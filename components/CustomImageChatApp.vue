<script setup lang="ts">
type ModeKey = "generation" | "edit" | "image-chat" | "text-chat" | "video";
type LangKey = "zh" | "en";
type QualityKey = "low" | "medium" | "high" | "auto";
type ExecutionMode = "sync" | "async";
type TaskStatus = "SYNC_SUCCESS" | "IN_PROGRESS" | "SUCCESS" | "FAILURE";
type MediaType = "image" | "video";
type ImageEntryKey = "official" | "custom";
type CustomImageMode = "text-to-image" | "image-to-image";
type VideoChannelKey = "veo" | "grok-openai" | "grok-unified" | "veo-unified" | "veo-openai" | "zhipu-cogvideo";
type GrokReferenceMode = "single" | "multi";
type ZhipuVideoQuality = "speed" | "quality";
type ChatHistoryRecord = {
  id: string;
  kind: "sync" | "async";
  mediaType: MediaType;
  imageEntry: ImageEntryKey;
  createdAt: string;
  updatedAt: string;
  mode: ModeKey;
  model: string;
  base: string;
  imageEndpoint: string;
  prompt: string;
  size: string;
  quality: QualityKey;
  n: number;
  taskId: string;
  status: TaskStatus;
  progress: string;
  failReason: string;
  upstreamUrl: string;
  imageInputLabel: string;
  imageInputValue: string;
  videoChannel: VideoChannelKey;
  grokReferenceMode: GrokReferenceMode;
  videoImages: string[];
  coverUrl: string;
  images: string[];
  videos: string[];
  response: unknown;
};

const HISTORY_STORAGE_KEY = "goodscheck:chat-history:v1";
const API_KEY_STORAGE_KEY = "goodscheck:chat-api-key:v1";
const API_KEYS_STORAGE_KEY = "goodscheck:chat-api-keys:v1";
const IMAGE_ENTRY_STORAGE_KEY = "goodscheck:chat-image-entry:v1";
const CUSTOM_IMAGE_PROVIDER_STORAGE_KEY = "goodscheck:chat-custom-image-provider:v1";
const HISTORY_LIMIT = 100;
const APIFOX_DOC_HOSTS = new Set(["value-apiqk.apifox.cn", "gpt-best.apifox.cn", "yunwu.apifox.cn"]);
const DEFAULT_API_BASE_URL = "https://api.bltcy.ai/";
const VIDEO_API_BASE_BY_CHANNEL: Record<VideoChannelKey, string> = {
  veo: "https://api.bltcy.ai/",
  "grok-openai": "https://yunwu.ai/v1/videos",
  "grok-unified": "https://yunwu.ai",
  "veo-unified": "https://yunwu.ai",
  "veo-openai": "https://yunwu.ai",
  "zhipu-cogvideo": "https://open.bigmodel.cn/api/paas/v4",
};
const apiBaseOptions = [
  DEFAULT_API_BASE_URL,
  "https://value.apiqik.online",
];
const OFFICIAL_IMAGE_DEFAULT_MODEL = "gpt-image-2-all";
const CUSTOM_IMAGE_DEFAULT_MODEL = "gpt-image-2";
const modelOptions = [
  "gpt-image-2",
  "gpt-image-2-all",
  "gpt-image-2-flatfee",
  "gpt-image-2-flatfee-2k",
  "gpt-image-2-flatfee-4k",
];
const videoModelOptions = [
  "veo3.1-fast",
  "veo3.1-components",
  "veo3.1",
];
const grokVideoModelOptions = [
  "grok-videos",
];
const grokUnifiedVideoModelOptions = [
  "grok-video-3",
  "grok-video-3-10s",
];
const veoUnifiedVideoModelOptions = [
  "veo3.1-fast-components",
];
const veoOpenAIVideoModelOptions = [
  "veo_3_1-fast-4K",
  "veo_3_1-fast",
];
const zhipuCogVideoModelOptions = [
  "cogvideox-3",
];
const grokUnifiedAspectRatioOptions = [
  "2:3",
  "3:2",
  "1:1",
];
const veoUnifiedAspectRatioOptions = [
  "16:9",
  "9:16",
];
const bltVideoAspectRatioOptions = [
  "16:9",
  "9:16",
];
const grokUnifiedSizeOptions = [
  "720P",
];
const grokAspectRatioOptions = [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
];
const grokDurationOptions = Array.from({ length: 15 }, (_value, index) => index + 1);
const zhipuVideoSizeOptions = [
  "1280x720",
  "720x1280",
  "1024x1024",
  "1920x1080",
  "1080x1920",
  "2048x1080",
  "3840x2160",
];
const zhipuVideoFpsOptions = [30, 60];
const zhipuVideoDurationOptions = [5, 10];
const videoChannelOptions: Array<{ value: VideoChannelKey; labelZh: string; labelEn: string; hintZh: string; hintEn: string; endpoint: string }> = [
  {
    value: "veo",
    labelZh: "BLT 渠道",
    labelEn: "BLT Channel",
    hintZh: "走 BLT /v2/videos/generations，支持 veo3.1 系列。",
    hintEn: "Uses BLT /v2/videos/generations for veo3.1 models.",
    endpoint: "/v2/videos",
  },
  {
    value: "grok-openai",
    labelZh: "云雾 Grok OpenAI",
    labelEn: "Yunwu Grok OpenAI",
    hintZh: "走云雾 /v1/videos 创建和查询 Grok 视频任务，图片会转为 base64 images 数组。",
    hintEn: "Uses Yunwu /v1/videos for Grok video tasks. Images are uploaded as a base64 images array.",
    endpoint: "/v1/videos",
  },
  {
    value: "grok-unified",
    labelZh: "云雾 Grok 统一",
    labelEn: "Yunwu Grok Unified",
    hintZh: "走云雾 /v1/video/create 创建任务，按统一格式提交 images 图片链接数组。",
    hintEn: "Uses Yunwu /v1/video/create and submits image URLs through the images array.",
    endpoint: "/v1/video",
  },
  {
    value: "veo-unified",
    labelZh: "云雾 VEO 统一",
    labelEn: "Yunwu VEO Unified",
    hintZh: "走云雾 /v1/video/create 创建 VEO 统一格式任务，首期支持 veo3.1-fast-components。",
    hintEn: "Uses Yunwu /v1/video/create for VEO unified tasks. Initially supports veo3.1-fast-components.",
    endpoint: "/v1/video",
  },
  {
    value: "veo-openai",
    labelZh: "云雾 VEO OpenAI",
    labelEn: "Yunwu VEO OpenAI",
    hintZh: "走云雾 OpenAI 视频格式 /v1/videos，按 multipart/form-data 提交 input_reference。",
    hintEn: "Uses Yunwu OpenAI video format at /v1/videos with multipart/form-data input_reference.",
    endpoint: "/v1/videos",
  },
  {
    value: "zhipu-cogvideo",
    labelZh: "智谱 CogVideoX-3",
    labelEn: "Zhipu CogVideoX-3",
    hintZh: "走智谱 /api/paas/v4/videos/generations，支持文生视频、图生视频和首尾帧。",
    hintEn: "Uses Zhipu /api/paas/v4/videos/generations for text, image, and first-last-frame video.",
    endpoint: "/videos/generations",
  },
];
const sizeOptions = [
  { value: "1024x1024", labelEn: "1024x1024 (square)", labelZh: "1024x1024 （正方形）" },
  { value: "1536x1024", labelEn: "1536x1024 (landscape)", labelZh: "1536x1024 （横向）" },
  { value: "1024x1536", labelEn: "1024x1536 (portrait)", labelZh: "1024x1536 （竖屏）" },
  { value: "2048x2048", labelEn: "2048x2048 (2K square)", labelZh: "2048x2048 （2K 正方形）" },
  { value: "2048x1152", labelEn: "2048x1152 (2K landscape)", labelZh: "2048x1152 （2K 横向）" },
  { value: "3840x2160", labelEn: "3840x2160 (4K landscape)", labelZh: "3840x2160 （4K 横向）" },
  { value: "2160x3840", labelEn: "2160x3840 (4K portrait)", labelZh: "2160x3840 （4K 竖屏）" },
];
const qualityOptions: Array<{ value: QualityKey; labelEn: string; labelZh: string }> = [
  { value: "low", labelEn: "low", labelZh: "低的" },
  { value: "medium", labelEn: "medium", labelZh: "中间" },
  { value: "high", labelEn: "high", labelZh: "高的" },
  { value: "auto", labelEn: "auto (default)", labelZh: "auto （默认）" },
];

const imageEntryOptions: Array<{
  key: ImageEntryKey;
  labelZh: string;
  labelEn: string;
  hintZh: string;
  hintEn: string;
  path: string;
}> = [
  {
    key: "official",
    labelZh: "中转生图",
    labelEn: "Official Image",
    hintZh: "使用预设 API Base，可直接填写授权 API Key。",
    hintEn: "Uses a preset API Base and your API key.",
    path: "/v1/images/generations",
  },
  {
    key: "custom",
    labelZh: "gpt生图",
    labelEn: "GPT Image",
    hintZh: "手动填写兼容 OpenAI Images 协议的 API Base 和 Key。",
    hintEn: "Enter any OpenAI-compatible Images API base and key.",
    path: "custom base",
  },
];

const modeOptions: Array<{
  key: ModeKey;
  labelZh: string;
  labelEn: string;
  hintZh: string;
  hintEn: string;
  path: string;
  docUrl: string;
}> = [
  {
    key: "generation",
    labelZh: "中转生图",
    labelEn: "Image Generate",
    hintZh: "POST /v1/images/generations，JSON 请求体。",
    hintEn: "POST /v1/images/generations with a JSON body.",
    path: "/v1/images/generations",
    docUrl: "https://value-apiqk.apifox.cn/449011210e0",
  },
  {
    key: "video",
    labelZh: "生成视频",
    labelEn: "Video Generate",
    hintZh: "视频接口固定异步，支持文生视频和图生视频任务。",
    hintEn: "Async-only video tasks for text-to-video and image-to-video.",
    path: "/v2/videos/generations",
    docUrl: "https://gpt-best.apifox.cn/api-343590061",
  },
];

const lang = ref<LangKey>("zh");
const mode = ref<ModeKey>("generation");
const imageEntry = ref<ImageEntryKey>("official");
const executionMode = ref<ExecutionMode>("sync");
const apiKey = ref("");
const customImageApiKey = ref("");
const baseUrl = ref(DEFAULT_API_BASE_URL);
const customImageBaseUrl = ref("");
const customImageMode = ref<CustomImageMode>("text-to-image");
const model = ref(OFFICIAL_IMAGE_DEFAULT_MODEL);
const prompt = ref("");
const imageUrl = ref("");
const imageDataUrl = ref("");
const imageFileName = ref("");
const selectedHistoryImageKey = ref("");
const generationImageUrls = ref([""]);
const selectedGenerationHistoryImageKeys = ref([""]);
const videoChannel = ref<VideoChannelKey>("veo");
const grokReferenceMode = ref<GrokReferenceMode>("single");
const grokInputReference = ref("");
const selectedGrokHistoryImageKey = ref("");
const videoImageUrls = ref(["", "", ""]);
const selectedVideoHistoryImageKeys = ref(["", "", ""]);
const grokAspectRatio = ref("16:9");
const grokDuration = ref(10);
const grokResolution = ref("720P");
const veoEnhancePrompt = ref(true);
const veoEnableUpsample = ref(false);
const zhipuVideoQuality = ref<ZhipuVideoQuality>("quality");
const zhipuVideoSize = ref("1920x1080");
const zhipuVideoFps = ref(30);
const zhipuVideoDuration = ref(5);
const zhipuWithAudio = ref(true);
const zhipuWatermarkEnabled = ref(true);
const size = ref("1024x1024");
const quality = ref<QualityKey>("auto");
const count = ref(1);
const b64Json = ref(false);
const loading = ref(false);
const queryingTask = ref(false);
const errorMessage = ref("");
const responseJson = ref<any>(null);
const previewUrls = ref<string[]>([]);
const videoPreviewUrls = ref<string[]>([]);
const historyRecords = ref<ChatHistoryRecord[]>([]);
const activeHistoryId = ref("");
const historyDrawerOpen = ref(false);
let pollingTimer: ReturnType<typeof setInterval> | null = null;
const countdownSeconds = ref(0);
const countdownTotalSeconds = ref(0);
const countdownMediaType = ref<MediaType>("image");
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let syncingApiKeyFromStorage = false;

const currentMode = computed(() => modeOptions.find((item) => item.key === mode.value) || modeOptions[0]);
const isVideoMode = computed(() => mode.value === "video");
const isCustomImageEntry = computed(() => !isVideoMode.value && imageEntry.value === "custom");
const isCustomImageToImage = computed(() => isCustomImageEntry.value && customImageMode.value === "image-to-image");
const isGrokOpenAIFormatChannel = computed(() => isVideoMode.value && videoChannel.value === "grok-openai");
const isGrokUnifiedFormatChannel = computed(() => isVideoMode.value && videoChannel.value === "grok-unified");
const isVeoUnifiedFormatChannel = computed(() => isVideoMode.value && videoChannel.value === "veo-unified");
const isVeoOpenAIFormatChannel = computed(() => isVideoMode.value && videoChannel.value === "veo-openai");
const isZhipuCogVideoChannel = computed(() => isVideoMode.value && videoChannel.value === "zhipu-cogvideo");
const isBltVideoChannel = computed(() => isVideoMode.value && videoChannel.value === "veo");
const isYunwuUnifiedVideoChannel = computed(() => isGrokUnifiedFormatChannel.value || isVeoUnifiedFormatChannel.value);
const isYunwuVideoChannel = computed(() => isGrokOpenAIFormatChannel.value || isYunwuUnifiedVideoChannel.value || isVeoOpenAIFormatChannel.value);
const currentModeLabel = computed(() => isVideoMode.value ? modeLabel(mode.value, videoChannel.value) : imageEntryLabel(imageEntry.value));
const activeModelOptions = computed(() => isVideoMode.value
  ? (isGrokOpenAIFormatChannel.value ? grokVideoModelOptions : isGrokUnifiedFormatChannel.value ? grokUnifiedVideoModelOptions : isVeoUnifiedFormatChannel.value ? veoUnifiedVideoModelOptions : isVeoOpenAIFormatChannel.value ? veoOpenAIVideoModelOptions : isZhipuCogVideoChannel.value ? zhipuCogVideoModelOptions : videoModelOptions)
  : isCustomImageEntry.value && !modelOptions.includes(model.value)
    ? [model.value, ...modelOptions]
    : modelOptions);
