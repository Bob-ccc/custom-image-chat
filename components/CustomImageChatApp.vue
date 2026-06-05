<script setup lang="ts">
type ModeKey = "generation" | "edit" | "image-chat" | "text-chat" | "video" | "dialogue";
type LangKey = "zh" | "en";
type QualityKey = "low" | "medium" | "high" | "auto";
type ExecutionMode = "sync" | "async";
type TaskStatus = "SYNC_SUCCESS" | "IN_PROGRESS" | "SUCCESS" | "FAILURE";
type MediaType = "image" | "video";
type ImageEntryKey = "official" | "custom";
type CustomImageMode = "text-to-image" | "image-to-image";
type DialogueProviderKey = "chatgpt" | "zhipu";
type DialogueMessageRole = "user" | "assistant";
type DialogueMessage = {
  id: string;
  role: DialogueMessageRole;
  content: string;
  createdAt: string;
  model?: string;
  reasoningContent?: string;
  streamStatus?: "connected" | "receiving" | "done" | "failed";
  streamChunkCount?: number;
  reasoningExpanded?: boolean;
  stopped?: boolean;
};
type DialogueProviderState = {
  input: string;
  messages: DialogueMessage[];
  model: string;
  base: string;
};
type VideoChannelKey = "veo" | "grok-openai" | "grok-unified" | "veo-unified" | "veo-openai" | "zhipu-cogvideo" | "lingya-sora" | "yunwu-vidu" | "dimleap-happyhorse";
type GrokReferenceMode = "single" | "multi";
type ZhipuVideoQuality = "speed" | "quality";
type GptImageGeneratedPayload = {
  data: unknown;
  images: string[];
  imageMode: CustomImageMode;
  model: string;
  base: string;
  prompt: string;
  size: string;
  quality: QualityKey;
  count: number;
  sourceImages: string[];
  imageEndpoint: string;
};
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
  config: Record<string, unknown>;
};

