<script setup lang="ts">
type Locale = "zh" | "en";
type HidreamTaskStatus = "running" | "completed" | "failed" | "cancelled";

type HidreamTaskParams = {
  prompt: string;
  negativePrompt: string;
  aspectRatio: (typeof aspectRatioOptions)[number];
  promptRefine: boolean;
  seed: number;
  guidanceScale: number;
};

type HidreamTask = {
  id: string;
  eventId: string;
  status: HidreamTaskStatus;
  statuses: string[];
  imageUrl: string | null;
  displayUrl: string | null;
  error: string | null;
  startedAt: number;
  params: HidreamTaskParams;
};

type HidreamHistoryRecord = {
  id: string;
  createdAt: string;
  eventId: string;
  imageUrl: string;
  localImageUrl?: string | null;
  thumbnailUrl?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageBytes?: number | null;
  statuses: string[];
  params: HidreamTaskParams;
};

type HidreamInterruptedSnapshot = {
  params: HidreamTaskParams;
  statuses: string[];
  savedAt: number;
};

type HidreamImage = {
  url?: string | null;
};

const HIDREAM_GENERATE_ENDPOINT =
  "https://hidream-ai-hidream-o1-image.hf.space/gradio_api/call/_generate_wrapped";
const HIDREAM_HISTORY_KEY = "hidream:history:v1";
const HIDREAM_INTERRUPTED_KEY = "hidream:interrupted:v1";
const HIDREAM_HISTORY_DB_NAME = "hidream-history-db";
const HIDREAM_HISTORY_DB_VERSION = 1;
const HIDREAM_HISTORY_STORE = "records";
const HIDREAM_HISTORY_LIMIT = 80;
const HISTORY_LAZY_INITIAL = 12;
const HISTORY_LAZY_BATCH = 12;
const HISTORY_THUMBNAIL_MAX_SIZE = 192;
const HISTORY_THUMBNAIL_QUALITY = 0.72;
const HIDREAM_MAX_CONCURRENT = 4;
const aspectRatioOptions = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "9:21", "9:7", "7:9"] as const;

const messages = {
  zh: {
    title: "HiDream",
    subtitle: "文生图",
    prompt: "提示词",
    promptPlaceholder: "描述你想生成的画面…",
    negativePrompt: "反向提示词",
    negativePlaceholder: "不希望出现的内容（可选）",
    advancedSettings: "高级设置",
    aspectRatio: "画幅比例",
    seed: "随机种子",
    seedHint: "-1 表示随机",
    guidance: "引导强度",
    promptRefine: "提示词优化",
    promptRefineHint: "由模型自动扩写提示词",
    generate: "开始生成",
    generating: "生成中…",
    ready: "就绪",
    done: "生成完成",
    waiting: "等待生成",
    emptyHint: "输入提示词后点击开始生成",
    viewLogs: "任务日志",
    tasks: "任务",
    history: "生成记录",
    historyEmpty: "暂无记录",
    historyLoadingMore: "加载更多…",
    deleteHistory: "删除",
    restoreHistory: "回填参数",
    downloadImage: "下载",
    closePreview: "关闭",
    cancelTask: "取消",
    removeTask: "移除",
    promptRequired: "请输入提示词。",
    submitFailed: "提交 HiDream 任务失败。",
    readFailed: "读取 HiDream 任务结果失败。",
    noImage: "HiDream 未返回图片结果。",
    requestFailed: "HiDream 生成请求失败。",
    concurrencyLimit: "最多同时进行 4 个任务",
    interruptedTitle: "上次生成因刷新已中断",
    interruptedHint: "无法续接原任务，可用相同参数重新生成",
    retryInterrupted: "重新生成",
    dismissInterrupted: "忽略",
    langZh: "中文",
    langEn: "EN",
    imageAlt: "HiDream 生成结果",
    statusRunning: "进行中",
    statusDone: "完成",
    statusFailed: "失败",
    statusCancelled: "已取消",
  },
  en: {
    title: "HiDream",
    subtitle: "Text to Image",
    prompt: "Prompt",
    promptPlaceholder: "Describe the image you want to create…",
    negativePrompt: "Negative Prompt",
    negativePlaceholder: "Things to avoid (optional)",
    advancedSettings: "Advanced",
    aspectRatio: "Aspect Ratio",
    seed: "Seed",
    seedHint: "-1 for random",
    guidance: "Guidance Scale",
    promptRefine: "Prompt Refine",
    promptRefineHint: "Let the model enrich your prompt",
    generate: "Generate",
    generating: "Generating…",
    ready: "Ready",
    done: "Complete",
    waiting: "Waiting",
    emptyHint: "Enter a prompt and click Generate",
    viewLogs: "Task Log",
    tasks: "Tasks",
    history: "History",
    historyEmpty: "No records yet",
    historyLoadingMore: "Load more…",
    deleteHistory: "Delete",
    restoreHistory: "Restore params",
    downloadImage: "Download",
    closePreview: "Close",
    cancelTask: "Cancel",
    removeTask: "Remove",
    promptRequired: "Prompt is required.",
    submitFailed: "Failed to submit HiDream task.",
    readFailed: "Failed to read HiDream task result.",
    noImage: "HiDream returned no image.",
    requestFailed: "HiDream generation failed.",
    concurrencyLimit: "Up to 4 concurrent tasks",
    interruptedTitle: "Last run was interrupted by refresh",
    interruptedHint: "Cannot resume the same job; regenerate with the same params",
    retryInterrupted: "Regenerate",
    dismissInterrupted: "Dismiss",
    langZh: "中文",
    langEn: "EN",
    imageAlt: "HiDream generated image",
    statusRunning: "Running",
    statusDone: "Done",
    statusFailed: "Failed",
    statusCancelled: "Cancelled",
  },
} as const;

const locale = ref<Locale>("zh");
const prompt = ref("");
const negativePrompt = ref("");
const aspectRatio = ref<(typeof aspectRatioOptions)[number]>("1:1");
const promptRefine = ref(false);
const seed = ref(-1);
const guidanceScale = ref(5);
const tasks = ref<HidreamTask[]>([]);
const activeTaskId = ref<string | null>(null);
const historyRecords = ref<HidreamHistoryRecord[]>([]);
const historyVisibleCount = ref(HISTORY_LAZY_INITIAL);
const historyListRef = ref<HTMLElement | null>(null);
const historyLoadMoreRef = ref<HTMLElement | null>(null);
let historyLazyObserver: IntersectionObserver | null = null;

const visibleHistoryRecords = computed(() =>
  historyRecords.value.slice(0, historyVisibleCount.value),
);

