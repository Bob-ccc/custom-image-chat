import { defineEventHandler, readBody } from "h3";
import {
  assertProvider,
  buildCustomEndpoint,
  buildEndpoint,
  endpointHint,
  extractPreviewUrls,
  fail,
  fetchWithTimeout,
  imageSourceToBlob,
  normalizeQuality,
  postJson,
  providerFromBody,
  readUpstreamJson,
  toPreviewImageUrls,
  toPositiveInt,
} from "../../lib/chat-image-proxy";

type ChatImageMode = "generation" | "edit" | "image-chat" | "text-chat";

const SUPPORTED_MODES = new Set<ChatImageMode>([
  "generation",
  "edit",
  "image-chat",
  "text-chat",
]);

function upstreamErrorMessage(data: any, rawText: string, fallback: string) {
  return data?.error?.message || data?.message || rawText || fallback;
}

function normalizeImageInputs(body: Record<string, unknown>) {
  if (Array.isArray(body.image)) {
    return body.image.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return [body.image, body.imageUrl, body.imageDataUrl].map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeB64Json(value: unknown) {
  return value === true || String(value).trim().toLowerCase() === "true";
}

function optionalString(value: unknown) {
  return String(value == null ? "" : value).trim();
}

function addOptionalPayloadParams(payload: Record<string, unknown>, body: Record<string, unknown>) {
  const background = optionalString(body.background);
  const outputFormat = optionalString(body.output_format || body.outputFormat);
  const moderation = optionalString(body.moderation);
  const outputCompression = Number(body.output_compression || body.outputCompression);
  if (background) payload.background = background;
  if (outputFormat) payload.output_format = outputFormat;
  if (moderation) payload.moderation = moderation;
  if (Number.isFinite(outputCompression)) payload.output_compression = Math.max(0, Math.min(100, Math.round(outputCompression)));
}

function addOptionalFormParams(form: FormData, body: Record<string, unknown>) {
  const background = optionalString(body.background);
  const outputFormat = optionalString(body.output_format || body.outputFormat);
  const moderation = optionalString(body.moderation);
  const outputCompression = Number(body.output_compression || body.outputCompression);
  if (background) form.set("background", background);
  if (outputFormat) form.set("output_format", outputFormat);
  if (moderation) form.set("moderation", moderation);
  if (Number.isFinite(outputCompression)) form.set("output_compression", String(Math.max(0, Math.min(100, Math.round(outputCompression)))));
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) || {};
  const mode = String(body.mode || "").trim() as ChatImageMode;
  const { base, imageEndpoint, key, model } = providerFromBody(body);
  const hasCustomImageEndpoint = Boolean(imageEndpoint);
  const prompt = String(body.prompt || "").trim();
  const size = String(body.size || "1024x1024").trim() || "1024x1024";
  const quality = normalizeQuality(body.quality);
  const n = toPositiveInt(body.n, 1, 1, 10);
  const b64Json = normalizeB64Json(body.b64_json);
  const imageInputs = normalizeImageInputs(body);
  const imageSource = imageInputs[0] || "";
  const maskSource = optionalString(body.mask || body.maskImage || body.maskDataUrl);

  if (!SUPPORTED_MODES.has(mode)) {
    return fail(event, 400, "UNSUPPORTED_MODE", "仅支持 official image generation、image edit、image-to-image chat、text-to-image chat 四种同步图片接口。");
  }
  const providerError = assertProvider(event, base, key, model);
  if (providerError) return providerError;
  if (!prompt) return fail(event, 400, "BAD_REQUEST", "提示词不能为空。");
  if ((mode === "edit" || mode === "image-chat") && !imageSource) {
    return fail(event, 400, "BAD_REQUEST", mode === "edit" ? "编辑图片模式需要输入图片。" : "图生图 chat 模式需要输入图片链接或 Base64。");
  }

  let upstreamUrl = "";

  try {
    let upstream: Response;
    if (mode === "generation") {
      upstreamUrl = buildCustomEndpoint(base, imageEndpoint) || buildEndpoint(base, "/v1/images/generations");
      const payload: Record<string, unknown> = { model, prompt, size, quality, n };
      addOptionalPayloadParams(payload, body);
      if (!hasCustomImageEndpoint) {
        payload.b64_json = b64Json;
        if (imageInputs.length) payload.image = imageInputs;
      }
      upstream = await postJson(upstreamUrl, key, payload);
    } else if (mode === "edit") {
      upstreamUrl = buildCustomEndpoint(base, imageEndpoint) || buildEndpoint(base, "/v1/images/edits");
      const blobs = await Promise.all(imageInputs.map((source) => imageSourceToBlob(source)));
      if (!blobs.length || blobs.some((blob) => !blob)) return fail(event, 400, "BAD_REQUEST", "输入图片必须是可读取的 URL 或 Base64 Data URL。");
      const maskBlob = maskSource ? await imageSourceToBlob(maskSource) : null;
      if (maskSource && !maskBlob) return fail(event, 400, "BAD_REQUEST", "Mask 必须是可读取的图片 URL 或 Base64 Data URL。");
      const form = new FormData();
      form.set("model", model);
      blobs.forEach((blob, index) => {
        if (blob) form.append("image[]", blob, `input-image-${index + 1}.png`);
      });
      if (maskBlob) form.set("mask", maskBlob, "mask.png");
      form.set("prompt", prompt);
      form.set("n", String(n));
      form.set("size", size);
      form.set("quality", quality);
      form.set("b64_json", String(b64Json));
      addOptionalFormParams(form, body);
      upstream = await fetchWithTimeout(upstreamUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
    } else if (mode === "image-chat") {
      upstreamUrl = buildEndpoint(base, "/v1/chat/completions");
      const payload: Record<string, unknown> = {
        model,
        stream: false,
        size,
        quality,
        b64_json: false,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageSource } },
            ],
          },
        ],
      };
      upstream = await postJson(upstreamUrl, key, payload);
    } else {
      upstreamUrl = buildEndpoint(base, "/v1/chat/completions");
      upstream = await postJson(upstreamUrl, key, {
        model,
        stream: false,
        size,
        quality,
        b64_json: false,
        messages: [{ role: "user", content: prompt }],
      });
    }

    const { data, rawText } = await readUpstreamJson(upstream);
    if (!upstream.ok) {
      const isTimeoutStatus = upstream.status === 504;
      return fail(
        event,
        upstream.status,
        isTimeoutStatus ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
        (isTimeoutStatus
          ? "图片接口请求超时或上游返回 504，请确认填写的是真实运行 API Base，不是 Apifox 文档地址。"
          : upstreamErrorMessage(data, rawText, "图片接口请求失败。")) + endpointHint(upstreamUrl),
        { upstreamStatus: upstream.status, upstreamUrl },
      );
    }

    const images = toPreviewImageUrls(extractPreviewUrls(data));
    return {
      ok: true,
      mode,
      upstreamUrl,
      images,
      data,
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return fail(
      event,
      isAbort ? 504 : 502,
      isAbort ? "UPSTREAM_TIMEOUT" : "BAD_GATEWAY",
      (isAbort
        ? "图片接口请求超时，请确认填写的是真实运行 API Base，不是 Apifox 文档地址。"
        : "图片代理请求失败：" + (error instanceof Error ? error.message : String(error))) + endpointHint(upstreamUrl),
      upstreamUrl ? { upstreamUrl } : undefined,
    );
  }
});