const effectiveBaseUrl = computed(() => isVideoMode.value ? videoBaseForChannel(videoChannel.value) : isCustomImageEntry.value ? customImageBaseUrl.value.trim() : baseUrl.value.trim());
const customImageEndpointPath = computed(() => isCustomImageToImage.value ? "/v1/images/edits" : "/v1/images/generations");
const customImageGenerationEndpoint = computed(() => isCustomImageEntry.value ? buildCustomPreviewEndpoint(customImageBaseUrl.value, customImageEndpointPath.value) : "");
const effectiveApiKey = computed(() => isCustomImageEntry.value ? customImageApiKey.value : apiKey.value);
const needsImage = computed(() => mode.value === "edit" || mode.value === "image-chat" || isCustomImageToImage.value);
const isGrokSingleReferenceMode = computed(() => isGrokOpenAIFormatChannel.value && grokReferenceMode.value === "single");
const isGrokMultiReferenceMode = computed(() => isGrokOpenAIFormatChannel.value && grokReferenceMode.value === "multi");
const videoImageLimit = computed(() => {
  if (isZhipuCogVideoChannel.value) return 2;
  if (isVeoOpenAIFormatChannel.value) return 2;
  if (isVeoUnifiedFormatChannel.value) return 3;
  if (isGrokUnifiedFormatChannel.value) return 7;
  if (isGrokOpenAIFormatChannel.value) return isGrokMultiReferenceMode.value ? 3 : 0;
  if (model.value === "veo3.1-components") return 3;
  if (model.value === "veo3.1") return 2;
  return 0;
});
const videoAllowsImages = computed(() => isVideoMode.value && videoImageLimit.value > 0);
const supportsImageInput = computed(() => (mode.value === "generation" && !isCustomImageEntry.value) || needsImage.value || videoAllowsImages.value || (isGrokOpenAIFormatChannel.value && isGrokSingleReferenceMode.value));
const asyncAvailable = computed(() => mode.value === "generation" && !isCustomImageEntry.value);
const videoDocUrl = computed(() => {
  if (isZhipuCogVideoChannel.value) return "https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E8%A7%86%E9%A2%91%E7%94%9F%E6%88%90%E5%BC%82%E6%AD%A5";
  if (isVeoOpenAIFormatChannel.value) return "https://yunwu.apifox.cn/api-370109881";
  if (isVeoUnifiedFormatChannel.value) return "https://yunwu.apifox.cn/api-311083745";
  if (isGrokUnifiedFormatChannel.value) return "https://yunwu.apifox.cn/api-385288046";
  if (isGrokOpenAIFormatChannel.value) return "https://yunwu.apifox.cn/api-444583342";
  return videoImages.value.length ? "https://gpt-best.apifox.cn/api-343632235" : "https://gpt-best.apifox.cn/api-343590061";
});
const videoStatusDocUrl = computed(() => {
  if (isZhipuCogVideoChannel.value) return "https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E6%9F%A5%E8%AF%A2%E5%BC%82%E6%AD%A5%E7%BB%93%E6%9E%9C";
  if (isVeoOpenAIFormatChannel.value) return "https://yunwu.apifox.cn/api-370109885";
  if (isVeoUnifiedFormatChannel.value) return "https://yunwu.apifox.cn/api-311081757";
  if (isGrokUnifiedFormatChannel.value) return "https://yunwu.apifox.cn/api-385288050";
  if (isGrokOpenAIFormatChannel.value) return "https://yunwu.apifox.cn/api-428940785";
  return "";
});
const endpointPath = computed(() => isZhipuCogVideoChannel.value ? "/videos/generations" : isYunwuUnifiedVideoChannel.value ? "/v1/video/create" : isGrokOpenAIFormatChannel.value || isVeoOpenAIFormatChannel.value ? "/v1/videos" : currentMode.value.path);
const statusEndpointPath = computed(() => {
  if (!isVideoMode.value) return "";
  if (isZhipuCogVideoChannel.value) return "/async-result/{id}";
  if (isVeoOpenAIFormatChannel.value) return "/v1/videos/{id}";
  if (isYunwuUnifiedVideoChannel.value || isGrokOpenAIFormatChannel.value) return "/v1/video/query?id={id}";
  return "/v2/videos/generations/{id}";
});
const endpointPreview = computed(() => {
  if (isCustomImageEntry.value) {
    return customImageGenerationEndpoint.value;
  }
  const endpoint = buildPreviewEndpoint(effectiveBaseUrl.value, endpointPath.value);
  if (executionMode.value === "async" && asyncAvailable.value) return withPreviewQuery(endpoint, "async", "true");
  return endpoint;
});
const selectedRecord = computed(() => historyRecords.value.find((record: ChatHistoryRecord) => record.id === activeHistoryId.value) || null);
const selectedAsyncRecord = computed(() => selectedRecord.value?.kind === "async" ? selectedRecord.value : null);
const historyDrawerEnabled = computed(() => true);
const canQuerySelectedTask = computed(() => selectedAsyncRecord.value ? Boolean(keyForRecord(selectedAsyncRecord.value)) : false);
const countdownActive = computed(() => countdownSeconds.value > 0);
const countdownProgress = computed(() => countdownTotalSeconds.value
  ? Math.max(0, Math.min(100, Math.round((countdownSeconds.value / countdownTotalSeconds.value) * 100)))
  : 0);
const generationImages = computed(() => {
  return Array.from(new Set(generationImageUrls.value.map((url: string) => url.trim()).filter(Boolean))).slice(0, 10);
});
const customEditImages = computed(() => {
  const images = [...generationImages.value];
  const uploaded = imageDataUrl.value.trim();
  if (uploaded) images.push(uploaded);
  return Array.from(new Set(images.map((url: string) => url.trim()).filter(Boolean))).slice(0, 10);
});
const videoImages = computed(() => {
  if (isGrokOpenAIFormatChannel.value && !isGrokMultiReferenceMode.value) return [];
  const values = videoImageUrls.value.map((url: string) => url.trim()).filter(Boolean);
  const filtered = isVeoOpenAIFormatChannel.value
    ? values
    : isGrokOpenAIFormatChannel.value
    ? values.filter((url: string) => /^data:image\//i.test(url))
    : isYunwuUnifiedVideoChannel.value
      ? values.filter((url: string) => /^https?:\/\//i.test(url))
      : values;
  return Array.from(new Set(filtered)).slice(0, videoImageLimit.value || 3);
});
const veoOpenAIFrameImages = computed(() => videoImageUrls.value.slice(0, 2).map((url: string) => url.trim()));
const grokSingleInputReference = computed(() => isGrokOpenAIFormatChannel.value && isGrokSingleReferenceMode.value ? grokInputReference.value.trim() : "");
const showRequestJson = computed(() => !isYunwuVideoChannel.value);
const apiBaseWarning = computed(() => {
  if (isVideoMode.value) return "";
  if (!isApifoxDocumentationBase(effectiveBaseUrl.value)) return "";
  return lang.value === "zh"
    ? "当前 API Base 看起来是 Apifox 文档地址，不一定是真实运行接口；如果返回 504 或超时，请向接口提供方确认真实 API Base。"
    : "The current API Base looks like an Apifox documentation URL, not necessarily the runtime API host. Confirm the real API Base if requests return 504 or timeout.";
});
const imageSource = computed(() => imageDataUrl.value || imageUrl.value.trim());
const historyImageOptions = computed(() => {
  return historyRecords.value.flatMap((record: ChatHistoryRecord) => {
    return record.images.map((url: string, index: number) => ({
      key: `${record.id}:${index}`,
      url,
      label: `${formatHistoryTime(record.createdAt)} · ${promptSummary(record.prompt)} · ${index + 1}`,
    }));
  }).slice(0, HISTORY_LIMIT);
});
const copy = computed(() => {
  const zh = lang.value === "zh";
  return {
    title: zh ? "调试台" : "Debug Console",
    subtitle: zh
      ? "公开 BYOK 页面，支持图片生成和异步视频任务。密钥会缓存在本机浏览器，请勿在公共设备保存。"
      : "A public BYOK page for image generation and async video tasks. The key is cached in this browser; avoid public devices.",
    model: zh ? "模型" : "Model",
    apiKey: zh ? "授权 API 密钥" : "API Key",
    customApiKey: zh ? "自定义 API Key" : "Custom API Key",
    baseUrl: zh ? "运行 API Base" : "Runtime API Base",
    customBaseUrl: zh ? "自定义 API Base" : "Custom API Base",
    customImageType: zh ? "自定义类型" : "Custom Type",
    textToImage: zh ? "文生图" : "Text to Image",
    imageToImage: zh ? "图生图" : "Image to Image",
    autoVideoBaseHint: zh ? "视频 API Base 根据入口渠道自动选择，不需要在这里手动切换。" : "The video API base is selected automatically from the channel entry.",
    docUrl: zh ? "接口文档" : "API Docs",
    endpointPath: zh ? "接口路径" : "API Path",
    upstreamUrl: zh ? "最终请求地址" : "Final Upstream URL",
    statusDocUrl: zh ? "查询文档" : "Status Docs",
    statusEndpointPath: zh ? "查询路径" : "Status Path",
    prompt: zh ? "提示词" : "Prompt",
    inputImage: zh ? "输入图片" : "Input Image",
    imageUrl: zh ? "图片链接" : "Image URL",
    referenceImage: zh ? "参考图片" : "Reference Image",
    optionalReferenceImage: zh ? "参考图片（可选）" : "Reference Image (optional)",
    sourceImage: zh ? "输入图片" : "Source Image",
    addReferenceImage: zh ? "添加参考图片" : "Add Reference Image",
    removeReferenceImage: zh ? "移除" : "Remove",
    historyImage: zh ? "历史图片" : "History Image",
    historyImagePlaceholder: zh ? "从历史记录选择图片" : "Select an image from history",
    imageHint: zh ? "中转生图可选填多张图片链接，或从历史生成结果中选择多张作为参考。" : "Official generation can optionally use multiple image URLs or generated history images as references.",
    videoImageHint: zh ? "当前视频模型支持图片输入，可手动填写 URL、上传本地图片，或从历史图片中选择。" : "The current video model supports image URLs, local uploads, or image history.",
    videoNoImages: zh ? "veo3.1-fast 不支持图片输入，仅提交文生视频任务。" : "veo3.1-fast does not support image input and submits text-to-video only.",
    videoTaskOnly: zh ? "视频接口固定为异步任务，不需要选择同步/异步。" : "Video APIs are async task APIs, so no sync/async selector is needed.",
    videoChannel: zh ? "视频渠道" : "Video Channel",
    grokReferenceMode: zh ? "参考图模式" : "Reference Mode",
    grokSingleReference: zh ? "单图" : "Single Image",
    grokMultiReference: zh ? "多图" : "Multiple Images",
    grokAspectRatio: zh ? "比例" : "Aspect Ratio",
    grokDuration: zh ? "时长（秒）" : "Duration (seconds)",
    grokResolution: zh ? "尺寸" : "Size",
    veoEnhancePrompt: zh ? "自动英文优化" : "Enhance Prompt",
    veoEnableUpsample: zh ? "超分" : "Upsample",
    bltVideoParamHint: zh ? "BLT 视频会提交 aspect_ratio 和 enhance_prompt；开启 enhance_prompt 可让中文提示词自动优化/转英文。" : "BLT video submits aspect_ratio and enhance_prompt. Enable enhance_prompt to optimize or translate Chinese prompts to English.",
    grokSingleReferenceHint: zh ? "单图模式只传 1 张参考图，字段为 input_reference，值为字符串；可填写 URL 或从历史图片选择，不会转 base64。" : "Single-image mode sends one reference through input_reference as a string. Enter a URL or choose history; it is not converted to base64.",
    grokMultiReferenceHint: zh ? "多图模式维持现状：只支持选择本地文件，页面会转为 base64，并通过 images 数组上传。" : "Multi-image mode keeps the current behavior: choose local files only, converted to base64 and uploaded through the images array.",
    grokUnifiedReferenceHint: zh ? "Grok 统一格式固定提交 images 图片链接数组；图片必须是 URL，不会转 base64。" : "The Grok unified format submits the images URL array; images must be URLs and are not converted to base64.",
    veoUnifiedReferenceHint: zh ? "VEO 统一格式的 images 可选，当前模型最多 3 张，图片会作为视频元素；只支持 URL，不会转 base64。" : "Images are optional for VEO unified. The current model supports up to 3 URLs as video components; they are not converted to base64.",
    firstFrame: zh ? "首帧" : "First Frame",
    lastFrame: zh ? "尾帧" : "Last Frame",
    veoOpenAIReferenceHint: zh ? "VEO OpenAI 格式必须提交首帧和尾帧 2 张 input_reference，可填写图片 URL、上传本地图片，或从历史图片中选择。" : "The VEO OpenAI format requires two input_reference images: first frame and last frame. Enter image URLs, upload local images, or choose from history.",
    zhipuReferenceHint: zh ? "智谱 CogVideoX-3 可不传图做文生视频，也可传 1 张参考图或 2 张首尾帧；图片支持 URL 或本地上传转 base64。" : "Zhipu CogVideoX-3 can run text-to-video, one reference image, or two first-last-frame images. Images can be URLs or uploaded as base64.",
    zhipuQuality: zh ? "输出模式" : "Output Mode",
    zhipuWithAudio: zh ? "生成音效" : "Generate Audio",
    zhipuWatermark: zh ? "水印" : "Watermark",
    zhipuParamHint: zh ? "智谱会提交 quality、with_audio、watermark_enabled、size、fps 和 duration；模型固定为 cogvideox-3。" : "Zhipu submits quality, with_audio, watermark_enabled, size, fps, and duration. The model is fixed to cogvideox-3.",
    videoResult: zh ? "视频结果" : "Video Result",
    mediaImage: zh ? "图片" : "Image",
    mediaVideo: zh ? "视频" : "Video",
    upload: zh ? "选择文件" : "Choose File",
    executionMode: zh ? "运行方式" : "Execution",
    syncMode: zh ? "同步生成" : "Sync",
    asyncMode: zh ? "异步任务" : "Async",
    asyncUnavailable: zh ? "异步仅支持中转生图接口。" : "Async is only available for official image generation.",
    size: zh ? "尺寸" : "Size",
    quality: zh ? "质量" : "Quality",
    count: zh ? "生成数量" : "Count",
    b64Json: zh ? "b64_json" : "b64_json",
    reset: zh ? "重置" : "Reset",
    generate: zh ? "生成" : "Generate",
    submitAsync: zh ? "提交异步任务" : "Submit Async Task",
    generating: zh ? "生成中..." : "Generating...",
    requestJson: zh ? "请求 JSON" : "Request JSON",
    responseJson: zh ? "响应 JSON" : "Response JSON",
    preview: zh ? "结果预览" : "Preview",
    empty: zh ? "点击生成后可在此预览结果" : "Generated images will appear here.",
    history: zh ? "任务与历史" : "Tasks & History",
    historyEmpty: zh ? "同步图片结果、异步图片任务和视频任务会保存到这里。" : "Sync image results, async image tasks, and video tasks are saved here.",
    clearHistory: zh ? "清空" : "Clear",
    deleteHistory: zh ? "删除" : "Delete",
    images: zh ? "张图片" : "images",
    videos: zh ? "个视频" : "videos",
    taskStatus: zh ? "异步任务状态" : "Async Task Status",
    taskId: zh ? "任务 ID" : "Task ID",
    status: zh ? "状态" : "Status",
    progress: zh ? "进度" : "Progress",
    failReason: zh ? "失败原因" : "Failure Reason",
    lastUpdated: zh ? "最近查询" : "Last Checked",
    queryTask: zh ? "查询任务" : "Check Task",
    queryingTask: zh ? "查询中..." : "Checking...",
    noTask: zh ? "选择或提交异步任务后可在这里查看状态。" : "Select or submit an async task to view status here.",
    countdownTitle: zh ? "生成倒计时" : "Generation Countdown",
    countdownImage: zh ? "图片生成预计 90 秒" : "Image generation estimate: 90s",
    countdownVideo: zh ? "视频生成预计 200 秒" : "Video generation estimate: 200s",
    needsKeyToQuery: zh ? "请先填写授权 API 密钥后再查询任务。" : "Enter the API key before checking the task.",
    noUpload: zh ? "暂未上传图片" : "No image uploaded",
    uploadedImageCount: zh ? "已上传图片" : "Uploaded images",
    keyHint: zh ? "会缓存在本机浏览器；预览中会脱敏。" : "Cached in this browser and redacted in previews.",
    customKeyHint: zh ? "仅用于 gpt生图入口，会缓存在本机浏览器；预览中会脱敏。" : "Used only by the GPT image entry, cached in this browser and redacted in previews.",
    baseHint: zh ? "已默认配置，可按需切换；正常只需要填写 API Key 和提示词。" : "Preconfigured by default and switchable if needed. Usually you only need to enter the API key and prompt.",
    customBaseHint: zh ? "填写服务商根地址，例如 https://api.openai.com；接口路径会按文生图/图生图自动关联。" : "Enter the provider root, for example https://api.openai.com. The path is linked to the selected image type.",
  };
});

const sanitizedRequest = computed(() => {
  const provider = {
    base: effectiveBaseUrl.value,
    imageEndpoint: isCustomImageEntry.value ? customImageEndpointPath.value : undefined,
    model: model.value.trim(),
    key: effectiveApiKey.value ? "Bearer ***REDACTED***" : "",
  };
  const base = {
    mode: isCustomImageToImage.value ? "edit" : mode.value,
    imageEntry: isVideoMode.value ? undefined : imageEntry.value,
    executionMode: isVideoMode.value ? "async-task" : executionMode.value,
    provider,
    endpointPath: endpointPath.value,
    upstreamUrl: endpointPreview.value,
    documentationUrl: isVideoMode.value ? videoDocUrl.value : currentMode.value.docUrl,
    statusDocumentationUrl: isVideoMode.value ? videoStatusDocUrl.value : undefined,
    statusEndpointPath: isVideoMode.value ? statusEndpointPath.value : undefined,
    prompt: prompt.value,
  } as Record<string, unknown>;
  if (!isVideoMode.value) {
    base.size = size.value;
    base.quality = quality.value;
    if (isCustomImageEntry.value) {
      base.customImageMode = customImageMode.value;
      base.imageEndpoint = customImageEndpointPath.value;
    } else {
      base.b64_json = mode.value === "generation" ? b64Json.value : false;
    }
  }
  if (isVideoMode.value) {
    base.videoChannel = videoChannel.value;
    base.imageLimit = videoImageLimit.value;
    if (isZhipuCogVideoChannel.value) {
      base.quality = zhipuVideoQuality.value;
      base.size = zhipuVideoSize.value;
      base.fps = zhipuVideoFps.value;
      base.duration = zhipuVideoDuration.value;
      base.with_audio = zhipuWithAudio.value;
      base.watermark_enabled = zhipuWatermarkEnabled.value;
      if (videoImages.value.length) base.image_url = videoImages.value.length > 1 ? videoImages.value : videoImages.value[0];
    } else if (isYunwuVideoChannel.value) {
      if (isVeoOpenAIFormatChannel.value) {
        base.size = grokAspectRatio.value;
        base.seconds = grokDuration.value;
        base.input_reference = {
          firstFrame: veoOpenAIFrameImages.value[0] || "",
          lastFrame: veoOpenAIFrameImages.value[1] || "",
        };
        base.watermark = "false";
      } else if (isVeoUnifiedFormatChannel.value) {
        base.aspect_ratio = grokAspectRatio.value;
        base.enhance_prompt = veoEnhancePrompt.value;
        base.enable_upsample = veoEnableUpsample.value;
        if (videoImages.value.length) base.images = videoImages.value;
      } else if (isGrokUnifiedFormatChannel.value) {
        base.aspect_ratio = grokAspectRatio.value;
        base.size = grokResolution.value;
        base.images = videoImages.value;
      } else {
        base.grokReferenceMode = grokReferenceMode.value;
        if (grokSingleInputReference.value) base.input_reference = grokSingleInputReference.value;
        if (videoImages.value.length) base.images = videoImages.value;
        base.size = grokAspectRatio.value;
        base.seconds = grokDuration.value;
      }
    } else {
      base.aspect_ratio = grokAspectRatio.value;
      base.enhance_prompt = veoEnhancePrompt.value;
      base.images = videoImages.value;
    }
  }
  if (mode.value === "generation" && !isCustomImageEntry.value) {
    base.n = count.value;
    if (generationImages.value.length) {
      base.image = generationImages.value;
    }
  }
  if (mode.value === "edit" || isCustomImageToImage.value) {
    base.n = count.value;
    base.image = imageFileName.value || (imageUrl.value ? "[image-url]" : "");
  }
  if (mode.value === "image-chat") {
    base.image = imageFileName.value || imageUrl.value || "";
  }
  return base;
});

const requestJson = computed(() => JSON.stringify(sanitizedRequest.value, null, 2));
const responseText = computed(() => responseJson.value ? JSON.stringify(responseJson.value, null, 2) : "");
const submitLabel = computed(() => isVideoMode.value ? copy.value.submitAsync : executionMode.value === "async" ? copy.value.submitAsync : copy.value.generate);

function buildPreviewEndpoint(baseRaw: string, path: string) {
  const base = baseRaw.trim().replace(/\/+$/, "");
  if (!base) return path;
  if (base.endsWith(path)) return base;
  const withoutKnownEndpoint = base.replace(/\/v[12]\/(?:(?:images|videos)\/(?:generations(?:\/[^/]+)?|edits)|videos(?:\/[^/]+)?|chat\/completions)$/i, "");
  return withoutKnownEndpoint + path;
}

function buildCustomPreviewEndpoint(baseRaw: string, endpointRaw: string) {
  const endpoint = endpointRaw.trim();
  if (!endpoint) return "";
  if (/^https?:\/\//i.test(endpoint)) return endpoint.replace(/\/+$/, "");
  const base = baseRaw.trim().replace(/\/+$/, "");
  if (!base) return endpoint;
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : "/" + endpoint;
  if (/\/v[12]$/i.test(base) && /^\/v[12]\//i.test(normalizedEndpoint)) {
    return base.replace(/\/v[12]$/i, "") + normalizedEndpoint;
  }
  return buildPreviewEndpoint(base, normalizedEndpoint);
}

function withPreviewQuery(endpoint: string, key: string, value: string) {
  try {
    const url = new URL(endpoint);
    url.searchParams.set(key, value);
    return url.toString();
  } catch {
    const separator = endpoint.includes("?") ? "&" : "?";
    return `${endpoint}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}

function videoBaseForChannel(channel: VideoChannelKey) {
  return VIDEO_API_BASE_BY_CHANNEL[channel] || VIDEO_API_BASE_BY_CHANNEL.veo;
}

function isApifoxDocumentationBase(value: string) {
  const raw = value.trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (!APIFOX_DOC_HOSTS.has(parsed.hostname)) return false;
    return parsed.pathname === "/" || /^\/\d+e\d+\/?$/i.test(parsed.pathname);
  } catch {
    return Array.from(APIFOX_DOC_HOSTS).some((host) => raw === `https://${host}` || raw.startsWith(`https://${host}/`));
  }
}

function sanitizeHistoryRecord(record: unknown): ChatHistoryRecord | null {
  if (!record || typeof record !== "object") return null;
  const item = record as Partial<ChatHistoryRecord>;
  if (!item.id || !item.createdAt || !item.mode) return null;
  if (!modeOptions.some((option) => option.key === item.mode)) return null;
  const status = normalizeRecordStatus(item.status, item.taskId);
  const kind = item.kind === "async" || item.taskId ? "async" : "sync";
  const mediaType: MediaType = item.mediaType === "video" || item.mode === "video" ? "video" : "image";
  const images = Array.isArray(item.images) ? item.images.map((url) => String(url || "").trim()).filter(Boolean) : [];
  const videos = Array.isArray(item.videos) ? item.videos.map((url) => String(url || "").trim()).filter(Boolean) : [];
  const recordBase = String(item.base || "");
  const imageEntryValue: ImageEntryKey = mediaType === "image" && (item.imageEntry === "custom" || (recordBase && !apiBaseOptions.includes(recordBase)))
    ? "custom"
    : "official";
  return {
    id: String(item.id),
    kind,
    mediaType,
    imageEntry: imageEntryValue,
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt || item.createdAt),
    mode: item.mode,
    model: String(item.model || ""),
    base: recordBase,
    imageEndpoint: String((item as any).imageEndpoint || ""),
    prompt: String(item.prompt || ""),
    size: String(item.size || "1024x1024"),
    quality: qualityOptions.some((option) => option.value === item.quality) ? item.quality as QualityKey : "auto",
    n: Number.isFinite(Number(item.n)) ? Number(item.n) : 1,
    taskId: String(item.taskId || ""),
    status,
    progress: String(item.progress || ""),
    failReason: String(item.failReason || ""),
    upstreamUrl: String(item.upstreamUrl || ""),
    imageInputLabel: String(item.imageInputLabel || ""),
    imageInputValue: String(item.imageInputValue || ""),
    videoChannel: String(item.videoChannel || "") === "grok" || String(item.videoChannel || "") === "sora" || String(item.videoChannel || "") === "grok-openai"
      ? "grok-openai"
      : String(item.videoChannel || "") === "grok-unified"
        ? "grok-unified"
        : String(item.videoChannel || "") === "veo-unified"
          ? "veo-unified"
          : String(item.videoChannel || "") === "veo-openai"
            ? "veo-openai"
            : String(item.videoChannel || "") === "zhipu-cogvideo"
              ? "zhipu-cogvideo"
              : "veo",
    grokReferenceMode: String((item as any).grokReferenceMode || "") === "multi" ? "multi" : "single",
    videoImages: Array.isArray(item.videoImages) ? item.videoImages.map((url) => String(url || "").trim()).filter(Boolean) : [],
    coverUrl: String(item.coverUrl || images[0] || ""),
    images,
    videos,
    response: item.response ?? null,
  };
}

function normalizeRecordStatus(value: unknown, taskId?: unknown): TaskStatus {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  if (normalized === "completed" || normalized === "done" || normalized === "succeeded" || normalized === "success") return "SUCCESS";
  if (normalized === "failed" || normalized === "fail" || normalized === "failure" || normalized === "expired" || normalized === "error" || normalized === "cancelled" || normalized === "canceled") return "FAILURE";
  if (normalized === "queued" || normalized === "in_progress" || normalized === "processing" || normalized === "pending" || normalized === "running") return "IN_PROGRESS";
  if (raw === "IN_PROGRESS" || raw === "SUCCESS" || raw === "FAILURE" || raw === "SYNC_SUCCESS") return raw;
  return taskId ? "IN_PROGRESS" : "SYNC_SUCCESS";
}

function persistHistory() {
  if (!import.meta.client) return;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyRecords.value.slice(0, HISTORY_LIMIT)));
  } catch {}
}