const historyHasMore = computed(
  () => historyVisibleCount.value < historyRecords.value.length,
);
const interruptedTask = ref<HidreamInterruptedSnapshot | null>(null);
const settingsOpen = ref(false);
const historyPreview = ref<HidreamHistoryRecord | null>(null);
const formError = ref("");

const taskStreams = new Map<string, AbortController>();
const previewImageLoadStarts = new Map<string, number>();
const previewObjectUrls = new Set<string>();
let historyDbPromise: Promise<IDBDatabase | null> | null = null;

const t = computed(() => messages[locale.value as Locale]);

const activeTask = computed(() => tasks.value.find((task) => task.id === activeTaskId.value) || null);

const runningCount = computed(() => tasks.value.filter((task) => task.status === "running").length);

const canGenerate = computed(
  () => Boolean(prompt.value.trim()) && runningCount.value < HIDREAM_MAX_CONCURRENT,
);

const displayedStatuses = computed(() =>
  (activeTask.value?.statuses || []).map((item) => localizeStatus(item)),
);

const statusText = computed(() => {
  const task = activeTask.value;
  if (!task) return interruptedTask.value ? t.value.interruptedTitle : t.value.ready;
  if (task.status === "failed") return task.error || t.value.requestFailed;
  if (task.status === "completed" && task.imageUrl) return t.value.done;
  if (task.status === "running") {
    const latest = task.statuses.at(-1);
    return latest ? localizeStatus(latest) : t.value.generating;
  }
  if (task.status === "cancelled") return t.value.statusCancelled;
  return t.value.ready;
});

const previewState = computed(() => {
  const task = activeTask.value;
  if (!task) return "empty" as const;
  if (task.status === "completed" && task.imageUrl) return "image" as const;
  if (task.status === "running") return "loading" as const;
  if (task.status === "failed") return "error" as const;
  return "empty" as const;
});

useHead({
  title: "HiDream",
  htmlAttrs: { class: "hidream-html" },
  bodyAttrs: { class: "hidream-body" },
  link: [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
    },
  ],
});

function setLocale(next: Locale) {
  locale.value = next;
}

