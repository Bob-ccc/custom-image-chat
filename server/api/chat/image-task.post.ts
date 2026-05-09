import { defineEventHandler, readBody } from "h3";
import {
  assertProvider,
  buildCustomEndpoint,
  buildEndpoint,
  endpointHint,
  extractTaskId,
  fail,
  normalizeQuality,
  postJson,
  providerFromBody,
  readUpstreamJson,
  toPositiveInt,
  withQuery,
} from "../../lib/chat-image-proxy";

function normalizeImageInputs(body: Record<string, unknown>) {
  if (Array.isArray(body.image)) {
    return body.image.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return [body.image, body.imageUrl, body.imageDataUrl].map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeB64Json(value: unknown) {
  return value === true || String(value).trim().toLowerCase() === "true";
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) || {};
  const { base, imageEndpoint, key, model } = providerFromBody(body);
  if (imageEndpoint) {
    return fail(event, 400, "BAD_REQUEST", "自定义生图按官方 Images API 仅支持同步提交。");
  }
  const prompt = String(body.prompt || "").trim();
  const size = String(body.size || "1024x1024").trim() || "1024x1024";
  const quality = normalizeQuality(body.quality);
  const n = toPositiveInt(body.n, 1, 1, 10);
  const b64Json = normalizeB64Json(body.b64_json);
  const imageInputs = normalizeImageInputs(body);

  const providerError = assertProvider(event, base, key, model);
  if (providerError) return providerError;
  if (!prompt) return fail(event, 400, "BAD_REQUEST", "提示词不能为空。");

  let upstreamUrl = "";

  try {
    upstreamUrl = withQuery(buildCustomEndpoint(base, imageEndpoint) || buildEndpoint(base, "/v1/images/generations"), { async: "true" });
    const payload: Record<string, unknown> = { model, prompt, size, quality, n, b64_json: b64Json };
    if (imageInputs.length) payload.image = imageInputs;
    const upstream = await postJson(upstreamUrl, key, payload);
    const { data, rawText } = await readUpstreamJson(upstream);

    if (!upstream.ok) {
      const isTimeoutStatus = upstream.status === 504;
      return fail(
        event,
        upstream.status,
        isTimeoutStatus ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
        (isTimeoutStatus
          ? "异步图片任务提交超时或上游返回 504，请确认真实运行 API Base。"
          : data?.error?.message || data?.message || rawText || "异步图片任务提交失败。") + endpointHint(upstreamUrl),
        { upstreamStatus: upstream.status, upstreamUrl },
      );
    }

    const taskId = extractTaskId(data);
    if (!taskId) {
      return fail(event, 502, "MISSING_TASK_ID", "异步接口未返回 task id。", { upstreamUrl, data });
    }

    return {
      ok: true,
      taskId,
      status: "IN_PROGRESS",
      upstreamUrl,
      data,
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return fail(
      event,
      isAbort ? 504 : 502,
      isAbort ? "UPSTREAM_TIMEOUT" : "BAD_GATEWAY",
      (isAbort
        ? "异步图片任务提交超时，请确认真实运行 API Base。"
        : "异步图片任务代理请求失败：" + (error instanceof Error ? error.message : String(error))) + endpointHint(upstreamUrl),
      upstreamUrl ? { upstreamUrl } : undefined,
    );
  }
});
