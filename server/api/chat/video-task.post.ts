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
import { archiveUploadedMedia } from "~/server/services/media-storage";

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
const LINGYA_SORA_MODELS = new Set(["sora-2-all-vip-15s"]);
const YUNWU_VIDU_MODELS = new Set(["viduq3-turbo", "viduq2-turbo"]);
const DIMLEAP_HAPPYHORSE_MODELS = new Set(["happyhorse-1.0-i2v", "happyhorse-1.0-r2v"]);
const GROK_SIZES = new Set(["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"]);
const GROK_UNIFIED_ASPECT_RATIOS = new Set(["2:3", "3:2", "1:1"]);
const GROK_UNIFIED_SIZES = new Set(["720P"]);
const VEO_UNIFIED_ASPECT_RATIOS = new Set(["16:9", "9:16"]);
const BLT_VIDEO_ASPECT_RATIOS = new Set(["16:9", "9:16"]);
const ZHIPU_VIDEO_QUALITIES = new Set(["speed", "quality"]);
const ZHIPU_VIDEO_SIZES = new Set(["1280x720", "720x1280", "1024x1024", "1920x1080", "1080x1920", "2048x1080", "3840x2160"]);
const ZHIPU_VIDEO_FPS = new Set([30, 60]);
const ZHIPU_VIDEO_DURATIONS = new Set([5, 10]);
const YUNWU_VIDU_DURATIONS = new Set(Array.from({ length: 16 }, (_value, index) => index + 1));
const YUNWU_VIDU_RESOLUTIONS = new Set(["540p", "720p", "1080p"]);
const YUNWU_VIDU_MOVEMENT_AMPLITUDES = new Set(["auto", "small", "medium", "large"]);
const YUNWU_VIDU_AUDIO_TYPES = new Set(["all", "speech_only", "sound_effect_only"]);
const YUNWU_VIDU_WATERMARK_POSITIONS = new Set([1, 2, 3, 4]);
const DIMLEAP_HAPPYHORSE_DURATIONS = new Set(Array.from({ length: 13 }, (_value, index) => index + 3));
const DIMLEAP_HAPPYHORSE_RESOLUTIONS = new Set(["720P", "1080P"]);
const LINGYA_SORA_ORIENTATIONS = new Set(["portrait", "landscape"]);
const LINGYA_SORA_SIZES = new Set(["small", "large"]);
const LINGYA_SORA_DURATIONS_BY_MODEL: Record<string, number> = {
  "sora-2-all-vip-15s": 15,
};
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

function isLingyaSoraChannel(body: Record<string, unknown>) {
  return ["lingya-sora", "lingya", "sora-2-all-vip-15s"].includes(videoChannel(body));
}

function isYunwuViduChannel(body: Record<string, unknown>) {
  return ["yunwu-vidu", "vidu", "viduq3-turbo", "viduq2-turbo"].includes(videoChannel(body));
}

function isDimleapHappyhorseChannel(body: Record<string, unknown>) {
  return ["dimleap-happyhorse", "dimleap", "happyhorse-1.0-i2v", "happyhorse-1.0-r2v"].includes(videoChannel(body));
}

function isHttpOrDataImage(value: string) {
  return /^https?:\/\//i.test(value) || /^data:image\//i.test(value);
}

function extensionForDataImage(mimeType: string) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

function parseDataImage(value: string, index: number) {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  return {
    buffer: Buffer.from(match[2], "base64"),
    mimeType,
    originalFilename: `vidu-input-${index + 1}.${extensionForDataImage(mimeType)}`,
  };
}