function createLocalId() {
  return `hd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildTaskParams(): HidreamTaskParams {
  return {
    prompt: prompt.value.trim(),
    aspectRatio: aspectRatio.value,
    negativePrompt: negativePrompt.value.trim(),
    promptRefine: Boolean(promptRefine.value),
    seed: normalizeSeed(seed.value),
    guidanceScale: normalizeGuidanceScale(guidanceScale.value),
  };
}

function applyTaskParams(params: HidreamTaskParams) {
  prompt.value = params.prompt;
  negativePrompt.value = params.negativePrompt;
  aspectRatio.value = params.aspectRatio;
  promptRefine.value = params.promptRefine;
  seed.value = params.seed;
  guidanceScale.value = params.guidanceScale;
}

function updateTask(taskId: string, patch: Partial<HidreamTask>) {
  const index = tasks.value.findIndex((task) => task.id === taskId);
  if (index < 0) return;
  const next = { ...tasks.value[index], ...patch };
  tasks.value = [...tasks.value.slice(0, index), next, ...tasks.value.slice(index + 1)];
}

function pushTaskStatus(taskId: string, status: string) {
  const task = tasks.value.find((item) => item.id === taskId);
  if (!task || !status || task.statuses.at(-1) === status) return;
  updateTask(taskId, { statuses: [...task.statuses, status] });
}

function selectTask(taskId: string) {
  activeTaskId.value = taskId;
  const task = tasks.value.find((item) => item.id === taskId);
  if (task) applyTaskParams(task.params);
}

function releasePreviewObjectUrl(url?: string | null) {
  if (!url || !previewObjectUrls.has(url)) return;
  URL.revokeObjectURL(url);
  previewObjectUrls.delete(url);
}

function removeTask(taskId: string) {
  cancelTaskStream(taskId);
  const task = tasks.value.find((item) => item.id === taskId);
  releasePreviewObjectUrl(task?.displayUrl);
  tasks.value = tasks.value.filter((task) => task.id !== taskId);
  if (activeTaskId.value === taskId) {
    activeTaskId.value = tasks.value[0]?.id || null;
    if (activeTask.value) applyTaskParams(activeTask.value.params);
  }
}

function cancelTaskStream(taskId: string) {
  taskStreams.get(taskId)?.abort();
  taskStreams.delete(taskId);
}

function cancelTask(taskId: string) {
  cancelTaskStream(taskId);
  const task = tasks.value.find((item) => item.id === taskId);
  releasePreviewObjectUrl(task?.displayUrl);
  updateTask(taskId, { status: "cancelled" });
}

function persistInterruptedSnapshot() {
  if (!import.meta.client) return;
  const running = tasks.value.find((task) => task.id === activeTaskId.value && task.status === "running");
  if (!running) {
    localStorage.removeItem(HIDREAM_INTERRUPTED_KEY);
    return;
  }
  localStorage.setItem(
    HIDREAM_INTERRUPTED_KEY,
    JSON.stringify({
      params: running.params,
      statuses: running.statuses,
      savedAt: Date.now(),
    } satisfies HidreamInterruptedSnapshot),
  );
}

function loadInterruptedSnapshot() {
  if (!import.meta.client) return;
  try {
    const raw = localStorage.getItem(HIDREAM_INTERRUPTED_KEY);
    if (!raw) return;
    const snapshot = parseJson(raw) as HidreamInterruptedSnapshot | null;
    if (!snapshot?.params?.prompt) return;
    interruptedTask.value = snapshot;
  } catch {
    localStorage.removeItem(HIDREAM_INTERRUPTED_KEY);
  }
}

function dismissInterrupted() {
  interruptedTask.value = null;
  localStorage.removeItem(HIDREAM_INTERRUPTED_KEY);
}

function retryInterrupted() {
  if (!interruptedTask.value) return;
  applyTaskParams(interruptedTask.value.params);
  dismissInterrupted();
  void generateImage();
}

function resetHistoryVisibleCount() {
  historyVisibleCount.value = Math.min(HISTORY_LAZY_INITIAL, historyRecords.value.length);
}

function loadMoreHistory() {
  if (!historyHasMore.value) return;
  historyVisibleCount.value = Math.min(
    historyVisibleCount.value + HISTORY_LAZY_BATCH,
    historyRecords.value.length,
  );
}

function disconnectHistoryLazyObserver() {
  historyLazyObserver?.disconnect();
  historyLazyObserver = null;
}

function setupHistoryLazyObserver() {
  disconnectHistoryLazyObserver();
  if (!import.meta.client || !historyHasMore.value) return;

  const root = historyListRef.value;
  const target = historyLoadMoreRef.value;
  if (!root || !target) return;

  historyLazyObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMoreHistory();
    },
    { root, rootMargin: "120px" },
  );
  historyLazyObserver.observe(target);
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openHistoryDb() {
  if (!import.meta.client || !("indexedDB" in window)) return Promise.resolve(null);
  if (historyDbPromise) return historyDbPromise;

  historyDbPromise = new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(HIDREAM_HISTORY_DB_NAME, HIDREAM_HISTORY_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HIDREAM_HISTORY_STORE)) {
        const store = db.createObjectStore(HIDREAM_HISTORY_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return historyDbPromise;
}

function legacyLocalHistory() {
  try {
    const parsed = parseJson(localStorage.getItem(HIDREAM_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, HIDREAM_HISTORY_LIMIT) as HidreamHistoryRecord[] : [];
  } catch {
    return [];
  }
}

async function readIndexedDbHistory(db: IDBDatabase) {
  const transaction = db.transaction(HIDREAM_HISTORY_STORE, "readonly");
  const store = transaction.objectStore(HIDREAM_HISTORY_STORE);
  const records = await requestToPromise<HidreamHistoryRecord[]>(store.getAll());
  return records
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, HIDREAM_HISTORY_LIMIT);
}

async function writeIndexedDbHistory(db: IDBDatabase, records: HidreamHistoryRecord[]) {
  const transaction = db.transaction(HIDREAM_HISTORY_STORE, "readwrite");
  const store = transaction.objectStore(HIDREAM_HISTORY_STORE);
  await requestToPromise(store.clear());
  for (const record of records.slice(0, HIDREAM_HISTORY_LIMIT)) {
    store.put(record);
  }
  await transactionDone(transaction);
}

async function loadHistory() {
  if (!import.meta.client) return;
  const db = await openHistoryDb();

  if (!db) {
    historyRecords.value = legacyLocalHistory();
    resetHistoryVisibleCount();
    return;
  }

  try {
    let records = await readIndexedDbHistory(db);
    const legacyRecords = legacyLocalHistory();

    if (!records.length && legacyRecords.length) {
      await writeIndexedDbHistory(db, legacyRecords);
      records = legacyRecords;
    }

    historyRecords.value = records;
    localStorage.removeItem(HIDREAM_HISTORY_KEY);
  } catch {
    historyRecords.value = legacyLocalHistory();
  }

  resetHistoryVisibleCount();
}

async function persistHistory() {
  if (!import.meta.client) return;
  const records = historyRecords.value.slice(0, HIDREAM_HISTORY_LIMIT);
  const db = await openHistoryDb();

  if (!db) {
    localStorage.setItem(HIDREAM_HISTORY_KEY, JSON.stringify(records));
    return;
  }

  try {
    await writeIndexedDbHistory(db, records);
    localStorage.removeItem(HIDREAM_HISTORY_KEY);
  } catch {
    localStorage.setItem(HIDREAM_HISTORY_KEY, JSON.stringify(records));
  }
}

function updateHistoryRecord(recordId: string, patch: Partial<HidreamHistoryRecord>) {
  const index = historyRecords.value.findIndex((item) => item.id === recordId);
  if (index < 0) return;
  historyRecords.value = [
    ...historyRecords.value.slice(0, index),
    { ...historyRecords.value[index], ...patch },
    ...historyRecords.value.slice(index + 1),
  ];
  void persistHistory();
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatHistoryImageSize(record: HidreamHistoryRecord) {
  const parts: string[] = [];
  if (record.imageWidth && record.imageHeight) {
    parts.push(`${record.imageWidth}×${record.imageHeight}`);
  }
  if (record.imageBytes && record.imageBytes > 0) {
    parts.push(formatBytes(record.imageBytes));
  }
  return parts.join(" · ");
}

function formatHistoryMetaLine(record: HidreamHistoryRecord) {
  const parts: string[] = [record.params.aspectRatio];
  const size = formatHistoryImageSize(record);
  if (size) parts.push(size);
  parts.push(formatTime(record.createdAt));
  return parts.join(" · ");
}

function displayImageUrl(url: string) {
  const value = String(url || "").trim();
  if (!/^https?:\/\//i.test(value)) return value;
  return "/api/chat/image-preview?url=" + encodeURIComponent(value);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image blob."));
    reader.readAsDataURL(blob);
  });
}

function canvasToDataUrl(canvas: HTMLCanvasElement, mimeType = "image/webp", quality = 0.92) {
  const dataUrl = canvas.toDataURL(mimeType, quality);
  return dataUrl.startsWith("data:image/png") && mimeType !== "image/png"
    ? canvas.toDataURL("image/png")
    : dataUrl;
}

function imageElementToThumbnailUrl(img: HTMLImageElement) {
  const sourceWidth = img.naturalWidth;
  const sourceHeight = img.naturalHeight;
  if (!sourceWidth || !sourceHeight) return null;

  const scale = Math.min(1, HISTORY_THUMBNAIL_MAX_SIZE / Math.max(sourceWidth, sourceHeight));
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = Math.max(1, Math.round(sourceWidth * scale));
  thumbCanvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const thumbCtx = thumbCanvas.getContext("2d");
  if (!thumbCtx) return null;
  thumbCtx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);

  return {
    thumbnailUrl: canvasToDataUrl(thumbCanvas, "image/webp", HISTORY_THUMBNAIL_QUALITY),
    width: sourceWidth,
    height: sourceHeight,
  };
}

function reportPreviewImageLoad(task: HidreamTask, event: Event) {
  const startedAt = previewImageLoadStarts.get(task.id);
  const elapsed = startedAt ? Math.round(performance.now() - startedAt) : null;
  const img = event.target as HTMLImageElement;
  let stored: ReturnType<typeof imageElementToThumbnailUrl> = null;
  try {
    stored = imageElementToThumbnailUrl(img);
  } catch (error) {
    console.warn("[HiDream] preview thumbnail could not be created", error);
  }
  const record = historyRecords.value.find((item) => item.eventId === task.eventId);
  if (record && stored) {
    updateHistoryRecord(record.id, {
      thumbnailUrl: stored.thumbnailUrl,
      imageWidth: stored.width,
      imageHeight: stored.height,
    });
  }
  console.info("[HiDream] preview image loaded", {
    elapsedMs: elapsed,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    storedBytes: record?.imageBytes ?? null,
    url: task.imageUrl,
  });
  previewImageLoadStarts.delete(task.id);
}

function reportPreviewImageError(task: HidreamTask) {
  const startedAt = previewImageLoadStarts.get(task.id);
  const elapsed = startedAt ? Math.round(performance.now() - startedAt) : null;
  console.warn("[HiDream] preview image failed", {
    elapsedMs: elapsed,
    url: task.imageUrl,
  });
  previewImageLoadStarts.delete(task.id);
}

async function prepareGeneratedImage(imageUrl: string, signal: AbortSignal) {
  const response = await fetch(displayImageUrl(imageUrl), { signal });
  if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  previewObjectUrls.add(objectUrl);
  const localImageUrl = await blobToDataUrl(blob);
  return {
    displayUrl: objectUrl,
    localImageUrl,
    bytes: blob.size,
    contentType: blob.type || null,
  };
}

async function saveHistoryRecord(task: HidreamTask, localImageUrl?: string | null, imageBytes?: number | null) {
  if (!task.imageUrl) return;
  const record: HidreamHistoryRecord = {
    id: createLocalId(),
    createdAt: new Date().toISOString(),
    eventId: task.eventId,
    imageUrl: task.imageUrl,
    localImageUrl: localImageUrl || null,
    thumbnailUrl: null,
    imageWidth: null,
    imageHeight: null,
    imageBytes: imageBytes ?? null,
    statuses: [...task.statuses],
    params: { ...task.params },
  };
  historyRecords.value = [record, ...historyRecords.value.filter((item) => item.id !== record.id)].slice(
    0,
    HIDREAM_HISTORY_LIMIT,
  );
  historyVisibleCount.value = Math.min(
    Math.max(historyVisibleCount.value, HISTORY_LAZY_INITIAL),
    historyRecords.value.length,
  );
  void persistHistory();
}

function deleteHistoryRecord(recordId: string) {
  historyRecords.value = historyRecords.value.filter((item) => item.id !== recordId);
  if (historyVisibleCount.value > historyRecords.value.length) {
    historyVisibleCount.value = historyRecords.value.length;
  }
  void persistHistory();
}

function openHistoryPreview(record: HidreamHistoryRecord) {
  historyPreview.value = record;
}

function closeHistoryPreview() {
  historyPreview.value = null;
}

function restoreHistoryParams(record: HidreamHistoryRecord) {
  applyTaskParams(record.params);
}

function historyDownloadFilename(record: HidreamHistoryRecord) {
  const source = record.localImageUrl || record.imageUrl;
  const extMatch = source.match(/^data:image\/([^;,]+)/i) || source.match(/\.(png|jpe?g|webp|gif)(\?|$)/i);
  const ext = extMatch ? extMatch[1].toLowerCase().replace("jpeg", "jpg") : "png";
  return `hidream-${record.id}.${ext}`;
}

async function downloadHistoryImage(record: HidreamHistoryRecord) {
  if (!import.meta.client || (!record.localImageUrl && !record.imageUrl)) return;

  const filename = historyDownloadFilename(record);
  if (record.localImageUrl) {
    const anchor = document.createElement("a");
    anchor.href = record.localImageUrl;
    anchor.download = filename;
    anchor.click();
    return;
  }

  try {
    const response = await fetch(displayImageUrl(record.imageUrl));
    if (!response.ok) throw new Error("fetch failed");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    const anchor = document.createElement("a");
    anchor.href = record.imageUrl;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.click();
  }
}

function onPreviewKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") closeHistoryPreview();
}

function taskStatusLabel(task: HidreamTask) {
  if (task.status === "running") return t.value.statusRunning;
  if (task.status === "completed") return t.value.statusDone;
  if (task.status === "failed") return t.value.statusFailed;
  return t.value.statusCancelled;
}

function promptSummary(value: string) {
  const text = value.trim();
  if (text.length <= 42) return text;
  return `${text.slice(0, 42)}…`;
}

function formatTime(isoOrMs: string | number) {
  const date = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
  return date.toLocaleString(locale.value === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function generateImage() {
  formError.value = "";
  if (!prompt.value.trim()) {
    formError.value = t.value.promptRequired;
    return;
  }
  if (runningCount.value >= HIDREAM_MAX_CONCURRENT) return;

  const params = buildTaskParams();
  const taskId = createLocalId();
  const task: HidreamTask = {
    id: taskId,
    eventId: "",
    status: "running",
    statuses: [],
    imageUrl: null,
    displayUrl: null,
    error: null,
    startedAt: Date.now(),
    params,
  };

  tasks.value = [task, ...tasks.value];
  activeTaskId.value = taskId;
  dismissInterrupted();
  void executeTask(taskId);
}

async function executeTask(taskId: string) {
  const task = tasks.value.find((item) => item.id === taskId);
  if (!task || task.status !== "running") return;

  cancelTaskStream(taskId);
  const controller = new AbortController();
  taskStreams.set(taskId, controller);

  try {
    const submitResponse = await fetch(HIDREAM_GENERATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        data: [
          task.params.prompt,
          task.params.aspectRatio,
          task.params.negativePrompt,
          task.params.promptRefine,
          task.params.seed,
          task.params.guidanceScale,
        ],
      }),
    });

    const submitText = await submitResponse.text();
    const submitData = parseJson(submitText) as { event_id?: string } | null;
    if (!submitResponse.ok || !submitData?.event_id) {
      throw new Error(upstreamErrorMessage(submitText, t.value.submitFailed));
    }

    updateTask(taskId, { eventId: submitData.event_id });
    const imageUrl = await readGenerationStream(taskId, submitData.event_id, controller.signal);
    const preparedImage = await prepareGeneratedImage(imageUrl, controller.signal);
    previewImageLoadStarts.set(taskId, performance.now());
    updateTask(taskId, { status: "completed", imageUrl, displayUrl: preparedImage.displayUrl, error: null });
    const completed = tasks.value.find((item) => item.id === taskId);
    if (completed) void saveHistoryRecord(completed, preparedImage.localImageUrl, preparedImage.bytes);
    if (activeTaskId.value === taskId) persistInterruptedSnapshot();
  } catch (error) {
    if (isAbortError(error)) {
      updateTask(taskId, { status: "cancelled" });
      return;
    }
    updateTask(taskId, {
      status: "failed",
      error: error instanceof Error ? error.message : t.value.requestFailed,
    });
  } finally {
    taskStreams.delete(taskId);
    persistInterruptedSnapshot();
  }
}

async function readGenerationStream(taskId: string, eventId: string, signal: AbortSignal) {
  const response = await fetch(`${HIDREAM_GENERATE_ENDPOINT}/${encodeURIComponent(eventId)}`, {
    headers: { Accept: "text/event-stream" },
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(upstreamErrorMessage(errorBody, t.value.readFailed));
  }

  let imageUrl = "";
  const consume = (text: string) => {
    parseSseChunk(taskId, text, (url) => {
      imageUrl = url;
    });
  };

  if (!response.body) {
    consume(await response.text());
    if (imageUrl) return imageUrl;
    throw new Error(t.value.noImage);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\n\n/);
    buffer = parts.pop() || "";
    for (const part of parts) consume(part);
  }

  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer);

  if (!imageUrl) {
    const task = tasks.value.find((item) => item.id === taskId);
    throw new Error(task?.statuses.at(-1) || t.value.noImage);
  }

  return imageUrl;
}

function parseSseChunk(taskId: string, chunk: string, onImage: (url: string) => void) {
  for (const line of chunk.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "null") continue;

    if (payload.startsWith('"') && payload.includes("404")) {
      throw new Error(payload.replace(/^"|"$/g, ""));
    }

    const data = parseJson(payload);
    if (!Array.isArray(data)) continue;

    const image = data[0] as HidreamImage | null;
    const status = typeof data[1] === "string" ? stripHtml(data[1]) : "";
    if (status) pushTaskStatus(taskId, status);
    if (image?.url) onImage(image.url);
  }
}

function localizeStatus(raw: string) {
  if (locale.value === "en") return raw;

  if (/^Sending request to API…?$/.test(raw)) return "正在提交请求…";

  const submitted = raw.match(/^Request submitted · Task ([\da-f]+)…?$/);
  if (submitted) return `任务已提交 · ${submitted[1]}…`;

  const generating = raw.match(/^Generating… (\d+)s$/);
  if (generating) return `生成中… ${generating[1]}s`;

  const waiting = raw.match(/^Waiting… (\d+)s$/);
  if (waiting) return `等待中… ${waiting[1]}s`;

  if (/^Downloading image…?$/.test(raw)) return "正在下载图片…";
  if (raw === "Image generated") return "图片已生成";

  const failed = raw.match(/^Task failed: (.+)$/);
  if (failed) return `任务失败：${failed[1]}`;

  const timedOut = raw.match(/^Timed out after (\d+)s$/);
  if (timedOut) return `已超时（${timedOut[1]}s）`;

  return raw;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function normalizeSeed(value: unknown) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? Math.trunc(normalized) : -1;
}

function normalizeGuidanceScale(value: unknown) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 5;
  return Math.min(20, Math.max(1, normalized));
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function upstreamErrorMessage(rawText: string, fallback: string) {
  const data = parseJson(rawText) as { error?: { message?: string }; message?: string } | null;
  return data?.error?.message || data?.message || rawText || fallback;
}

function onSettingsToggle(event: Event) {
  settingsOpen.value = (event.target as HTMLDetailsElement).open;
}

function onPageHide() {
  persistInterruptedSnapshot();
}

onMounted(() => {
  void loadHistory();
  loadInterruptedSnapshot();
  if (import.meta.client) {
    if (window.matchMedia("(min-width: 1025px)").matches) {
      settingsOpen.value = true;
    }
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("keydown", onPreviewKeydown);
    nextTick(() => setupHistoryLazyObserver());
  }
});

watch(historyRecords, () => {
  if (historyVisibleCount.value > historyRecords.value.length) {
    historyVisibleCount.value = historyRecords.value.length;
  }
});

watch([historyHasMore, () => historyRecords.value.length], () => {
  nextTick(() => setupHistoryLazyObserver());
});

onBeforeUnmount(() => {
  disconnectHistoryLazyObserver();
  if (import.meta.client) {
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("keydown", onPreviewKeydown);
  }
  for (const taskId of [...taskStreams.keys()]) {
    cancelTaskStream(taskId);
  }
  for (const url of [...previewObjectUrls]) {
    releasePreviewObjectUrl(url);
  }
});
</script>

<template>
  <main class="hidream-page" :lang="locale">
    <header class="topbar">
      <div class="brand">
        <p class="brand-mark">HD</p>
        <div>
          <h1 class="brand-title">{{ t.title }}</h1>
          <p class="brand-sub">{{ t.subtitle }}</p>
        </div>
      </div>

      <div
        class="topbar-status"
        :class="{
          error: previewState === 'error',
          done: previewState === 'image',
          running: previewState === 'loading',
        }"
        role="status"
        aria-live="polite"
      >
        <span class="status-dot" aria-hidden="true" />
        <span class="status-text">{{ statusText }}</span>
      </div>

      <div class="lang-switch" role="group" :aria-label="locale === 'zh' ? '语言切换' : 'Language'">
        <button type="button" class="lang-btn" :class="{ active: locale === 'zh' }" @click="setLocale('zh')">
          {{ t.langZh }}
        </button>
        <button type="button" class="lang-btn" :class="{ active: locale === 'en' }" @click="setLocale('en')">
          {{ t.langEn }}
        </button>
      </div>
    </header>

    <section class="workspace">
      <form class="panel controls" @submit.prevent="generateImage">
        <div class="controls-primary">
          <label class="field">
            <span class="field-label">{{ t.prompt }}</span>
            <textarea
              v-model="prompt"
              class="prompt-textarea"
              rows="6"
              :placeholder="t.promptPlaceholder"
            />
          </label>

          <label class="field">
            <span class="field-label">{{ t.negativePrompt }}</span>
            <textarea v-model="negativePrompt" rows="2" :placeholder="t.negativePlaceholder" />
          </label>

          <div class="controls-actions">
            <p v-if="formError" class="hint-banner warn">{{ formError }}</p>

            <p v-else-if="runningCount >= HIDREAM_MAX_CONCURRENT" class="hint-banner warn">
              {{ t.concurrencyLimit }}
            </p>

            <button type="submit" class="submit-btn" :disabled="!canGenerate">
              {{ t.generate }}
              <span v-if="runningCount" class="submit-badge">{{ runningCount }}</span>
            </button>
          </div>
        </div>

        <details class="settings-block" :open="settingsOpen" @toggle="onSettingsToggle">
          <summary class="settings-summary">{{ t.advancedSettings }}</summary>
          <div class="settings-body">
            <div class="field">
              <span class="field-label">{{ t.aspectRatio }}</span>
              <div class="ratio-grid">
                <button
                  v-for="option in aspectRatioOptions"
                  :key="option"
                  type="button"
                  class="ratio-btn"
                  :class="{ active: aspectRatio === option }"
                  @click="aspectRatio = option"
                >
                  {{ option }}
                </button>
              </div>
            </div>

            <div class="param-grid">
              <label class="field compact">
                <span class="field-label">{{ t.seed }}</span>
                <input v-model.number="seed" type="number" min="-1" step="1">
                <span class="field-hint">{{ t.seedHint }}</span>
              </label>

              <label class="field compact">
                <span class="field-label">{{ t.guidance }}</span>
                <input v-model.number="guidanceScale" type="number" min="1" max="20" step="0.1">
              </label>
            </div>

            <button
              type="button"
              class="toggle-card"
              role="switch"
              :aria-checked="promptRefine"
              @click="promptRefine = !promptRefine"
            >
              <span class="toggle-ui" :class="{ on: promptRefine }" aria-hidden="true" />
              <span class="toggle-copy">
                <span class="toggle-title">{{ t.promptRefine }}</span>
                <span class="toggle-hint">{{ t.promptRefineHint }}</span>
              </span>
            </button>
          </div>
        </details>
      </form>

      <section class="panel canvas-panel">
        <div v-if="interruptedTask" class="hint-banner interrupted canvas-banner">
          <div class="hint-copy">
            <strong>{{ t.interruptedTitle }}</strong>
            <p>{{ t.interruptedHint }}</p>
          </div>
          <div class="banner-actions">
            <button type="button" class="ghost-btn" @click="retryInterrupted">{{ t.retryInterrupted }}</button>
            <button type="button" class="ghost-btn" @click="dismissInterrupted">{{ t.dismissInterrupted }}</button>
          </div>
        </div>

        <div v-if="tasks.length" class="task-strip">
          <span class="task-strip-label">{{ t.tasks }} {{ runningCount }}/{{ HIDREAM_MAX_CONCURRENT }}</span>
          <div class="task-list">
            <div
              v-for="task in tasks"
              :key="task.id"
              class="task-chip"
              :class="{ active: activeTaskId === task.id, [task.status]: true }"
              :aria-current="activeTaskId === task.id ? 'true' : undefined"
            >
              <button type="button" class="task-chip-main" @click="selectTask(task.id)">
                <span class="task-chip-status">{{ taskStatusLabel(task) }}</span>
                <span class="task-chip-prompt">{{ promptSummary(task.params.prompt) }}</span>
              </button>
              <button
                v-if="task.status === 'running'"
                type="button"
                class="task-chip-action"
                :aria-label="t.cancelTask"
                @click="cancelTask(task.id)"
              >
                ×
              </button>
              <button
                v-else
                type="button"
                class="task-chip-action"
                :aria-label="t.removeTask"
                @click="removeTask(task.id)"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div class="preview-stage">
          <div v-if="previewState === 'image' && activeTask?.imageUrl" class="image-frame">
            <img
              :src="activeTask.displayUrl || displayImageUrl(activeTask.imageUrl)"
              :alt="t.imageAlt"
              @load="reportPreviewImageLoad(activeTask, $event)"
              @error="reportPreviewImageError(activeTask)"
            >
          </div>
          <div v-else-if="previewState === 'loading'" class="preview-loading">
            <span class="preview-spinner" aria-hidden="true" />
            <p class="empty-title">{{ t.generating }}</p>
            <p class="empty-hint">{{ displayedStatuses.at(-1) || t.emptyHint }}</p>
          </div>
          <div v-else-if="previewState === 'error'" class="empty error-panel">
            <p class="empty-title">{{ t.statusFailed }}</p>
            <p class="empty-hint">{{ activeTask?.error }}</p>
          </div>
          <div v-else class="empty">
            <p class="empty-title">{{ t.waiting }}</p>
            <p class="empty-hint">{{ t.emptyHint }}</p>
          </div>
        </div>

        <details v-if="displayedStatuses.length" class="panel-details logs" :open="previewState === 'loading'">
          <summary>{{ t.viewLogs }}</summary>
          <ol>
            <li v-for="(status, index) in displayedStatuses" :key="index">
              {{ status }}
            </li>
          </ol>
        </details>
      </section>

      <aside class="panel history-rail">
        <div class="history-rail-head">
          <h2 class="history-rail-title">{{ t.history }}</h2>
          <span v-if="historyRecords.length" class="summary-badge">{{ historyRecords.length }}</span>
        </div>

        <div v-if="historyRecords.length" ref="historyListRef" class="history-list">
          <article v-for="record in visibleHistoryRecords" :key="record.id" class="history-item">
            <div class="history-visual">
              <button type="button" class="history-thumb" @click="openHistoryPreview(record)">
                <img
                  v-if="record.thumbnailUrl"
                  :src="record.thumbnailUrl"
                  :alt="t.imageAlt"
                  loading="lazy"
                >
                <span v-else class="history-thumb-placeholder" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="history-download"
                :aria-label="t.downloadImage"
                :title="t.downloadImage"
                @click="downloadHistoryImage(record)"
              >
                <svg class="history-download-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12 4v10m0 0l4-4m-4 4l-4-4M5 20h14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>
            <div class="history-meta">
              <p>{{ promptSummary(record.params.prompt) }}</p>
              <small>{{ formatHistoryMetaLine(record) }}</small>
              <div class="history-actions">
                <button type="button" class="ghost-btn" @click="restoreHistoryParams(record)">
                  {{ t.restoreHistory }}
                </button>
                <button type="button" class="ghost-btn danger" @click="deleteHistoryRecord(record.id)">
                  {{ t.deleteHistory }}
                </button>
              </div>
            </div>
          </article>
          <div
            v-if="historyHasMore"
            ref="historyLoadMoreRef"
            class="history-load-more"
            aria-hidden="true"
          >
            {{ t.historyLoadingMore }}
          </div>
        </div>
        <p v-else class="history-empty">{{ t.historyEmpty }}</p>
      </aside>
    </section>

    <Teleport to="body">
      <div
        v-if="historyPreview"
        class="history-lightbox"
        role="dialog"
        aria-modal="true"
        :aria-label="t.imageAlt"
        @click.self="closeHistoryPreview"
      >
        <button type="button" class="lightbox-close" @click="closeHistoryPreview">
          {{ t.closePreview }}
        </button>
        <figure class="lightbox-figure">
          <img :src="historyPreview.localImageUrl || displayImageUrl(historyPreview.imageUrl)" :alt="t.imageAlt">
          <figcaption>{{ promptSummary(historyPreview.params.prompt) }}</figcaption>
        </figure>
      </div>
    </Teleport>
  </main>
</template>

<style>
html.hidream-html,
body.hidream-body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  display: block;
  overflow: hidden;
  background: #0b0d12;
}

body.hidream-body #__nuxt {
  width: 100%;
  min-width: 0;
  height: 100%;
}
</style>

<style scoped>
.hidream-page,
.hidream-page *,
.hidream-page *::before,
.hidream-page *::after {
  box-sizing: border-box;
}

.hidream-page {
  --panel: rgba(22, 26, 36, 0.82);
  --panel-border: rgba(255, 255, 255, 0.08);
  --text: #f4f6fb;
  --muted: #9aa3b2;
  --accent: #c9a962;
  --accent-soft: rgba(201, 169, 98, 0.16);
  --accent-border: rgba(201, 169, 98, 0.42);
  --danger: #f87171;
  --success: #4ade80;
  --shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100dvh;
  min-height: 100dvh;
  padding: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% -10%, rgba(201, 169, 98, 0.18), transparent 34%),
    radial-gradient(circle at 88% 0%, rgba(96, 165, 250, 0.12), transparent 28%),
    linear-gradient(180deg, #0b0d12 0%, #10131a 100%);
  color: var(--text);
  font-family: "Noto Sans SC", "Inter", ui-sans-serif, system-ui, sans-serif;
}

.topbar,
.workspace {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
}

.topbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px 16px;
  flex-shrink: 0;
  padding: 10px 14px 0;
}

.topbar-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  justify-self: center;
  max-width: min(520px, 100%);
  min-width: 0;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #d9dee8;
  font-size: 13px;
  font-weight: 600;
}

.topbar-status.running {
  background: rgba(96, 165, 250, 0.12);
  border-color: rgba(96, 165, 250, 0.28);
  color: #bfdbfe;
}

.topbar-status.running .status-dot {
  background: #60a5fa;
  animation: pulse 1.4s ease-in-out infinite;
}

.topbar-status.done {
  background: rgba(74, 222, 128, 0.12);
  border-color: rgba(74, 222, 128, 0.28);
  color: #bbf7d0;
}

.topbar-status.done .status-dot {
  background: var(--success);
}

.topbar-status.error {
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.28);
  color: #fecaca;
}

.topbar-status.error .status-dot {
  background: var(--danger);
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: 0;
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(201, 169, 98, 0.28), rgba(201, 169, 98, 0.08));
  border: 1px solid var(--accent-border);
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.brand-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.brand-sub {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.lang-switch {
  display: inline-flex;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--panel-border);
}

.lang-btn {
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 14px;
}

.lang-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.workspace {
  display: grid;
  grid-template-columns: minmax(300px, 360px) minmax(0, 1fr) minmax(240px, 300px);
  grid-template-areas: "controls canvas history";
  gap: 10px;
  flex: 1;
  min-height: 0;
  padding: 8px 14px 14px;
  align-items: stretch;
}

.controls {
  grid-area: controls;
}

.canvas-panel {
  grid-area: canvas;
}

.history-rail {
  grid-area: history;
}

.workspace > * {
  min-height: 0;
  min-width: 0;
}

.panel {
  border: 1px solid var(--panel-border);
  border-radius: 24px;
  background: var(--panel);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
  min-width: 0;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  padding: 16px;
  overflow: hidden;
}

.controls-primary {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.controls-actions {
  display: grid;
  gap: 10px;
}

.controls-actions .submit-btn {
  width: 100%;
}

.settings-block {
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.settings-summary {
  cursor: pointer;
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 600;
  padding: 12px 0 10px;
  list-style: none;
}

.settings-summary::-webkit-details-marker {
  display: none;
}

.settings-summary::before {
  content: "▸ ";
  color: var(--muted);
}

.settings-block[open] .settings-summary::before {
  content: "▾ ";
}

.settings-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 4px;
  overflow: auto;
  min-height: 0;
}

.canvas-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 12px;
  overflow: hidden;
}

.canvas-banner {
  flex-shrink: 0;
}

.history-rail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 14px;
  overflow: hidden;
}

.history-rail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.history-rail-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #e5e9f0;
}

.field {
  display: grid;
  gap: 8px;
}

.field.compact {
  gap: 6px;
}

.field-label {
  color: #d6dbe5;
  font-size: 13px;
  font-weight: 600;
}

.field-hint {
  color: var(--muted);
  font-size: 12px;
}

textarea,
input[type="number"] {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--text);
  font: inherit;
  padding: 12px 14px;
  outline: none;
  -moz-appearance: textfield;
  appearance: textfield;
}

input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

textarea {
  resize: none;
  line-height: 1.65;
  overflow-y: auto;
}

.prompt-textarea {
  min-height: 140px;
  max-height: 280px;
  resize: vertical;
}

textarea:not(.prompt-textarea) {
  min-height: 64px;
  max-height: 100px;
}

textarea::placeholder {
  color: #7b8494;
}

textarea:focus,
input[type="number"]:focus {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px rgba(201, 169, 98, 0.16);
}

.ratio-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ratio-btn {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: #c5cad4;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 12px;
}

.ratio-btn.active {
  border-color: var(--accent-border);
  background: var(--accent-soft);
  color: var(--accent);
}

.param-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.toggle-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.toggle-ui {
  position: relative;
  flex-shrink: 0;
  width: 44px;
  height: 26px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}

.toggle-ui::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}

.toggle-ui.on {
  background: rgba(201, 169, 98, 0.55);
}

.toggle-ui.on::after {
  transform: translateX(18px);
}

.toggle-copy {
  display: grid;
  gap: 2px;
}

.toggle-title {
  font-size: 14px;
  font-weight: 600;
}

.toggle-hint {
  color: var(--muted);
  font-size: 12px;
}

.submit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, #d4b56a 0%, #b8923f 100%);
  color: #15120a;
  cursor: pointer;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  padding: 14px 18px;
}

.submit-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.submit-badge {
  min-width: 22px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(21, 18, 10, 0.18);
  font-size: 12px;
}

.hint-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 12px;
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 13px;
  min-width: 0;
}

.hint-copy {
  flex: 1 1 180px;
  min-width: 0;
}

.hint-banner p {
  margin: 4px 0 0;
  color: var(--muted);
  line-height: 1.5;
}

.hint-banner.warn {
  background: rgba(251, 191, 36, 0.12);
  color: #fde68a;
}

.hint-banner.interrupted {
  background: rgba(96, 165, 250, 0.12);
  color: #dbeafe;
}

.banner-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 0 0 auto;
}

.ghost-btn {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 6px 10px;
}

.ghost-btn.danger {
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.28);
}

.preview-stage {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.preview-stage > .image-frame,
.preview-stage > .empty,
.preview-stage > .preview-loading,
.preview-stage > .error-panel {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.panel-details {
  flex-shrink: 0;
  min-height: 0;
  color: var(--muted);
  font-size: 13px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  overflow: hidden;
}

.canvas-panel .panel-details[open] {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  max-height: 120px;
  min-height: 0;
}

.panel-details summary {
  cursor: pointer;
  color: #cbd5e1;
  font-weight: 600;
  padding: 10px 12px;
  list-style-position: inside;
}

.panel-details summary::-webkit-details-marker {
  color: var(--muted);
}

.summary-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  vertical-align: middle;
}

.panel-details ol,
.history-list {
  margin: 0;
  padding: 0 12px 12px;
  overflow: auto;
  min-height: 0;
}

.panel-details ol {
  padding-left: 28px;
}

.panel-details li + li {
  margin-top: 4px;
  word-break: break-word;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.history-load-more {
  flex-shrink: 0;
  align-self: center;
  padding: 10px 4px 6px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}

.history-item {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 8px;
  padding: 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.history-visual {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 64px;
  flex-shrink: 0;
}

.history-download {
  display: grid;
  place-items: center;
  width: 100%;
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: #d6dbe5;
  cursor: pointer;
  padding: 0;
}

.history-download-icon {
  width: 16px;
  height: 16px;
}

.history-download:hover {
  border-color: var(--accent-border);
  color: var(--accent);
}

.history-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border: 0;
  padding: 4px;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: #11151d;
  box-sizing: border-box;
}

.history-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.history-thumb-placeholder {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 7px;
  background:
    linear-gradient(135deg, rgba(139, 233, 253, 0.16), rgba(255, 255, 255, 0.04)),
    #151a23;
}

.history-meta p {
  margin: 0;
  color: #e5e9f0;
  font-size: 13px;
}

.history-meta small {
  color: var(--muted);
}

.history-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.history-empty {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}

.status-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
  flex-shrink: 0;
}

.task-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  min-width: 0;
}

.task-strip-label {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

.task-list {
  display: flex;
  flex: 1;
  flex-wrap: nowrap;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
  scrollbar-width: thin;
}

.task-chip {
  display: inline-flex;
  align-items: stretch;
  flex: 0 0 auto;
  max-width: min(240px, 72vw);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  overflow: hidden;
}

.task-chip.running:not(.active) {
  border-color: rgba(96, 165, 250, 0.35);
}

.task-chip.failed:not(.active) {
  border-color: rgba(248, 113, 113, 0.28);
}

.task-chip.active {
  border: 2px solid var(--accent);
  background: linear-gradient(135deg, rgba(201, 169, 98, 0.22), rgba(201, 169, 98, 0.08));
  box-shadow:
    0 0 0 3px rgba(201, 169, 98, 0.18),
    0 6px 16px rgba(0, 0, 0, 0.28);
}

.task-chip.active .task-chip-status {
  color: var(--accent);
  font-weight: 700;
}

.task-chip.active .task-chip-prompt {
  color: #f8fafc;
  font-weight: 600;
}

.task-chip.active .task-chip-action {
  border-left-color: rgba(201, 169, 98, 0.35);
  background: rgba(201, 169, 98, 0.12);
  color: #f4f6fb;
}

.task-chip-main {
  display: grid;
  gap: 2px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  padding: 8px 10px;
  min-width: 0;
}

.task-chip-status {
  font-size: 11px;
  color: var(--muted);
}

.task-chip-prompt {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.task-chip-action {
  border: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #cbd5e1;
  cursor: pointer;
  width: 32px;
  font-size: 16px;
}

.image-frame,
.empty,
.preview-loading {
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01)),
    repeating-linear-gradient(
      -45deg,
      rgba(255, 255, 255, 0.025),
      rgba(255, 255, 255, 0.025) 8px,
      transparent 8px,
      transparent 16px
    );
}

.image-frame {
  position: relative;
  box-sizing: border-box;
  overflow: hidden;
}

.empty,
.preview-loading {
  display: grid;
  place-items: center;
  overflow: hidden;
}

.empty,
.preview-loading,
.error-panel {
  gap: 10px;
  text-align: center;
  padding: 24px;
}

.preview-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(201, 169, 98, 0.2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

.empty-title {
  margin: 0;
  color: #dbe1ea;
  font-size: 16px;
  font-weight: 600;
}

.empty-hint {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.image-frame img {
  position: absolute;
  inset: 10px;
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.history-lightbox {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(4, 6, 10, 0.88);
  backdrop-filter: blur(10px);
}

.lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: #f4f6fb;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 14px;
}

.lightbox-figure {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: min(96vw, 1200px);
  max-height: 92dvh;
  margin: 0;
  min-width: 0;
}

.lightbox-figure img {
  display: block;
  max-width: 100%;
  max-height: calc(92dvh - 48px);
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
}

.lightbox-figure figcaption {
  max-width: 100%;
  color: #c5cad4;
  font-size: 13px;
  text-align: center;
  line-height: 1.5;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.85);
  }

  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

@media (min-width: 769px) and (max-width: 1024px) {
  .workspace {
    grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
    grid-template-areas:
      "controls canvas"
      "history history";
  }

  .history-rail {
    max-height: min(28dvh, 220px);
  }
}

@media (max-width: 768px) {
  .topbar {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "brand lang"
      "status status";
    padding: 8px 10px 0;
    gap: 8px;
  }

  .topbar-status {
    grid-area: status;
    justify-self: stretch;
    max-width: none;
  }

  .brand-title {
    font-size: 20px;
  }

  .workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "controls"
      "canvas"
      "history";
    padding: 6px 8px 10px;
    gap: 8px;
    max-width: none;
  }

  .controls-actions {
    position: sticky;
    bottom: 0;
    z-index: 3;
    padding: 10px 0 4px;
    background: linear-gradient(180deg, transparent 0%, rgba(22, 26, 36, 0.94) 35%, rgba(22, 26, 36, 1) 100%);
  }

  .history-rail {
    max-height: min(32dvh, 260px);
  }

  .history-list {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 4px;
  }

  .history-load-more {
    align-self: stretch;
    display: flex;
    align-items: center;
    padding: 0 12px;
    white-space: nowrap;
  }

  .history-item {
    width: min(280px, 78vw);
    grid-template-columns: 56px 1fr;
  }

  .history-visual {
    width: 56px;
  }

  .history-thumb {
    width: 56px;
    height: 56px;
  }

  .controls {
    padding: 12px;
    overflow: visible;
  }

  .settings-block {
    flex: 0 0 auto;
  }

  .canvas-panel {
    min-height: min(40dvh, 360px);
    padding: 10px;
  }

  .param-grid {
    grid-template-columns: 1fr;
  }

  .prompt-textarea {
    min-height: 112px;
    max-height: 200px;
  }

  textarea:not(.prompt-textarea) {
    min-height: 56px;
    max-height: 80px;
  }

  .ratio-btn {
    padding: 7px 10px;
    font-size: 11px;
  }

  .hint-banner.interrupted {
    flex-direction: column;
    align-items: stretch;
  }

  .banner-actions {
    width: 100%;
  }

  .banner-actions .ghost-btn {
    flex: 1;
    text-align: center;
  }

  .panel {
    border-radius: 18px;
  }
}

@media (min-width: 1025px) {
  .settings-summary {
    display: none;
  }

  .settings-block {
    flex: 1;
    min-height: 0;
    margin-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .settings-block .settings-body {
    display: flex;
    flex: 1;
    overflow: auto;
  }
}
</style>