function loadHistory() {
  if (!import.meta.client) return;
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
    const records = Array.isArray(parsed) ? parsed.map(sanitizeHistoryRecord).filter(Boolean) as ChatHistoryRecord[] : [];
    historyRecords.value = records.slice(0, HISTORY_LIMIT);
  } catch {
    historyRecords.value = [];
  }
}

function persistApiKey() {
  if (!import.meta.client) return;
  try {
    if (syncingApiKeyFromStorage) return;
    setStoredApiKey(activeApiKeyStorageKey(), activeApiKeyRef().value);
  } catch {}
}

function loadApiKey() {
  if (!import.meta.client) return;
  syncingApiKeyFromStorage = true;
  try {
    migrateLegacyApiKeys();
    apiKey.value = getStoredApiKey(activeApiKeyStorageKey());
    customImageApiKey.value = getStoredApiKey("custom-image") || customImageApiKey.value;
  } catch {
    apiKey.value = "";
  } finally {
    syncingApiKeyFromStorage = false;
  }
}

function readStoredApiKeys(): Record<string, string> {
  if (!import.meta.client) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(API_KEYS_STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) out[key] = value.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function writeStoredApiKeys(keys: Record<string, string>) {
  if (!import.meta.client) return;
  const cleaned = Object.fromEntries(Object.entries(keys).filter(([, value]) => value.trim()));
  if (Object.keys(cleaned).length) localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(cleaned));
  else localStorage.removeItem(API_KEYS_STORAGE_KEY);
}

function getStoredApiKey(key: string) {
  return readStoredApiKeys()[key] || "";
}

function setStoredApiKey(key: string, value: string) {
  const keys = readStoredApiKeys();
  const cleanKey = key.trim();
  const cleanValue = value.trim();
  if (!cleanKey) return;
  if (cleanValue) keys[cleanKey] = cleanValue;
  else delete keys[cleanKey];
  writeStoredApiKeys(keys);
}

function migrateLegacyApiKeys() {
  if (!import.meta.client) return;
  const keys = readStoredApiKeys();
  const legacyKey = (localStorage.getItem(API_KEY_STORAGE_KEY) || "").trim();
  if (legacyKey) {
    keys["official-image"] ||= legacyKey;
    keys["video:veo"] ||= legacyKey;
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_IMAGE_PROVIDER_STORAGE_KEY) || "{}");
    const customKey = String(parsed?.key || "").trim();
    if (customKey) keys["custom-image"] ||= customKey;
  } catch {}
  writeStoredApiKeys(keys);
}

function activeApiKeyStorageKey() {
  if (isVideoMode.value) return `video:${videoChannel.value}`;
  return imageEntry.value === "custom" ? "custom-image" : "official-image";
}

function activeApiKeyRef() {
  return imageEntry.value === "custom" && !isVideoMode.value ? customImageApiKey : apiKey;
}

function syncActiveApiKeyFromStorage() {
  if (!import.meta.client) return;
  syncingApiKeyFromStorage = true;
  try {
    activeApiKeyRef().value = getStoredApiKey(activeApiKeyStorageKey());
  } finally {
    syncingApiKeyFromStorage = false;
  }
}

function switchActiveApiKey(update: () => void) {
  if (!import.meta.client) {
    update();
    return;
  }
  setStoredApiKey(activeApiKeyStorageKey(), activeApiKeyRef().value);
  update();
  syncActiveApiKeyFromStorage();
}

function apiKeyForRecord(record: ChatHistoryRecord) {
  if (record.mediaType === "video") return getStoredApiKey(`video:${record.videoChannel || "veo"}`);
  return getStoredApiKey(record.imageEntry === "custom" ? "custom-image" : "official-image");
}

function persistImageEntry() {
  if (!import.meta.client) return;
  try {
    localStorage.setItem(IMAGE_ENTRY_STORAGE_KEY, imageEntry.value);
  } catch {}
}

function persistCustomImageProvider() {
  if (!import.meta.client) return;
  try {
    const data = {
      base: customImageBaseUrl.value.trim(),
      mode: customImageMode.value,
      key: customImageApiKey.value.trim(),
    };
    if (data.base || data.key || data.mode !== "text-to-image") {
      localStorage.setItem(CUSTOM_IMAGE_PROVIDER_STORAGE_KEY, JSON.stringify(data));
    } else {
      localStorage.removeItem(CUSTOM_IMAGE_PROVIDER_STORAGE_KEY);
    }
  } catch {}
}

function loadCustomImageProvider() {
  if (!import.meta.client) return;
  try {
    const savedEntry = localStorage.getItem(IMAGE_ENTRY_STORAGE_KEY);
    if (savedEntry === "custom" || savedEntry === "official") {
      imageEntry.value = savedEntry;
      model.value = defaultImageModelForEntry(savedEntry);
    }
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_IMAGE_PROVIDER_STORAGE_KEY) || "{}");
    customImageBaseUrl.value = String(parsed?.base || "");
    customImageMode.value = parsed?.mode === "image-to-image" ? "image-to-image" : "text-to-image";
    if (!getStoredApiKey("custom-image")) customImageApiKey.value = String(parsed?.key || "");
  } catch {
    customImageBaseUrl.value = "";
    customImageMode.value = "text-to-image";
    if (!getStoredApiKey("custom-image")) customImageApiKey.value = "";
  }
}