async function resolveYunwuViduImages(event: Parameters<typeof archiveUploadedMedia>[0], images: string[], model: string) {
  const resolved: string[] = [];
  for (const [index, image] of images.entries()) {
    const value = image.trim();
    if (/^https?:\/\//i.test(value)) {
      resolved.push(value);
      continue;
    }
    const dataImage = parseDataImage(value, index);
    if (!dataImage) {
      resolved.push(value);
      continue;
    }
    const archived = await archiveUploadedMedia(event, {
      buffer: dataImage.buffer,
      kind: "image",
      provider: "yunwu-vidu",
      model,
      mimeType: dataImage.mimeType,
      originalFilename: dataImage.originalFilename,
      requireExternalUrl: true,
      metadata: {
        action: "yunwu_vidu_input_upload",
        sourceType: "chat_video_input",
      },
    });
    resolved.push(archived.externalUrl || archived.url);
  }
  return resolved;
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

function optionalString(value: unknown) {
  return String(value == null ? "" : value).trim();
}

function normalizeLingyaOrientation(body: Record<string, unknown>) {
  const raw = String(body.orientation || body.aspect_ratio || body.aspectRatio || body.ratio || "landscape").trim();
  if (raw === "9:16" || raw === "3:4" || raw === "2:3") return "portrait";
  if (raw === "16:9" || raw === "4:3" || raw === "3:2") return "landscape";
  return raw;
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
  const lingyaSoraChannel = isLingyaSoraChannel(body);
  const yunwuViduChannel = isYunwuViduChannel(body);
  const dimleapHappyhorseChannel = isDimleapHappyhorseChannel(body);
  const yunwuUnifiedChannel = grokUnifiedChannel || veoUnifiedChannel;
  const yunwuChannel = grokOpenAIChannel || yunwuUnifiedChannel || veoOpenAIChannel || yunwuViduChannel;

  const providerError = assertProvider(event, base, key, model);
  if (providerError) return providerError;
  if (dimleapHappyhorseChannel) {
    if (!DIMLEAP_HAPPYHORSE_MODELS.has(model)) return fail(event, 400, "BAD_REQUEST", "Dimleap Happyhorse 仅支持 happyhorse-1.0-i2v 和 happyhorse-1.0-r2v。");
    if (!prompt) return fail(event, 400, "BAD_REQUEST", "提示词不能为空。");
    if (model === "happyhorse-1.0-i2v" && images.length !== 1) return fail(event, 400, "BAD_REQUEST", "Dimleap Happyhorse i2v 必须提交 1 张首帧图片 URL。");
    if (model === "happyhorse-1.0-r2v" && (images.length < 1 || images.length > 9)) return fail(event, 400, "BAD_REQUEST", "Dimleap Happyhorse r2v 必须提交 1-9 张参考图片 URL。");
    if (images.some((url) => !/^https?:\/\//i.test(url))) return fail(event, 400, "BAD_REQUEST", "Dimleap Happyhorse 只支持可公网访问的图片 URL，不支持本地 base64。");
    const duration = normalizeZhipuNumber(body.duration, 3);
    const resolution = optionalString(body.resolution || (model === "happyhorse-1.0-r2v" ? "" : body.size) || "720P").toUpperCase();
    const size = optionalString(body.size || body.aspect_ratio || body.aspectRatio || "16:9");
    const seed = body.seed == null || body.seed === "" ? undefined : normalizeZhipuNumber(body.seed, 12345);
    if (!DIMLEAP_HAPPYHORSE_DURATIONS.has(duration)) return fail(event, 400, "BAD_REQUEST", "Dimleap Happyhorse 时长必须为 3-15 秒。");
    if (!DIMLEAP_HAPPYHORSE_RESOLUTIONS.has(resolution)) return fail(event, 400, "BAD_REQUEST", "Dimleap Happyhorse 分辨率只能为 720P 或 1080P。");
    if (model === "happyhorse-1.0-r2v" && !GROK_SIZES.has(size)) return fail(event, 400, "BAD_REQUEST", "Dimleap Happyhorse r2v 视频比例无效。");
    if (seed != null && seed < 0) return fail(event, 400, "BAD_REQUEST", "Dimleap Happyhorse seed 必须是非负整数。");
  } else if (yunwuViduChannel) {
    if (!YUNWU_VIDU_MODELS.has(model)) return fail(event, 400, "BAD_REQUEST", "云雾 Vidu 仅支持 viduq3-turbo 和 viduq2-turbo。");
    if (!prompt) return fail(event, 400, "BAD_REQUEST", "提示词不能为空。");
    if (!images.length) return fail(event, 400, "BAD_REQUEST", "云雾 Vidu 至少需要 1 张图片 URL 或上传图片。");
    if (images.length > 2) return fail(event, 400, "BAD_REQUEST", "云雾 Vidu 最多支持首尾帧 2 张图片。");
    if (images.some((url) => !isHttpOrDataImage(url))) return fail(event, 400, "BAD_REQUEST", "云雾 Vidu 只支持图片 URL 或本地上传图片。");
    const duration = normalizeZhipuNumber(body.duration, 5);
    const resolution = optionalString(body.resolution || body.size || "540p");
    const movementAmplitude = optionalString(body.movement_amplitude || body.movementAmplitude || "auto");
    const audioType = optionalString(body.audio_type || body.audioType || "all");
    const seed = normalizeZhipuNumber(body.seed, 0);
    const payload = optionalString(body.payload);
    const callbackUrl = optionalString(body.callback_url || body.callbackUrl);
    const watermarkPosition = normalizeZhipuNumber(body.wm_position || body.wmPosition, 3);
    const watermarkUrl = optionalString(body.wm_url || body.wmUrl);
    const metaData = optionalString(body.meta_data || body.metaData);
    if (!YUNWU_VIDU_DURATIONS.has(duration)) return fail(event, 400, "BAD_REQUEST", "云雾 Vidu 时长必须为 1-16 秒。");
    if (model === "viduq2-turbo" && duration > 10) return fail(event, 400, "BAD_REQUEST", "viduq2-turbo 时长必须为 1-10 秒。");
    if (!YUNWU_VIDU_RESOLUTIONS.has(resolution)) return fail(event, 400, "BAD_REQUEST", "云雾 Vidu 清晰度只能为 540p、720p 或 1080p。");
    if (!YUNWU_VIDU_MOVEMENT_AMPLITUDES.has(movementAmplitude)) return fail(event, 400, "BAD_REQUEST", "云雾 Vidu 运动幅度只能为 auto、small、medium 或 large。");
    if (!YUNWU_VIDU_AUDIO_TYPES.has(audioType)) return fail(event, 400, "BAD_REQUEST", "云雾 Vidu 音频类型只能为 all、speech_only 或 sound_effect_only。");
    if (seed < 0) return fail(event, 400, "BAD_REQUEST", "云雾 Vidu seed 必须是非负整数，0 表示随机。");
    if (payload.length > 1048576) return fail(event, 400, "BAD_REQUEST", "云雾 Vidu payload 不能超过 1048576 个字符。");
    if (callbackUrl && !/^https?:\/\//i.test(callbackUrl)) return fail(event, 400, "BAD_REQUEST", "云雾 Vidu callback_url 必须是 http(s) URL。");
    if (!YUNWU_VIDU_WATERMARK_POSITIONS.has(watermarkPosition)) return fail(event, 400, "BAD_REQUEST", "云雾 Vidu 水印位置只能为 1-4。");
    if (watermarkUrl && !/^https?:\/\//i.test(watermarkUrl)) return fail(event, 400, "BAD_REQUEST", "云雾 Vidu wm_url 必须是 http(s) URL。");
    if (metaData) {
      try {
        JSON.parse(metaData);
      } catch {
        return fail(event, 400, "BAD_REQUEST", "云雾 Vidu meta_data 必须是 JSON 字符串。");
      }
    }
  } else if (lingyaSoraChannel) {
    if (!LINGYA_SORA_MODELS.has(model)) return fail(event, 400, "BAD_REQUEST", "灵芽 Sora 仅支持 sora-2-all-vip-15s。");
    if (!prompt) return fail(event, 400, "BAD_REQUEST", "提示词不能为空。");
    if (images.length > 1) return fail(event, 400, "BAD_REQUEST", "灵芽 Sora 初版最多支持 1 张参考图。");
    if (images.some((url) => !/^https?:\/\//i.test(url))) return fail(event, 400, "BAD_REQUEST", "灵芽 Sora unified 仅支持图片 URL，不支持 base64。");
    const orientation = normalizeLingyaOrientation(body);
    const lingyaSize = String(body.size || "large").trim();
    const duration = normalizeZhipuNumber(body.duration, LINGYA_SORA_DURATIONS_BY_MODEL[model] || 10);
    if (!LINGYA_SORA_ORIENTATIONS.has(orientation)) return fail(event, 400, "BAD_REQUEST", "灵芽 Sora 方向只能为 portrait 或 landscape。");
    if (!LINGYA_SORA_SIZES.has(lingyaSize)) return fail(event, 400, "BAD_REQUEST", "灵芽 Sora size 只能为 small 或 large。");
    if (duration !== LINGYA_SORA_DURATIONS_BY_MODEL[model]) return fail(event, 400, "BAD_REQUEST", `${model} 视频时长必须为 ${LINGYA_SORA_DURATIONS_BY_MODEL[model]} 秒。`);
  } else if (zhipuCogVideoChannel) {
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
    if (dimleapHappyhorseChannel) {
      upstreamUrl = buildEndpoint(base, "/v1/video/generations");
      const resolution = optionalString(body.resolution || (model === "happyhorse-1.0-r2v" ? "" : body.size) || "720P").toUpperCase();
      const seed = body.seed == null || body.seed === "" ? undefined : normalizeZhipuNumber(body.seed, 12345);
      const media = model === "happyhorse-1.0-r2v"
        ? images.slice(0, 9).map((url) => ({ type: "reference_image", url }))
        : [{ type: "first_frame", url: images[0] }];
      const payload: Record<string, unknown> = {
        model,
        prompt,
        ...(model === "happyhorse-1.0-r2v" ? { size: optionalString(body.size || body.aspect_ratio || body.aspectRatio || "16:9") } : {}),
        duration: normalizeZhipuNumber(body.duration, 3),
        metadata: {
          resolution,
          watermark: normalizeBoolean(body.watermark, false),
          action: "referenceGenerate",
          media,
          ...(seed == null ? {} : { seed }),
        },
      };
      upstream = await postJson(upstreamUrl, key, payload);
    } else if (yunwuViduChannel) {
      upstreamUrl = buildEndpoint(base, images.length >= 2 ? "/ent/v2/start-end2video" : "/ent/v2/img2video");
      const upstreamImages = await resolveYunwuViduImages(event, images.slice(0, 2), model);
      const payloadText = optionalString(body.payload);
      const callbackUrl = optionalString(body.callback_url || body.callbackUrl);
      const voiceId = optionalString(body.voice_id || body.voiceId);
      const watermarkUrl = optionalString(body.wm_url || body.wmUrl);
      const metaData = optionalString(body.meta_data || body.metaData);
      const payload: Record<string, unknown> = {
        model,
        prompt,
        images: upstreamImages,
        duration: normalizeZhipuNumber(body.duration, 5),
        resolution: optionalString(body.resolution || body.size || "540p"),
        movement_amplitude: optionalString(body.movement_amplitude || body.movementAmplitude || "auto"),
        seed: normalizeZhipuNumber(body.seed, 0),
        audio: normalizeBoolean(body.audio, false),
        audio_type: optionalString(body.audio_type || body.audioType || "all"),
        is_rec: normalizeBoolean(body.is_rec ?? body.isRec, false),
        bgm: normalizeBoolean(body.bgm, false),
        off_peak: normalizeBoolean(body.off_peak ?? body.offPeak, false),
        watermark: normalizeBoolean(body.watermark, false),
        wm_position: normalizeZhipuNumber(body.wm_position || body.wmPosition, 3),
      };
      if (voiceId) payload.voice_id = voiceId;
      if (watermarkUrl) payload.wm_url = watermarkUrl;
      if (metaData) payload.meta_data = metaData;
      if (payloadText) payload.payload = payloadText;
      if (callbackUrl) payload.callback_url = callbackUrl;
      upstream = await postJson(upstreamUrl, key, payload);
    } else if (lingyaSoraChannel) {
      upstreamUrl = buildEndpoint(base, "/v1/video/create");
      const payload: Record<string, unknown> = {
        model,
        prompt,
        // Lingya Sora 2 unified requires images even for text-to-video; pass [] when no reference image is used.
        images,
        orientation: normalizeLingyaOrientation(body),
        size: String(body.size || "large").trim(),
        duration: normalizeZhipuNumber(body.duration, LINGYA_SORA_DURATIONS_BY_MODEL[model] || 10),
      };
      upstream = await postJson(upstreamUrl, key, payload);
    } else if (zhipuCogVideoChannel) {
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
    const statusCode = Number((error as any)?.statusCode || (error as any)?.status || 0);
    if (!isAbort && statusCode >= 400 && statusCode < 500) {
      const data = (error as any)?.data && typeof (error as any).data === "object" ? (error as any).data as Record<string, unknown> : {};
      return fail(
        event,
        statusCode,
        String(data.code || "BAD_REQUEST"),
        error instanceof Error ? error.message : String(error),
        Object.keys(data).length ? data : undefined,
      );
    }
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
