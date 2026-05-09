import { defineEventHandler, readBody } from "h3";
import {
  assertProvider,
  buildEndpoint,
  endpointHint,
  extractTaskId,
  fail,
  fetchWithTimeout,
  imageSourceToBlob,
  postJson,
  providerFromBody,
  readUpstreamJson,
} from "../../lib/chat-image-proxy";

const VIDEO_MODEL_LIMITS: Record<string, number> = {
  "veo3.1-fast": 0,
  "veo3.1-components": 3,
  "veo3.1": 2,
};
const GROK_MODELS = new Set(["grok-videos"]);
const GROK_UNIFIED_MODELS = new Set(["grok-video-3", "grok-video-3-10s"]);
const VEO_UNIFIED_MODELS = new Set(["veo3.1-fast-components"]);
const VEO_OPENAI_MODELS = new Set(["veo_3_1-fast-4K", "veo_3_1-fast"]);
const ZHIPU_COGVIDEO_MODELS = new Set(["cogvideox-3"]);
const GROK_SIZES = new Set(["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"]);
const GROK_UNIFIED_ASPECT_RATIOS = new Set(["2:3", "3:2", "1:1"]);
const GROK_UNIFIED_SIZES = new Set(["720P"]);
const VEO_UNIFIED_ASPECT_RATIOS = new Set(["16:9", "9:16"]);
const BLT_VIDEO_ASPECT_RATIOS = new Set(["16:9", "9:16"]);
const ZHIPU_VIDEO_QUALITIES = new Set(["speed", "quality"]);
const ZHIPU_VIDEO_SIZES = new Set(["1280x720", "720x1280", "1024x1024", "1920x1080", "1080x1920", "2048x1080", "3840x2160"]);
const ZHIPU_VIDEO_FPS = new Set([30, 60]);
const ZHIPU_VIDEO_DURATIONS = new Set([5, 10]);
const VEO_UNIFIED_IMAGE_LIMITS: Record<string, number> = {
  "veo3.1-fast-components": 3,
};

function imageInputValue(item: unknown) {
  if (typeof item === "string") return item.trim();
  if (item && typeof item === "object") {
    const url = (item as Record<string, unknown>).url;
    return typeof url === "string" ? url.trim() : "";
  }
  return "";
}

function normalizeImageInputs(body: Record<string, unknown>) {
  const raw = Array.isArray(body.images)
    ? body.images
    : Array.isArray(body.reference_images)
      ? body.reference_images
      : Array.isArray(body.image_url)
        ? body.image_url
        : [body.image_url, body.image, body.imageUrl, body.imageDataUrl];
  return raw.map(imageInputValue).filter(Boolean);
}

function normalizeGrokInputReference(body: Record<string, unknown>) {
  return String(body.input_reference || body.inputReference || "").trim();
}

function validateVideoImages(model: string, images: string[]) {
  const max = VIDEO_MODEL_LIMITS[model];
  if (max == null) return `不支持的视频模型：${model}。`;
  if (max === 0 && images.length) return "veo3.1-fast 不支持图片输入，请清空图片后提交文生视频。";
  if (images.length > max) return `${model} 最多支持 ${max} 张图片。`;
  return "";
}

function videoChannel(body: Record<string, unknown>) {
  return String(body.channel || body.videoChannel || "").trim();
}

function isGrokOpenAIChannel(body: Record<string, unknown>) {
  return ["grok", "sora", "grok-openai"].includes(videoChannel(body));
}

function isGrokUnifiedChannel(body: Record<string, unknown>) {
  return ["grok-unified", "xai-video"].includes(videoChannel(body));
}

function isVeoUnifiedChannel(body: Record<string, unknown>) {
  return ["veo-unified", "yunwu-veo-unified"].includes(videoChannel(body));
}

function isVeoOpenAIChannel(body: Record<string, unknown>) {
  return ["veo-openai", "yunwu-veo-openai"].includes(videoChannel(body));
}

function isZhipuCogVideoChannel(body: Record<string, unknown>) {
  return ["zhipu-cogvideo", "zhipu", "cogvideox", "cogvideox-3"].includes(videoChannel(body));
}

function isYunwuUnifiedChannel(body: Record<string, unknown>) {
  return isGrokUnifiedChannel(body) || isVeoUnifiedChannel(body);
}

function normalizeGrokSeconds(value: unknown) {
  const seconds = Number(value || 10);
  if (!Number.isFinite(seconds)) return 0;
  return Math.round(seconds);
}

function normalizeWatermark(value: unknown) {
  if (value == null || value === "") return "false";
  return value === true || value === "true" ? "true" : "false";
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (value == null || value === "") return fallback;
  return value === true || value === "true";
}