const HISTORY_STORAGE_KEY = "goodscheck:chat-history:v1";
const API_KEY_STORAGE_KEY = "goodscheck:chat-api-key:v1";
const API_KEYS_STORAGE_KEY = "goodscheck:chat-api-keys:v1";
const IMAGE_ENTRY_STORAGE_KEY = "goodscheck:chat-image-entry:v1";
const CUSTOM_IMAGE_PROVIDER_STORAGE_KEY = "goodscheck:chat-custom-image-provider:v1";
const CHAT_UI_STATE_STORAGE_KEY = "goodscheck:chat-ui-state:v1";
const HISTORY_LIMIT = 100;
const VIDEO_IMAGE_CACHE_LIMIT = 9;
const HISTORY_IMAGE_URL_RE = /https?:\/\/[^\s"'()[\]<>]+?\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'()[\]<>]*)?/gi;
const STRUCTURED_HISTORY_IMAGE_KEY_RE = /^(?:url|image|image_url|imageUrl|output|result|displayUrl|localUrl|externalUrl|assetUrl|thumbnailUrl|coverUrl)$/i;
const APIFOX_DOC_HOSTS = new Set(["value-apiqk.apifox.cn", "gpt-best.apifox.cn", "yunwu.apifox.cn"]);
const DEFAULT_API_BASE_URL = "https://api.bltcy.ai/";
const VIDEO_API_BASE_BY_CHANNEL: Record<VideoChannelKey, string> = {
  veo: "https://api.bltcy.ai/",
  "grok-openai": "https://yunwu.ai/v1/videos",
  "grok-unified": "https://yunwu.ai",
  "veo-unified": "https://yunwu.ai",
  "veo-openai": "https://yunwu.ai",
  "zhipu-cogvideo": "https://open.bigmodel.cn/api/paas/v4",
  "lingya-sora": "https://api.lingyaai.cn",
  "yunwu-vidu": "https://yunwu.ai",
  "dimleap-happyhorse": "https://api.dimleap.cn",
};
const DIALOGUE_API_BASE_BY_PROVIDER: Record<DialogueProviderKey, string> = {
  chatgpt: "https://api.openai.com/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
};
const chatgptDialogueModelOptions = [
  "gpt-5.5",
  "gpt-5.1",
  "gpt-4o",
];
const zhipuDialogueModelOptions = [
  "glm-4.7",
  "glm-4.6v",
  "glm-4.5-air",
];
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
const lingyaSoraModelOptions = [
  "sora-2-all-vip-15s",
];
const yunwuViduModelOptions = [
  "viduq3-turbo",
  "viduq2-turbo",
];
const dimleapHappyhorseModelOptions = [
  "happyhorse-1.0-i2v",
  "happyhorse-1.0-r2v",
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
const lingyaSoraSizeOptions = [
  "small",
  "large",
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
const yunwuViduDurationOptions = Array.from({ length: 16 }, (_value, index) => index + 1);
const yunwuViduResolutionOptions = ["540p", "720p", "1080p"];
const yunwuViduMovementAmplitudeOptions = ["auto", "small", "medium", "large"];
const yunwuViduAudioTypeOptions = ["all", "speech_only", "sound_effect_only"];
const yunwuViduWatermarkPositionOptions = [1, 2, 3, 4];
const dimleapHappyhorseDurationOptions = Array.from({ length: 13 }, (_value, index) => index + 3);
const dimleapHappyhorseResolutionOptions = ["720P", "1080P"];
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
  {
    value: "lingya-sora",
    labelZh: "灵芽 Sora",
    labelEn: "Lingya Sora",
    hintZh: "走灵芽 Sora 2 unified /v1/video/create，支持 sora-2-all-vip-15s。",
    hintEn: "Uses Lingya Sora 2 unified /v1/video/create for sora-2-all-vip-15s.",
    endpoint: "/v1/video",
  },
  {
    value: "yunwu-vidu",
    labelZh: "云雾 Vidu",
    labelEn: "Yunwu Vidu",
    hintZh: "走云雾 Vidu /ent/v2/img2video 或 /ent/v2/start-end2video，支持 viduq3-turbo 和 viduq2-turbo。",
    hintEn: "Uses Yunwu Vidu /ent/v2/img2video or /ent/v2/start-end2video with viduq3-turbo and viduq2-turbo.",
    endpoint: "/ent/v2",
  },
  {
    value: "dimleap-happyhorse",
    labelZh: "Dimleap Happyhorse",
    labelEn: "Dimleap Happyhorse",
    hintZh: "走 Dimleap /v1/video/generations 创建 happyhorse 图生视频或参考生视频任务，查询走 /v1/videos/{id}。",
    hintEn: "Uses Dimleap /v1/video/generations for Happyhorse image-to-video or reference-to-video tasks and /v1/videos/{id} for status.",
    endpoint: "/v1/video",
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
  {
    key: "dialogue",
    labelZh: "对话",
    labelEn: "Chat",
    hintZh: "对话渠道，ChatGPT 使用 OpenAI Responses，智谱使用 Chat Completions。",
    hintEn: "Dialogue providers. ChatGPT uses OpenAI Responses, and Zhipu uses Chat Completions.",
    path: "/v1/responses",
    docUrl: "",
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
const dialogueProvider = ref<DialogueProviderKey>("zhipu");
const dialogueInput = ref("");
const dialogueBaseUrl = ref("");
const dialogueInputEl = ref<HTMLTextAreaElement | null>(null);
const dialogueMessages = ref<DialogueMessage[]>([]);
const dialogueProviderStates = ref<Record<DialogueProviderKey, DialogueProviderState>>({
  chatgpt: { input: "", messages: [], model: "gpt-5.5", base: DIALOGUE_API_BASE_BY_PROVIDER.chatgpt },
  zhipu: { input: "", messages: [], model: "glm-4.7", base: DIALOGUE_API_BASE_BY_PROVIDER.zhipu },
});
const dialogueMessagesEl = ref<HTMLElement | null>(null);
const dialogueReasoningEls = ref<Record<string, HTMLElement | null>>({});
const dialogueSidebarCollapsed = ref(false);
const activeDialogueAssistantId = ref("");
const copiedDialogueMessageId = ref("");
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
const yunwuViduDuration = ref(5);
const yunwuViduResolution = ref("540p");
const yunwuViduMovementAmplitude = ref("auto");
const yunwuViduSeed = ref(0);
const yunwuViduAudio = ref(false);
const yunwuViduAudioType = ref("all");
const yunwuViduVoiceId = ref("");
const yunwuViduIsRec = ref(false);
const yunwuViduBgm = ref(false);
const yunwuViduOffPeak = ref(false);
const yunwuViduWatermark = ref(false);
const yunwuViduWatermarkPosition = ref(3);
const yunwuViduWatermarkUrl = ref("");
const yunwuViduMetaData = ref("");
const yunwuViduPayload = ref("");
const yunwuViduCallbackUrl = ref("");
const dimleapHappyhorseWatermark = ref(false);
const dimleapHappyhorseSeedEnabled = ref(false);
const dimleapHappyhorseSeed = ref(12345);
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
let loadingUiState = false;
let restoringDialogueProviderState = false;
let activeDialogueController: AbortController | null = null;
let dialogueCopyTimer: ReturnType<typeof setTimeout> | null = null;

const currentMode = computed(() => modeOptions.find((item) => item.key === mode.value) || modeOptions[0]);
const isVideoMode = computed(() => mode.value === "video");
const isDialogueMode = computed(() => mode.value === "dialogue");
const isImageMode = computed(() => !isVideoMode.value && !isDialogueMode.value);
const isCustomImageEntry = computed(() => isImageMode.value && imageEntry.value === "custom");
const isCustomImageToImage = computed(() => isCustomImageEntry.value && customImageMode.value === "image-to-image");
const isGrokOpenAIFormatChannel = computed(() => isVideoMode.value && videoChannel.value === "grok-openai");
const isGrokUnifiedFormatChannel = computed(() => isVideoMode.value && videoChannel.value === "grok-unified");
const isVeoUnifiedFormatChannel = computed(() => isVideoMode.value && videoChannel.value === "veo-unified");
const isVeoOpenAIFormatChannel = computed(() => isVideoMode.value && videoChannel.value === "veo-openai");
const isZhipuCogVideoChannel = computed(() => isVideoMode.value && videoChannel.value === "zhipu-cogvideo");
const isLingyaSoraChannel = computed(() => isVideoMode.value && videoChannel.value === "lingya-sora");
const isYunwuViduChannel = computed(() => isVideoMode.value && videoChannel.value === "yunwu-vidu");
const isDimleapHappyhorseChannel = computed(() => isVideoMode.value && videoChannel.value === "dimleap-happyhorse");
const isDimleapHappyhorseI2vModel = computed(() => isDimleapHappyhorseChannel.value && model.value === "happyhorse-1.0-i2v");
const isDimleapHappyhorseR2vModel = computed(() => isDimleapHappyhorseChannel.value && model.value === "happyhorse-1.0-r2v");
const isBltVideoChannel = computed(() => isVideoMode.value && videoChannel.value === "veo");
const isYunwuUnifiedVideoChannel = computed(() => isGrokUnifiedFormatChannel.value || isVeoUnifiedFormatChannel.value);
const isYunwuVideoChannel = computed(() => isGrokOpenAIFormatChannel.value || isYunwuUnifiedVideoChannel.value || isVeoOpenAIFormatChannel.value || isYunwuViduChannel.value);
const currentModeLabel = computed(() => isDialogueMode.value ? dialogueProviderLabel(dialogueProvider.value) : isVideoMode.value ? modeLabel(mode.value, videoChannel.value) : imageEntryLabel(imageEntry.value));
const activeModelOptions = computed(() => isVideoMode.value
  ? (isGrokOpenAIFormatChannel.value ? grokVideoModelOptions : isGrokUnifiedFormatChannel.value ? grokUnifiedVideoModelOptions : isVeoUnifiedFormatChannel.value ? veoUnifiedVideoModelOptions : isVeoOpenAIFormatChannel.value ? veoOpenAIVideoModelOptions : isZhipuCogVideoChannel.value ? zhipuCogVideoModelOptions : isLingyaSoraChannel.value ? lingyaSoraModelOptions : isYunwuViduChannel.value ? yunwuViduModelOptions : isDimleapHappyhorseChannel.value ? dimleapHappyhorseModelOptions : videoModelOptions)
  : isDialogueMode.value
  ? (dialogueProvider.value === "zhipu" ? zhipuDialogueModelOptions : chatgptDialogueModelOptions)
  : isCustomImageEntry.value && !modelOptions.includes(model.value)
    ? [model.value, ...modelOptions]
    : modelOptions);
const currentYunwuViduDurationOptions = computed(() => model.value === "viduq2-turbo"
  ? yunwuViduDurationOptions.slice(0, 10)
  : yunwuViduDurationOptions);
const effectiveBaseUrl = computed(() => isDialogueMode.value ? (dialogueBaseUrl.value.trim() || DIALOGUE_API_BASE_BY_PROVIDER[dialogueProvider.value]) : isVideoMode.value ? videoBaseForChannel(videoChannel.value) : isCustomImageEntry.value ? customImageBaseUrl.value.trim() : baseUrl.value.trim());
const customImageEndpointPath = computed(() => isCustomImageToImage.value ? "/v1/images/edits" : "/v1/images/generations");
const customImageGenerationEndpoint = computed(() => isCustomImageEntry.value ? buildCustomPreviewEndpoint(customImageBaseUrl.value, customImageEndpointPath.value) : "");
const effectiveApiKey = computed(() => isCustomImageEntry.value ? customImageApiKey.value : apiKey.value);
const needsImage = computed(() => mode.value === "edit" || mode.value === "image-chat" || isCustomImageToImage.value);
const isGrokSingleReferenceMode = computed(() => isGrokOpenAIFormatChannel.value && grokReferenceMode.value === "single");
const isGrokMultiReferenceMode = computed(() => isGrokOpenAIFormatChannel.value && grokReferenceMode.value === "multi");
const videoImageLimit = computed(() => {
  if (isZhipuCogVideoChannel.value) return 2;
  if (isLingyaSoraChannel.value) return 1;
  if (isYunwuViduChannel.value) return 2;
  if (isDimleapHappyhorseR2vModel.value) return 9;
  if (isDimleapHappyhorseChannel.value) return 1;
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
  if (isLingyaSoraChannel.value) return "https://api.lingyaai.cn/doc/#/coding/sora-2-unify";
  if (isDimleapHappyhorseChannel.value) return `https://dimleap.cn/models/playground?model=${model.value === "happyhorse-1.0-r2v" ? "happyhorse-1.0-r2v" : "happyhorse-1.0-i2v"}&categoryId=video`;
  if (isYunwuViduChannel.value) return videoImages.value.length >= 2 ? "https://yunwu.apifox.cn/api-407937113" : "https://yunwu.apifox.cn/api-407755273";
  if (isZhipuCogVideoChannel.value) return "https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E8%A7%86%E9%A2%91%E7%94%9F%E6%88%90%E5%BC%82%E6%AD%A5";
  if (isVeoOpenAIFormatChannel.value) return "https://yunwu.apifox.cn/api-370109881";
  if (isVeoUnifiedFormatChannel.value) return "https://yunwu.apifox.cn/api-311083745";
  if (isGrokUnifiedFormatChannel.value) return "https://yunwu.apifox.cn/api-385288046";
  if (isGrokOpenAIFormatChannel.value) return "https://yunwu.apifox.cn/api-444583342";
  return videoImages.value.length ? "https://gpt-best.apifox.cn/api-343632235" : "https://gpt-best.apifox.cn/api-343590061";
});
const videoStatusDocUrl = computed(() => {
  if (isLingyaSoraChannel.value) return "https://api.lingyaai.cn/doc/#/coding/sora-2-unify";
  if (isDimleapHappyhorseChannel.value) return `https://dimleap.cn/models/playground?model=${model.value === "happyhorse-1.0-r2v" ? "happyhorse-1.0-r2v" : "happyhorse-1.0-i2v"}&categoryId=video`;
  if (isYunwuViduChannel.value) return "https://yunwu.apifox.cn/api-407353662";
  if (isZhipuCogVideoChannel.value) return "https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E6%9F%A5%E8%AF%A2%E5%BC%82%E6%AD%A5%E7%BB%93%E6%9E%9C";
  if (isVeoOpenAIFormatChannel.value) return "https://yunwu.apifox.cn/api-370109885";
  if (isVeoUnifiedFormatChannel.value) return "https://yunwu.apifox.cn/api-311081757";
  if (isGrokUnifiedFormatChannel.value) return "https://yunwu.apifox.cn/api-385288050";
  if (isGrokOpenAIFormatChannel.value) return "https://yunwu.apifox.cn/api-428940785";
  return "";
});
const endpointPath = computed(() => isZhipuCogVideoChannel.value ? "/videos/generations" : isDimleapHappyhorseChannel.value ? "/v1/video/generations" : isLingyaSoraChannel.value ? "/v1/video/create" : isYunwuViduChannel.value ? (videoImages.value.length >= 2 ? "/ent/v2/start-end2video" : "/ent/v2/img2video") : isYunwuUnifiedVideoChannel.value ? "/v1/video/create" : isGrokOpenAIFormatChannel.value || isVeoOpenAIFormatChannel.value ? "/v1/videos" : currentMode.value.path);
const statusEndpointPath = computed(() => {
  if (!isVideoMode.value) return "";
  if (isZhipuCogVideoChannel.value) return "/async-result/{id}";
  if (isDimleapHappyhorseChannel.value) return "/v1/videos/{id}";
  if (isVeoOpenAIFormatChannel.value) return "/v1/videos/{id}";
  if (isYunwuViduChannel.value) return "/ent/v2/tasks/{id}/creations";
  if (isLingyaSoraChannel.value) return "/v1/video/query?id={id}";
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
    : isLingyaSoraChannel.value
    ? values.filter((url: string) => /^https?:\/\//i.test(url))
    : isYunwuViduChannel.value
    ? values.filter((url: string) => /^https?:\/\//i.test(url) || /^data:image\//i.test(url))
    : isDimleapHappyhorseChannel.value
    ? values.filter((url: string) => /^https?:\/\//i.test(url))
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
    return historyRecordImageUrls(record).map((url: string, index: number) => ({
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
    lingyaSoraParamHint: zh ? "灵芽 Sora unified 会提交 model、prompt、images、orientation、size 和 duration；当前初版只支持图片 URL，不上传本地 base64。" : "Lingya Sora unified submits model, prompt, images, orientation, size, and duration. This first version supports image URLs only, not local base64 uploads.",
    yunwuViduParamHint: zh ? "云雾 Vidu 支持 viduq3-turbo 和 viduq2-turbo；可填写图片 URL，本地上传会先归档为云端 URL。1 张图调用图生视频，2 张图调用首尾帧。" : "Yunwu Vidu supports viduq3-turbo and viduq2-turbo. Use image URLs; local uploads are archived to cloud URLs first. One image calls image-to-video; two images call start/end-to-video.",
    yunwuViduMovement: zh ? "运动幅度" : "Movement",
    yunwuViduSeed: zh ? "随机种子" : "Seed",
    yunwuViduAudio: zh ? "音视频直出" : "Audio",
    yunwuViduAudioType: zh ? "音频类型" : "Audio Type",
    yunwuViduVoiceId: zh ? "音色 ID" : "Voice ID",
    yunwuViduIsRec: zh ? "推荐提示词" : "Prompt Rec",
    yunwuViduBgm: zh ? "背景音乐" : "BGM",
    yunwuViduOffPeak: zh ? "错峰模式" : "Off Peak",
    yunwuViduWatermark: zh ? "水印" : "Watermark",
    yunwuViduWatermarkPosition: zh ? "水印位置" : "Watermark Position",
    yunwuViduWatermarkUrl: zh ? "水印图片 URL" : "Watermark URL",
    yunwuViduMetaData: zh ? "元数据 meta_data" : "Meta Data",
    yunwuViduPayload: zh ? "透传 payload" : "Payload",
    dimleapHappyhorseParamHint: zh ? "Dimleap Happyhorse 会提交 model、prompt、size、duration 和 metadata；i2v 使用首帧图，r2v 使用 1-9 张参考图，图片必须是公网 URL。" : "Dimleap Happyhorse submits model, prompt, size, duration, and metadata. i2v uses one first-frame image; r2v uses 1-9 reference images. Images must be public URLs.",
    dimleapHappyhorseReferenceHint: zh ? (isDimleapHappyhorseR2vModel.value ? "Dimleap Happyhorse happyhorse-1.0-r2v 需要 1-9 张可公网访问的参考图片 URL，用于引导角色与画风。" : "Dimleap Happyhorse happyhorse-1.0-i2v 必须填写 1 张可公网访问的首帧图片 URL。") : (isDimleapHappyhorseR2vModel.value ? "Dimleap Happyhorse happyhorse-1.0-r2v requires 1-9 public reference image URLs to guide character and style." : "Dimleap Happyhorse happyhorse-1.0-i2v requires one public first-frame image URL."),
    dimleapHappyhorseWatermark: zh ? "水印" : "Watermark",
    dimleapHappyhorseSeedEnabled: zh ? "固定随机种子" : "Fixed Seed",
    dimleapHappyhorseSeed: zh ? "随机种子" : "Seed",
    callbackUrl: zh ? "回调 URL" : "Callback URL",
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
    send: zh ? "发送" : "Send",
    stop: zh ? "停止" : "Stop",
    copyMessage: zh ? "复制" : "Copy",
    copied: zh ? "已复制" : "Copied",
    regenerate: zh ? "重新生成" : "Regenerate",
    retry: zh ? "重试" : "Retry",
    stopped: zh ? "已停止" : "Stopped",
    newChat: zh ? "新对话" : "New Chat",
    chatPlaceholder: zh ? "输入消息" : "Message",
    chatgptPlaceholder: zh ? "ChatGPT 对话走 OpenAI Responses API，按官方推荐使用 /responses。" : "ChatGPT chat uses the OpenAI Responses API at /responses.",
    zhipuChatHint: zh ? "智谱对话走 /chat/completions，当前只开放 demo 配置中的三种模型。" : "Zhipu chat uses /chat/completions and only exposes the three demo models.",
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
    } else if (isLingyaSoraChannel.value) {
      base.orientation = grokAspectRatio.value === "9:16" || grokAspectRatio.value === "3:4" || grokAspectRatio.value === "2:3" ? "portrait" : "landscape";
      base.size = grokResolution.value;
      base.duration = grokDuration.value;
      base.images = videoImages.value;
    } else if (isYunwuViduChannel.value) {
      base.images = videoImages.value;
      base.mode = videoImages.value.length >= 2 ? "start-end-to-video" : "image-to-video";
      base.duration = yunwuViduDuration.value;
      base.resolution = yunwuViduResolution.value;
      base.movement_amplitude = yunwuViduMovementAmplitude.value;
      base.seed = yunwuViduSeed.value;
      base.audio = yunwuViduAudio.value;
      base.audio_type = yunwuViduAudioType.value;
      if (yunwuViduVoiceId.value.trim()) base.voice_id = yunwuViduVoiceId.value.trim();
      base.is_rec = yunwuViduIsRec.value;
      base.bgm = yunwuViduBgm.value;
      base.off_peak = yunwuViduOffPeak.value;
      base.watermark = yunwuViduWatermark.value;
      base.wm_position = yunwuViduWatermarkPosition.value;
      if (yunwuViduWatermarkUrl.value.trim()) base.wm_url = yunwuViduWatermarkUrl.value.trim();
      if (yunwuViduMetaData.value.trim()) base.meta_data = yunwuViduMetaData.value.trim();
      if (yunwuViduPayload.value.trim()) base.payload = yunwuViduPayload.value.trim();
      if (yunwuViduCallbackUrl.value.trim()) base.callback_url = yunwuViduCallbackUrl.value.trim();
    } else if (isDimleapHappyhorseChannel.value) {
      base.images = videoImages.value;
      if (isDimleapHappyhorseR2vModel.value) base.size = grokAspectRatio.value;
      base.duration = grokDuration.value;
      base.resolution = grokResolution.value;
      base.watermark = dimleapHappyhorseWatermark.value;
      if (dimleapHappyhorseSeedEnabled.value) base.seed = dimleapHappyhorseSeed.value;
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
const submitLabel = computed(() => isDialogueMode.value ? copy.value.send : isVideoMode.value ? copy.value.submitAsync : executionMode.value === "async" ? copy.value.submitAsync : copy.value.generate);

function buildPreviewEndpoint(baseRaw: string, path: string) {
  const base = baseRaw.trim().replace(/\/+$/, "");
  if (!base) return path;
  if (base.endsWith(path)) return base;
  const withoutKnownEndpoint = base.replace(/\/v[12]\/(?:(?:images|videos)\/(?:generations(?:\/[^/]+)?|edits)|video\/generations|videos(?:\/[^/]+)?|chat\/completions)$/i, "");
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

function isDataImageUrl(value: string) {
  return /^data:image\//i.test(value.trim());
}

function isStoredImageUrl(value: string) {
  const raw = value.trim();
  return Boolean(raw) && !isDataImageUrl(raw) && (/^https?:\/\//i.test(raw) || raw.startsWith("/"));
}

function b64JsonToDataImageUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isDataImageUrl(raw)) return raw;
  const mimeType = raw.startsWith("/9j/")
    ? "image/jpeg"
    : raw.startsWith("UklGR")
      ? "image/webp"
      : raw.startsWith("R0lGOD")
        ? "image/gif"
        : "image/png";
  return `data:${mimeType};base64,${raw}`;
}

function pushHistoryImageCandidate(urls: string[], value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return;
  if (isDataImageUrl(raw) || /^https?:\/\//i.test(raw) || raw.startsWith("/")) {
    urls.push(raw);
    return;
  }
  HISTORY_IMAGE_URL_RE.lastIndex = 0;
  for (const match of raw.matchAll(HISTORY_IMAGE_URL_RE)) {
    if (match[0]) urls.push(match[0]);
  }
}

function extractHistoryImageUrls(value: unknown, urls: string[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) extractHistoryImageUrls(item, urls);
    return urls;
  }
  if (typeof value === "string") {
    pushHistoryImageCandidate(urls, value);
    return urls;
  }
  if (!value || typeof value !== "object") return urls;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "b64_json") {
      const dataUrl = b64JsonToDataImageUrl(item);
      if (dataUrl) urls.push(dataUrl);
    } else if (STRUCTURED_HISTORY_IMAGE_KEY_RE.test(key)) {
      pushHistoryImageCandidate(urls, item);
    }
    extractHistoryImageUrls(item, urls);
  }
  return urls;
}

function preferStoredImageUrls(urls: string[]) {
  const unique = Array.from(new Set(urls.map((url) => String(url || "").trim()).filter(Boolean)));
  return [
    ...unique.filter(isStoredImageUrl),
    ...unique.filter((url) => !isStoredImageUrl(url)),
  ];
}

function historyImageUrlsFromCandidates(values: unknown[]) {
  return preferStoredImageUrls(values.flatMap((value) => extractHistoryImageUrls(value)));
}

function historyRecordImageUrls(record: ChatHistoryRecord) {
  return preferStoredImageUrls([record.coverUrl, ...record.images]);
}

function historyCoverUrl(record: ChatHistoryRecord) {
  return historyRecordImageUrls(record)[0] || "";
}

function sanitizeHistoryRecord(record: unknown): ChatHistoryRecord | null {
  if (!record || typeof record !== "object") return null;
  const item = record as Partial<ChatHistoryRecord>;
  if (!item.id || !item.createdAt || !item.mode) return null;
  if (!modeOptions.some((option) => option.key === item.mode)) return null;
  const status = normalizeRecordStatus(item.status, item.taskId);
  const kind = item.kind === "async" || item.taskId ? "async" : "sync";
  const mediaType: MediaType = item.mediaType === "video" || item.mode === "video" ? "video" : "image";
  const images = historyImageUrlsFromCandidates([
    ...(Array.isArray(item.images) ? item.images : []),
    item.coverUrl,
    item.response,
  ]);
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
              : String(item.videoChannel || "") === "lingya-sora"
                ? "lingya-sora"
            : String(item.videoChannel || "") === "yunwu-vidu"
              ? "yunwu-vidu"
              : String(item.videoChannel || "") === "dimleap-happyhorse" || String(item.videoChannel || "") === "dimleap" || String(item.videoChannel || "") === "happyhorse-1.0-i2v" || String(item.videoChannel || "") === "happyhorse-1.0-r2v"
                ? "dimleap-happyhorse"
                : "veo",
    grokReferenceMode: String((item as any).grokReferenceMode || "") === "multi" ? "multi" : "single",
    videoImages: Array.isArray(item.videoImages) ? item.videoImages.map((url) => String(url || "").trim()).filter(Boolean) : [],
    coverUrl: preferStoredImageUrls([String(item.coverUrl || ""), ...images])[0] || "",
    images,
    videos,
    response: item.response ?? null,
    config: item.config && typeof item.config === "object" && !Array.isArray(item.config) ? item.config as Record<string, unknown> : {},
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
  if (isDialogueMode.value) return `chat:${dialogueProvider.value}`;
  if (isVideoMode.value) return `video:${videoChannel.value}`;
  return imageEntry.value === "custom" ? "custom-image" : "official-image";
}

function activeApiKeyRef() {
  return imageEntry.value === "custom" && isImageMode.value ? customImageApiKey : apiKey;
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

function compactCachedStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter((item) => item && item.length <= 2_000_000)
    .slice(0, limit);
}

function fixedCachedStringArray(value: unknown, length: number) {
  const items = compactCachedStringArray(value, length);
  return Array.from({ length }, (_item, index) => items[index] || "");
}

function fixedCachedNullableStringArray(value: unknown, length: number) {
  const items = Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).slice(0, length)
    : [];
  return Array.from({ length }, (_item, index) => items[index] || "");
}

function sanitizeDialogueMessage(value: unknown): DialogueMessage | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<DialogueMessage>;
  const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : "";
  const content = String(item.content || "").trim();
  const reasoningContent = typeof item.reasoningContent === "string" && item.reasoningContent.length <= 40_000 ? item.reasoningContent : undefined;
  if (!role || (!content && !reasoningContent?.trim()) || content.length > 40_000) return null;
  return {
    id: String(item.id || newHistoryId()),
    role,
    content,
    createdAt: String(item.createdAt || new Date().toISOString()),
    model: typeof item.model === "string" ? item.model : undefined,
    reasoningContent,
    streamStatus: item.streamStatus === "connected" || item.streamStatus === "receiving" || item.streamStatus === "done" || item.streamStatus === "failed" ? item.streamStatus : undefined,
    streamChunkCount: Number.isFinite(Number(item.streamChunkCount)) ? Number(item.streamChunkCount) : undefined,
    reasoningExpanded: typeof item.reasoningExpanded === "boolean" ? item.reasoningExpanded : undefined,
    stopped: typeof item.stopped === "boolean" ? item.stopped : undefined,
  };
}

function dialogueModelOptionsForProvider(provider: DialogueProviderKey) {
  return provider === "zhipu" ? zhipuDialogueModelOptions : chatgptDialogueModelOptions;
}

function safeDialogueModelForProvider(provider: DialogueProviderKey, value: unknown) {
  const raw = String(value || "").trim();
  return dialogueModelOptionsForProvider(provider).includes(raw) ? raw : defaultDialogueModelForProvider(provider);
}

function safeDialogueBaseForProvider(provider: DialogueProviderKey, value: unknown) {
  const raw = String(value || "").trim();
  return raw && raw.length <= 500 ? raw : DIALOGUE_API_BASE_BY_PROVIDER[provider];
}

function sanitizeDialogueProviderState(value: unknown, provider: DialogueProviderKey): DialogueProviderState {
  const state = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const input = typeof state.input === "string" && state.input.length <= 20_000 ? state.input : "";
  const messages = Array.isArray(state.messages)
    ? state.messages
        .map((item) => sanitizeDialogueMessage(item))
        .filter(Boolean)
        .slice(-50) as DialogueMessage[]
    : [];
  return {
    input,
    messages,
    model: safeDialogueModelForProvider(provider, state.model),
    base: safeDialogueBaseForProvider(provider, state.base),
  };
}

function currentDialogueProviderStates() {
  const states: Record<DialogueProviderKey, DialogueProviderState> = {
    chatgpt: sanitizeDialogueProviderState(dialogueProviderStates.value.chatgpt, "chatgpt"),
    zhipu: sanitizeDialogueProviderState(dialogueProviderStates.value.zhipu, "zhipu"),
  };
  states[dialogueProvider.value] = {
    input: dialogueInput.value,
    messages: dialogueMessages.value.slice(-50),
    model: safeDialogueModelForProvider(dialogueProvider.value, model.value),
    base: safeDialogueBaseForProvider(dialogueProvider.value, dialogueBaseUrl.value),
  };
  return states;
}

function syncCurrentDialogueProviderState() {
  if (loadingUiState || restoringDialogueProviderState) return;
  dialogueProviderStates.value = currentDialogueProviderStates();
}

function restoreDialogueProviderState(provider: DialogueProviderKey) {
  const state = sanitizeDialogueProviderState(dialogueProviderStates.value[provider], provider);
  restoringDialogueProviderState = true;
  try {
    dialogueInput.value = state.input;
    dialogueBaseUrl.value = state.base;
    dialogueMessages.value = state.messages;
    model.value = state.model;
    responseJson.value = null;
    errorMessage.value = "";
  } finally {
    restoringDialogueProviderState = false;
  }
  resizeDialogueInput();
  scrollDialogueToBottom(true);
}

function persistChatUiState() {
  if (!import.meta.client || loadingUiState) return;
  try {
    const nextDialogueProviderStates = currentDialogueProviderStates();
    const data = {
      mode: mode.value,
      imageEntry: imageEntry.value,
      customImageMode: customImageMode.value,
      executionMode: executionMode.value,
      selectedHistoryImageKey: selectedHistoryImageKey.value,
      generationImageUrls: generationImageUrls.value,
      selectedGenerationHistoryImageKeys: selectedGenerationHistoryImageKeys.value,
      imageUrl: imageUrl.value,
      videoChannel: videoChannel.value,
      grokReferenceMode: grokReferenceMode.value,
      grokInputReference: grokInputReference.value,
      selectedGrokHistoryImageKey: selectedGrokHistoryImageKey.value,
      videoImageUrls: videoImageUrls.value,
      selectedVideoHistoryImageKeys: selectedVideoHistoryImageKeys.value,
      dialogueProvider: dialogueProvider.value,
      dialogueModel: nextDialogueProviderStates[dialogueProvider.value].model,
      dialogueBaseUrl: nextDialogueProviderStates[dialogueProvider.value].base,
      dialogueInput: nextDialogueProviderStates[dialogueProvider.value].input,
      dialogueMessages: nextDialogueProviderStates[dialogueProvider.value].messages,
      dialogueProviderStates: nextDialogueProviderStates,
      dialogueSidebarCollapsed: dialogueSidebarCollapsed.value,
      historyDrawerOpen: historyDrawerOpen.value,
    };
    localStorage.setItem(CHAT_UI_STATE_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function loadChatUiState() {
  if (!import.meta.client) return;
  loadingUiState = true;
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_UI_STATE_STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    const state = parsed as Record<string, unknown>;
    if (state.mode === "generation" || state.mode === "edit" || state.mode === "image-chat" || state.mode === "text-chat" || state.mode === "video" || state.mode === "dialogue") mode.value = state.mode;
    if (state.imageEntry === "official" || state.imageEntry === "custom") imageEntry.value = state.imageEntry;
    if (state.customImageMode === "text-to-image" || state.customImageMode === "image-to-image") customImageMode.value = state.customImageMode;
    if (state.executionMode === "sync" || state.executionMode === "async") executionMode.value = state.executionMode;
    if (typeof state.selectedHistoryImageKey === "string") selectedHistoryImageKey.value = state.selectedHistoryImageKey;
    const restoredGenerationUrls = compactCachedStringArray(state.generationImageUrls, 10);
    generationImageUrls.value = restoredGenerationUrls.length ? restoredGenerationUrls : [""];
    selectedGenerationHistoryImageKeys.value = fixedCachedNullableStringArray(state.selectedGenerationHistoryImageKeys, generationImageUrls.value.length);
    if (typeof state.imageUrl === "string" && state.imageUrl.length <= 2_000_000) imageUrl.value = state.imageUrl;
    if (typeof state.videoChannel === "string" && VIDEO_API_BASE_BY_CHANNEL[state.videoChannel as VideoChannelKey]) videoChannel.value = state.videoChannel as VideoChannelKey;
    if (state.grokReferenceMode === "single" || state.grokReferenceMode === "multi") grokReferenceMode.value = state.grokReferenceMode;
    if (typeof state.grokInputReference === "string" && state.grokInputReference.length <= 2_000_000) grokInputReference.value = state.grokInputReference;
    if (typeof state.selectedGrokHistoryImageKey === "string") selectedGrokHistoryImageKey.value = state.selectedGrokHistoryImageKey;
    videoImageUrls.value = fixedCachedStringArray(state.videoImageUrls, VIDEO_IMAGE_CACHE_LIMIT);
    selectedVideoHistoryImageKeys.value = fixedCachedNullableStringArray(state.selectedVideoHistoryImageKeys, VIDEO_IMAGE_CACHE_LIMIT);
    if (state.dialogueProvider === "chatgpt" || state.dialogueProvider === "zhipu") dialogueProvider.value = state.dialogueProvider;
    const rawDialogueStates = state.dialogueProviderStates && typeof state.dialogueProviderStates === "object" && !Array.isArray(state.dialogueProviderStates)
      ? state.dialogueProviderStates as Record<string, unknown>
      : {};
    const restoredDialogueStates: Record<DialogueProviderKey, DialogueProviderState> = {
      chatgpt: sanitizeDialogueProviderState(rawDialogueStates.chatgpt, "chatgpt"),
      zhipu: sanitizeDialogueProviderState(rawDialogueStates.zhipu, "zhipu"),
    };
    if (!rawDialogueStates[dialogueProvider.value]) {
      restoredDialogueStates[dialogueProvider.value] = sanitizeDialogueProviderState({
        input: state.dialogueInput,
        messages: state.dialogueMessages,
        model: state.dialogueModel,
        base: state.dialogueBaseUrl,
      }, dialogueProvider.value);
    }
    dialogueProviderStates.value = restoredDialogueStates;
    if (typeof state.dialogueSidebarCollapsed === "boolean") dialogueSidebarCollapsed.value = state.dialogueSidebarCollapsed;
    if (typeof state.historyDrawerOpen === "boolean") historyDrawerOpen.value = state.historyDrawerOpen;
    restoreDialogueProviderState(dialogueProvider.value);
    if (!activeModelOptions.value.includes(model.value)) {
      model.value = isDialogueMode.value ? defaultDialogueModelForProvider(dialogueProvider.value) : isVideoMode.value ? defaultVideoModelForChannel(videoChannel.value) : defaultImageModelForEntry(imageEntry.value);
    }
  } catch {
  } finally {
    loadingUiState = false;
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

function dialogueProviderLabel(provider: DialogueProviderKey) {
  if (provider === "chatgpt") return "ChatGPT";
  return lang.value === "zh" ? "智谱" : "Zhipu";
}

function defaultImageModelForEntry(entry: ImageEntryKey) {
  return entry === "custom" ? CUSTOM_IMAGE_DEFAULT_MODEL : OFFICIAL_IMAGE_DEFAULT_MODEL;
}

function defaultDialogueModelForProvider(provider: DialogueProviderKey) {
  return provider === "zhipu" ? "glm-4.7" : "gpt-5.5";
}

function defaultVideoModelForChannel(channel: VideoChannelKey) {
  if (channel === "grok-openai") return "grok-videos";
  if (channel === "grok-unified") return "grok-video-3";
  if (channel === "veo-unified") return "veo3.1-fast-components";
  if (channel === "veo-openai") return "veo_3_1-fast";
  if (channel === "zhipu-cogvideo") return "cogvideox-3";
  if (channel === "lingya-sora") return "sora-2-all-vip-15s";
  if (channel === "yunwu-vidu") return "viduq3-turbo";
  if (channel === "dimleap-happyhorse") return "happyhorse-1.0-i2v";
  return "veo3.1-fast";
}

function keyForRecord(record: ChatHistoryRecord) {
  return apiKeyForRecord(record) || (record.mediaType === "video" || record.imageEntry !== "custom" ? apiKey.value.trim() : customImageApiKey.value.trim());
}

function selectImageMode() {
  switchActiveApiKey(() => {
    if (!isImageMode.value) {
      mode.value = "generation";
    }
  });
}

function selectVideoMode() {
  switchActiveApiKey(() => {
    mode.value = "video";
  });
}

function selectDialogueMode() {
  switchActiveApiKey(() => {
    mode.value = "dialogue";
    restoreDialogueProviderState(dialogueProvider.value);
  });
}

function selectDialogueProvider(provider: DialogueProviderKey) {
  if (provider === dialogueProvider.value) {
    mode.value = "dialogue";
    return;
  }
  syncCurrentDialogueProviderState();
  switchActiveApiKey(() => {
    dialogueProvider.value = provider;
    mode.value = "dialogue";
    restoreDialogueProviderState(provider);
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
    if (channel === "lingya-sora") {
      grokAspectRatio.value = "16:9";
      grokResolution.value = "large";
      grokDuration.value = 15;
    }
    if (channel === "yunwu-vidu") {
      videoImageUrls.value = ["", "", ""];
      selectedVideoHistoryImageKeys.value = ["", "", ""];
    }
    if (channel === "dimleap-happyhorse") {
      grokDuration.value = 3;
      grokResolution.value = "720P";
      videoImageUrls.value = ["", "", ""];
      selectedVideoHistoryImageKeys.value = ["", "", ""];
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
  if (isLingyaSoraChannel.value) return copy.value.imageUrl;
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
  const normalizedImages = historyImageUrlsFromCandidates([...images, data]);
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
    config: currentHistoryConfig(),
  };
  historyRecords.value = [record, ...historyRecords.value.filter((item: ChatHistoryRecord) => item.id !== record.id)].slice(0, HISTORY_LIMIT);
  activeHistoryId.value = record.id;
  persistHistory();
  publishGenerationContext(record);
}

function displayImageUrl(url: string) {
  const value = String(url || "").trim();
  if (!/^http:\/\//i.test(value)) return value;
  return "/api/chat/image-preview?url=" + encodeURIComponent(value);
}

function saveGptImageHistory(payload: GptImageGeneratedPayload) {
  const normalizedImages = historyImageUrlsFromCandidates([...payload.images, payload.data]);
  if (!normalizedImages.length) return;
  const now = new Date().toISOString();
  const record: ChatHistoryRecord = {
    id: newHistoryId(),
    kind: "sync",
    mediaType: "image",
    imageEntry: "custom",
    createdAt: now,
    updatedAt: now,
    mode: payload.imageMode === "image-to-image" ? "edit" : "generation",
    model: payload.model,
    base: payload.base,
    imageEndpoint: payload.imageEndpoint,
    prompt: payload.prompt,
    size: payload.size,
    quality: payload.quality,
    n: payload.count,
    taskId: "",
    status: "SYNC_SUCCESS",
    progress: "",
    failReason: "",
    upstreamUrl: typeof (payload.data as any)?.upstreamUrl === "string" ? (payload.data as any).upstreamUrl : "",
    imageInputLabel: payload.sourceImages.length ? "gpt生图输入图片" : "",
    imageInputValue: payload.sourceImages.join("\n"),
    videoChannel: "veo",
    grokReferenceMode: "single",
    videoImages: [],
    coverUrl: normalizedImages[0],
    images: normalizedImages,
    videos: [],
    response: payload.data,
    config: {
      ...currentHistoryConfig(),
      imageEntry: "custom",
      customImageMode: payload.imageMode,
      customImageBaseUrl: payload.base,
      customImageEndpointPath: payload.imageEndpoint,
      generationImageUrls: payload.sourceImages,
    },
  };
  historyRecords.value = [record, ...historyRecords.value.filter((item: ChatHistoryRecord) => item.id !== record.id)].slice(0, HISTORY_LIMIT);
  activeHistoryId.value = record.id;
  persistHistory();
  publishGenerationContext(record);
}

function upsertHistoryRecord(record: ChatHistoryRecord) {
  historyRecords.value = [record, ...historyRecords.value.filter((item: ChatHistoryRecord) => item.id !== record.id)].slice(0, HISTORY_LIMIT);
  activeHistoryId.value = record.id;
  persistHistory();
  publishGenerationContext(record);
}

function currentHistoryConfig(): Record<string, unknown> {
  return {
    imageEntry: imageEntry.value,
    executionMode: executionMode.value,
    customImageMode: customImageMode.value,
    baseUrl: baseUrl.value,
    customImageBaseUrl: customImageBaseUrl.value,
    customImageEndpointPath: customImageEndpointPath.value,
    b64Json: b64Json.value,
    generationImageUrls: [...generationImageUrls.value],
    imageUrl: imageUrl.value,
    videoChannel: videoChannel.value,
    grokReferenceMode: grokReferenceMode.value,
    grokInputReference: grokInputReference.value,
    videoImageUrls: [...videoImageUrls.value],
    grokAspectRatio: grokAspectRatio.value,
    grokDuration: grokDuration.value,
    grokResolution: grokResolution.value,
    veoEnhancePrompt: veoEnhancePrompt.value,
    veoEnableUpsample: veoEnableUpsample.value,
    zhipuVideoQuality: zhipuVideoQuality.value,
    zhipuVideoSize: zhipuVideoSize.value,
    zhipuVideoFps: zhipuVideoFps.value,
    zhipuVideoDuration: zhipuVideoDuration.value,
    zhipuWithAudio: zhipuWithAudio.value,
    zhipuWatermarkEnabled: zhipuWatermarkEnabled.value,
    yunwuViduDuration: yunwuViduDuration.value,
    yunwuViduResolution: yunwuViduResolution.value,
    yunwuViduMovementAmplitude: yunwuViduMovementAmplitude.value,
    yunwuViduSeed: yunwuViduSeed.value,
    yunwuViduAudio: yunwuViduAudio.value,
    yunwuViduAudioType: yunwuViduAudioType.value,
    yunwuViduVoiceId: yunwuViduVoiceId.value,
    yunwuViduIsRec: yunwuViduIsRec.value,
    yunwuViduBgm: yunwuViduBgm.value,
    yunwuViduOffPeak: yunwuViduOffPeak.value,
    yunwuViduWatermark: yunwuViduWatermark.value,
    yunwuViduWatermarkPosition: yunwuViduWatermarkPosition.value,
    yunwuViduWatermarkUrl: yunwuViduWatermarkUrl.value,
    yunwuViduMetaData: yunwuViduMetaData.value,
    yunwuViduPayload: yunwuViduPayload.value,
    yunwuViduCallbackUrl: yunwuViduCallbackUrl.value,
    dimleapHappyhorseWatermark: dimleapHappyhorseWatermark.value,
    dimleapHappyhorseSeedEnabled: dimleapHappyhorseSeedEnabled.value,
    dimleapHappyhorseSeed: dimleapHappyhorseSeed.value,
  };
}

function generationContextForRecord(record: ChatHistoryRecord): Record<string, unknown> {
  return {
    prompt: record.prompt,
    provider: record.mediaType === "video" ? record.videoChannel : record.imageEntry,
    model: record.model,
    size: record.size,
    quality: record.quality,
    n: record.n,
    mode: record.mode,
    mediaType: record.mediaType,
    imageEntry: record.imageEntry,
    videoChannel: record.videoChannel,
    upstreamUrl: record.upstreamUrl,
    imageEndpoint: record.imageEndpoint,
    config: record.config,
  };
}

function publishGenerationContext(record: ChatHistoryRecord) {
  if (!import.meta.client) return;
  window.dispatchEvent(new CustomEvent("chat:generation-context", {
    detail: generationContextForRecord(record),
  }));
}

function configString(config: Record<string, unknown>, key: string, fallback = "") {
  const value = config[key];
  return typeof value === "string" ? value : fallback;
}

function configNumber(config: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(config[key]);
  return Number.isFinite(value) ? value : fallback;
}

function configBoolean(config: Record<string, unknown>, key: string, fallback: boolean) {
  return typeof config[key] === "boolean" ? config[key] as boolean : fallback;
}

function configStringArray(config: Record<string, unknown>, key: string) {
  return Array.isArray(config[key]) ? (config[key] as unknown[]).map((item) => String(item || "")).filter(Boolean) : [];
}

function applyHistoryConfig(record: ChatHistoryRecord) {
  const config = record.config || {};
  if (config.imageEntry === "official" || config.imageEntry === "custom") imageEntry.value = config.imageEntry;
  if (config.executionMode === "sync" || config.executionMode === "async") executionMode.value = config.executionMode;
  if (config.customImageMode === "text-to-image" || config.customImageMode === "image-to-image") customImageMode.value = config.customImageMode;
  baseUrl.value = configString(config, "baseUrl", baseUrl.value);
  customImageBaseUrl.value = configString(config, "customImageBaseUrl", customImageBaseUrl.value);
  b64Json.value = configBoolean(config, "b64Json", b64Json.value);
  const restoredGenerationUrls = configStringArray(config, "generationImageUrls");
  if (restoredGenerationUrls.length) generationImageUrls.value = restoredGenerationUrls;
  imageUrl.value = configString(config, "imageUrl", imageUrl.value);
  if (config.videoChannel && VIDEO_API_BASE_BY_CHANNEL[config.videoChannel as VideoChannelKey]) videoChannel.value = config.videoChannel as VideoChannelKey;
  if (config.grokReferenceMode === "single" || config.grokReferenceMode === "multi") grokReferenceMode.value = config.grokReferenceMode;
  grokInputReference.value = configString(config, "grokInputReference", grokInputReference.value);
  const restoredVideoUrls = configStringArray(config, "videoImageUrls");
  if (restoredVideoUrls.length) videoImageUrls.value = [...restoredVideoUrls, "", "", ""].slice(0, 3);
  grokAspectRatio.value = configString(config, "grokAspectRatio", grokAspectRatio.value);
  grokDuration.value = configNumber(config, "grokDuration", grokDuration.value);
  grokResolution.value = configString(config, "grokResolution", grokResolution.value);
  veoEnhancePrompt.value = configBoolean(config, "veoEnhancePrompt", veoEnhancePrompt.value);
  veoEnableUpsample.value = configBoolean(config, "veoEnableUpsample", veoEnableUpsample.value);
  zhipuVideoQuality.value = configString(config, "zhipuVideoQuality", zhipuVideoQuality.value) as ZhipuVideoQuality;
  zhipuVideoSize.value = configString(config, "zhipuVideoSize", zhipuVideoSize.value);
  zhipuVideoFps.value = configNumber(config, "zhipuVideoFps", zhipuVideoFps.value);
  zhipuVideoDuration.value = configNumber(config, "zhipuVideoDuration", zhipuVideoDuration.value);
  zhipuWithAudio.value = configBoolean(config, "zhipuWithAudio", zhipuWithAudio.value);
  zhipuWatermarkEnabled.value = configBoolean(config, "zhipuWatermarkEnabled", zhipuWatermarkEnabled.value);
  yunwuViduDuration.value = configNumber(config, "yunwuViduDuration", yunwuViduDuration.value);
  yunwuViduResolution.value = configString(config, "yunwuViduResolution", yunwuViduResolution.value);
  yunwuViduMovementAmplitude.value = configString(config, "yunwuViduMovementAmplitude", yunwuViduMovementAmplitude.value);
  yunwuViduSeed.value = configNumber(config, "yunwuViduSeed", yunwuViduSeed.value);
  yunwuViduAudio.value = configBoolean(config, "yunwuViduAudio", yunwuViduAudio.value);
  yunwuViduAudioType.value = configString(config, "yunwuViduAudioType", yunwuViduAudioType.value);
  yunwuViduVoiceId.value = configString(config, "yunwuViduVoiceId", yunwuViduVoiceId.value);
  yunwuViduIsRec.value = configBoolean(config, "yunwuViduIsRec", yunwuViduIsRec.value);
  yunwuViduBgm.value = configBoolean(config, "yunwuViduBgm", yunwuViduBgm.value);
  yunwuViduOffPeak.value = configBoolean(config, "yunwuViduOffPeak", yunwuViduOffPeak.value);
  yunwuViduWatermark.value = configBoolean(config, "yunwuViduWatermark", yunwuViduWatermark.value);
  yunwuViduWatermarkPosition.value = configNumber(config, "yunwuViduWatermarkPosition", yunwuViduWatermarkPosition.value);
  yunwuViduWatermarkUrl.value = configString(config, "yunwuViduWatermarkUrl", yunwuViduWatermarkUrl.value);
  yunwuViduMetaData.value = configString(config, "yunwuViduMetaData", yunwuViduMetaData.value);
  yunwuViduPayload.value = configString(config, "yunwuViduPayload", yunwuViduPayload.value);
  yunwuViduCallbackUrl.value = configString(config, "yunwuViduCallbackUrl", yunwuViduCallbackUrl.value);
  dimleapHappyhorseWatermark.value = configBoolean(config, "dimleapHappyhorseWatermark", dimleapHappyhorseWatermark.value);
  dimleapHappyhorseSeedEnabled.value = configBoolean(config, "dimleapHappyhorseSeedEnabled", dimleapHappyhorseSeedEnabled.value);
  dimleapHappyhorseSeed.value = configNumber(config, "dimleapHappyhorseSeed", dimleapHappyhorseSeed.value);
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
  applyHistoryConfig(record);
  selectedGenerationHistoryImageKeys.value = generationImageUrls.value.map(() => "");
  selectedVideoHistoryImageKeys.value = ["", "", ""];
  responseJson.value = record.response;
  previewUrls.value = [...record.images];
  videoPreviewUrls.value = [...record.videos];
  errorMessage.value = "";
  publishGenerationContext(record);
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

function syncDialogueBodyClass(value = isDialogueMode.value) {
  if (!import.meta.client) return;
  document.body.classList.toggle("custom-chat-dialogue-mode", value);
}

onMounted(() => {
  loadApiKey();
  loadCustomImageProvider();
  loadChatUiState();
  syncActiveApiKeyFromStorage();
  loadHistory();
  syncDialogueBodyClass();
});

onBeforeUnmount(() => {
  stopDialogue();
  if (dialogueCopyTimer) clearTimeout(dialogueCopyTimer);
  if (import.meta.client) document.body.classList.remove("custom-chat-dialogue-mode");
  stopPolling();
  stopCountdown();
});

watch(isDialogueMode, (value: boolean) => {
  syncDialogueBodyClass(value);
  if (value) resizeDialogueInput();
});

watch(dialogueInput, resizeDialogueInput);
watch([dialogueInput, dialogueBaseUrl, dialogueMessages, model], () => {
  if (isDialogueMode.value) syncCurrentDialogueProviderState();
}, { deep: true });

watch(mode, () => {
  if (isDialogueMode.value && !activeModelOptions.value.includes(model.value)) {
    model.value = defaultDialogueModelForProvider(dialogueProvider.value);
  }
  if (isVideoMode.value && !activeModelOptions.value.includes(model.value)) {
    model.value = defaultVideoModelForChannel(videoChannel.value);
  }
  if (isImageMode.value && !isCustomImageEntry.value && !modelOptions.includes(model.value)) {
    model.value = defaultImageModelForEntry(imageEntry.value);
  }
  if (!asyncAvailable.value && executionMode.value === "async") {
    executionMode.value = "sync";
    stopPolling();
  }
});

watch(dialogueProvider, () => {
  if (!isDialogueMode.value) return;
  if (!activeModelOptions.value.includes(model.value)) {
    model.value = defaultDialogueModelForProvider(dialogueProvider.value);
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
  if (isLingyaSoraChannel.value) {
    if (!bltVideoAspectRatioOptions.includes(grokAspectRatio.value)) grokAspectRatio.value = "16:9";
    if (!lingyaSoraSizeOptions.includes(grokResolution.value)) grokResolution.value = "large";
    grokDuration.value = 15;
  }
  if (isYunwuViduChannel.value) {
    videoImageUrls.value = videoImageUrls.value.map((url: string) => /^https?:\/\//i.test(url.trim()) || /^data:image\//i.test(url.trim()) ? url : "");
    selectedVideoHistoryImageKeys.value = selectedVideoHistoryImageKeys.value.map((key: string, index: number) => index < videoImageLimit.value ? key : "");
    if (!currentYunwuViduDurationOptions.value.includes(Number(yunwuViduDuration.value))) yunwuViduDuration.value = Math.min(5, currentYunwuViduDurationOptions.value.at(-1) || 5);
    if (!yunwuViduResolutionOptions.includes(yunwuViduResolution.value)) yunwuViduResolution.value = "540p";
    if (!yunwuViduMovementAmplitudeOptions.includes(yunwuViduMovementAmplitude.value)) yunwuViduMovementAmplitude.value = "auto";
    if (!yunwuViduAudioTypeOptions.includes(yunwuViduAudioType.value)) yunwuViduAudioType.value = "all";
    if (!yunwuViduWatermarkPositionOptions.includes(Number(yunwuViduWatermarkPosition.value))) yunwuViduWatermarkPosition.value = 3;
  }
  if (isDimleapHappyhorseChannel.value) {
    videoImageUrls.value = videoImageUrls.value.map((url: string) => /^https?:\/\//i.test(url.trim()) ? url : "");
    selectedVideoHistoryImageKeys.value = selectedVideoHistoryImageKeys.value.map((key: string, index: number) => index < videoImageLimit.value ? key : "");
    if (isDimleapHappyhorseR2vModel.value && !grokAspectRatioOptions.includes(grokAspectRatio.value)) grokAspectRatio.value = "16:9";
    if (!dimleapHappyhorseDurationOptions.includes(Number(grokDuration.value))) grokDuration.value = 3;
    if (!dimleapHappyhorseResolutionOptions.includes(grokResolution.value)) grokResolution.value = "720P";
    if (!Number.isInteger(Number(dimleapHappyhorseSeed.value)) || Number(dimleapHappyhorseSeed.value) < 0) dimleapHappyhorseSeed.value = 12345;
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
  if (isDialogueMode.value) {
    if (!activeModelOptions.value.includes(model.value)) {
      model.value = defaultDialogueModelForProvider(dialogueProvider.value);
    }
    return;
  }
  if (!isVideoMode.value) return;
  if (isDimleapHappyhorseChannel.value) {
    if (isDimleapHappyhorseR2vModel.value && Number(grokDuration.value) === 3) grokDuration.value = 5;
    if (isDimleapHappyhorseI2vModel.value && Number(grokDuration.value) === 5) grokDuration.value = 3;
  }
  if (isLingyaSoraChannel.value) {
    grokDuration.value = 15;
  }
  if (isYunwuViduChannel.value && !currentYunwuViduDurationOptions.value.includes(Number(yunwuViduDuration.value))) {
    yunwuViduDuration.value = currentYunwuViduDurationOptions.value.at(-1) || 5;
  }
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
watch([
  mode,
  model,
  imageEntry,
  customImageMode,
  executionMode,
  selectedHistoryImageKey,
  generationImageUrls,
  selectedGenerationHistoryImageKeys,
  imageUrl,
  videoChannel,
  grokReferenceMode,
  grokInputReference,
  selectedGrokHistoryImageKey,
  videoImageUrls,
  selectedVideoHistoryImageKeys,
  dialogueProvider,
  dialogueInput,
  dialogueBaseUrl,
  dialogueMessages,
  dialogueProviderStates,
  dialogueSidebarCollapsed,
  historyDrawerOpen,
], persistChatUiState, { deep: true });
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
  if (isDialogueMode.value) {
    dialogueInput.value = "";
    dialogueMessages.value = [];
    dialogueProviderStates.value = {
      ...currentDialogueProviderStates(),
      [dialogueProvider.value]: {
        input: "",
        messages: [],
        model: safeDialogueModelForProvider(dialogueProvider.value, model.value),
        base: safeDialogueBaseForProvider(dialogueProvider.value, dialogueBaseUrl.value),
      },
    };
    responseJson.value = null;
    errorMessage.value = "";
    return;
  }
  prompt.value = "";
  imageUrl.value = "";
  imageDataUrl.value = "";
  imageFileName.value = "";
  selectedHistoryImageKey.value = "";
  generationImageUrls.value = [""];
  selectedGenerationHistoryImageKeys.value = [""];
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
  dimleapHappyhorseWatermark.value = false;
  dimleapHappyhorseSeedEnabled.value = false;
  dimleapHappyhorseSeed.value = 12345;
  size.value = "1024x1024";
  quality.value = "auto";
  count.value = 1;
  b64Json.value = false;
  responseJson.value = null;
  previewUrls.value = [];
  videoPreviewUrls.value = [];
  errorMessage.value = "";
}

function dialogueMessageTime(value: string) {
  try {
    return new Date(value).toLocaleTimeString(lang.value === "zh" ? "zh-CN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

function dialogueSubmitDisabled() {
  return !activeModelOptions.value.length || !dialogueInput.value.trim();
}

function resizeDialogueInput() {
  if (!import.meta.client) return;
  nextTick(() => {
    const el = dialogueInputEl.value;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  });
}

function dialogueMessageText(message: DialogueMessage) {
  const parts = [];
  if (message.reasoningContent?.trim()) {
    parts.push(`${lang.value === "zh" ? "思考过程" : "Thinking"}:\n${message.reasoningContent.trim()}`);
  }
  if (message.content.trim()) parts.push(message.content.trim());
  return parts.join("\n\n");
}

function dialogueReasoningActive(message: DialogueMessage) {
  return (message.streamStatus === "connected" || message.streamStatus === "receiving") && !message.content.trim();
}

function dialogueReasoningLabel(message: DialogueMessage) {
  if (dialogueReasoningActive(message)) return lang.value === "zh" ? "正在思考" : "Thinking";
  if (message.stopped) return lang.value === "zh" ? "思考已停止" : "Thinking stopped";
  return lang.value === "zh" ? "已思考" : "Thought";
}

function dialogueReasoningToggleLabel(message: DialogueMessage) {
  if (message.reasoningExpanded) return lang.value === "zh" ? "收起" : "Collapse";
  return lang.value === "zh" ? "查看思考过程" : "View thinking";
}

function setDialogueReasoningEl(id: string, el: Element | null) {
  dialogueReasoningEls.value[id] = el instanceof HTMLElement ? el : null;
}

function scrollDialogueToBottom(force = false) {
  if (!import.meta.client) return;
  nextTick(() => {
    const el = dialogueMessagesEl.value;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (force || distance < 180) el.scrollTop = el.scrollHeight;
  });
}

function scrollDialogueReasoningToBottom(id: string) {
  if (!import.meta.client) return;
  nextTick(() => {
    const el = dialogueReasoningEls.value[id];
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });
}

function stopDialogue() {
  if (!activeDialogueController) return;
  activeDialogueController.abort();
  const id = activeDialogueAssistantId.value;
  if (id) patchDialogueMessage(id, { streamStatus: "done", stopped: true });
}

async function copyDialogueMessage(message: DialogueMessage) {
  const text = dialogueMessageText(message);
  if (!text) return;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    copiedDialogueMessageId.value = message.id;
    if (dialogueCopyTimer) clearTimeout(dialogueCopyTimer);
    dialogueCopyTimer = setTimeout(() => {
      if (copiedDialogueMessageId.value === message.id) copiedDialogueMessageId.value = "";
    }, 1400);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

async function regenerateDialogue(message: DialogueMessage) {
  if (loading.value || !activeModelOptions.value.length) return;
  const assistantIndex = dialogueMessages.value.findIndex((item) => item.id === message.id);
  if (assistantIndex < 0) return;
  const userIndex = [...dialogueMessages.value.slice(0, assistantIndex)].map((item) => item.role).lastIndexOf("user");
  if (userIndex < 0) return;
  const userMessage = dialogueMessages.value[userIndex];
  const history = dialogueMessages.value.slice(0, userIndex);
  dialogueMessages.value = history;
  await submitDialogue({ content: userMessage.content, appendUser: true });
}

async function submitDialogue(options: { content?: string; appendUser?: boolean } = {}) {
  if (loading.value) return;
  errorMessage.value = "";
  responseJson.value = null;
  const content = (options.content ?? dialogueInput.value).trim();
  if (!content) {
    errorMessage.value = lang.value === "zh" ? "消息不能为空。" : "Message is required.";
    return;
  }
  if (!activeModelOptions.value.includes(model.value)) {
    errorMessage.value = dialogueProvider.value === "zhipu"
      ? (lang.value === "zh" ? "智谱对话仅支持 glm-4.7、glm-4.6v、glm-4.5-air。" : "Zhipu chat only supports glm-4.7, glm-4.6v, and glm-4.5-air.")
      : (lang.value === "zh" ? "ChatGPT 对话模型无效。" : "Invalid ChatGPT chat model.");
    return;
  }
  if (!effectiveApiKey.value.trim()) {
    errorMessage.value = lang.value === "zh" ? "API Key 不能为空。" : "API Key is required.";
    return;
  }
  const userMessage: DialogueMessage = {
    id: newHistoryId(),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
    model: model.value,
  };
  const messages = [...dialogueMessages.value, userMessage].slice(-30);
  const assistantId = newHistoryId();
  const assistantMessage: DialogueMessage = {
    id: assistantId,
    role: "assistant",
    content: "",
    reasoningContent: "",
    createdAt: new Date().toISOString(),
    model: model.value,
    streamStatus: "connected",
    streamChunkCount: 0,
  };
  dialogueMessages.value = [...messages, assistantMessage];
  if (!options.content) dialogueInput.value = "";
  resizeDialogueInput();
  loading.value = true;
  activeDialogueAssistantId.value = assistantId;
  const controller = new AbortController();
  activeDialogueController = controller;
  scrollDialogueToBottom(true);
  try {
    const response = await fetch("/api/chat/dialogue-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        providerName: dialogueProvider.value,
        provider: {
          base: effectiveBaseUrl.value,
          key: effectiveApiKey.value,
          model: model.value,
        },
        messages: messages.map((item) => ({
          role: item.role,
          content: item.content,
        })),
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      responseJson.value = data;
      errorMessage.value = data?.error?.message || data?.message || (lang.value === "zh" ? "对话请求失败。" : "Chat request failed.");
      patchDialogueMessage(assistantId, { streamStatus: "failed", content: errorMessage.value });
      return;
    }
    await readDialogueStream(response, assistantId);
    const finalMessage = dialogueMessages.value.find((item) => item.id === assistantId);
    if (!finalMessage?.content?.trim() && !finalMessage?.reasoningContent?.trim()) {
      errorMessage.value = lang.value === "zh" ? "接口未返回助手消息。" : "The API did not return an assistant message.";
      patchDialogueMessage(assistantId, { streamStatus: "failed", content: errorMessage.value });
      return;
    }
    patchDialogueMessage(assistantId, { streamStatus: "done" });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const finalMessage = dialogueMessages.value.find((item) => item.id === assistantId);
      patchDialogueMessage(assistantId, {
        streamStatus: finalMessage?.content?.trim() || finalMessage?.reasoningContent?.trim() ? "done" : "failed",
        content: finalMessage?.content?.trim() || finalMessage?.reasoningContent?.trim() ? finalMessage.content : copy.value.stopped,
        stopped: true,
      });
      return;
    }
    errorMessage.value = error instanceof Error ? error.message : String(error);
    responseJson.value = { ok: false, error: { message: errorMessage.value } };
    patchDialogueMessage(assistantId, { streamStatus: "failed", content: errorMessage.value });
  } finally {
    loading.value = false;
    activeDialogueController = null;
    activeDialogueAssistantId.value = "";
    scrollDialogueToBottom();
  }
}

function patchDialogueMessage(id: string, patch: Partial<DialogueMessage>) {
  dialogueMessages.value = dialogueMessages.value.map((item) => item.id === id ? { ...item, ...patch } : item).slice(-50);
  if (patch.reasoningExpanded && dialogueMessages.value.find((item) => item.id === id)?.reasoningContent) {
    scrollDialogueReasoningToBottom(id);
  }
}

function appendDialogueDelta(id: string, delta: { content?: string; reasoningContent?: string; model?: string }) {
  dialogueMessages.value = dialogueMessages.value.map((item) => {
    if (item.id !== id) return item;
    const nextReasoning = (item.reasoningContent || "") + (delta.reasoningContent || "");
    const nextContent = (item.content || "") + (delta.content || "");
    const contentStarted = !item.content.trim() && Boolean((delta.content || "").trim()) && Boolean(nextContent.trim());
    const reasoningStarted = !item.reasoningContent?.trim() && Boolean((delta.reasoningContent || "").trim());
    return {
      ...item,
      content: nextContent,
      reasoningContent: nextReasoning,
      model: delta.model || item.model,
      streamStatus: "receiving",
      streamChunkCount: (item.streamChunkCount || 0) + ((delta.content || delta.reasoningContent) ? 1 : 0),
      reasoningExpanded: nextReasoning
        ? contentStarted
          ? false
          : nextContent
            ? item.reasoningExpanded ?? false
            : reasoningStarted
              ? true
              : item.reasoningExpanded ?? true
        : item.reasoningExpanded,
    };
  }).slice(-50);
  for (const key of Object.keys(dialogueReasoningEls.value)) {
    if (!dialogueMessages.value.some((item) => item.id === key)) {
      delete dialogueReasoningEls.value[key];
    }
  }
  if (delta.reasoningContent) scrollDialogueReasoningToBottom(id);
  scrollDialogueToBottom();
}

async function readDialogueStream(response: Response, assistantId: string) {
  if (!response.body?.getReader) throw new Error(lang.value === "zh" ? "当前浏览器不支持流式响应。" : "This browser does not support streaming responses.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const finalData: Record<string, unknown> = {};

  function nextSseSeparator(value: string) {
    const lf = value.indexOf("\n\n");
    const crlf = value.indexOf("\r\n\r\n");
    if (lf < 0 && crlf < 0) return null;
    if (lf < 0) return { index: crlf, length: 4 };
    if (crlf < 0) return { index: lf, length: 2 };
    return lf < crlf ? { index: lf, length: 2 } : { index: crlf, length: 4 };
  }

  async function consumePayload(payload: string) {
    if (!payload) return false;
    if (payload === "[DONE]") return true;
    let data: any = null;
    try {
      data = JSON.parse(payload);
    } catch {
      return false;
    }
    if (data?.ok === false || data?.error) {
      throw new Error(data?.error?.message || data?.message || (lang.value === "zh" ? "流式对话失败。" : "Streaming chat failed."));
    }
    if (data?.type === "delta") {
      appendDialogueDelta(assistantId, {
        content: String(data.content || ""),
        reasoningContent: String(data.reasoningContent || ""),
        model: typeof data.model === "string" ? data.model : undefined,
      });
    } else if (data?.type === "final") {
      Object.assign(finalData, data);
      responseJson.value = { ok: true, ...finalData };
    }
    return false;
  }

  outer: for (;;) {
    const read = await reader.read();
    if (read.done) break;
    buffer += decoder.decode(read.value, { stream: true });
    for (;;) {
      const separator = nextSseSeparator(buffer);
      if (!separator) break;
      const frame = buffer.slice(0, separator.index);
      buffer = buffer.slice(separator.index + separator.length);
      const payloadLines = frame
        .split("\n")
        .map((line) => line.replace(/\r$/, ""))
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());
      if (!payloadLines.length) continue;
      const done = await consumePayload(payloadLines.join("\n"));
      if (done) break outer;
    }
  }
  const rest = buffer.trim();
  if (rest) {
    const payloadLines = rest
      .split("\n")
      .map((line) => line.replace(/\r$/, ""))
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    if (payloadLines.length) await consumePayload(payloadLines.join("\n"));
  }
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
    config: currentHistoryConfig(),
  };
}

function updateAsyncRecord(record: ChatHistoryRecord, data: any): ChatHistoryRecord {
  const status = normalizeRecordStatus(data?.status, record.taskId);
  const images = Array.isArray(data?.images) ? historyImageUrlsFromCandidates([...data.images, data]) : record.images;
  const videos = Array.isArray(data?.videos) ? data.videos.map((url: unknown) => String(url || "").trim()).filter(Boolean) : record.videos;
  return {
    ...record,
    updatedAt: new Date().toISOString(),
    status,
    progress: String(data?.progress || record.progress || ""),
    failReason: String(data?.failReason || record.failReason || ""),
    upstreamUrl: String(data?.upstreamUrl || record.upstreamUrl || ""),
    coverUrl: preferStoredImageUrls([record.coverUrl, ...images])[0] || "",
    images,
    videos,
    response: data,
    config: record.config || {},
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
  if (isLingyaSoraChannel.value) {
    if (!lingyaSoraModelOptions.includes(model.value)) return lang.value === "zh" ? "灵芽 Sora 仅支持 sora-2-all-vip-15s。" : "Lingya Sora only supports sora-2-all-vip-15s.";
    if (!prompt.value.trim()) return lang.value === "zh" ? "提示词不能为空。" : "Prompt is required.";
    if (!["16:9", "9:16"].includes(grokAspectRatio.value)) return lang.value === "zh" ? "灵芽 Sora 方向仅支持 16:9 或 9:16。" : "Lingya Sora orientation supports 16:9 or 9:16.";
    if (!lingyaSoraSizeOptions.includes(grokResolution.value)) return lang.value === "zh" ? "灵芽 Sora 尺寸只能为 small 或 large。" : "Lingya Sora size must be small or large.";
    if (Number(grokDuration.value) !== 15) return lang.value === "zh" ? "sora-2-all-vip-15s 视频时长必须为 15 秒。" : "sora-2-all-vip-15s duration must be 15 seconds.";
    if (videoImageUrls.value.some((url: string) => url.trim() && !/^https?:\/\//i.test(url.trim()))) return lang.value === "zh" ? "灵芽 Sora unified 仅支持图片 URL，不支持本地 base64 图片。" : "Lingya Sora unified only supports image URLs, not local base64 images.";
    if (videoImages.value.length > videoImageLimit.value) return lang.value === "zh" ? "灵芽 Sora 初版最多支持 1 张参考图。" : "Lingya Sora currently supports up to 1 reference image.";
    return "";
  }
  if (isYunwuViduChannel.value) {
    if (!yunwuViduModelOptions.includes(model.value)) return lang.value === "zh" ? "云雾 Vidu 仅支持 viduq3-turbo 和 viduq2-turbo。" : "Yunwu Vidu only supports viduq3-turbo and viduq2-turbo.";
    if (!prompt.value.trim()) return lang.value === "zh" ? "提示词不能为空。" : "Prompt is required.";
    if (!videoImages.value.length) return lang.value === "zh" ? "云雾 Vidu 至少需要 1 张图片 URL 或上传图片。" : "Yunwu Vidu requires at least one image URL or uploaded image.";
    if (videoImages.value.length > 2) return lang.value === "zh" ? "云雾 Vidu 最多支持首尾帧 2 张图片。" : "Yunwu Vidu supports at most two first/last frame images.";
    if (videoImageUrls.value.some((url: string) => url.trim() && !(/^https?:\/\//i.test(url.trim()) || /^data:image\//i.test(url.trim())))) return lang.value === "zh" ? "云雾 Vidu 只支持图片 URL 或本地上传图片。" : "Yunwu Vidu only supports image URLs or uploaded images.";
    if (!currentYunwuViduDurationOptions.value.includes(Number(yunwuViduDuration.value))) return model.value === "viduq2-turbo"
      ? (lang.value === "zh" ? "viduq2-turbo 时长必须为 1-10 秒。" : "viduq2-turbo duration must be 1-10 seconds.")
      : (lang.value === "zh" ? "viduq3-turbo 时长必须为 1-16 秒。" : "viduq3-turbo duration must be 1-16 seconds.");
    if (!yunwuViduResolutionOptions.includes(yunwuViduResolution.value)) return lang.value === "zh" ? "云雾 Vidu 清晰度只能为 540p、720p 或 1080p。" : "Yunwu Vidu resolution must be 540p, 720p, or 1080p.";
    if (!yunwuViduMovementAmplitudeOptions.includes(yunwuViduMovementAmplitude.value)) return lang.value === "zh" ? "云雾 Vidu 运动幅度无效。" : "Yunwu Vidu movement amplitude is invalid.";
    if (!yunwuViduAudioTypeOptions.includes(yunwuViduAudioType.value)) return lang.value === "zh" ? "云雾 Vidu 音频类型无效。" : "Yunwu Vidu audio type is invalid.";
    if (!Number.isInteger(Number(yunwuViduSeed.value)) || Number(yunwuViduSeed.value) < 0) return lang.value === "zh" ? "云雾 Vidu seed 必须是非负整数，0 表示随机。" : "Yunwu Vidu seed must be a non-negative integer; 0 means random.";
    if (!yunwuViduWatermarkPositionOptions.includes(Number(yunwuViduWatermarkPosition.value))) return lang.value === "zh" ? "云雾 Vidu 水印位置只能为 1-4。" : "Yunwu Vidu watermark position must be 1-4.";
    if (yunwuViduWatermarkUrl.value.trim() && !/^https?:\/\//i.test(yunwuViduWatermarkUrl.value.trim())) return lang.value === "zh" ? "云雾 Vidu wm_url 必须是 http(s) URL。" : "Yunwu Vidu wm_url must be an http(s) URL.";
    if (yunwuViduMetaData.value.trim()) {
      try {
        JSON.parse(yunwuViduMetaData.value.trim());
      } catch {
        return lang.value === "zh" ? "云雾 Vidu meta_data 必须是 JSON 字符串。" : "Yunwu Vidu meta_data must be a JSON string.";
      }
    }
    if (yunwuViduPayload.value.length > 1048576) return lang.value === "zh" ? "云雾 Vidu payload 不能超过 1048576 个字符。" : "Yunwu Vidu payload cannot exceed 1,048,576 characters.";
    if (yunwuViduCallbackUrl.value.trim() && !/^https?:\/\//i.test(yunwuViduCallbackUrl.value.trim())) return lang.value === "zh" ? "云雾 Vidu callback_url 必须是 http(s) URL。" : "Yunwu Vidu callback_url must be an http(s) URL.";
    return "";
  }
  if (isDimleapHappyhorseChannel.value) {
    if (!dimleapHappyhorseModelOptions.includes(model.value)) return lang.value === "zh" ? "Dimleap Happyhorse 仅支持 happyhorse-1.0-i2v 和 happyhorse-1.0-r2v。" : "Dimleap Happyhorse only supports happyhorse-1.0-i2v and happyhorse-1.0-r2v.";
    if (!prompt.value.trim()) return lang.value === "zh" ? "提示词不能为空。" : "Prompt is required.";
    if (isDimleapHappyhorseI2vModel.value && videoImages.value.length !== 1) return lang.value === "zh" ? "Dimleap Happyhorse i2v 必须填写 1 张首帧图片 URL。" : "Dimleap Happyhorse i2v requires one first-frame image URL.";
    if (isDimleapHappyhorseR2vModel.value && (videoImages.value.length < 1 || videoImages.value.length > 9)) return lang.value === "zh" ? "Dimleap Happyhorse r2v 需要 1-9 张参考图片 URL。" : "Dimleap Happyhorse r2v requires 1-9 reference image URLs.";
    if (videoImageUrls.value.some((url: string) => url.trim() && !/^https?:\/\//i.test(url.trim()))) return lang.value === "zh" ? "Dimleap Happyhorse 只支持公网图片 URL，不支持本地 base64。" : "Dimleap Happyhorse only supports public image URLs, not local base64.";
    if (!dimleapHappyhorseDurationOptions.includes(Number(grokDuration.value))) return lang.value === "zh" ? "Dimleap Happyhorse 时长必须为 3-15 秒。" : "Dimleap Happyhorse duration must be 3-15 seconds.";
    if (isDimleapHappyhorseR2vModel.value && !grokAspectRatioOptions.includes(grokAspectRatio.value)) return lang.value === "zh" ? "Dimleap Happyhorse r2v 比例无效。" : "Dimleap Happyhorse r2v size is invalid.";
    if (!dimleapHappyhorseResolutionOptions.includes(grokResolution.value)) return lang.value === "zh" ? "Dimleap Happyhorse 分辨率只能为 720P 或 1080P。" : "Dimleap Happyhorse resolution must be 720P or 1080P.";
    if (dimleapHappyhorseSeedEnabled.value && (!Number.isInteger(Number(dimleapHappyhorseSeed.value)) || Number(dimleapHappyhorseSeed.value) < 0)) return lang.value === "zh" ? "Dimleap Happyhorse seed 必须是非负整数。" : "Dimleap Happyhorse seed must be a non-negative integer.";
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
  } else if (isLingyaSoraChannel.value) {
    payload.orientation = grokAspectRatio.value === "9:16" ? "portrait" : "landscape";
    payload.size = grokResolution.value;
    payload.duration = grokDuration.value;
    payload.images = requestImages;
  } else if (isYunwuViduChannel.value) {
    payload.images = requestImages;
    payload.duration = yunwuViduDuration.value;
    payload.resolution = yunwuViduResolution.value;
    payload.movement_amplitude = yunwuViduMovementAmplitude.value;
    payload.seed = yunwuViduSeed.value;
    payload.audio = yunwuViduAudio.value;
    payload.audio_type = yunwuViduAudioType.value;
    if (yunwuViduVoiceId.value.trim()) payload.voice_id = yunwuViduVoiceId.value.trim();
    payload.is_rec = yunwuViduIsRec.value;
    payload.bgm = yunwuViduBgm.value;
    payload.off_peak = yunwuViduOffPeak.value;
    payload.watermark = yunwuViduWatermark.value;
    payload.wm_position = yunwuViduWatermarkPosition.value;
    if (yunwuViduWatermarkUrl.value.trim()) payload.wm_url = yunwuViduWatermarkUrl.value.trim();
    if (yunwuViduMetaData.value.trim()) payload.meta_data = yunwuViduMetaData.value.trim();
    if (yunwuViduPayload.value.trim()) payload.payload = yunwuViduPayload.value.trim();
    if (yunwuViduCallbackUrl.value.trim()) payload.callback_url = yunwuViduCallbackUrl.value.trim();
  } else if (isDimleapHappyhorseChannel.value) {
    payload.images = requestImages;
    if (isDimleapHappyhorseR2vModel.value) payload.size = grokAspectRatio.value;
    payload.duration = grokDuration.value;
    payload.resolution = grokResolution.value;
    payload.watermark = dimleapHappyhorseWatermark.value;
    if (dimleapHappyhorseSeedEnabled.value) payload.seed = dimleapHappyhorseSeed.value;
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
  if (isDialogueMode.value) {
    await submitDialogue();
    return;
  }
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
  <main class="chat-page compact-sidebar-layout" :class="{ 'dialogue-mode': isDialogueMode }">
    <section
      class="chat-shell has-fixed-top-panel"
      :class="{ 'dialogue-shell-layout': isDialogueMode, 'dialogue-sidebar-collapsed': isDialogueMode && dialogueSidebarCollapsed }"
    >
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
          <button
            v-if="isDialogueMode"
            type="button"
            class="dialogue-sidebar-toggle"
            :aria-expanded="!dialogueSidebarCollapsed"
            :title="dialogueSidebarCollapsed ? (lang === 'zh' ? '展开侧栏' : 'Expand sidebar') : (lang === 'zh' ? '收起侧栏' : 'Collapse sidebar')"
            @click="dialogueSidebarCollapsed = !dialogueSidebarCollapsed"
          >
            {{ dialogueSidebarCollapsed ? "›" : "‹" }}
          </button>
        </header>

        <div class="media-tabs" aria-label="媒体类型">
          <button
            type="button"
            :class="{ active: isImageMode }"
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
          <button
            type="button"
            :class="{ active: isDialogueMode }"
            @click="selectDialogueMode"
          >
            {{ lang === "zh" ? "对话" : "Chat" }}
          </button>
        </div>

        <div v-if="isImageMode" class="mode-tabs compact-tabs" aria-label="图片入口">
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
        <div v-else-if="isVideoMode" class="mode-tabs compact-tabs video-tabs" aria-label="视频渠道">
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
        <div v-else class="mode-tabs compact-tabs dialogue-tabs" aria-label="对话渠道">
          <button
            type="button"
            :class="{ active: dialogueProvider === 'chatgpt' }"
            @click="selectDialogueProvider('chatgpt')"
          >
            <strong>ChatGPT</strong>
            <span>/responses</span>
          </button>
          <button
            type="button"
            :class="{ active: dialogueProvider === 'zhipu' }"
            @click="selectDialogueProvider('zhipu')"
          >
            <strong>{{ lang === "zh" ? "智谱" : "Zhipu" }}</strong>
            <span>/chat/completions</span>
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

      <div class="chat-grid" :class="{ 'history-as-drawer': historyDrawerEnabled, 'dialogue-layout': isDialogueMode }">
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
              <img v-if="historyCoverUrl(record)" :src="displayImageUrl(historyCoverUrl(record))" :alt="promptSummary(record.prompt)" />
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

        <GptImageGenerator
          v-if="isCustomImageEntry"
          embedded
          :restore-record="selectedRecord?.imageEntry === 'custom' ? selectedRecord : null"
          @generated="saveGptImageHistory"
        />

        <form v-else-if="isDialogueMode" class="dialogue-panel" @submit.prevent="submit">
          <section class="dialogue-shell">
            <header class="dialogue-toolbar">
              <div>
                <strong>{{ dialogueProviderLabel(dialogueProvider) }}</strong>
                <span v-if="dialogueProvider === 'zhipu'">{{ copy.zhipuChatHint }}</span>
                <span v-else>{{ copy.chatgptPlaceholder }}</span>
              </div>
              <div class="dialogue-config">
                <select v-model="model" :aria-label="dialogueProvider === 'zhipu' ? '智谱模型' : 'ChatGPT 模型'">
                  <option v-for="item in activeModelOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
                <input
                  v-model="dialogueBaseUrl"
                  type="url"
                  autocomplete="off"
                  spellcheck="false"
                  :placeholder="DIALOGUE_API_BASE_BY_PROVIDER[dialogueProvider]"
                  :aria-label="dialogueProvider === 'zhipu' ? '智谱 API Base' : 'OpenAI API Base'"
                />
                <input
                  v-model="apiKey"
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="sk-..."
                  :aria-label="dialogueProvider === 'zhipu' ? '智谱 API Key' : 'OpenAI API Key'"
                />
                <button type="button" class="secondary" :disabled="loading || !dialogueMessages.length" @click="resetForm">
                  {{ copy.newChat }}
                </button>
              </div>
            </header>

            <div ref="dialogueMessagesEl" class="dialogue-messages" aria-live="polite">
              <div v-if="!dialogueMessages.length" class="dialogue-empty">
                {{ lang === "zh" ? "有什么可以帮忙的？" : "How can I help?" }}
              </div>
              <template v-else>
                <article
                  v-for="message in dialogueMessages"
                  :key="message.id"
                  class="dialogue-message"
                  :class="message.role"
                >
                  <div class="dialogue-avatar">{{ message.role === "user" ? "U" : "AI" }}</div>
                  <div class="dialogue-bubble">
                    <div
                      v-if="message.reasoningContent"
                      class="dialogue-reasoning"
                      :class="{ active: dialogueReasoningActive(message), expanded: message.reasoningExpanded }"
                    >
                      <button
                        type="button"
                        class="dialogue-reasoning-toggle"
                        :aria-expanded="Boolean(message.reasoningExpanded)"
                        @click="message.reasoningExpanded = !message.reasoningExpanded"
                      >
                        <span class="reasoning-status-dot" aria-hidden="true" />
                        <strong>{{ dialogueReasoningLabel(message) }}</strong>
                        <span>{{ dialogueReasoningToggleLabel(message) }}</span>
                      </button>
                      <div
                        v-if="message.reasoningExpanded"
                        :ref="(el) => setDialogueReasoningEl(message.id, el)"
                        class="dialogue-reasoning-body"
                      >
                        <pre>{{ message.reasoningContent }}</pre>
                      </div>
                    </div>
                    <p v-if="message.content">{{ message.content }}</p>
                    <p v-else-if="message.streamStatus === 'connected' || message.streamStatus === 'receiving'" class="stream-placeholder">
                      {{ message.reasoningContent ? (lang === "zh" ? "正在组织回答..." : "Writing answer...") : (lang === "zh" ? "正在思考..." : "Thinking...") }}
                    </p>
                    <small>
                      {{ message.model || dialogueProviderLabel(dialogueProvider) }} ·
                      {{ message.stopped ? copy.stopped : message.streamStatus === "receiving" ? (lang === "zh" ? "流式输出中" : "Streaming") : dialogueMessageTime(message.createdAt) }}
                    </small>
                    <div class="dialogue-actions">
                      <button
                        type="button"
                        :disabled="!dialogueMessageText(message)"
                        @click="copyDialogueMessage(message)"
                      >
                        {{ copiedDialogueMessageId === message.id ? copy.copied : copy.copyMessage }}
                      </button>
                      <button
                        v-if="message.role === 'assistant' && message.streamStatus !== 'connected' && message.streamStatus !== 'receiving'"
                        type="button"
                        :disabled="loading"
                        @click="regenerateDialogue(message)"
                      >
                        {{ message.streamStatus === "failed" ? copy.retry : copy.regenerate }}
                      </button>
                    </div>
                  </div>
                </article>
              </template>
            </div>

            <div class="dialogue-composer" :class="{ active: dialogueInput.trim(), streaming: loading }">
              <textarea
                ref="dialogueInputEl"
                v-model="dialogueInput"
                rows="1"
                :disabled="loading"
                :placeholder="copy.chatPlaceholder"
                @input="resizeDialogueInput"
                @keydown.enter.exact.prevent="submit"
              />
              <button
                v-if="loading"
                type="button"
                class="dialogue-send-button stop"
                :aria-label="copy.stop"
                :title="copy.stop"
                @click="stopDialogue"
              >
                <span aria-hidden="true">■</span>
              </button>
              <button
                v-else
                type="submit"
                class="dialogue-send-button"
                :disabled="dialogueSubmitDisabled()"
                :aria-label="copy.send"
                :title="copy.send"
              >
                <span aria-hidden="true">↑</span>
              </button>
            </div>
            <p v-if="errorMessage" class="error-box" role="alert">{{ errorMessage }}</p>
          </section>
        </form>

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
                <template v-if="!isYunwuVideoChannel || isYunwuUnifiedVideoChannel || isVeoOpenAIFormatChannel || isYunwuViduChannel">
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
                <template v-if="(!isYunwuVideoChannel && !isDimleapHappyhorseChannel) || isVeoOpenAIFormatChannel || isYunwuViduChannel || (isGrokOpenAIFormatChannel && isGrokMultiReferenceMode)">
                  <label v-for="index in videoImageLimit" :key="`video-file-${index}`">
                    <span>{{ videoFrameLabel(index - 1) }} · {{ copy.upload }}</span>
                    <input type="file" accept="image/*" @change="handleVideoFile(index - 1, $event)" />
                  </label>
                </template>
                <template v-if="(!isYunwuVideoChannel || isYunwuUnifiedVideoChannel || isVeoOpenAIFormatChannel || isYunwuViduChannel) && historyImageOptions.length">
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
                <small>{{ isZhipuCogVideoChannel ? copy.zhipuReferenceHint : isDimleapHappyhorseChannel ? copy.dimleapHappyhorseReferenceHint : isVeoOpenAIFormatChannel ? copy.veoOpenAIReferenceHint : isVeoUnifiedFormatChannel ? copy.veoUnifiedReferenceHint : isGrokUnifiedFormatChannel ? copy.grokUnifiedReferenceHint : isYunwuVideoChannel ? (isGrokSingleReferenceMode ? copy.grokSingleReferenceHint : copy.grokMultiReferenceHint) : copy.videoImageHint }}</small>
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
            <div v-if="isYunwuVideoChannel || isBltVideoChannel || isZhipuCogVideoChannel || isLingyaSoraChannel || isDimleapHappyhorseChannel" class="video-grok-grid">
              <label v-if="!isDimleapHappyhorseChannel || isDimleapHappyhorseR2vModel">
                <span>{{ isZhipuCogVideoChannel ? copy.size : isLingyaSoraChannel ? copy.grokAspectRatio : copy.grokAspectRatio }}</span>
                <select v-if="isZhipuCogVideoChannel" v-model="zhipuVideoSize">
                  <option v-for="item in zhipuVideoSizeOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
                <select v-else v-model="grokAspectRatio">
                  <option v-for="item in isBltVideoChannel || isLingyaSoraChannel ? bltVideoAspectRatioOptions : isVeoUnifiedFormatChannel ? veoUnifiedAspectRatioOptions : isGrokUnifiedFormatChannel ? grokUnifiedAspectRatioOptions : grokAspectRatioOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label v-if="isGrokOpenAIFormatChannel || isVeoOpenAIFormatChannel || isLingyaSoraChannel || isDimleapHappyhorseChannel">
                <span>{{ copy.grokDuration }}</span>
                <select v-model.number="grokDuration">
                  <option v-for="item in isDimleapHappyhorseChannel ? dimleapHappyhorseDurationOptions : isLingyaSoraChannel ? [10, 15] : grokDurationOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label v-if="isGrokUnifiedFormatChannel || isLingyaSoraChannel || isDimleapHappyhorseChannel">
                <span>{{ copy.grokResolution }}</span>
                <select v-model="grokResolution">
                  <option v-for="item in isDimleapHappyhorseChannel ? dimleapHappyhorseResolutionOptions : isLingyaSoraChannel ? lingyaSoraSizeOptions : grokUnifiedSizeOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label v-if="isDimleapHappyhorseChannel">
                <span>{{ copy.dimleapHappyhorseWatermark }}</span>
                <select v-model="dimleapHappyhorseWatermark">
                  <option :value="false">false</option>
                  <option :value="true">true</option>
                </select>
              </label>
              <label v-if="isDimleapHappyhorseChannel">
                <span>{{ copy.dimleapHappyhorseSeedEnabled }}</span>
                <select v-model="dimleapHappyhorseSeedEnabled">
                  <option :value="false">false</option>
                  <option :value="true">true</option>
                </select>
              </label>
              <label v-if="isDimleapHappyhorseChannel && dimleapHappyhorseSeedEnabled">
                <span>{{ copy.dimleapHappyhorseSeed }}</span>
                <input v-model.number="dimleapHappyhorseSeed" type="number" min="0" step="1" />
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
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.grokDuration }}</span>
                <select v-model.number="yunwuViduDuration">
                  <option v-for="item in currentYunwuViduDurationOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.grokResolution }}</span>
                <select v-model="yunwuViduResolution">
                  <option v-for="item in yunwuViduResolutionOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.yunwuViduMovement }}</span>
                <select v-model="yunwuViduMovementAmplitude">
                  <option v-for="item in yunwuViduMovementAmplitudeOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.yunwuViduSeed }}</span>
                <input v-model.number="yunwuViduSeed" type="number" min="0" step="1" />
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.yunwuViduAudio }}</span>
                <select v-model="yunwuViduAudio">
                  <option :value="false">false</option>
                  <option :value="true">true</option>
                </select>
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.yunwuViduAudioType }}</span>
                <select v-model="yunwuViduAudioType">
                  <option v-for="item in yunwuViduAudioTypeOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.yunwuViduVoiceId }}</span>
                <input v-model="yunwuViduVoiceId" type="text" placeholder="optional" />
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.yunwuViduIsRec }}</span>
                <select v-model="yunwuViduIsRec">
                  <option :value="false">false</option>
                  <option :value="true">true</option>
                </select>
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.yunwuViduBgm }}</span>
                <select v-model="yunwuViduBgm">
                  <option :value="false">false</option>
                  <option :value="true">true</option>
                </select>
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.yunwuViduOffPeak }}</span>
                <select v-model="yunwuViduOffPeak">
                  <option :value="false">false</option>
                  <option :value="true">true</option>
                </select>
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.yunwuViduWatermark }}</span>
                <select v-model="yunwuViduWatermark">
                  <option :value="false">false</option>
                  <option :value="true">true</option>
                </select>
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.yunwuViduWatermarkPosition }}</span>
                <select v-model.number="yunwuViduWatermarkPosition">
                  <option v-for="item in yunwuViduWatermarkPositionOptions" :key="item" :value="item">
                    {{ item }}
                  </option>
                </select>
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.yunwuViduWatermarkUrl }}</span>
                <input v-model="yunwuViduWatermarkUrl" type="url" placeholder="https://..." />
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.yunwuViduMetaData }}</span>
                <input v-model="yunwuViduMetaData" type="text" placeholder='{"Label":"..."}' />
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.yunwuViduPayload }}</span>
                <input v-model="yunwuViduPayload" type="text" placeholder="optional" />
              </label>
              <label v-if="isYunwuViduChannel">
                <span>{{ copy.callbackUrl }}</span>
                <input v-model="yunwuViduCallbackUrl" type="url" placeholder="https://..." />
              </label>
              <small>{{ isZhipuCogVideoChannel ? copy.zhipuParamHint : isYunwuViduChannel ? copy.yunwuViduParamHint : isDimleapHappyhorseChannel ? copy.dimleapHappyhorseParamHint : isLingyaSoraChannel ? copy.lingyaSoraParamHint : isBltVideoChannel ? copy.bltVideoParamHint : isVeoOpenAIFormatChannel ? copy.veoOpenAIReferenceHint : isVeoUnifiedFormatChannel ? copy.veoUnifiedReferenceHint : isGrokUnifiedFormatChannel ? copy.grokUnifiedReferenceHint : isGrokSingleReferenceMode ? copy.grokSingleReferenceHint : copy.grokMultiReferenceHint }}</small>
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

        <aside v-if="!isCustomImageEntry && !isDialogueMode" class="preview-panel">
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
              <a v-for="url in previewUrls" :key="url" :href="displayImageUrl(url)" target="_blank" rel="noreferrer">
                <img :src="displayImageUrl(url)" alt="Generated image" />
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
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
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
.chat-page.dialogue-mode {
  overflow: hidden;
  background: #ffffff;
}
:global(.custom-chat-dialogue-mode .chat-resource-enhancer) {
  display: none;
}
:global(body.custom-chat-dialogue-mode) {
  margin: 0;
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
.chat-shell.dialogue-shell-layout {
  width: min(860px, calc(100% - 640px));
}
.chat-shell.dialogue-shell-layout {
  display: grid;
  grid-template-columns: 288px minmax(0, 1fr);
  width: 100%;
  min-height: 100dvh;
  margin: 0;
  padding: 0;
}
.chat-shell.dialogue-shell-layout.dialogue-sidebar-collapsed {
  grid-template-columns: 0 minmax(0, 1fr);
}
.chat-shell.dialogue-shell-layout .page-lang-switch {
  top: 14px;
  right: 18px;
  z-index: 38;
  width: 108px;
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
.chat-shell.dialogue-shell-layout .top-panel {
  position: sticky;
  top: 0;
  left: auto;
  width: 288px;
  height: 100dvh;
  max-height: none;
  gap: 14px;
  overflow: auto;
  border-width: 0 1px 0 0;
  border-color: rgba(15, 23, 42, 0.08);
  border-radius: 0;
  background: #f7f7f8;
  box-shadow: none;
  padding: 14px;
  backdrop-filter: none;
}
.chat-shell.dialogue-shell-layout.dialogue-sidebar-collapsed .top-panel {
  width: 0;
  min-width: 0;
  overflow: visible;
  border-right: 0;
  padding: 0;
}
.chat-shell.dialogue-shell-layout.dialogue-sidebar-collapsed .top-panel > *:not(.chat-header) {
  display: none;
}
.chat-shell.dialogue-shell-layout .chat-header {
  padding: 4px 4px 0;
}
.chat-shell.dialogue-shell-layout.dialogue-sidebar-collapsed .chat-header {
  position: fixed;
  top: 14px;
  left: 14px;
  z-index: 39;
  padding: 0;
}
.chat-shell.dialogue-shell-layout.dialogue-sidebar-collapsed .chat-brand {
  display: none;
}
.chat-shell.dialogue-shell-layout .chat-header h1 {
  font-size: 17px;
  letter-spacing: 0;
}
.dialogue-sidebar-toggle {
  display: inline-grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 10px;
  background: #ffffff;
  color: #18181b;
  padding: 0;
  font-size: 22px;
  line-height: 1;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
.dialogue-sidebar-toggle:hover {
  background: #f4f4f5;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
.chat-shell.dialogue-shell-layout .media-tabs {
  border-color: rgba(15, 23, 42, 0.08);
  background: #ececf1;
  padding: 3px;
}
.chat-shell.dialogue-shell-layout .media-tabs button {
  min-height: 34px;
  color: #52525b;
  padding: 7px 10px;
  font-size: 13px;
}
.chat-shell.dialogue-shell-layout .media-tabs button.active {
  background: #ffffff;
  color: #111827;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
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
.dialogue-tabs {
  grid-template-columns: 1fr;
}
.chat-shell.dialogue-shell-layout .dialogue-tabs {
  gap: 6px;
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
.chat-shell.dialogue-shell-layout .mode-tabs button {
  min-height: 54px;
  border-color: transparent;
  border-radius: 10px;
  background: transparent;
  color: #52525b;
  padding: 10px;
}
.chat-shell.dialogue-shell-layout .mode-tabs button strong {
  color: #18181b;
  font-size: 14px;
}
.chat-shell.dialogue-shell-layout .mode-tabs button span {
  color: #71717a;
  font-size: 11px;
}
.chat-shell.dialogue-shell-layout .mode-tabs button:hover {
  background: #ececf1;
}
.chat-shell.dialogue-shell-layout .mode-tabs button.active {
  border-color: rgba(15, 23, 42, 0.08);
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
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
.chat-grid.dialogue-layout {
  grid-template-columns: minmax(0, 1fr);
}
.chat-shell.dialogue-shell-layout .chat-grid,
.chat-shell.dialogue-shell-layout .chat-grid.dialogue-layout {
  position: relative;
  z-index: 1;
  display: block;
  min-height: 100dvh;
  grid-column: 2;
  isolation: isolate;
  background: #ffffff;
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
.chat-shell.dialogue-shell-layout .history-drawer-toggle {
  left: 14px;
  bottom: 14px;
  z-index: 36;
  width: 260px;
  min-height: 40px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 10px;
  background: #ffffff;
  color: #18181b;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
.chat-shell.dialogue-shell-layout .history-drawer-toggle strong {
  background: #f4f4f5;
  color: #52525b;
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
.preview-panel,
.dialogue-panel {
  display: grid;
  gap: 10px;
}
.dialogue-panel {
  min-height: calc(100dvh - 64px);
}
.chat-shell.dialogue-shell-layout .dialogue-panel {
  min-height: 100dvh;
}
.dialogue-shell {
  display: grid;
  grid-template-rows: auto minmax(360px, 1fr) auto auto;
  min-height: calc(100dvh - 70px);
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 22px 70px rgba(15, 23, 42, 0.08);
}
.chat-shell.dialogue-shell-layout .dialogue-shell {
  height: 100dvh;
  min-height: 100dvh;
  grid-template-rows: auto minmax(0, 1fr) 0 auto;
  border: 0;
  border-radius: 0;
  background: #ffffff;
  box-shadow: none;
}
.dialogue-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  padding: 14px 18px;
}
.chat-shell.dialogue-shell-layout .dialogue-toolbar {
  min-height: 64px;
  border-bottom-color: rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.94);
  padding: 12px 132px 12px 24px;
}
.dialogue-toolbar > div:first-child {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.dialogue-toolbar strong {
  color: #0f172a;
  font-size: 15px;
}
.chat-shell.dialogue-shell-layout .dialogue-toolbar strong {
  font-size: 16px;
}
.dialogue-toolbar span {
  overflow: hidden;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-shell.dialogue-shell-layout .dialogue-toolbar span {
  max-width: 520px;
  color: #71717a;
  font-weight: 600;
}
.dialogue-config {
  display: grid;
  grid-template-columns: minmax(130px, 150px) minmax(210px, 1fr) minmax(160px, 220px) auto;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
  width: min(760px, 100%);
}
.chat-shell.dialogue-shell-layout .dialogue-config {
  grid-template-columns: minmax(128px, 154px) minmax(220px, 1fr) minmax(180px, 260px) auto;
  width: min(820px, 100%);
}
.dialogue-config select,
.dialogue-config input {
  min-height: 38px;
  border-radius: 10px;
  padding: 7px 10px;
  font-size: 12px;
}
.dialogue-config button {
  min-width: 72px;
  white-space: nowrap;
}
.chat-shell.dialogue-shell-layout .dialogue-config select,
.chat-shell.dialogue-shell-layout .dialogue-config input {
  min-height: 38px;
  border-radius: 8px;
  background: #ffffff;
}
.chat-shell.dialogue-shell-layout .dialogue-config button {
  min-height: 38px;
  border-radius: 8px;
  background: #f4f4f5;
  color: #18181b;
}
.dialogue-messages {
  display: grid;
  align-content: start;
  gap: 18px;
  overflow: auto;
  padding: 28px min(8vw, 88px);
  scrollbar-color: rgba(15, 23, 42, 0.28) transparent;
  scrollbar-width: thin;
}
.dialogue-messages::-webkit-scrollbar,
.dialogue-reasoning-body::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.dialogue-messages::-webkit-scrollbar-track,
.dialogue-reasoning-body::-webkit-scrollbar-track {
  background: transparent;
}
.dialogue-messages::-webkit-scrollbar-thumb,
.dialogue-reasoning-body::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.28);
  background-clip: content-box;
}
.dialogue-messages::-webkit-scrollbar-thumb:hover,
.dialogue-reasoning-body::-webkit-scrollbar-thumb:hover {
  background: rgba(15, 23, 42, 0.42);
  background-clip: content-box;
}
.chat-shell.dialogue-shell-layout .dialogue-messages {
  gap: 22px;
  min-height: 0;
  overscroll-behavior: contain;
  background: #ffffff;
  padding: 34px max(24px, calc((100% - 820px) / 2)) 126px;
}
.dialogue-empty {
  display: grid;
  min-height: 320px;
  place-items: center;
  color: #0f172a;
  font-size: clamp(22px, 4vw, 32px);
  font-weight: 800;
  text-align: center;
}
.chat-shell.dialogue-shell-layout .dialogue-empty {
  min-height: calc(100dvh - 260px);
  color: #18181b;
  font-size: 30px;
  font-weight: 750;
}
.dialogue-message {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 14px;
  width: min(760px, 100%);
}
.chat-shell.dialogue-shell-layout .dialogue-message {
  width: min(820px, 100%);
}
.dialogue-message.user {
  justify-self: end;
  grid-template-columns: minmax(0, 1fr) 34px;
}
.dialogue-message.user .dialogue-avatar {
  grid-column: 2;
  grid-row: 1;
}
.dialogue-message.user .dialogue-bubble {
  grid-column: 1;
  grid-row: 1;
  justify-self: end;
  border-color: rgba(15, 23, 42, 0.08);
  background: #f4f4f4;
}
.chat-shell.dialogue-shell-layout .dialogue-message.user .dialogue-bubble {
  max-width: min(620px, 100%);
  border-color: transparent;
  border-radius: 18px;
  background: #f4f4f4;
}
.dialogue-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 999px;
  background: #111827;
  color: #fff;
  font-size: 11px;
  font-weight: 900;
}
.chat-shell.dialogue-shell-layout .dialogue-avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: #111827;
  font-size: 10px;
}
.dialogue-message.user .dialogue-avatar {
  background: #10a37f;
}
.chat-shell.dialogue-shell-layout .dialogue-message.user .dialogue-avatar {
  border-radius: 999px;
  background: #ececf1;
  color: #18181b;
}
.dialogue-bubble {
  max-width: 100%;
  border: 1px solid transparent;
  border-radius: 18px;
  background: transparent;
  color: #0f172a;
  padding: 9px 12px;
}
.chat-shell.dialogue-shell-layout .dialogue-bubble {
  padding: 3px 0 0;
}
.chat-shell.dialogue-shell-layout .dialogue-message.user .dialogue-bubble {
  padding: 10px 14px;
}
.dialogue-bubble p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.chat-shell.dialogue-shell-layout .dialogue-bubble p {
  color: #18181b;
  font-size: 15px;
  line-height: 1.75;
}
.dialogue-bubble .stream-placeholder {
  color: #64748b;
}
.dialogue-reasoning {
  display: grid;
  gap: 6px;
  margin: 0 0 10px;
}
.dialogue-reasoning-toggle {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 7px;
  min-height: 30px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 10px;
  background: #f8fafc;
  color: #64748b;
  padding: 5px 9px;
  font-size: 12px;
  font-weight: 800;
}
.dialogue-reasoning-toggle strong {
  color: #475569;
  font-size: 12px;
}
.dialogue-reasoning-toggle span:last-child {
  color: #64748b;
  font-weight: 800;
}
.reasoning-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #94a3b8;
}
.dialogue-reasoning.active .reasoning-status-dot {
  background: #10a37f;
  box-shadow: 0 0 0 0 rgba(16, 163, 127, 0.42);
  animation: reasoning-pulse 1.25s ease-out infinite;
}
@keyframes reasoning-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(16, 163, 127, 0.38);
  }
  70% {
    box-shadow: 0 0 0 7px rgba(16, 163, 127, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(16, 163, 127, 0);
  }
}
.dialogue-reasoning-body {
  max-height: 260px;
  overflow: auto;
  scrollbar-color: rgba(15, 23, 42, 0.28) transparent;
  scrollbar-width: thin;
  border-left: 3px solid rgba(16, 163, 127, 0.42);
  border-radius: 0 12px 12px 0;
  background: #f8fafc;
  padding: 10px 12px;
}
.dialogue-reasoning pre {
  margin: 0;
  color: #475569;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.chat-shell.dialogue-shell-layout .dialogue-reasoning-toggle {
  border-color: rgba(15, 23, 42, 0.08);
  border-radius: 9px;
  background: #f4f4f5;
}
.chat-shell.dialogue-shell-layout .dialogue-reasoning.expanded .dialogue-reasoning-toggle {
  background: #f7f7f8;
}
.chat-shell.dialogue-shell-layout .dialogue-reasoning-body {
  max-height: 300px;
  background: #f7f7f8;
}
.dialogue-bubble small {
  display: block;
  margin-top: 8px;
  color: #94a3b8;
  font-size: 11px;
}
.dialogue-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  opacity: 0;
  transition: opacity 0.16s ease;
}
.dialogue-message:focus-within .dialogue-actions,
.dialogue-message:hover .dialogue-actions {
  opacity: 1;
}
.dialogue-actions button {
  min-height: 26px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 8px;
  background: #fff;
  color: #475569;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 800;
}
.dialogue-actions button:hover:not(:disabled) {
  border-color: rgba(16, 163, 127, 0.32);
  background: rgba(16, 163, 127, 0.08);
  color: #0f766e;
}
.chat-shell.dialogue-shell-layout .dialogue-actions button {
  border-color: transparent;
  background: transparent;
  color: #71717a;
  padding: 4px 6px;
}
.chat-shell.dialogue-shell-layout .dialogue-actions button:hover:not(:disabled) {
  background: #f4f4f5;
  color: #18181b;
}
.dialogue-composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
  width: min(820px, calc(100% - 32px));
  margin: 0 auto 16px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 22px;
  background: #ffffff;
  padding: 9px;
  box-shadow: 0 16px 46px rgba(15, 23, 42, 0.08);
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}
.dialogue-composer:focus-within {
  border-color: rgba(15, 23, 42, 0.22);
  box-shadow: 0 18px 54px rgba(15, 23, 42, 0.12);
}
.dialogue-composer.active {
  border-color: rgba(16, 163, 127, 0.28);
}
.chat-shell.dialogue-shell-layout .dialogue-composer {
  position: fixed;
  right: max(24px, calc((100% - 288px - 820px) / 2));
  bottom: 18px;
  z-index: 34;
  width: min(820px, calc(100% - 288px - 48px));
  margin: 0;
  border-color: rgba(15, 23, 42, 0.14);
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.12);
}
.chat-shell.dialogue-shell-layout.dialogue-sidebar-collapsed .dialogue-composer {
  right: max(24px, calc((100% - 820px) / 2));
  width: min(820px, calc(100% - 48px));
}
.dialogue-composer textarea {
  height: 42px;
  min-height: 42px;
  max-height: 180px;
  border: 0;
  border-radius: 18px;
  background: transparent;
  padding: 10px 12px;
  resize: none;
  overflow-y: auto;
  scrollbar-color: rgba(15, 23, 42, 0.28) transparent;
  scrollbar-width: thin;
}
.chat-shell.dialogue-shell-layout .dialogue-composer textarea {
  height: 48px;
  min-height: 48px;
  max-height: 220px;
  border-radius: 14px;
  padding: 13px 12px;
  resize: none;
}
.dialogue-composer textarea::-webkit-scrollbar {
  width: 8px;
}
.dialogue-composer textarea::-webkit-scrollbar-track {
  background: transparent;
}
.dialogue-composer textarea::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.28);
  background-clip: content-box;
}
.dialogue-composer textarea:focus {
  box-shadow: none;
}
.dialogue-send-button {
  display: inline-grid;
  width: 40px;
  min-width: 40px;
  height: 40px;
  min-height: 40px;
  place-items: center;
  border-radius: 999px;
  background: #111827;
  color: #ffffff;
  padding: 0;
  font-size: 20px;
  line-height: 1;
}
.dialogue-send-button span {
  transform: translateY(-1px);
}
.dialogue-send-button.stop {
  background: #ef4444;
  font-size: 12px;
}
.dialogue-send-button:disabled {
  background: #d4d4d8;
  color: #ffffff;
  opacity: 1;
}
.chat-shell.dialogue-shell-layout .dialogue-composer button {
  width: 38px;
  min-width: 38px;
  height: 38px;
  min-height: 38px;
  border-radius: 999px;
  padding: 0;
}
.dialogue-shell > .error-box {
  width: min(820px, calc(100% - 32px));
  margin: 0 auto 16px;
}
.chat-shell.dialogue-shell-layout .dialogue-shell > .error-box {
  position: fixed;
  right: max(24px, calc((100% - 288px - 820px) / 2));
  bottom: 86px;
  z-index: 34;
  width: min(820px, calc(100% - 288px - 48px));
  margin: 0;
  border-radius: 12px;
}
.chat-shell.dialogue-shell-layout.dialogue-sidebar-collapsed .dialogue-shell > .error-box {
  right: max(24px, calc((100% - 820px) / 2));
  width: min(820px, calc(100% - 48px));
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
  .chat-shell.dialogue-shell-layout {
    display: grid;
    grid-template-columns: 288px minmax(0, 1fr);
    width: 100%;
    min-height: 100dvh;
    margin: 0;
    padding: 0;
  }
  .chat-shell.dialogue-shell-layout.dialogue-sidebar-collapsed {
    grid-template-columns: 0 minmax(0, 1fr);
  }
  .top-panel {
    position: static;
    width: auto;
    max-height: none;
    overflow: visible;
    margin-bottom: 14px;
  }
  .chat-shell.dialogue-shell-layout .top-panel {
    position: sticky;
    top: 0;
    left: auto;
    width: 288px;
    height: 100dvh;
    max-height: none;
    margin-bottom: 0;
  }
  .chat-shell.dialogue-shell-layout.dialogue-sidebar-collapsed .top-panel {
    width: 0;
    padding: 0;
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
  .video-tabs,
  .dialogue-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .media-tabs {
    grid-template-columns: repeat(3, minmax(82px, 1fr));
  }
  .history-drawer-toggle {
    width: auto;
  }
  .chat-shell.dialogue-shell-layout .history-drawer-toggle {
    width: 260px;
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
  .video-tabs,
  .dialogue-tabs {
    width: 100%;
    grid-template-columns: 1fr;
  }
  .dialogue-panel,
  .dialogue-shell {
    min-height: calc(100dvh - 24px);
  }
  .dialogue-toolbar,
  .dialogue-config {
    grid-template-columns: 1fr;
  }
  .dialogue-toolbar {
    display: grid;
  }
  .dialogue-messages {
    padding: 20px 12px;
  }
  .dialogue-message,
  .dialogue-message.user {
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 10px;
    justify-self: stretch;
  }
  .dialogue-message.user .dialogue-avatar {
    grid-column: 1;
  }
  .dialogue-message.user .dialogue-bubble {
    grid-column: 2;
    justify-self: stretch;
  }
  .dialogue-avatar {
    width: 30px;
    height: 30px;
  }
  .dialogue-actions {
    opacity: 1;
  }
  .dialogue-composer {
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

@media (max-width: 760px) {
  .chat-page.dialogue-mode {
    overflow-y: auto;
  }
  .chat-shell.dialogue-shell-layout {
    width: 100%;
    min-height: 100dvh;
    margin: 0;
    padding: 0;
  }
  .chat-shell.dialogue-shell-layout,
  .chat-shell.dialogue-shell-layout.dialogue-sidebar-collapsed {
    display: block;
  }
  .chat-shell.dialogue-shell-layout .page-lang-switch {
    position: absolute;
    top: 10px;
    right: 10px;
  }
  .chat-shell.dialogue-shell-layout .top-panel {
    position: static;
    width: 100%;
    max-height: none;
    border-width: 0 0 1px;
    padding: 10px;
  }
  .chat-shell.dialogue-shell-layout.dialogue-sidebar-collapsed .top-panel {
    width: 100%;
    height: auto;
    overflow: visible;
    border-width: 0 0 1px;
    padding: 10px;
  }
  .chat-shell.dialogue-shell-layout.dialogue-sidebar-collapsed .top-panel > *:not(.chat-header) {
    display: none;
  }
  .chat-shell.dialogue-shell-layout .chat-header {
    padding-right: 118px;
  }
  .chat-shell.dialogue-shell-layout.dialogue-sidebar-collapsed .chat-header {
    position: static;
    padding: 0 118px 0 0;
  }
  .chat-shell.dialogue-shell-layout .dialogue-toolbar {
    display: grid;
    min-height: 0;
    padding: 12px;
  }
  .chat-shell.dialogue-shell-layout .dialogue-config {
    grid-template-columns: 1fr;
  }
  .chat-shell.dialogue-shell-layout .dialogue-messages {
    padding: 24px 14px 132px;
  }
  .chat-shell.dialogue-shell-layout .dialogue-empty {
    min-height: 260px;
    font-size: 26px;
  }
  .chat-shell.dialogue-shell-layout .dialogue-composer,
  .chat-shell.dialogue-shell-layout .dialogue-shell > .error-box {
    right: 10px;
    width: calc(100% - 20px);
  }
  .chat-shell.dialogue-shell-layout .history-drawer-toggle {
    display: none;
  }
}
</style>