function newHistoryId() {
  if (import.meta.client && typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `history-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function videoChannelLabel(channel: VideoChannelKey) {
  const option = videoChannelOptions.find((item) => item.value === channel) || videoChannelOptions[0];
  return lang.value === "zh" ? option.labelZh : option.labelEn;
}

function imageEntryLabel(entry: ImageEntryKey) {
  const option = imageEntryOptions.find((item) => item.key === entry) || imageEntryOptions[0];
  return lang.value === "zh" ? option.labelZh : option.labelEn;
}

function defaultImageModelForEntry(entry: ImageEntryKey) {
  return entry === "custom" ? CUSTOM_IMAGE_DEFAULT_MODEL : OFFICIAL_IMAGE_DEFAULT_MODEL;
}

function defaultVideoModelForChannel(channel: VideoChannelKey) {
  if (channel === "grok-openai") return "grok-videos";
  if (channel === "grok-unified") return "grok-video-3";
  if (channel === "veo-unified") return "veo3.1-fast-components";
  if (channel === "veo-openai") return "veo_3_1-fast";
  if (channel === "zhipu-cogvideo") return "cogvideox-3";
  return "veo3.1-fast";
}

function keyForRecord(record: ChatHistoryRecord) {
  return apiKeyForRecord(record) || (record.mediaType === "video" || record.imageEntry !== "custom" ? apiKey.value.trim() : customImageApiKey.value.trim());
}

function selectImageMode() {
  switchActiveApiKey(() => {
    if (isVideoMode.value) {
      mode.value = "generation";
    }
  });
}

function selectVideoMode() {
  switchActiveApiKey(() => {
    mode.value = "video";
  });
}

function selectImageEntry(nextEntry: ImageEntryKey) {
  switchActiveApiKey(() => {
    imageEntry.value = nextEntry;
    mode.value = "generation";
    if (nextEntry === "custom") customImageMode.value = "text-to-image";
    model.value = defaultImageModelForEntry(nextEntry);
  });
}

function selectVideoChannel(channel: VideoChannelKey) {
  switchActiveApiKey(() => {
    mode.value = "video";
    videoChannel.value = channel;
    if (!activeModelOptions.value.includes(model.value)) {
      model.value = defaultVideoModelForChannel(channel);
    }
  });
}

function modeLabel(recordMode: ModeKey, recordVideoChannel: VideoChannelKey = "veo") {
  const option = modeOptions.find((item) => item.key === recordMode) || modeOptions[0];
  const label = lang.value === "zh" ? option.labelZh : option.labelEn;
  return recordMode === "video" ? `${label} · ${videoChannelLabel(recordVideoChannel)}` : label;
}

function formatHistoryTime(value: string) {
  try {
    return new Date(value).toLocaleString(lang.value === "zh" ? "zh-CN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return value;
  }
}

function promptSummary(value: string) {
  const text = value.trim();
  if (!text) return lang.value === "zh" ? "无提示词" : "No prompt";
  return text.length > 42 ? text.slice(0, 42) + "..." : text;
}

function imageCountText(total: number) {
  if (lang.value === "zh") return `${total} 张图片`;
  return total === 1 ? "1 image" : `${total} images`;
}

function mediaCountText(record: ChatHistoryRecord) {
  if (record.mediaType === "video") {
    if (lang.value === "zh") return `${record.videos.length} 个视频`;
    return record.videos.length === 1 ? "1 video" : `${record.videos.length} videos`;
  }
  return imageCountText(record.images.length);
}

function mediaLabel(record: ChatHistoryRecord) {
  return record.mediaType === "video" ? copy.value.mediaVideo : copy.value.mediaImage;
}

function videoFrameLabel(index: number) {
  if (!isVeoOpenAIFormatChannel.value && !isZhipuCogVideoChannel.value) return `${copy.value.imageUrl} ${index + 1}`;
  return index === 0 ? copy.value.firstFrame : copy.value.lastFrame;
}

function statusLabel(record: ChatHistoryRecord) {
  if (record.kind === "sync" || record.status === "SYNC_SUCCESS") return lang.value === "zh" ? "完成" : "Done";
  if (record.status === "IN_PROGRESS") return lang.value === "zh" ? "处理中" : "Processing";
  if (record.status === "SUCCESS") return lang.value === "zh" ? "成功" : "Success";
  if (record.status === "FAILURE") return lang.value === "zh" ? "失败" : "Failed";
  return record.status;
}

function statusClass(record: ChatHistoryRecord) {
  if (record.status === "FAILURE") return "failed";
  if (record.status === "IN_PROGRESS") return "processing";
  return "success";
}

function currentImageInputLabel() {
  if (isCustomImageToImage.value) {
    if (customEditImages.value.length) return imageCountText(customEditImages.value.length);
    return "";
  }
  if (mode.value === "generation" && generationImages.value.length) return imageCountText(generationImages.value.length);
  if (imageFileName.value) return imageFileName.value;
  if (imageUrl.value.trim()) return imageUrl.value.trim();
  return "";
}

function selectHistoryImage() {
  const selected = historyImageOptions.value.find((item: { key: string; url: string; label: string }) => item.key === selectedHistoryImageKey.value);
  if (!selected) return;
  imageUrl.value = selected.url;
  imageDataUrl.value = "";
  imageFileName.value = "";
}

function selectGenerationHistoryImage(index: number) {
  const selected = historyImageOptions.value.find((item: { key: string; url: string; label: string }) => item.key === selectedGenerationHistoryImageKeys.value[index]);
  if (!selected) return;
  generationImageUrls.value[index] = selected.url;
}

function addGenerationImageInput() {
  if (generationImageUrls.value.length >= 10) return;
  generationImageUrls.value = [...generationImageUrls.value, ""];
  selectedGenerationHistoryImageKeys.value = [...selectedGenerationHistoryImageKeys.value, ""];
}

function removeGenerationImageInput(index: number) {
  if (generationImageUrls.value.length <= 1) {
    generationImageUrls.value = [""];
    selectedGenerationHistoryImageKeys.value = [""];
    return;
  }
  generationImageUrls.value = generationImageUrls.value.filter((_value: string, itemIndex: number) => itemIndex !== index);
  selectedGenerationHistoryImageKeys.value = selectedGenerationHistoryImageKeys.value.filter((_value: string, itemIndex: number) => itemIndex !== index);
}

function customEditImageLabel(index: number) {
  return `${copy.value.sourceImage} ${index + 1}`;
}

function selectVideoHistoryImage(index: number) {
  const selected = historyImageOptions.value.find((item: { key: string; url: string; label: string }) => item.key === selectedVideoHistoryImageKeys.value[index]);
  if (!selected) return;
  videoImageUrls.value[index] = selected.url;
}

function selectGrokHistoryImage() {
  const selected = historyImageOptions.value.find((item: { key: string; url: string; label: string }) => item.key === selectedGrokHistoryImageKey.value);
  if (!selected) return;
  grokInputReference.value = selected.url;
}

function saveHistoryRecord(data: unknown, images: string[]) {
  const normalizedImages = images.map((url) => String(url || "").trim()).filter(Boolean);
  if (!normalizedImages.length) return;
  const now = new Date().toISOString();
  const record: ChatHistoryRecord = {
    id: newHistoryId(),
    kind: "sync",
    mediaType: "image",
    imageEntry: imageEntry.value,
    createdAt: now,
    updatedAt: now,
    mode: mode.value,
    model: model.value.trim(),
    base: effectiveBaseUrl.value,
    imageEndpoint: isCustomImageEntry.value ? customImageEndpointPath.value : "",
    prompt: prompt.value,
    size: size.value,
    quality: quality.value,
    n: Number(count.value) || 1,
    taskId: "",
    status: "SYNC_SUCCESS",
    progress: "",
    failReason: "",
    upstreamUrl: typeof (data as any)?.upstreamUrl === "string" ? (data as any).upstreamUrl : "",
    imageInputLabel: currentImageInputLabel(),
    imageInputValue: isCustomImageToImage.value ? customEditImages.value.join("\n") : mode.value === "generation" ? generationImages.value.join("\n") : imageUrl.value.trim(),
    videoChannel: "veo",
    grokReferenceMode: "single",
    videoImages: [],
    coverUrl: normalizedImages[0],
    images: normalizedImages,
    videos: [],
    response: data,
  };
  historyRecords.value = [record, ...historyRecords.value.filter((item: ChatHistoryRecord) => item.id !== record.id)].slice(0, HISTORY_LIMIT);
  activeHistoryId.value = record.id;
  persistHistory();
}

function upsertHistoryRecord(record: ChatHistoryRecord) {
  historyRecords.value = [record, ...historyRecords.value.filter((item: ChatHistoryRecord) => item.id !== record.id)].slice(0, HISTORY_LIMIT);
  activeHistoryId.value = record.id;
  persistHistory();
}

function restoreHistory(record: ChatHistoryRecord) {
  activeHistoryId.value = record.id;
  mode.value = record.mode;
  imageEntry.value = record.mediaType === "image" ? record.imageEntry || "official" : imageEntry.value;
  videoChannel.value = record.videoChannel || "veo";
  grokReferenceMode.value = record.grokReferenceMode || "single";
  executionMode.value = record.kind === "async" ? "async" : "sync";
  model.value = record.model || defaultImageModelForEntry(record.imageEntry || "official");
  if (record.mediaType !== "video") {
    if (record.imageEntry === "custom") {
      customImageBaseUrl.value = record.base || customImageBaseUrl.value;
      customImageMode.value = record.mode === "edit" ? "image-to-image" : "text-to-image";
    } else {
      baseUrl.value = record.base || DEFAULT_API_BASE_URL;
    }
  }
  prompt.value = record.prompt || "";
  size.value = record.size || "1024x1024";
  quality.value = record.quality || "auto";
  count.value = record.n || 1;
  const restoredGenerationImages = record.mode === "generation" || (record.imageEntry === "custom" && record.mode === "edit")
    ? record.imageInputValue.split(/\n+/).map((url: string) => url.trim()).filter(Boolean)
    : [];
  generationImageUrls.value = record.mode === "generation" || (record.imageEntry === "custom" && record.mode === "edit") ? [...restoredGenerationImages, ""].slice(0, Math.max(1, restoredGenerationImages.length + 1)) : [""];
  selectedGenerationHistoryImageKeys.value = generationImageUrls.value.map(() => "");
  imageUrl.value = record.mode === "generation" || (record.imageEntry === "custom" && record.mode === "edit") ? "" : record.imageInputValue || "";
  imageDataUrl.value = "";
  imageFileName.value = record.imageInputLabel && !record.imageInputValue ? record.imageInputLabel : "";
  selectedHistoryImageKey.value = "";
  grokInputReference.value = record.videoChannel === "grok-openai" && (record.grokReferenceMode || "single") === "single" ? record.videoImages[0] || "" : "";
  selectedGrokHistoryImageKey.value = "";
  videoImageUrls.value = [...record.videoImages, "", "", ""].slice(0, 3);
  selectedVideoHistoryImageKeys.value = ["", "", ""];
  responseJson.value = record.response;
  previewUrls.value = [...record.images];
  videoPreviewUrls.value = [...record.videos];
  errorMessage.value = "";
  if (record.kind === "async" && record.status === "IN_PROGRESS" && keyForRecord(record)) {
    startPolling(record.id);
  } else {
    stopPolling();
  }
}

function openHistoryDrawer() {
  historyDrawerOpen.value = true;
}

function closeHistoryDrawer() {
  historyDrawerOpen.value = false;
}

function deleteHistoryRecord(id: string) {
  historyRecords.value = historyRecords.value.filter((record: ChatHistoryRecord) => record.id !== id);
  if (activeHistoryId.value === id) activeHistoryId.value = "";
  if (selectedHistoryImageKey.value.startsWith(`${id}:`)) selectedHistoryImageKey.value = "";
  if (selectedGrokHistoryImageKey.value.startsWith(`${id}:`)) selectedGrokHistoryImageKey.value = "";
  selectedGenerationHistoryImageKeys.value = selectedGenerationHistoryImageKeys.value.map((key: string) => key.startsWith(`${id}:`) ? "" : key);
  selectedVideoHistoryImageKeys.value = selectedVideoHistoryImageKeys.value.map((key: string) => key.startsWith(`${id}:`) ? "" : key);
  persistHistory();
}

function clearHistory() {
  historyRecords.value = [];
  activeHistoryId.value = "";
  selectedHistoryImageKey.value = "";
  selectedGrokHistoryImageKey.value = "";
  selectedGenerationHistoryImageKeys.value = [""];
  selectedVideoHistoryImageKeys.value = ["", "", ""];
  persistHistory();
}

onMounted(() => {
  loadApiKey();
  loadCustomImageProvider();
  syncActiveApiKeyFromStorage();
  loadHistory();
});

onBeforeUnmount(() => {
  stopPolling();
  stopCountdown();
});

watch(mode, () => {
  if (isVideoMode.value && !activeModelOptions.value.includes(model.value)) {
    model.value = defaultVideoModelForChannel(videoChannel.value);
  }
  if (!isVideoMode.value && !isCustomImageEntry.value && !modelOptions.includes(model.value)) {
    model.value = defaultImageModelForEntry(imageEntry.value);
  }
  if (!asyncAvailable.value && executionMode.value === "async") {
    executionMode.value = "sync";
    stopPolling();
  }
});

watch(videoChannel, () => {
  if (!isVideoMode.value) return;
  if (!activeModelOptions.value.includes(model.value)) {
    model.value = defaultVideoModelForChannel(videoChannel.value);
  }
  if (isGrokOpenAIFormatChannel.value && isGrokMultiReferenceMode.value) {
    videoImageUrls.value = videoImageUrls.value.map((url: string) => (/^data:image\//i.test(url.trim()) ? url : ""));
    selectedVideoHistoryImageKeys.value = ["", "", ""];
  }
  if (isGrokUnifiedFormatChannel.value) {
    if (!grokUnifiedAspectRatioOptions.includes(grokAspectRatio.value)) grokAspectRatio.value = "3:2";
    if (!grokUnifiedSizeOptions.includes(grokResolution.value)) grokResolution.value = "720P";
  }
  if (isVeoUnifiedFormatChannel.value) {
    if (!veoUnifiedAspectRatioOptions.includes(grokAspectRatio.value)) grokAspectRatio.value = "16:9";
  }
  if (isBltVideoChannel.value) {
    if (!bltVideoAspectRatioOptions.includes(grokAspectRatio.value)) grokAspectRatio.value = "16:9";
  }
  if (isVeoOpenAIFormatChannel.value) {
    if (!grokAspectRatioOptions.includes(grokAspectRatio.value)) grokAspectRatio.value = "16:9";
    if (!grokDurationOptions.includes(Number(grokDuration.value))) grokDuration.value = 8;
  }
  if (isZhipuCogVideoChannel.value) {
    if (!zhipuVideoSizeOptions.includes(zhipuVideoSize.value)) zhipuVideoSize.value = "1920x1080";
    if (!zhipuVideoFpsOptions.includes(Number(zhipuVideoFps.value))) zhipuVideoFps.value = 30;
    if (!zhipuVideoDurationOptions.includes(Number(zhipuVideoDuration.value))) zhipuVideoDuration.value = 5;
  }
  videoImageUrls.value = videoImageUrls.value.map((url: string, index: number) => index < videoImageLimit.value ? url : "");
  selectedVideoHistoryImageKeys.value = selectedVideoHistoryImageKeys.value.map((key: string, index: number) => index < videoImageLimit.value ? key : "");
});

watch(grokReferenceMode, () => {
  if (!isGrokOpenAIFormatChannel.value) return;
  if (isGrokSingleReferenceMode.value) {
    videoImageUrls.value = ["", "", ""];
    selectedVideoHistoryImageKeys.value = ["", "", ""];
    return;
  }
  grokInputReference.value = "";
  selectedGrokHistoryImageKey.value = "";
});

watch(model, () => {
  if (!isVideoMode.value) return;
  if (!videoAllowsImages.value) {
    videoImageUrls.value = ["", "", ""];
    selectedVideoHistoryImageKeys.value = ["", "", ""];
    return;
  }
  videoImageUrls.value = videoImageUrls.value.map((url: string, index: number) => index < videoImageLimit.value ? url : "");
  selectedVideoHistoryImageKeys.value = selectedVideoHistoryImageKeys.value.map((key: string, index: number) => index < videoImageLimit.value ? key : "");
});

watch(executionMode, (value: ExecutionMode) => {
  if (value === "sync") stopPolling();
});

watch(apiKey, persistApiKey);
watch(imageEntry, persistImageEntry);
watch(customImageBaseUrl, persistCustomImageProvider);
watch(customImageMode, (value: CustomImageMode) => {
  mode.value = "generation";
  if (value === "text-to-image") {
    imageUrl.value = "";
    imageDataUrl.value = "";
    imageFileName.value = "";
    selectedHistoryImageKey.value = "";
  } else {
    const existingImages = generationImageUrls.value.map((url: string) => url.trim()).filter(Boolean);
    generationImageUrls.value = existingImages.length ? [...existingImages, ""].slice(0, 10) : [""];
    selectedGenerationHistoryImageKeys.value = generationImageUrls.value.map(() => "");
  }
  persistCustomImageProvider();
});
watch(customImageApiKey, persistCustomImageProvider);

useHead({
  title: "调试台",
  meta: [
    {
      name: "description",
      content: "公开 BYOK 图片与视频生成调试页，支持同步图片、异步图片任务和异步视频任务。",
    },
  ],
});

function resetForm() {
  mode.value = "generation";
  imageEntry.value = "official";
  customImageMode.value = "text-to-image";
  executionMode.value = "sync";
  baseUrl.value = DEFAULT_API_BASE_URL;
  model.value = OFFICIAL_IMAGE_DEFAULT_MODEL;
  prompt.value = "";
  imageUrl.value = "";
  imageDataUrl.value = "";
  imageFileName.value = "";
  selectedHistoryImageKey.value = "";
  generationImageUrls.value = [""];
  selectedGenerationHistoryImageKeys.value = [""];
  videoChannel.value = "veo";
  grokReferenceMode.value = "single";
  grokInputReference.value = "";
  selectedGrokHistoryImageKey.value = "";
  videoImageUrls.value = ["", "", ""];
  selectedVideoHistoryImageKeys.value = ["", "", ""];
  grokAspectRatio.value = "16:9";
  grokDuration.value = 10;
  grokResolution.value = "720P";
  veoEnhancePrompt.value = true;
  veoEnableUpsample.value = false;
  zhipuVideoQuality.value = "quality";
  zhipuVideoSize.value = "1920x1080";
  zhipuVideoFps.value = 30;
  zhipuVideoDuration.value = 5;
  zhipuWithAudio.value = true;
  zhipuWatermarkEnabled.value = true;
  size.value = "1024x1024";
  quality.value = "auto";
  count.value = 1;
  b64Json.value = false;
  responseJson.value = null;
  previewUrls.value = [];
  videoPreviewUrls.value = [];
  errorMessage.value = "";
}

function handleFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  const file = files[0];
  if (!file) return;
  selectedHistoryImageKey.value = "";
  if (isCustomImageToImage.value) {
    const readers = files.slice(0, Math.max(0, 10 - customEditImages.value.length)).map((item) => blobToBase64(item));
    Promise.all(readers)
      .then((dataUrls) => {
        const current = generationImageUrls.value.map((url: string) => url.trim()).filter(Boolean);
        generationImageUrls.value = [...current, ...dataUrls, ""].slice(0, 10);
        selectedGenerationHistoryImageKeys.value = generationImageUrls.value.map(() => "");
        imageFileName.value = files.length === 1 ? file.name : imageCountText(dataUrls.length);
      })
      .catch(() => {
        errorMessage.value = lang.value === "zh" ? "读取图片失败。" : "Failed to read image.";
      });
    input.value = "";
    return;
  }
  imageFileName.value = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    imageDataUrl.value = typeof reader.result === "string" ? reader.result : "";
  };
  reader.onerror = () => {
    errorMessage.value = lang.value === "zh" ? "读取图片失败。" : "Failed to read image.";
  };
  reader.readAsDataURL(file);
}

function handleVideoFile(index: number, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  selectedVideoHistoryImageKeys.value[index] = "";
  const reader = new FileReader();
  reader.onload = () => {
    videoImageUrls.value[index] = typeof reader.result === "string" ? reader.result : "";
  };
  reader.onerror = () => {
    errorMessage.value = lang.value === "zh" ? "读取视频参考图片失败。" : "Failed to read video reference image.";
  };
  reader.readAsDataURL(file);
}

function makeAsyncRecord(data: any, taskId: string): ChatHistoryRecord {
  const now = new Date().toISOString();
  const mediaType: MediaType = isVideoMode.value ? "video" : "image";
  return {
    id: newHistoryId(),
    kind: "async",
    mediaType,
    imageEntry: mediaType === "image" ? imageEntry.value : "official",
    createdAt: now,
    updatedAt: now,
    mode: mode.value,
    model: model.value.trim(),
    base: effectiveBaseUrl.value,
    imageEndpoint: isCustomImageEntry.value ? customImageEndpointPath.value : "",
    prompt: prompt.value,
    size: size.value,
    quality: quality.value,
    n: Number(count.value) || 1,
    taskId,
    status: "IN_PROGRESS",
    progress: String(data?.progress || ""),
    failReason: "",
    upstreamUrl: String(data?.upstreamUrl || ""),
    imageInputLabel: currentImageInputLabel(),
    imageInputValue: mode.value === "generation" ? generationImages.value.join("\n") : imageUrl.value.trim(),
    videoChannel: mediaType === "video" ? videoChannel.value : "veo",
    grokReferenceMode: mediaType === "video" && isGrokOpenAIFormatChannel.value ? grokReferenceMode.value : "multi",
    videoImages: mediaType === "video"
      ? (isGrokOpenAIFormatChannel.value && grokReferenceMode.value === "single" ? [grokSingleInputReference.value].filter(Boolean) : [...videoImages.value])
      : [],
    coverUrl: "",
    images: [],
    videos: [],
    response: data,
  };
}

function updateAsyncRecord(record: ChatHistoryRecord, data: any): ChatHistoryRecord {
  const status = normalizeRecordStatus(data?.status, record.taskId);
  const images = Array.isArray(data?.images) ? data.images.map((url: unknown) => String(url || "").trim()).filter(Boolean) : record.images;
  const videos = Array.isArray(data?.videos) ? data.videos.map((url: unknown) => String(url || "").trim()).filter(Boolean) : record.videos;
  return {
    ...record,
    updatedAt: new Date().toISOString(),
    status,
    progress: String(data?.progress || record.progress || ""),
    failReason: String(data?.failReason || record.failReason || ""),
    upstreamUrl: String(data?.upstreamUrl || record.upstreamUrl || ""),
    coverUrl: images[0] || record.coverUrl,
    images,
    videos,
    response: data,
  };
}

function stopPolling() {
  if (!pollingTimer) return;
  clearInterval(pollingTimer);
  pollingTimer = null;
}

function startPolling(recordId: string) {
  stopPolling();
  pollingTimer = setInterval(() => {
    const record = historyRecords.value.find((item: ChatHistoryRecord) => item.id === recordId);
    if (!record || record.status !== "IN_PROGRESS" || !keyForRecord(record)) {
      stopPolling();
      return;
    }
    queryAsyncTask(record, { silent: true });
  }, 5000);
}

function stopCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
  countdownSeconds.value = 0;
  countdownTotalSeconds.value = 0;
}

function startCountdown(mediaType: MediaType) {
  stopCountdown();
  const seconds = mediaType === "video" ? 200 : 90;
  countdownMediaType.value = mediaType;
  countdownSeconds.value = seconds;
  countdownTotalSeconds.value = seconds;
  countdownTimer = setInterval(() => {
    countdownSeconds.value = Math.max(0, countdownSeconds.value - 1);
    if (countdownSeconds.value <= 0 && countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 1000);
}

function validateVideoInputs() {
  if (isZhipuCogVideoChannel.value) {
    if (!zhipuCogVideoModelOptions.includes(model.value)) return lang.value === "zh" ? "智谱视频仅支持 cogvideox-3。" : "Zhipu video only supports cogvideox-3.";
    if (!prompt.value.trim()) return lang.value === "zh" ? "提示词不能为空。" : "Prompt is required.";
    if (prompt.value.trim().length > 512) return lang.value === "zh" ? "智谱视频提示词不能超过 512 个字符。" : "Zhipu video prompts cannot exceed 512 characters.";
    if (!zhipuVideoSizeOptions.includes(zhipuVideoSize.value)) return lang.value === "zh" ? "请选择智谱支持的视频尺寸。" : "Choose a supported Zhipu video size.";
    if (!zhipuVideoFpsOptions.includes(Number(zhipuVideoFps.value))) return lang.value === "zh" ? "请选择智谱支持的 FPS。" : "Choose a supported Zhipu FPS.";
    if (!zhipuVideoDurationOptions.includes(Number(zhipuVideoDuration.value))) return lang.value === "zh" ? "请选择智谱支持的视频时长。" : "Choose a supported Zhipu duration.";
    if (zhipuVideoQuality.value !== "speed" && zhipuVideoQuality.value !== "quality") return lang.value === "zh" ? "请选择智谱输出模式。" : "Choose a Zhipu output mode.";
    if (videoImages.value.length > videoImageLimit.value) return lang.value === "zh" ? "智谱最多支持 2 张参考图。" : "Zhipu supports up to 2 reference images.";
    return "";
  }
  if (isYunwuVideoChannel.value) {
    if (isGrokOpenAIFormatChannel.value && !grokVideoModelOptions.includes(model.value)) return lang.value === "zh" ? "Grok OpenAI 格式仅支持 grok-videos。" : "The Grok OpenAI format only supports grok-videos.";
    if (isGrokUnifiedFormatChannel.value && !grokUnifiedVideoModelOptions.includes(model.value)) return lang.value === "zh" ? "Grok 统一格式仅支持 grok-video-3 和 grok-video-3-10s。" : "The Grok unified format only supports grok-video-3 and grok-video-3-10s.";
    if (isVeoUnifiedFormatChannel.value && !veoUnifiedVideoModelOptions.includes(model.value)) return lang.value === "zh" ? "云雾 VEO 统一格式仅支持 veo3.1-fast-components。" : "The Yunwu VEO unified format only supports veo3.1-fast-components.";
    if (isVeoOpenAIFormatChannel.value && !veoOpenAIVideoModelOptions.includes(model.value)) return lang.value === "zh" ? "云雾 VEO OpenAI 仅支持 veo_3_1-fast-4K 和 veo_3_1-fast。" : "Yunwu VEO OpenAI only supports veo_3_1-fast-4K and veo_3_1-fast.";
    if (isGrokUnifiedFormatChannel.value && !grokUnifiedAspectRatioOptions.includes(grokAspectRatio.value)) return lang.value === "zh" ? "Grok 统一格式比例只能为 2:3、3:2 或 1:1。" : "The Grok unified aspect ratio must be 2:3, 3:2, or 1:1.";
    if (isVeoUnifiedFormatChannel.value && !veoUnifiedAspectRatioOptions.includes(grokAspectRatio.value)) return lang.value === "zh" ? "VEO 统一格式比例只能为 16:9 或 9:16。" : "The VEO unified aspect ratio must be 16:9 or 9:16.";
    if (isVeoOpenAIFormatChannel.value && !grokAspectRatioOptions.includes(grokAspectRatio.value)) return lang.value === "zh" ? "请选择 VEO OpenAI 支持的尺寸比例。" : "Choose a supported VEO OpenAI size.";
    if (isGrokOpenAIFormatChannel.value && !grokAspectRatioOptions.includes(grokAspectRatio.value)) return lang.value === "zh" ? "请选择 Grok 支持的比例。" : "Choose a supported Grok aspect ratio.";
    if ((isGrokOpenAIFormatChannel.value || isVeoOpenAIFormatChannel.value) && !grokDurationOptions.includes(Number(grokDuration.value))) return lang.value === "zh" ? "请选择 1-15 秒的视频时长。" : "Choose a video duration from 1 to 15 seconds.";
    if (isGrokUnifiedFormatChannel.value && !grokUnifiedSizeOptions.includes(grokResolution.value)) return lang.value === "zh" ? "Grok 统一格式 size 暂只支持 720P。" : "The Grok unified size currently only supports 720P.";
    if (isGrokUnifiedFormatChannel.value && !videoImages.value.length) return lang.value === "zh" ? "Grok 统一格式必须至少填写一张图片 URL。" : "The Grok unified format requires at least one image URL.";
    if (isVeoUnifiedFormatChannel.value && videoImages.value.length > 3) return lang.value === "zh" ? "当前 VEO 统一模型 images 最多支持 3 张。" : "The current VEO unified model supports up to 3 images.";
    if (isVeoOpenAIFormatChannel.value && !veoOpenAIFrameImages.value[0]) return lang.value === "zh" ? "云雾 VEO OpenAI 必须填写首帧。" : "Yunwu VEO OpenAI requires the first frame.";
    if (isVeoOpenAIFormatChannel.value && !veoOpenAIFrameImages.value[1]) return lang.value === "zh" ? "云雾 VEO OpenAI 必须填写尾帧。" : "Yunwu VEO OpenAI requires the last frame.";
    if (isGrokOpenAIFormatChannel.value && grokReferenceMode.value !== "single" && grokReferenceMode.value !== "multi") return lang.value === "zh" ? "请选择 Grok 参考图模式。" : "Choose a Grok reference mode.";
    return "";
  }
  if (isBltVideoChannel.value && !bltVideoAspectRatioOptions.includes(grokAspectRatio.value)) return lang.value === "zh" ? "BLT 视频比例只能为 16:9 或 9:16。" : "The BLT video aspect ratio must be 16:9 or 9:16.";
  if (model.value === "veo3.1-fast" && videoImages.value.length) return copy.value.videoNoImages;
  if (videoImages.value.length > videoImageLimit.value) {
    return lang.value === "zh" ? `${model.value} 最多支持 ${videoImageLimit.value} 张图片。` : `${model.value} supports up to ${videoImageLimit.value} images.`;
  }
  if (!prompt.value.trim()) return lang.value === "zh" ? "提示词不能为空。" : "Prompt is required.";
  return "";
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(lang.value === "zh" ? "图片转 base64 失败。" : "Failed to convert image to base64."));
    reader.readAsDataURL(blob);
  });
}

async function imageSourceToBase64OnPage(source: string) {
  const value = source.trim();
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) return value;
  const response = await fetch(value);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await blobToBase64(await response.blob());
}

async function submitVideo() {
  const validationError = validateVideoInputs();
  if (validationError) {
    errorMessage.value = validationError;
    stopCountdown();
    return;
  }
  let requestImages = videoImages.value;
  const inputReference = grokSingleInputReference.value;
  if (isGrokOpenAIFormatChannel.value && isGrokMultiReferenceMode.value && videoImages.value.length) {
    try {
      requestImages = await Promise.all(videoImages.value.map(imageSourceToBase64OnPage));
    } catch (error) {
      errorMessage.value = lang.value === "zh"
        ? `图片转 base64 失败。图片 URL 可能不允许浏览器跨域读取，请改用本地上传：${error instanceof Error ? error.message : String(error)}`
        : `Failed to convert image to base64. The image URL may block browser CORS access; use local upload instead: ${error instanceof Error ? error.message : String(error)}`;
      stopCountdown();
      return;
    }
  }
  const payload: Record<string, unknown> = {
    provider: {
      base: effectiveBaseUrl.value,
      key: effectiveApiKey.value,
      model: model.value.trim(),
    },
    channel: videoChannel.value,
    prompt: prompt.value,
  };
  if (isVeoOpenAIFormatChannel.value) {
    payload.size = grokAspectRatio.value;
    payload.seconds = grokDuration.value;
    payload.watermark = false;
    payload.images = veoOpenAIFrameImages.value;
  } else if (isZhipuCogVideoChannel.value) {
    payload.quality = zhipuVideoQuality.value;
    payload.size = zhipuVideoSize.value;
    payload.fps = zhipuVideoFps.value;
    payload.duration = zhipuVideoDuration.value;
    payload.with_audio = zhipuWithAudio.value;
    payload.watermark_enabled = zhipuWatermarkEnabled.value;
    if (requestImages.length) payload.images = requestImages;
  } else if (isVeoUnifiedFormatChannel.value) {
    payload.aspect_ratio = grokAspectRatio.value;
    payload.enhance_prompt = veoEnhancePrompt.value;
    payload.enable_upsample = veoEnableUpsample.value;
    if (requestImages.length) payload.images = requestImages;
  } else if (isGrokUnifiedFormatChannel.value) {
    payload.aspect_ratio = grokAspectRatio.value;
    payload.size = grokResolution.value;
    payload.images = requestImages;
  } else if (isGrokOpenAIFormatChannel.value && isGrokSingleReferenceMode.value) {
    payload.size = grokAspectRatio.value;
    payload.seconds = grokDuration.value;
    if (inputReference) payload.input_reference = inputReference;
  } else if (isGrokOpenAIFormatChannel.value) {
    payload.size = grokAspectRatio.value;
    payload.seconds = grokDuration.value;
    payload.images = requestImages;
  } else {
    payload.aspect_ratio = grokAspectRatio.value;
    payload.enhance_prompt = veoEnhancePrompt.value;
    payload.images = requestImages;
  }
  const response = await fetch("/api/chat/video-task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  responseJson.value = data;
  previewUrls.value = [];
  videoPreviewUrls.value = [];
  if (!response.ok || data?.ok === false) {
    errorMessage.value = data?.error?.message || (lang.value === "zh" ? "视频任务提交失败。" : "Video task submission failed.");
    stopCountdown();
    return;
  }
  const taskId = String(data?.taskId || "").trim();
  if (!taskId) {
    errorMessage.value = lang.value === "zh" ? "视频接口未返回 task id。" : "Video API did not return a task id.";
    stopCountdown();
    return;
  }
  const record = makeAsyncRecord(data, taskId);
  upsertHistoryRecord(record);
  startPolling(record.id);
}

async function submitAsync() {
  if (!asyncAvailable.value) {
    errorMessage.value = copy.value.asyncUnavailable;
    stopCountdown();
    return;
  }
  if (isCustomImageEntry.value) {
    errorMessage.value = lang.value === "zh" ? "gpt生图按官方 Images API 仅支持同步提交。" : "GPT image generation uses the official Images API shape and only supports sync submission.";
    stopCountdown();
    return;
  }
  const payload: Record<string, unknown> = {
    provider: {
      base: effectiveBaseUrl.value,
      imageEndpoint: isCustomImageEntry.value ? customImageEndpointPath.value : undefined,
      key: effectiveApiKey.value,
      model: model.value.trim(),
    },
    prompt: prompt.value,
    size: size.value,
    quality: quality.value,
    n: count.value,
    b64_json: b64Json.value,
  };
  if (generationImages.value.length) payload.image = generationImages.value;
  const response = await fetch("/api/chat/image-task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  responseJson.value = data;
  previewUrls.value = [];
  if (!response.ok || data?.ok === false) {
    errorMessage.value = data?.error?.message || (lang.value === "zh" ? "异步任务提交失败。" : "Async task submission failed.");
    stopCountdown();
    return;
  }
  const taskId = String(data?.taskId || "").trim();
  if (!taskId) {
    errorMessage.value = lang.value === "zh" ? "异步接口未返回 task id。" : "Async API did not return a task id.";
    stopCountdown();
    return;
  }
  const record = makeAsyncRecord(data, taskId);
  upsertHistoryRecord(record);
  startPolling(record.id);
}

async function queryAsyncTask(record = selectedAsyncRecord.value, options: { silent?: boolean } = {}) {
  if (!record) return;
  const recordKey = keyForRecord(record);
  if (!recordKey) {
    errorMessage.value = copy.value.needsKeyToQuery;
    return;
  }
  if (!options.silent) queryingTask.value = true;
  try {
    const response = await fetch(record.mediaType === "video" ? "/api/chat/video-task-status" : "/api/chat/image-task-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: {
          base: record.mediaType === "video" ? videoBaseForChannel(record.videoChannel) : record.base || effectiveBaseUrl.value,
          key: recordKey,
        },
        taskId: record.taskId,
        channel: record.mediaType === "video" ? record.videoChannel : undefined,
      }),
    });
    const data = await response.json().catch(() => null);
    responseJson.value = data;
    if (!response.ok || data?.ok === false) {
      errorMessage.value = data?.error?.message || (lang.value === "zh" ? "异步任务查询失败。" : "Async task query failed.");
      return;
    }
    const updated = updateAsyncRecord(record, data);
    upsertHistoryRecord(updated);
    if (updated.images.length) previewUrls.value = [...updated.images];
    if (updated.videos.length) videoPreviewUrls.value = [...updated.videos];
    if (updated.status === "FAILURE") {
      errorMessage.value = updated.failReason || (lang.value === "zh" ? "异步任务失败。" : "Async task failed.");
      stopPolling();
      stopCountdown();
    } else if (updated.status === "SUCCESS") {
      errorMessage.value = "";
      stopPolling();
      stopCountdown();
    }
  } finally {
    if (!options.silent) queryingTask.value = false;
  }
}

async function submit() {
  errorMessage.value = "";
  responseJson.value = null;
  previewUrls.value = [];
  videoPreviewUrls.value = [];
  if (!prompt.value.trim()) {
    errorMessage.value = lang.value === "zh" ? "提示词不能为空。" : "Prompt is required.";
    stopCountdown();
    return;
  }
  startCountdown(isVideoMode.value ? "video" : "image");
  loading.value = true;
  try {
    if (isVideoMode.value) {
      await submitVideo();
      return;
    }
    if (!isCustomImageEntry.value && executionMode.value === "async") {
      await submitAsync();
      return;
    }
    const payload: Record<string, unknown> = {
      mode: isCustomImageToImage.value ? "edit" : mode.value,
      provider: {
        base: effectiveBaseUrl.value,
        imageEndpoint: isCustomImageEntry.value ? customImageEndpointPath.value : undefined,
        key: effectiveApiKey.value,
        model: model.value.trim(),
      },
      prompt: prompt.value,
      size: size.value,
      quality: quality.value,
      n: count.value,
      b64_json: !isCustomImageEntry.value && mode.value === "generation" ? b64Json.value : false,
    };
    if (isCustomImageToImage.value && !customEditImages.value.length) {
      errorMessage.value = lang.value === "zh" ? "图生图需要至少 1 张输入图片。" : "Image-to-image requires at least 1 source image.";
      stopCountdown();
      return;
    }
    if (isCustomImageToImage.value) {
      payload.image = customEditImages.value;
    } else if (needsImage.value) {
      payload.image = imageSource.value;
    } else if (!isCustomImageEntry.value && mode.value === "generation" && generationImages.value.length) {
      payload.image = generationImages.value;
    }
    const response = await fetch("/api/chat/image-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    responseJson.value = data;
    previewUrls.value = Array.isArray(data?.images) ? data.images : [];
    if (!response.ok || data?.ok === false) {
      errorMessage.value = data?.error?.message || (lang.value === "zh" ? "生成失败。" : "Generation failed.");
      stopCountdown();
    } else if (previewUrls.value.length) {
      saveHistoryRecord(data, previewUrls.value);
      stopCountdown();
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    responseJson.value = { ok: false, error: { message: errorMessage.value } };
    stopCountdown();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="chat-page compact-sidebar-layout">
    <section class="chat-shell has-fixed-top-panel">
      <label class="lang-switch page-lang-switch">
        <select v-model="lang">
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </label>

      <div class="top-panel">
        <header class="chat-header">
          <div class="chat-brand">
            <h1>{{ copy.title }}</h1>
          </div>
        </header>

        <div class="media-tabs" aria-label="媒体类型">
          <button
            type="button"
            :class="{ active: !isVideoMode }"
            @click="selectImageMode"
          >
            {{ lang === "zh" ? "图片" : "Image" }}
          </button>
          <button
            type="button"
            :class="{ active: isVideoMode }"
            @click="selectVideoMode"
          >
            {{ lang === "zh" ? "视频" : "Video" }}
          </button>
        </div>

        <div v-if="!isVideoMode" class="mode-tabs compact-tabs" aria-label="图片入口">
          <button
            v-for="item in imageEntryOptions"
            :key="item.key"
            type="button"
            :class="{ active: imageEntry === item.key }"
            :title="lang === 'zh' ? item.hintZh : item.hintEn"
            @click="selectImageEntry(item.key)"
          >
            <strong>{{ lang === "zh" ? item.labelZh : item.labelEn }}</strong>
            <span>{{ item.path }}</span>
          </button>
        </div>
        <div v-else class="mode-tabs compact-tabs video-tabs" aria-label="视频渠道">
          <button
            v-for="channel in videoChannelOptions"
            :key="channel.value"
            type="button"
            :class="{ active: videoChannel === channel.value }"
            :title="lang === 'zh' ? channel.hintZh : channel.hintEn"
            @click="selectVideoChannel(channel.value)"
          >
            <strong>{{ lang === "zh" ? channel.labelZh : channel.labelEn }}</strong>
            <span>{{ channel.endpoint }}</span>
          </button>
        </div>
      </div>

      <button
        v-if="historyDrawerEnabled"
        type="button"
        class="history-drawer-toggle"
        :aria-expanded="historyDrawerOpen"
        @click="openHistoryDrawer"
      >
        <span>{{ copy.history }}</span>
        <strong>{{ historyRecords.length }}</strong>
      </button>

      <div class="chat-grid" :class="{ 'history-as-drawer': historyDrawerEnabled }">
        <div
          v-if="historyDrawerEnabled && historyDrawerOpen"
          class="history-drawer-backdrop"
          aria-hidden="true"
          @click="closeHistoryDrawer"
        />
        <aside
          class="history-panel"
          :class="{ 'drawer-mode': historyDrawerEnabled, open: historyDrawerOpen }"
          :aria-hidden="historyDrawerEnabled && !historyDrawerOpen"
        >
          <div class="history-title">
            <div>
              <p class="eyebrow">{{ copy.history }}</p>
              <h2>{{ copy.history }}</h2>
            </div>
            <div class="history-title-actions">
              <button
                type="button"
                class="history-clear"
                :disabled="!historyRecords.length"
                @click="clearHistory"
              >
                {{ copy.clearHistory }}
              </button>
              <button
                v-if="historyDrawerEnabled"
                type="button"
                class="history-close"
                :aria-label="lang === 'zh' ? '关闭任务与历史' : 'Close tasks and history'"
                @click="closeHistoryDrawer"
              >
                ×
              </button>
            </div>
          </div>
          <div v-if="historyRecords.length" class="history-list">
            <article
              v-for="record in historyRecords"
              :key="record.id"
              class="history-item"
              :class="{ active: activeHistoryId === record.id }"
              tabindex="0"
              @click="restoreHistory(record)"
              @keydown.enter.prevent="restoreHistory(record)"
            >
              <img v-if="record.coverUrl" :src="record.coverUrl" :alt="promptSummary(record.prompt)" />
              <div v-else class="history-placeholder">
                {{ statusLabel(record) }}
              </div>
              <div class="history-meta">
                <div class="history-row">
                  <strong>{{ mediaLabel(record) }} · {{ modeLabel(record.mode, record.videoChannel) }}</strong>
                  <span class="status-pill" :class="statusClass(record)">{{ statusLabel(record) }}</span>
                </div>
                <small v-if="record.taskId">{{ copy.taskId }}: {{ record.taskId }}</small>
                <p>{{ promptSummary(record.prompt) }}</p>
                <small>{{ mediaCountText(record) }} · {{ formatHistoryTime(record.createdAt) }}</small>
              </div>
              <button
                type="button"
                class="history-delete"
                :aria-label="copy.deleteHistory"
                @click.stop="deleteHistoryRecord(record.id)"
              >
                {{ copy.deleteHistory }}
              </button>
            </article>
          </div>
          <div v-else class="history-empty">
            {{ copy.historyEmpty }}
          </div>
        </aside>

        <GptImageGenerator v-if="isCustomImageEntry" embedded />

        <form v-else class="control-panel" @submit.prevent="submit">
          <section class="card provider-card">
            <h2>{{ lang === "zh" ? "模型配置" : "Provider" }}</h2>
            <label>
              <span>{{ copy.model }}</span>
              <select v-model="model">
                <option v-for="item in activeModelOptions" :key="item" :value="item">
                  {{ item }}
                </option>
              </select>
            </label>
            <label v-if="isCustomImageEntry">
              <span>{{ copy.customApiKey }}</span>
              <input v-model="customImageApiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-..." />
            </label>
            <label v-else>
              <span>{{ copy.apiKey }}</span>
              <input v-model="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-..." />
            </label>
            <label v-if="isCustomImageEntry">
              <span>{{ copy.customBaseUrl }}</span>
              <input v-model="customImageBaseUrl" autocomplete="off" spellcheck="false" placeholder="https://api.openai.com" />
            </label>
            <div v-if="isCustomImageEntry" class="execution-switch">
              <span>{{ copy.customImageType }}</span>
              <div>
                <button
                  type="button"
                  class="mode-choice"
                  :class="{ active: customImageMode === 'text-to-image' }"
                  @click="customImageMode = 'text-to-image'"
                >
                  {{ copy.textToImage }}
                </button>
                <button
                  type="button"
                  class="mode-choice"
                  :class="{ active: customImageMode === 'image-to-image' }"
                  @click="customImageMode = 'image-to-image'"
                >
                  {{ copy.imageToImage }}
                </button>
              </div>
            </div>
            <label v-else-if="!isVideoMode">
              <span>{{ copy.baseUrl }}</span>
              <select v-model="baseUrl">
                <option v-for="item in apiBaseOptions" :key="item" :value="item">
                  {{ item }}
                </option>
              </select>
            </label>
            <div v-else class="readonly-base">
              <span>{{ copy.baseUrl }}</span>
              <code>{{ effectiveBaseUrl }}</code>
              <small>{{ copy.autoVideoBaseHint }}</small>
            </div>
            <p v-if="apiBaseWarning" class="warning-box" role="status">{{ apiBaseWarning }}</p>
            <div v-if="!isVideoMode && !isCustomImageEntry" class="execution-switch">
              <span>{{ copy.executionMode }}</span>
              <div>
                <button
                  type="button"
                  class="mode-choice"
                  :class="{ active: executionMode === 'sync' }"
                  @click="executionMode = 'sync'"
                >
                  {{ copy.syncMode }}
                </button>
                <button
                  type="button"
                  class="mode-choice"
                  :class="{ active: executionMode === 'async' }"
                  :disabled="!asyncAvailable"
                  @click="executionMode = 'async'"
                >
                  {{ copy.asyncMode }}
                </button>
              </div>
              <small v-if="!asyncAvailable">{{ copy.asyncUnavailable }}</small>
            </div>
            <p v-else-if="isVideoMode" class="warning-box" role="status">{{ copy.videoTaskOnly }}</p>
            <div v-if="!isCustomImageEntry" class="endpoint-stack">
              <p>
                <span>{{ copy.docUrl }}</span>
                <a :href="isVideoMode ? videoDocUrl : currentMode.docUrl" target="_blank" rel="noreferrer">{{ isVideoMode ? videoDocUrl : currentMode.docUrl }}</a>
              </p>
              <p>
                <span>{{ copy.endpointPath }}</span>
                <code>{{ endpointPath }}</code>
              </p>
              <p>
                <span>{{ copy.upstreamUrl }}</span>
                <code>{{ endpointPreview }}</code>
              </p>
              <p v-if="isVideoMode && videoStatusDocUrl">
                <span>{{ copy.statusDocUrl }}</span>
                <a :href="videoStatusDocUrl" target="_blank" rel="noreferrer">{{ videoStatusDocUrl }}</a>
              </p>
              <p v-if="isVideoMode">
                <span>{{ copy.statusEndpointPath }}</span>
                <code>{{ statusEndpointPath }}</code>
              </p>
            </div>
          </section>

          <section class="card input-card">
            <h2>{{ lang === "zh" ? "输入" : "Input" }}</h2>
            <label>
              <span>{{ copy.prompt }}</span>
              <textarea v-model="prompt" rows="5" :maxlength="isZhipuCogVideoChannel ? 512 : 5000" />
            </label>
            <div v-if="supportsImageInput" class="image-inputs">
              <template v-if="isVideoMode">
                <template v-if="isGrokOpenAIFormatChannel">
                  <label>
                    <span>{{ copy.grokReferenceMode }}</span>
                    <select v-model="grokReferenceMode">
                      <option value="single">{{ copy.grokSingleReference }}</option>
                      <option value="multi">{{ copy.grokMultiReference }}</option>
                    </select>
                  </label>
                  <template v-if="isGrokSingleReferenceMode">
                    <label>
                      <span>{{ copy.imageUrl }}</span>
                      <input
                        v-model="grokInputReference"
                        autocomplete="off"
                        spellcheck="false"
                        placeholder="https://..."
                        @input="selectedGrokHistoryImageKey = ''"
                      />
                    </label>
                    <label v-if="historyImageOptions.length">
                      <span>{{ copy.historyImage }}</span>
                      <select v-model="selectedGrokHistoryImageKey" @change="selectGrokHistoryImage">
                        <option value="">{{ copy.historyImagePlaceholder }}</option>
                        <option v-for="item in historyImageOptions" :key="item.key" :value="item.key">
                          {{ item.label }}
                        </option>
                      </select>
                    </label>
                  </template>
                </template>
                <template v-if="!isYunwuVideoChannel || isYunwuUnifiedVideoChannel || isVeoOpenAIFormatChannel">
                  <label v-for="index in videoImageLimit" :key="index">
                    <span>{{ videoFrameLabel(index - 1) }}</span>
                    <input
                      v-model="videoImageUrls[index - 1]"
                      autocomplete="off"
                      spellcheck="false"
                      placeholder="https://..."
                      @input="selectedVideoHistoryImageKeys[index - 1] = ''"
                    />
                  </label>
                </template>
                <template v-if="!isYunwuVideoChannel || isVeoOpenAIFormatChannel || (isGrokOpenAIFormatChannel && isGrokMultiReferenceMode)">
                  <label v-for="index in videoImageLimit" :key="`video-file-${index}`">
                    <span>{{ videoFrameLabel(index - 1) }} · {{ copy.upload }}</span>
                    <input type="file" accept="image/*" @change="handleVideoFile(index - 1, $event)" />
                  </label>
                </template>
                <template v-if="(!isYunwuVideoChannel || isYunwuUnifiedVideoChannel || isVeoOpenAIFormatChannel) && historyImageOptions.length">
                  <label v-for="index in videoImageLimit" :key="`history-${index}`">
                    <span>{{ videoFrameLabel(index - 1) }} · {{ copy.historyImage }}</span>
                    <select v-model="selectedVideoHistoryImageKeys[index - 1]" @change="selectVideoHistoryImage(index - 1)">
                      <option value="">{{ copy.historyImagePlaceholder }}</option>
                      <option v-for="item in historyImageOptions" :key="item.key" :value="item.key">
                        {{ item.label }}
                      </option>
                    </select>
                  </label>
                </template>
                <small>{{ isZhipuCogVideoChannel ? copy.zhipuReferenceHint : isVeoOpenAIFormatChannel ? copy.veoOpenAIReferenceHint : isVeoUnifiedFormatChannel ? copy.veoUnifiedReferenceHint : isGrokUnifiedFormatChannel ? copy.grokUnifiedReferenceHint : isYunwuVideoChannel ? (isGrokSingleReferenceMode ? copy.grokSingleReferenceHint : copy.grokMultiReferenceHint) : copy.videoImageHint }}</small>
              </template>
              <template v-else>
                <template v-if="mode === 'generation' && (!isCustomImageEntry || isCustomImageToImage)">
                  <div v-for="(_, index) in generationImageUrls" :key="`generation-image-${index}`" class="reference-row">
                    <label>
                      <span>{{ isCustomImageToImage ? customEditImageLabel(index) : `${copy.optionalReferenceImage} ${index + 1}` }}</span>
                      <input
                        v-model="generationImageUrls[index]"
                        autocomplete="off"
                        spellcheck="false"
                        placeholder="https://..."
                        @input="selectedGenerationHistoryImageKeys[index] = ''"
                      />
                    </label>
                    <button type="button" class="secondary compact" @click="removeGenerationImageInput(index)">
                      {{ copy.removeReferenceImage }}
                    </button>
                    <label v-if="historyImageOptions.length">
                      <span>{{ copy.historyImage }} {{ index + 1 }}</span>
                      <select v-model="selectedGenerationHistoryImageKeys[index]" @change="selectGenerationHistoryImage(index)">
                        <option value="">{{ copy.historyImagePlaceholder }}</option>
                        <option v-for="item in historyImageOptions" :key="item.key" :value="item.key">
                          {{ item.label }}
                        </option>
                      </select>
                    </label>
                  </div>
                  <button type="button" class="secondary" :disabled="generationImageUrls.length >= 10" @click="addGenerationImageInput">
                    {{ copy.addReferenceImage }}
                  </button>
                  <small v-if="!isCustomImageToImage">{{ copy.imageHint }}</small>
                </template>
                <label v-else-if="needsImage && !isCustomImageToImage">
                  <span>{{ copy.imageUrl }}</span>
                  <input
                    v-model="imageUrl"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="https://..."
                    @input="selectedHistoryImageKey = ''"
                  />
                </label>
                <label v-if="mode !== 'generation' && !isCustomImageToImage && historyImageOptions.length">
                  <span>{{ copy.historyImage }}</span>
                  <select v-model="selectedHistoryImageKey" @change="selectHistoryImage">
                    <option value="">{{ copy.historyImagePlaceholder }}</option>
                    <option v-for="item in historyImageOptions" :key="item.key" :value="item.key">
                      {{ item.label }}
                    </option>
                  </select>
                </label>
                <label v-if="needsImage" class="upload-box">
                  <span>{{ copy.inputImage }}</span>
                  <input type="file" accept="image/*" :multiple="isCustomImageToImage" @change="handleFile" />
                  <strong>{{ copy.upload }}</strong>
                  <small>{{ isCustomImageToImage && customEditImages.length ? `${copy.uploadedImageCount}: ${customEditImages.length}` : imageFileName || copy.noUpload }}</small>
                </label>
              </template>
            </div>
            <p v-else-if="isVideoMode" class="warning-box" role="status">{{ copy.videoNoImages }}</p>
          </section>

          <section v-if="!isVideoMode" class="card param-card">
            <h2>{{ lang === "zh" ? "参数" : "Parameters" }}</h2>
            <label>
              <span>{{ copy.size }}</span>
              <select v-model="size">
                <option v-for="item in sizeOptions" :key="item.value" :value="item.value">
                  {{ lang === "zh" ? item.labelZh : item.labelEn }}
                </option>
              </select>
            </label>
            <label>
              <span>{{ copy.quality }}</span>
              <select v-model="quality">
                <option v-for="item in qualityOptions" :key="item.value" :value="item.value">
                  {{ lang === "zh" ? item.labelZh : item.labelEn }}
                </option>
              </select>
            </label>
            <label v-if="mode === 'generation' || mode === 'edit' || isCustomImageToImage">
              <span>{{ copy.count }}</span>
              <input v-model.number="count" type="number" min="1" max="10" />
            </label>
            <label v-if="mode === 'generation' && !isCustomImageEntry">
              <span>{{ copy.b64Json }}</span>
              <select v-model="b64Json">
                <option :value="false">false</option>
                <option :value="true">true</option>
              </select>
            </label>
            <div class="actions">
              <button type="button" class="secondary" :disabled="loading" @click="resetForm">{{ copy.reset }}</button>
              <button type="submit" :disabled="loading">
                {{ loading ? copy.generating : submitLabel }}
              </button>
            </div>
            <p v-if="errorMessage" class="error-box" role="alert">{{ errorMessage }}</p>
          </section>
          <section v-else class="card">
            <h2>{{ lang === "zh" ? "提交视频任务" : "Submit Video Task" }}</h2>
            <small>{{ copy.videoTaskOnly }}</small>
            <div v-if="isYunwuVideoChannel || isBltVideoChannel || isZhipuCogVideoChannel" class="video-grok-grid">
              <label>
                <span>{{ isZhipuCogVideoChannel ? copy.size : copy.grokAspectRatio }}</span>
                <select v-if="isZhipuCogVideoChannel" v-model="zhipuVideoSize">
                  <option v-for="item in zhipuVideoSizeOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
                <select v-else v-model="grokAspectRatio">
                  <option v-for="item in isBltVideoChannel ? bltVideoAspectRatioOptions : isVeoUnifiedFormatChannel ? veoUnifiedAspectRatioOptions : isGrokUnifiedFormatChannel ? grokUnifiedAspectRatioOptions : grokAspectRatioOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label v-if="isGrokOpenAIFormatChannel || isVeoOpenAIFormatChannel">
                <span>{{ copy.grokDuration }}</span>
                <select v-model.number="grokDuration">
                  <option v-for="item in grokDurationOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label v-if="isGrokUnifiedFormatChannel">
                <span>{{ copy.grokResolution }}</span>
                <select v-model="grokResolution">
                  <option v-for="item in grokUnifiedSizeOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label v-if="isVeoUnifiedFormatChannel || isBltVideoChannel">
                <span>{{ copy.veoEnhancePrompt }}</span>
                <select v-model="veoEnhancePrompt">
                  <option :value="true">true</option>
                  <option :value="false">false</option>
                </select>
              </label>
              <label v-if="isVeoUnifiedFormatChannel">
                <span>{{ copy.veoEnableUpsample }}</span>
                <select v-model="veoEnableUpsample">
                  <option :value="false">false</option>
                  <option :value="true">true</option>
                </select>
              </label>
              <label v-if="isZhipuCogVideoChannel">
                <span>{{ copy.zhipuQuality }}</span>
                <select v-model="zhipuVideoQuality">
                  <option value="quality">quality</option>
                  <option value="speed">speed</option>
                </select>
              </label>
              <label v-if="isZhipuCogVideoChannel">
                <span>FPS</span>
                <select v-model.number="zhipuVideoFps">
                  <option v-for="item in zhipuVideoFpsOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label v-if="isZhipuCogVideoChannel">
                <span>{{ copy.grokDuration }}</span>
                <select v-model.number="zhipuVideoDuration">
                  <option v-for="item in zhipuVideoDurationOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label v-if="isZhipuCogVideoChannel">
                <span>{{ copy.zhipuWithAudio }}</span>
                <select v-model="zhipuWithAudio">
                  <option :value="true">true</option>
                  <option :value="false">false</option>
                </select>
              </label>
              <label v-if="isZhipuCogVideoChannel">
                <span>{{ copy.zhipuWatermark }}</span>
                <select v-model="zhipuWatermarkEnabled">
                  <option :value="true">true</option>
                  <option :value="false">false</option>
                </select>
              </label>
              <small>{{ isZhipuCogVideoChannel ? copy.zhipuParamHint : isBltVideoChannel ? copy.bltVideoParamHint : isVeoOpenAIFormatChannel ? copy.veoOpenAIReferenceHint : isVeoUnifiedFormatChannel ? copy.veoUnifiedReferenceHint : isGrokUnifiedFormatChannel ? copy.grokUnifiedReferenceHint : isGrokSingleReferenceMode ? copy.grokSingleReferenceHint : copy.grokMultiReferenceHint }}</small>
            </div>
            <div class="actions">
              <button type="button" class="secondary" :disabled="loading" @click="resetForm">{{ copy.reset }}</button>
              <button type="submit" :disabled="loading">
                {{ loading ? copy.generating : submitLabel }}
              </button>
            </div>
            <p v-if="errorMessage" class="error-box" role="alert">{{ errorMessage }}</p>
          </section>
        </form>

        <aside v-if="!isCustomImageEntry" class="preview-panel">
          <section class="preview-card task-card">
            <div class="panel-title">
              <h2>{{ copy.taskStatus }}</h2>
              <span>{{ selectedAsyncRecord ? statusLabel(selectedAsyncRecord) : "idle" }}</span>
            </div>
            <div v-if="countdownActive" class="task-countdown">
              <span>{{ copy.countdownTitle }}</span>
              <strong>{{ countdownSeconds }}s</strong>
              <small>{{ countdownMediaType === "video" ? copy.countdownVideo : copy.countdownImage }}</small>
              <div class="countdown-track">
                <i :style="{ width: countdownProgress + '%' }"></i>
              </div>
            </div>
            <div v-if="selectedAsyncRecord" class="task-detail">
              <p><strong>{{ copy.taskId }}</strong><code>{{ selectedAsyncRecord.taskId }}</code></p>
              <p><strong>{{ copy.status }}</strong><span>{{ statusLabel(selectedAsyncRecord) }}</span></p>
              <p v-if="selectedAsyncRecord.progress"><strong>{{ copy.progress }}</strong><span>{{ selectedAsyncRecord.progress }}</span></p>
              <p v-if="selectedAsyncRecord.failReason"><strong>{{ copy.failReason }}</strong><span>{{ selectedAsyncRecord.failReason }}</span></p>
              <p><strong>{{ copy.lastUpdated }}</strong><span>{{ formatHistoryTime(selectedAsyncRecord.updatedAt) }}</span></p>
              <small>{{ copy.needsKeyToQuery }}</small>
              <button
                type="button"
                class="secondary"
                :disabled="queryingTask || !canQuerySelectedTask || !selectedAsyncRecord.taskId"
                @click="queryAsyncTask()"
              >
                {{ queryingTask ? copy.queryingTask : copy.queryTask }}
              </button>
            </div>
            <div v-else class="task-empty">{{ copy.noTask }}</div>
          </section>

          <section class="preview-card result-card">
            <div class="panel-title">
              <h2>{{ copy.preview }}</h2>
              <span>{{ currentModeLabel }}</span>
            </div>
            <div v-if="loading" class="empty-state">{{ copy.generating }}</div>
            <div v-else-if="videoPreviewUrls.length" class="video-grid">
              <a v-for="url in videoPreviewUrls" :key="url" :href="url" target="_blank" rel="noreferrer">
                <video :src="url" controls playsinline />
                <span>{{ copy.videoResult }}</span>
              </a>
            </div>
            <div v-else-if="previewUrls.length" class="image-grid">
              <a v-for="url in previewUrls" :key="url" :href="url" target="_blank" rel="noreferrer">
                <img :src="url" alt="Generated image" />
              </a>
            </div>
            <div v-else class="empty-state">{{ copy.empty }}</div>
          </section>

          <section v-if="showRequestJson" class="preview-card json-card">
            <div class="panel-title">
              <h2>{{ copy.requestJson }}</h2>
              <span>sanitized</span>
            </div>
            <pre>{{ requestJson }}</pre>
          </section>

          <section class="preview-card json-card">
            <div class="panel-title">
              <h2>{{ copy.responseJson }}</h2>
              <span>{{ responseJson?.ok === true ? "ok" : responseJson?.ok === false ? "error" : "idle" }}</span>
            </div>
            <pre>{{ responseText || (lang === "zh" ? "未开始" : "Not started") }}</pre>
          </section>
        </aside>
      </div>
    </section>
  </main>
</template>

<style scoped>
.chat-page {
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
  background:
    radial-gradient(circle at 12% 8%, rgba(96, 165, 250, 0.2), transparent 32%),
    linear-gradient(135deg, #f8fafc 0%, #eef2ff 44%, #f8fafc 100%);
  color: #0f172a;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.chat-page *,
.chat-page *::before,
.chat-page *::after {
  box-sizing: border-box;
}
.chat-shell {
  width: min(1080px, calc(100% - 360px));
  margin-left: 320px;
  margin-right: auto;
  padding: 18px 0 36px;
}
.chat-grid {
  display: grid;
  gap: 18px;
}
.top-panel {
  position: fixed;
  top: 18px;
  left: 18px;
  z-index: 35;
  display: grid;
  align-content: start;
  gap: 12px;
  width: 270px;
  max-height: calc(100dvh - 36px);
  overflow: auto;
  margin-bottom: 0;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 18px 58px rgba(15, 23, 42, 0.08);
  padding: 12px;
  backdrop-filter: blur(18px);
}
.chat-header {
  display: grid;
  gap: 4px;
}
.chat-header h1,
.chat-header p,
.history-panel h2,
.card h2,
.preview-card h2 {
  margin: 0;
}
.chat-header h1 {
  font-size: 20px;
  line-height: 1.1;
  letter-spacing: -0.04em;
}
.eyebrow {
  margin-bottom: 5px;
  color: #2563eb;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.chat-brand {
  min-width: 0;
}
.lang-switch,
.card label,
.readonly-base {
  display: grid;
  gap: 8px;
  color: #334155;
  font-size: 13px;
  font-weight: 800;
}
.page-lang-switch {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 42;
  width: 116px;
}
.lang-switch select,
input,
textarea,
select {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.84);
  color: #0f172a;
  padding: 9px 11px;
  font: inherit;
  outline: none;
}
textarea {
  resize: vertical;
  min-height: 112px;
}
input:focus,
textarea:focus,
select:focus {
  border-color: rgba(37, 99, 235, 0.5);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
}
.mode-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 0;
}
.media-tabs {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.04);
  padding: 4px;
}
.media-tabs button {
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #475569;
  padding: 8px 18px;
  font-weight: 900;
  cursor: pointer;
}
.media-tabs button.active {
  background: #ffffff;
  color: #1d4ed8;
  box-shadow: 0 10px 26px rgba(37, 99, 235, 0.16);
}
.mode-tabs button,
.mode-tab-group,
.history-panel,
.card,
.preview-card {
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 22px 70px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(18px);
}
.mode-tabs button,
.mode-tab-group {
  border-color: rgba(15, 23, 42, 0.08);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.72);
  box-shadow: none;
}
.compact-tabs {
  align-items: stretch;
  grid-template-columns: 1fr;
}
.video-tabs {
  grid-template-columns: 1fr;
}
.mode-tab-group {
  display: grid;
  grid-template-columns: minmax(104px, 0.2fr) minmax(0, 1fr);
  align-items: stretch;
  gap: 8px;
  min-height: 0;
  padding: 8px;
  color: #475569;
}
.mode-tab-group.active {
  border-color: rgba(37, 99, 235, 0.38);
  background: rgba(239, 246, 255, 0.72);
}
.mode-tab-heading {
  display: grid;
  align-content: center;
  padding: 0 4px;
}
.mode-tab-heading strong {
  display: block;
  color: #0f172a;
}
.mode-subtabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.mode-tabs button {
  display: grid;
  align-content: center;
  gap: 3px;
  min-height: 0;
  padding: 10px 11px;
  color: #475569;
  cursor: pointer;
  text-align: left;
}
.mode-tabs button strong {
  overflow: hidden;
  color: #0f172a;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mode-tabs button span {
  font-size: 12px;
  line-height: 1.5;
}
.mode-tabs button.active {
  border-color: rgba(37, 99, 235, 0.38);
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(255, 255, 255, 0.86));
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);
}
.mode-tabs .mode-subtabs button {
  min-height: 0;
  padding: 8px 10px;
}
.mode-tabs .mode-subtabs button strong {
  font-size: 13px;
}
.mode-tabs .mode-subtabs button span {
  overflow: hidden;
  color: #64748b;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-grid {
  grid-template-columns: minmax(230px, 0.58fr) minmax(360px, 0.92fr) minmax(0, 1.08fr);
  align-items: start;
}
.chat-grid.history-as-drawer {
  grid-template-columns: minmax(320px, 0.9fr) minmax(0, 1fr);
}
.chat-grid > *,
.control-panel,
.preview-panel,
.history-panel,
.card,
.preview-card,
.card label,
.readonly-base {
  min-width: 0;
}
.history-panel {
  position: sticky;
  top: 20px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  max-height: calc(100vh - 40px);
  overflow: hidden;
  padding: 16px;
}
.history-panel.drawer-mode {
  position: fixed;
  top: 16px;
  bottom: 16px;
  left: 16px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  width: min(380px, calc(100vw - 32px));
  max-height: none;
  transform: translateX(calc(-100% - 28px));
  transition: transform 180ms ease, box-shadow 180ms ease;
  box-shadow: 0 30px 90px rgba(15, 23, 42, 0.22);
}
.history-panel.drawer-mode.open {
  transform: translateX(0);
}
.history-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(2px);
}
.history-drawer-toggle {
  position: fixed;
  left: 18px;
  bottom: 18px;
  z-index: 44;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 270px;
  box-shadow: 0 18px 42px rgba(37, 99, 235, 0.24);
}
.history-drawer-toggle strong {
  display: inline-grid;
  min-width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 12px;
}
.history-title {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.history-panel.drawer-mode .history-title {
  flex: 0 0 auto;
}
.history-title .eyebrow {
  margin-bottom: 6px;
}
.history-panel h2 {
  font-size: 16px;
}
.history-title-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
}
.history-clear,
.history-delete,
.history-close {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(255, 255, 255, 0.78);
  color: #334155;
  padding: 8px 10px;
  font-size: 12px;
}
.history-close {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 999px;
  font-size: 18px;
  line-height: 1;
}
.history-list {
  display: grid;
  gap: 10px;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}
.history-panel.drawer-mode .history-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2px 4px 2px 0;
}
.history-item {
  display: grid;
  gap: 10px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.74);
  padding: 10px;
  cursor: pointer;
}
.history-panel.drawer-mode .history-item {
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  padding: 9px;
}
.history-item.active {
  border-color: rgba(37, 99, 235, 0.45);
  background: rgba(239, 246, 255, 0.9);
  box-shadow: 0 14px 36px rgba(37, 99, 235, 0.14);
}
.history-item img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 14px;
  background: #e2e8f0;
  object-fit: cover;
}
.history-panel.drawer-mode .history-item img,
.history-panel.drawer-mode .history-placeholder {
  width: 72px;
  height: 54px;
  aspect-ratio: auto;
  border-radius: 12px;
}
.history-placeholder {
  display: grid;
  width: 100%;
  aspect-ratio: 4 / 3;
  place-items: center;
  border-radius: 14px;
  background:
    linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(124, 58, 237, 0.14)),
    #eef2ff;
  color: #2563eb;
  font-size: 13px;
  font-weight: 900;
}
.history-meta {
  display: grid;
  gap: 6px;
}
.history-panel.drawer-mode .history-meta {
  min-width: 0;
}
.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #0f172a;
  font-size: 12px;
}
.history-panel.drawer-mode .history-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}
.history-row strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-panel.drawer-mode .history-row strong {
  overflow-wrap: anywhere;
  white-space: normal;
}
.history-row span,
.history-meta small {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}
.history-panel.drawer-mode .history-meta small {
  overflow-wrap: anywhere;
}
.history-panel.drawer-mode .status-pill {
  flex: 0 0 auto;
}
.status-pill {
  border-radius: 999px;
  padding: 3px 8px;
}
.status-pill.success {
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
}
.status-pill.processing {
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
}
.status-pill.failed {
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
}
.history-meta p {
  margin: 0;
  color: #334155;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.history-panel.drawer-mode .history-meta p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.history-delete {
  justify-self: end;
  padding: 6px 9px;
}
.history-panel.drawer-mode .history-delete {
  grid-column: 2;
  align-self: start;
  justify-self: end;
  padding: 6px 8px;
}
.history-empty {
  display: grid;
  min-height: 320px;
  place-items: center;
  border: 1px dashed rgba(37, 99, 235, 0.24);
  border-radius: 18px;
  background: rgba(239, 246, 255, 0.52);
  color: #64748b;
  padding: 16px;
  text-align: center;
  line-height: 1.6;
}
.history-panel.drawer-mode .history-empty {
  flex: 1 1 auto;
  min-height: 0;
}
.control-panel,
.preview-panel {
  display: grid;
  gap: 10px;
}
.card,
.preview-card {
  padding: 14px;
}
.card h2,
.preview-card h2 {
  font-size: 14px;
}
.card {
  display: grid;
  gap: 10px;
}
.provider-card {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: end;
}
.provider-card h2,
.provider-card .endpoint-stack,
.provider-card .warning-box {
  grid-column: 1 / -1;
}
.provider-card .execution-switch {
  align-self: stretch;
}
.card small {
  color: #64748b;
  font-weight: 500;
  line-height: 1.5;
}
.readonly-base code {
  overflow-wrap: anywhere;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.06);
  color: #0f172a;
  padding: 11px 12px;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
}
.endpoint-stack {
  display: grid;
  gap: 6px;
}
.endpoint-stack p {
  margin: 0;
  overflow-wrap: anywhere;
  border-radius: 12px;
  background: #0f172a;
  color: #dbeafe;
  padding: 8px 10px;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
}
.endpoint-stack span {
  display: block;
  margin-bottom: 4px;
  color: #93c5fd;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 11px;
  font-weight: 900;
}
.endpoint-stack a,
.endpoint-stack code {
  color: inherit;
  font: inherit;
  overflow-wrap: anywhere;
}
.warning-box {
  margin: 0;
  border: 1px solid rgba(245, 158, 11, 0.32);
  border-radius: 12px;
  background: rgba(255, 251, 235, 0.9);
  color: #92400e;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
}
.video-grok-grid {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(37, 99, 235, 0.12);
  border-radius: 18px;
  background: rgba(37, 99, 235, 0.06);
  padding: 12px;
}
.execution-switch {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 12px;
  font-weight: 800;
}
.execution-switch > div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.mode-choice {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(255, 255, 255, 0.84);
  color: #0f172a;
}
.mode-choice.active {
  border-color: rgba(37, 99, 235, 0.4);
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
}
.image-inputs {
  display: grid;
  gap: 8px;
}
.reference-row {
  display: grid;
  gap: 10px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.64);
  padding: 12px;
}
.upload-box {
  border: 1px dashed rgba(37, 99, 235, 0.34);
  border-radius: 14px;
  padding: 10px 12px;
  background: rgba(239, 246, 255, 0.72);
  cursor: pointer;
}
.upload-box input {
  display: none;
}
.upload-box strong {
  color: #2563eb;
}
.param-card {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: end;
}
.param-card h2,
.actions,
.error-box {
  grid-column: 1 / -1;
}
.actions {
  display: flex;
  gap: 8px;
  align-self: end;
}
button {
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  padding: 10px 14px;
  cursor: pointer;
  font-weight: 900;
}
button.secondary {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(255, 255, 255, 0.84);
  color: #0f172a;
}
button.compact {
  justify-self: start;
  padding: 8px 10px;
  font-size: 12px;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.error-box {
  margin: 0;
  border: 1px solid rgba(220, 38, 38, 0.22);
  border-radius: 14px;
  background: rgba(254, 242, 242, 0.88);
  color: #b91c1c;
  padding: 10px 12px;
  line-height: 1.6;
}
.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.panel-title span {
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 900;
}
.result-card {
  min-height: 360px;
}
.task-countdown {
  display: grid;
  place-items: center;
  gap: 8px;
  margin: 12px 0 16px;
  border: 1px solid rgba(37, 99, 235, 0.16);
  border-radius: 18px;
  background:
    radial-gradient(circle at 50% 20%, rgba(37, 99, 235, 0.16), transparent 44%),
    rgba(239, 246, 255, 0.74);
  padding: 20px 16px;
  text-align: center;
}
.task-countdown span {
  color: #2563eb;
  font-size: 12px;
  font-weight: 900;
}
.task-countdown strong {
  color: #0f172a;
  font-size: 42px;
  line-height: 1;
  letter-spacing: 0;
}
.task-countdown small {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}
.countdown-track {
  width: min(180px, 100%);
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.12);
}
.countdown-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2563eb, #7c3aed);
  transition: width 0.2s ease;
}
.task-detail {
  display: grid;
  gap: 10px;
}
.task-detail p {
  display: grid;
  grid-template-columns: minmax(72px, 92px) minmax(0, 1fr);
  gap: 10px;
  margin: 0;
  color: #334155;
  font-size: 13px;
  line-height: 1.5;
}
.task-detail strong {
  color: #0f172a;
}
.task-detail code,
.task-detail span {
  overflow-wrap: anywhere;
  min-width: 0;
}
.task-detail small {
  color: #64748b;
  line-height: 1.5;
}
.task-empty {
  border: 1px dashed rgba(37, 99, 235, 0.24);
  border-radius: 18px;
  background: rgba(239, 246, 255, 0.52);
  color: #64748b;
  padding: 18px;
  text-align: center;
  line-height: 1.6;
}
.empty-state {
  min-height: 280px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background:
    linear-gradient(45deg, rgba(148, 163, 184, 0.14) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(148, 163, 184, 0.14) 25%, transparent 25%),
    #f8fafc;
  background-size: 22px 22px;
  color: #64748b;
  text-align: center;
}
.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.image-grid a {
  display: block;
  overflow: hidden;
  border-radius: 18px;
  background: #e2e8f0;
}
.image-grid img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}
.video-grid {
  display: grid;
  gap: 12px;
}
.video-grid a {
  display: grid;
  gap: 8px;
  overflow: hidden;
  border-radius: 18px;
  background: #0f172a;
  color: #dbeafe;
  padding: 10px;
  text-decoration: none;
  font-size: 12px;
  font-weight: 900;
}
.video-grid video {
  display: block;
  width: 100%;
  max-height: 520px;
  border-radius: 12px;
  background: #020617;
}
.json-card pre {
  max-height: 280px;
  overflow: auto;
  margin: 0;
  border-radius: 18px;
  background: #0f172a;
  color: #dbeafe;
  padding: 14px;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
@media (max-width: 1180px) {
  .chat-shell {
    width: min(100% - 32px, 920px);
    margin: 0 auto;
    padding: 18px 0;
  }
  .top-panel {
    position: static;
    width: auto;
    max-height: none;
    overflow: visible;
    margin-bottom: 14px;
  }
  .page-lang-switch {
    top: 14px;
    right: 14px;
    width: 112px;
  }
  .chat-header,
  .chat-grid,
  .mode-tabs {
    grid-template-columns: 1fr;
  }
  .chat-grid.history-as-drawer {
    grid-template-columns: 1fr;
  }
  .compact-tabs,
  .video-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .media-tabs {
    grid-template-columns: repeat(2, minmax(96px, 1fr));
  }
  .history-drawer-toggle {
    width: auto;
  }
  .history-panel {
    position: static;
    max-height: none;
  }
  .history-panel.drawer-mode {
    position: fixed;
    max-height: none;
  }
  .history-list {
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    max-height: 420px;
  }
  .history-panel.drawer-mode .history-list {
    display: grid;
    grid-template-columns: 1fr;
    max-height: none;
  }
  .provider-card,
  .param-card {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .chat-shell {
    width: min(100% - 20px, 1280px);
    padding: 10px 0;
  }
  .top-panel {
    border-radius: 20px;
    padding: 10px;
  }
  .chat-header {
    display: grid;
    gap: 10px;
  }
  .page-lang-switch {
    top: 10px;
    right: 10px;
    width: 104px;
  }
  .media-tabs,
  .compact-tabs,
  .video-tabs {
    width: 100%;
    grid-template-columns: 1fr;
  }
  .provider-card,
  .param-card {
    grid-template-columns: 1fr;
  }
  .mode-tab-heading {
    display: grid;
  }
  .mode-tab-heading span {
    text-align: left;
  }
  .mode-tab-group {
    grid-template-columns: 1fr;
  }
  .mode-subtabs {
    grid-template-columns: 1fr;
  }
  .param-card {
    grid-template-columns: 1fr;
  }
  .actions {
    flex-direction: column;
  }
  .history-panel.drawer-mode {
    top: 10px;
    bottom: 10px;
    left: 10px;
    width: calc(100vw - 20px);
  }
  .history-panel.drawer-mode .history-item {
    grid-template-columns: 64px minmax(0, 1fr);
  }
  .history-panel.drawer-mode .history-item img,
  .history-panel.drawer-mode .history-placeholder {
    width: 64px;
    height: 48px;
  }
  .history-panel.drawer-mode .history-delete {
    grid-column: 2;
    justify-self: start;
  }
  .history-drawer-toggle {
    left: 12px;
    right: 12px;
    bottom: 12px;
    justify-content: center;
  }
}
</style>