function normalizeZhipuNumber(value: unknown, fallback: number) {
  const numberValue = Number(value ?? fallback);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.round(numberValue);
}

function upstreamErrorMessage(data: any, rawText: string, fallback: string) {
  return data?.error?.message || data?.message || rawText || fallback;
}

function extractZhipuTaskId(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const id = (data as Record<string, unknown>).id;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return "";
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) || {};
  const { base, key, model } = providerFromBody(body);
  const prompt = String(body.prompt || "").trim();
  const images = normalizeImageInputs(body);
  const inputReference = normalizeGrokInputReference(body);
  const grokOpenAIChannel = isGrokOpenAIChannel(body);
  const grokUnifiedChannel = isGrokUnifiedChannel(body);
  const veoUnifiedChannel = isVeoUnifiedChannel(body);
  const veoOpenAIChannel = isVeoOpenAIChannel(body);
  const zhipuCogVideoChannel = isZhipuCogVideoChannel(body);
  const yunwuUnifiedChannel = grokUnifiedChannel || veoUnifiedChannel;
  const yunwuChannel = grokOpenAIChannel || yunwuUnifiedChannel || veoOpenAIChannel;

  const providerError = assertProvider(event, base, key, model);
  if (providerError) return providerError;
  if (zhipuCogVideoChannel) {
    if (!ZHIPU_COGVIDEO_MODELS.has(model)) return fail(event, 400, "BAD_REQUEST", "智谱视频仅支持 cogvideox-3。");
    if (!prompt && !images.length) return fail(event, 400, "BAD_REQUEST", "智谱视频的提示词和参考图不能同时为空。");
    if (prompt.length > 512) return fail(event, 400, "BAD_REQUEST", "智谱视频提示词不能超过 512 个字符。");
    if (images.length > 2) return fail(event, 400, "BAD_REQUEST", "智谱 CogVideoX-3 最多支持 2 张参考图。");
    const quality = String(body.quality || "speed").trim();
    const zhipuSize = String(body.size || "1920x1080").trim();
    const fps = normalizeZhipuNumber(body.fps, 30);
    const duration = normalizeZhipuNumber(body.duration, 5);
    if (!ZHIPU_VIDEO_QUALITIES.has(quality)) return fail(event, 400, "BAD_REQUEST", "智谱输出模式只能为 speed 或 quality。");
    if (!ZHIPU_VIDEO_SIZES.has(zhipuSize)) return fail(event, 400, "BAD_REQUEST", "智谱视频尺寸无效。");
    if (!ZHIPU_VIDEO_FPS.has(fps)) return fail(event, 400, "BAD_REQUEST", "智谱 FPS 只能为 30 或 60。");
    if (!ZHIPU_VIDEO_DURATIONS.has(duration)) return fail(event, 400, "BAD_REQUEST", "智谱视频时长只能为 5 或 10 秒。");
  } else if (yunwuChannel) {
    if (!prompt) return fail(event, 400, "BAD_REQUEST", "提示词不能为空。");
    if (grokOpenAIChannel && !GROK_MODELS.has(model)) return fail(event, 400, "BAD_REQUEST", "Grok OpenAI 格式仅支持 grok-videos。");
    if (grokUnifiedChannel && !GROK_UNIFIED_MODELS.has(model)) return fail(event, 400, "BAD_REQUEST", "Grok 统一格式仅支持 grok-video-3 和 grok-video-3-10s。");
    if (veoUnifiedChannel && !VEO_UNIFIED_MODELS.has(model)) return fail(event, 400, "BAD_REQUEST", "云雾 VEO 统一格式仅支持 veo3.1-fast-components。");
    if (veoOpenAIChannel && !VEO_OPENAI_MODELS.has(model)) return fail(event, 400, "BAD_REQUEST", "云雾 VEO OpenAI 仅支持 veo_3_1-fast-4K 和 veo_3_1-fast。");
    const size = String(body.size || body.aspect_ratio || body.aspectRatio || "16:9").trim();
    const seconds = normalizeGrokSeconds(body.seconds || body.duration);
    const unifiedAspectRatio = String(body.aspect_ratio || body.aspectRatio || body.ratio || size).trim();
    const unifiedSize = String(body.size || "720P").trim().toUpperCase();
    const veoImageLimit = VEO_UNIFIED_IMAGE_LIMITS[model] ?? 0;
    const hasEnhancePrompt = body.enhance_prompt != null || body.enhancePrompt != null;
    const hasEnableUpsample = body.enable_upsample != null || body.enableUpsample != null;
    if (grokOpenAIChannel && !GROK_SIZES.has(size)) return fail(event, 400, "BAD_REQUEST", "Grok 视频比例无效。");
    if ((grokOpenAIChannel || veoOpenAIChannel) && !GROK_SIZES.has(size)) return fail(event, 400, "BAD_REQUEST", veoOpenAIChannel ? "VEO OpenAI 尺寸比例无效。" : "Grok 视频比例无效。");
    if ((grokOpenAIChannel || veoOpenAIChannel) && (seconds < 1 || seconds > 15)) return fail(event, 400, "BAD_REQUEST", "视频时长必须为 1-15 秒。");
    if (grokUnifiedChannel && !GROK_UNIFIED_ASPECT_RATIOS.has(unifiedAspectRatio)) return fail(event, 400, "BAD_REQUEST", "Grok 统一格式比例只能为 2:3、3:2 或 1:1。");
    if (veoUnifiedChannel && !VEO_UNIFIED_ASPECT_RATIOS.has(unifiedAspectRatio)) return fail(event, 400, "BAD_REQUEST", "VEO 统一格式比例只能为 16:9 或 9:16。");
    if (grokUnifiedChannel && !GROK_UNIFIED_SIZES.has(unifiedSize)) return fail(event, 400, "BAD_REQUEST", "Grok 统一格式 size 暂只支持 720P。");
    if (grokOpenAIChannel && inputReference && images.length) return fail(event, 400, "BAD_REQUEST", "Grok 单图 input_reference 不能和多图 images 同时提交。");
    if (yunwuUnifiedChannel && inputReference) return fail(event, 400, "BAD_REQUEST", "云雾统一格式不使用 input_reference，请通过图片 URL 列表提交。");
    if (grokUnifiedChannel && !images.length) return fail(event, 400, "BAD_REQUEST", "Grok 统一格式必须提交 images 图片链接数组。");
    if (yunwuUnifiedChannel && images.some((url) => !/^https?:\/\//i.test(url))) return fail(event, 400, "BAD_REQUEST", "云雾统一格式只支持图片 URL，不支持 base64。");
    if (grokOpenAIChannel && images.length > 3) return fail(event, 400, "BAD_REQUEST", "Grok 多图模式最多支持 3 张图片。");
    if (veoOpenAIChannel && images.length < 2) return fail(event, 400, "BAD_REQUEST", "云雾 VEO OpenAI 必须提交首帧和尾帧两张 input_reference 参考图。");
    if (veoOpenAIChannel && images.length > 2) return fail(event, 400, "BAD_REQUEST", "云雾 VEO OpenAI 只支持首帧和尾帧两张 input_reference 参考图。");
    if (veoUnifiedChannel && images.length > veoImageLimit) return fail(event, 400, "BAD_REQUEST", `${model} 的 images 最多支持 ${veoImageLimit} 张。`);
    if (veoUnifiedChannel && !hasEnhancePrompt) return fail(event, 400, "BAD_REQUEST", "VEO 统一格式必须提交 enhance_prompt。");
    if (veoUnifiedChannel && !hasEnableUpsample) return fail(event, 400, "BAD_REQUEST", "VEO 统一格式必须提交 enable_upsample。");
  } else {
    if (!prompt) return fail(event, 400, "BAD_REQUEST", "提示词不能为空。");
    const aspectRatio = String(body.aspect_ratio || body.aspectRatio || body.ratio || "16:9").trim();
    if (!BLT_VIDEO_ASPECT_RATIOS.has(aspectRatio)) return fail(event, 400, "BAD_REQUEST", "BLT 视频比例只能为 16:9 或 9:16。");
    const imageError = validateVideoImages(model, images);
    if (imageError) return fail(event, 400, "BAD_REQUEST", imageError);
  }

  let upstreamUrl = "";

  try {
    let upstream: Response;
    if (zhipuCogVideoChannel) {
      upstreamUrl = buildEndpoint(base, "/videos/generations");
      const quality = String(body.quality || "speed").trim();
      const zhipuSize = String(body.size || "1920x1080").trim();
      const fps = normalizeZhipuNumber(body.fps, 30);
      const duration = normalizeZhipuNumber(body.duration, 5);
      const imageUrl = images.length > 1 ? images.slice(0, 2) : images[0] || "";
      const payload: Record<string, unknown> = {
        model,
        quality,
        with_audio: normalizeBoolean(body.with_audio ?? body.withAudio, false),
        watermark_enabled: normalizeBoolean(body.watermark_enabled ?? body.watermarkEnabled, true),
        size: zhipuSize,
        fps,
        duration,
      };
      if (prompt) payload.prompt = prompt;
      if (imageUrl) payload.image_url = imageUrl;
      upstream = await postJson(upstreamUrl, key, payload);
    } else if (grokOpenAIChannel) {
      upstreamUrl = buildEndpoint(base, "/v1/videos");
      const size = String(body.size || body.aspect_ratio || body.aspectRatio || "16:9").trim();
      const seconds = normalizeGrokSeconds(body.seconds || body.duration);
      const payload: Record<string, unknown> = {
        model,
        prompt,
        size,
        seconds,
      };
      if (inputReference) payload.input_reference = inputReference;
      else if (images.length) payload.images = images;
      upstream = await postJson(upstreamUrl, key, payload);
    } else if (veoOpenAIChannel) {
      upstreamUrl = buildEndpoint(base, "/v1/videos");
      const size = String(body.size || body.aspect_ratio || body.aspectRatio || "16:9").trim();
      const seconds = String(normalizeGrokSeconds(body.seconds || body.duration || 8));
      const [firstFrame, lastFrame] = images;
      const firstFrameBlob = await imageSourceToBlob(firstFrame || "");
      const lastFrameBlob = await imageSourceToBlob(lastFrame || "");
      if (!firstFrameBlob) return fail(event, 400, "BAD_REQUEST", "云雾 VEO OpenAI 的首帧必须是可读取的图片 URL 或上传图片。");
      if (!lastFrameBlob) return fail(event, 400, "BAD_REQUEST", "云雾 VEO OpenAI 的尾帧必须是可读取的图片 URL 或上传图片。");
      const formData = new FormData();
      formData.set("model", model);
      formData.set("prompt", prompt);
      formData.set("seconds", seconds);
      formData.set("size", size);
      formData.set("watermark", normalizeWatermark(body.watermark));
      formData.append("input_reference", firstFrameBlob, "first_frame.png");
      formData.append("input_reference", lastFrameBlob, "last_frame.png");
      upstream = await fetchWithTimeout(upstreamUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: formData,
      });
    } else if (grokUnifiedChannel) {
      upstreamUrl = buildEndpoint(base, "/v1/video/create");
      const aspectRatio = String(body.aspect_ratio || body.aspectRatio || body.ratio || "3:2").trim();
      const unifiedSize = String(body.size || "720P").trim().toUpperCase();
      const payload: Record<string, unknown> = {
        model,
        prompt,
        aspect_ratio: aspectRatio,
        size: unifiedSize,
        images,
      };
      upstream = await postJson(upstreamUrl, key, payload);
    } else if (veoUnifiedChannel) {
      upstreamUrl = buildEndpoint(base, "/v1/video/create");
      const aspectRatio = String(body.aspect_ratio || body.aspectRatio || body.ratio || "16:9").trim();
      const enhancePrompt = body.enhance_prompt ?? body.enhancePrompt;
      const enableUpsample = body.enable_upsample ?? body.enableUpsample;
      const payload: Record<string, unknown> = {
        model,
        prompt,
        aspect_ratio: aspectRatio,
        enhance_prompt: enhancePrompt === true || enhancePrompt === "true",
        enable_upsample: enableUpsample === true || enableUpsample === "true",
      };
      if (images.length) payload.images = images;
      upstream = await postJson(upstreamUrl, key, payload);
    } else {
      upstreamUrl = buildEndpoint(base, "/v2/videos/generations");
      const aspectRatio = String(body.aspect_ratio || body.aspectRatio || body.ratio || "16:9").trim();
      const enhancePrompt = body.enhance_prompt ?? body.enhancePrompt ?? true;
      const payload: Record<string, unknown> = {
        model,
        prompt,
        aspect_ratio: aspectRatio,
        enhance_prompt: enhancePrompt === true || enhancePrompt === "true",
      };
      if (images.length) payload.images = images;
      upstream = await postJson(upstreamUrl, key, payload);
    }
    const { data, rawText } = await readUpstreamJson(upstream);

    if (!upstream.ok) {
      const isTimeoutStatus = upstream.status === 504;
      return fail(
        event,
        upstream.status,
        isTimeoutStatus ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
        (isTimeoutStatus
          ? "视频任务提交超时或上游返回 504，请确认真实运行 API Base。"
          : upstreamErrorMessage(data, rawText, "视频任务提交失败。")) + endpointHint(upstreamUrl),
        { upstreamStatus: upstream.status, upstreamUrl },
      );
    }

    const taskId = zhipuCogVideoChannel ? extractZhipuTaskId(data) || extractTaskId(data) : extractTaskId(data);
    if (!taskId) {
      return fail(event, 502, "MISSING_TASK_ID", "视频接口未返回 task id。", { upstreamUrl, data });
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
        ? "视频任务提交超时，请确认真实运行 API Base。"
        : "视频任务代理请求失败：" + (error instanceof Error ? error.message : String(error))) + endpointHint(upstreamUrl),
      upstreamUrl ? { upstreamUrl } : undefined,
    );
  }
});
