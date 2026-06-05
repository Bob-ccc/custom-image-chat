<script setup lang="ts">
type PlaygroundMode = "generate" | "edit";
type QualityKey = "auto" | "low" | "medium" | "high";
type OutputFormat = "png" | "jpeg" | "webp";
type BackgroundMode = "auto" | "transparent" | "opaque";
type ModerationMode = "auto" | "low";
type StoredImageRecord = {
  id: string;
  mimeType: string;
  sourceUrl?: string;
};
type MaskPoint = { x: number; y: number };
type MaskStroke = { brushSize: number; points: MaskPoint[] };
type HistoryItem = {
  id: string;
  createdAt: string;
  mode: PlaygroundMode;
  prompt: string;
  model: string;
  size: string;
  quality: QualityKey;
  count: number;
  outputFormat: OutputFormat;
  background: BackgroundMode;
  moderation: ModerationMode;
  costUsd: number;
  images: StoredImageRecord[];
  sourceImages: string[];
  maskImage: string;
  request: Record<string, unknown>;
  response: unknown;
};

const API_KEYS_STORAGE_KEY = "goodscheck:chat-api-keys:v1";
const PROVIDER_STORAGE_KEY = "goodscheck:gpt-image-playground-provider:v1";
const HISTORY_STORAGE_KEY = "goodscheck:gpt-image-playground-history:v1";
const DB_NAME = "goodscheck-gpt-image-playground";
const DB_VERSION = 1;
const IMAGE_STORE = "images";
const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_MODEL = "gpt-image-2";
const MAX_IMAGES = 10;
const MIN_CUSTOM_PIXELS = 655360;
const MAX_CUSTOM_PIXELS = 8294400;

const modelOptions = ["gpt-image-2", "gpt-image-2-all", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini", "chatgpt-image-latest"];
const qualityOptions: QualityKey[] = ["auto", "low", "medium", "high"];
const outputFormatOptions: OutputFormat[] = ["png", "jpeg", "webp"];
const backgroundOptions: BackgroundMode[] = ["auto", "transparent", "opaque"];
const moderationOptions: ModerationMode[] = ["auto", "low"];
const sizePresets = [
  { value: "1024x1024", label: "1024 x 1024", hint: "1K square" },
  { value: "1536x1024", label: "1536 x 1024", hint: "1K landscape" },
  { value: "1024x1536", label: "1024 x 1536", hint: "1K portrait" },
  { value: "2048x2048", label: "2048 x 2048", hint: "2K square" },
  { value: "2048x1152", label: "2048 x 1152", hint: "2K 16:9" },
  { value: "3840x2160", label: "3840 x 2160", hint: "4K 16:9" },
  { value: "2160x3840", label: "2160 x 3840", hint: "4K 9:16" },
  { value: "auto", label: "auto", hint: "provider default" },
];

const mode = ref<PlaygroundMode>("generate");
const apiKey = ref("");
const baseUrl = ref(DEFAULT_BASE_URL);
const model = ref(DEFAULT_MODEL);
const prompt = ref("");
const sizeMode = ref<"preset" | "custom">("preset");
const size = ref("1024x1024");
const customWidth = ref(1024);
const customHeight = ref(1024);
const quality = ref<QualityKey>("auto");
const count = ref(1);
const outputFormat = ref<OutputFormat>("png");
const outputCompression = ref(90);
const background = ref<BackgroundMode>("auto");
const moderation = ref<ModerationMode>("auto");
const sourceImages = ref<string[]>([]);
const maskImage = ref("");
const maskCanvas = ref<HTMLCanvasElement | null>(null);
const maskToolOpen = ref(false);
const maskBrushSize = ref(56);
const maskStrokes = ref<MaskStroke[]>([]);
const maskDrawing = ref(false);
const loading = ref(false);
const errorMessage = ref("");
const responseJson = ref<unknown>(null);
const activeImageUrl = ref("");
const historyItems = ref<HistoryItem[]>([]);
const activeHistoryId = ref("");
const objectUrls = ref<Record<string, string>>({});
const historyDetailsOpen = ref(false);
const copiedMessage = ref("");

let dbPromise: Promise<IDBDatabase> | null = null;

const isEditMode = computed(() => mode.value === "edit");
const endpointPath = computed(() => isEditMode.value ? "/v1/images/edits" : "/v1/images/generations");
const endpointPreview = computed(() => buildEndpoint(baseUrl.value, endpointPath.value));
const effectiveSize = computed(() => sizeMode.value === "custom" ? `${Number(customWidth.value)}x${Number(customHeight.value)}` : size.value);
const customSizeError = computed(() => validateCustomSize());
const canSubmit = computed(() => {
  if (!prompt.value.trim() || !apiKey.value.trim() || !baseUrl.value.trim()) return false;
  if (isEditMode.value && !sourceImages.value.length) return false;
  if (sizeMode.value === "custom" && customSizeError.value) return false;
  return !loading.value;
});
const requestPreview = computed(() => ({
  mode: isEditMode.value ? "edit" : "generation",
  provider: {
    base: baseUrl.value.trim(),
    imageEndpoint: endpointPath.value,
    key: apiKey.value ? "Bearer ***REDACTED***" : "",
    model: model.value.trim(),
  },
  prompt: prompt.value,
  size: effectiveSize.value,
  quality: quality.value,
  n: count.value,
  b64_json: true,
  background: background.value,
  output_format: outputFormat.value,
  output_compression: shouldSendCompression.value ? outputCompression.value : undefined,
  moderation: moderation.value,
  image: isEditMode.value ? sourceImages.value.map(redactDataUrl) : undefined,
  mask: isEditMode.value && maskImage.value ? redactDataUrl(maskImage.value) : undefined,
}));
const requestText = computed(() => JSON.stringify(requestPreview.value, null, 2));
const responseText = computed(() => responseJson.value ? JSON.stringify(responseJson.value, null, 2) : "No response yet.");
const shouldSendCompression = computed(() => outputFormat.value === "jpeg" || outputFormat.value === "webp");
const activeHistory = computed(() => historyItems.value.find((item: HistoryItem) => item.id === activeHistoryId.value) || historyItems.value[0] || null);
const currentImages = computed(() => activeHistory.value?.images || []);
const totalCost = computed(() => historyItems.value.reduce((sum: number, item: HistoryItem) => sum + Number(item.costUsd || 0), 0));
const maskSourceImage = computed(() => sourceImages.value[0] || "");

onMounted(async () => {
  loadProvider();
  await loadHistory();
  window.addEventListener("paste", handleWindowPaste);
});

onBeforeUnmount(() => {
  window.removeEventListener("paste", handleWindowPaste);
  for (const url of Object.values(objectUrls.value) as string[]) URL.revokeObjectURL(url);
});

watch([apiKey, baseUrl], persistProvider);
watch(outputFormat, () => {
  if (outputFormat.value === "jpeg" && background.value === "transparent") background.value = "auto";
});
watch(maskSourceImage, () => {
  maskStrokes.value = [];
  maskImage.value = "";
  if (maskToolOpen.value) void nextTick(() => initializeMaskCanvas());
});

function buildEndpoint(baseRaw: string, path: string) {
  const base = baseRaw.trim().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : "/" + path;
  if (!base) return normalizedPath;
  if (/\/v[12]$/i.test(base) && /^\/v[12]\//i.test(normalizedPath)) return base.replace(/\/v[12]$/i, "") + normalizedPath;
  if (base.endsWith(normalizedPath)) return base;
  return base.replace(/\/v[12]\/(?:images\/(?:generations|edits)|chat\/completions)$/i, "") + normalizedPath;
}

function validateCustomSize() {
  if (sizeMode.value !== "custom") return "";
  const width = Number(customWidth.value);
  const height = Number(customHeight.value);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return "Width and height must be valid numbers.";
  if (width % 16 !== 0 || height % 16 !== 0) return "Width and height must be multiples of 16.";
  if (width > 3840 || height > 3840) return "Width and height cannot exceed 3840 px.";
  const ratio = Math.max(width / height, height / width);
  if (ratio > 3) return "Aspect ratio cannot exceed 3:1.";
  const pixels = width * height;
  if (pixels < MIN_CUSTOM_PIXELS || pixels > MAX_CUSTOM_PIXELS) return "Total pixels must be between 655,360 and 8,294,400.";
  return "";
}

function readStoredApiKeys(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(API_KEYS_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function loadProvider() {
  if (typeof window === "undefined") return;
  try {
    const keys = readStoredApiKeys();
    apiKey.value = keys["custom-image"] || "";
    const stored = JSON.parse(localStorage.getItem(PROVIDER_STORAGE_KEY) || "{}");
    baseUrl.value = String(stored.base || DEFAULT_BASE_URL);
    model.value = String(stored.model || DEFAULT_MODEL);
    outputFormat.value = outputFormatOptions.includes(stored.outputFormat) ? stored.outputFormat : "png";
  } catch {}
}

function persistProvider() {
  if (typeof window === "undefined") return;
  try {
    const keys = readStoredApiKeys();
    keys["custom-image"] = apiKey.value.trim();
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
    localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify({
      base: baseUrl.value.trim(),
      model: model.value.trim(),
      outputFormat: outputFormat.value,
    }));
  } catch {}
}

function openDb() {
  if (typeof window === "undefined") return Promise.reject(new Error("IndexedDB is only available in the browser."));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGE_STORE)) db.createObjectStore(IMAGE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB."));
  });
  return dbPromise;
}

async function putImageBlob(id: string, blob: Blob) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE, "readwrite");
    tx.objectStore(IMAGE_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Failed to store image."));
  });
}

async function getImageBlob(id: string) {
  const db = await openDb();
  return await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE, "readonly");
    const request = tx.objectStore(IMAGE_STORE).get(id);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error || new Error("Failed to read image."));
  });
}

async function deleteImageBlob(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE, "readwrite");
    tx.objectStore(IMAGE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Failed to delete image."));
  });
}

async function loadHistory() {
  if (typeof window === "undefined") return;
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
    historyItems.value = Array.isArray(parsed) ? parsed.slice(0, 80) : [];
    for (const item of historyItems.value) await hydrateHistoryItem(item);
    activeHistoryId.value = historyItems.value[0]?.id || "";
    activeImageUrl.value = currentImages.value[0] ? imageUrl(currentImages.value[0]) : "";
  } catch {
    historyItems.value = [];
  }
}

function persistHistory() {
  if (typeof window === "undefined") return;
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyItems.value.slice(0, 80)));
}

async function hydrateHistoryItem(item: HistoryItem) {
  for (const image of item.images) {
    if (objectUrls.value[image.id]) continue;
    const blob = await getImageBlob(image.id).catch(() => null);
    if (blob) objectUrls.value = { ...objectUrls.value, [image.id]: URL.createObjectURL(blob) };
  }
}

function imageUrl(image: StoredImageRecord) {
  return objectUrls.value[image.id] || displayImageUrl(image.sourceUrl || "");
}

function displayImageUrl(url: string) {
  const value = String(url || "").trim();
  if (!/^http:\/\//i.test(value)) return value;
  return "/api/chat/image-preview?url=" + encodeURIComponent(value);
}

function redactDataUrl(value: string) {
  if (!value.startsWith("data:")) return value;
  return value.slice(0, 42) + "...";
}

function uid(prefix = "img") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function estimateCost() {
  const modelWeight = model.value.includes("mini") ? 0.008 : model.value.includes("1.5") ? 0.025 : model.value.includes("2") ? 0.04 : 0.03;
  const sizeWeight = effectiveSize.value.includes("3840") || effectiveSize.value.includes("2160") ? 2 : effectiveSize.value.includes("2048") ? 1.4 : 1;
  const editWeight = isEditMode.value ? 1.25 : 1;
  return Number((modelWeight * sizeWeight * editWeight * Math.max(1, Number(count.value) || 1)).toFixed(4));
}

async function sourceToBlob(source: string) {
  const value = displayImageUrl(source);
  const response = await fetch(value);
  if (!response.ok) throw new Error(`Image fetch failed: HTTP ${response.status}`);
  return await response.blob();
}

async function storeResultImage(source: string, index: number): Promise<StoredImageRecord> {
  const id = uid(`result-${index + 1}`);
  const blob = await sourceToBlob(source);
  await putImageBlob(id, blob);
  objectUrls.value = { ...objectUrls.value, [id]: URL.createObjectURL(blob) };
  return { id, mimeType: blob.type || `image/${outputFormat.value}`, sourceUrl: source.startsWith("data:") ? "" : source };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image blob."));
    reader.readAsDataURL(blob);
  });
}

async function addSourceFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  if (!files.length) return;
  try {
    const dataUrls = await Promise.all(files.slice(0, MAX_IMAGES - sourceImages.value.length).map(fileToDataUrl));
    sourceImages.value = [...sourceImages.value, ...dataUrls].slice(0, MAX_IMAGES);
    mode.value = "edit";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    input.value = "";
  }
}

async function setMaskFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = Array.from(input.files || [])[0];
  if (!file) return;
  try {
    maskImage.value = await fileToDataUrl(file);
    mode.value = "edit";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    input.value = "";
  }
}

async function handlePaste(event: ClipboardEvent) {
  if (!isEditMode.value) return;
  const file = Array.from(event.clipboardData?.files || []).find((item: File) => item.type.startsWith("image/"));
  if (!file) return;
  event.preventDefault();
  try {
    sourceImages.value = [...sourceImages.value, await fileToDataUrl(file)].slice(0, MAX_IMAGES);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

function handleWindowPaste(event: Event) {
  void handlePaste(event as ClipboardEvent);
}

function removeSourceImage(index: number) {
  sourceImages.value = sourceImages.value.filter((_item: string, itemIndex: number) => itemIndex !== index);
}

function clearMask() {
  maskImage.value = "";
  maskStrokes.value = [];
  redrawMaskCanvas();
}

function loadImageElement(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load mask source image."));
    image.src = displayImageUrl(source);
  });
}

async function initializeMaskCanvas() {
  const canvas = maskCanvas.value;
  const source = maskSourceImage.value;
  if (!canvas || !source) return;
  const image = await loadImageElement(source);
  canvas.width = image.naturalWidth || image.width || 1024;
  canvas.height = image.naturalHeight || image.height || 1024;
  redrawMaskCanvas();
}

async function openMaskTool() {
  if (!maskSourceImage.value) {
    errorMessage.value = "Add a source image before drawing a mask.";
    return;
  }
  maskToolOpen.value = true;
  await nextTick();
  await initializeMaskCanvas();
}

function closeMaskTool() {
  maskToolOpen.value = false;
  maskDrawing.value = false;
}

function pointerPoint(event: PointerEvent): MaskPoint | null {
  const canvas = maskCanvas.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: MaskStroke) {
  if (!stroke.points.length) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.brushSize;
  ctx.strokeStyle = "rgba(59, 130, 246, 0.58)";
  ctx.fillStyle = "rgba(59, 130, 246, 0.58)";
  const [first, ...rest] = stroke.points;
  ctx.beginPath();
  ctx.arc(first.x, first.y, stroke.brushSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const point of rest) ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.restore();
}

function redrawMaskCanvas() {
  const canvas = maskCanvas.value;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of maskStrokes.value) drawStroke(ctx, stroke);
}

function startMaskStroke(event: PointerEvent) {
  const point = pointerPoint(event);
  if (!point) return;
  maskDrawing.value = true;
  maskCanvas.value?.setPointerCapture(event.pointerId);
  maskStrokes.value = [...maskStrokes.value, { brushSize: Number(maskBrushSize.value) || 48, points: [point] }];
  redrawMaskCanvas();
}

function moveMaskStroke(event: PointerEvent) {
  if (!maskDrawing.value) return;
  const point = pointerPoint(event);
  if (!point || !maskStrokes.value.length) return;
  const strokes = [...maskStrokes.value];
  const current = strokes[strokes.length - 1];
  strokes[strokes.length - 1] = { ...current, points: [...current.points, point] };
  maskStrokes.value = strokes;
  redrawMaskCanvas();
}

function endMaskStroke(event?: PointerEvent) {
  if (event) maskCanvas.value?.releasePointerCapture(event.pointerId);
  maskDrawing.value = false;
}

function undoMaskStroke() {
  maskStrokes.value = maskStrokes.value.slice(0, -1);
  redrawMaskCanvas();
}

function buildMaskDataUrl() {
  const canvas = maskCanvas.value;
  if (!canvas || !maskStrokes.value.length) return "";
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const ctx = output.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "rgba(0, 0, 0, 1)";
  ctx.fillRect(0, 0, output.width, output.height);
  ctx.globalCompositeOperation = "destination-out";
  for (const stroke of maskStrokes.value) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.brushSize;
    const [first, ...rest] = stroke.points;
    if (!first) continue;
    ctx.beginPath();
    ctx.arc(first.x, first.y, stroke.brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const point of rest) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  return output.toDataURL("image/png");
}

function applyDrawnMask() {
  const dataUrl = buildMaskDataUrl();
  if (!dataUrl) {
    errorMessage.value = "Draw on the mask canvas before applying it.";
    return;
  }
  maskImage.value = dataUrl;
  copiedMessage.value = "Mask applied.";
  setTimeout(() => copiedMessage.value = "", 1600);
}

async function sendToEdit(image: StoredImageRecord) {
  const blob = await getImageBlob(image.id).catch(() => null);
  const source = blob ? await blobToDataUrl(blob) : imageUrl(image);
  if (!source) return;
  mode.value = "edit";
  sourceImages.value = [source, ...sourceImages.value.filter((item: string) => item !== source)].slice(0, MAX_IMAGES);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function selectHistory(item: HistoryItem) {
  activeHistoryId.value = item.id;
  activeImageUrl.value = item.images[0] ? imageUrl(item.images[0]) : "";
  responseJson.value = item.response;
  historyDetailsOpen.value = true;
}

async function deleteHistory(item: HistoryItem) {
  historyItems.value = historyItems.value.filter((history: HistoryItem) => history.id !== item.id);
  for (const image of item.images) {
    await deleteImageBlob(image.id).catch(() => {});
    if (objectUrls.value[image.id]) URL.revokeObjectURL(objectUrls.value[image.id]);
  }
  persistHistory();
  activeHistoryId.value = historyItems.value[0]?.id || "";
  activeImageUrl.value = currentImages.value[0] ? imageUrl(currentImages.value[0]) : "";
}

async function clearHistory() {
  for (const item of historyItems.value) {
    for (const image of item.images) await deleteImageBlob(image.id).catch(() => {});
  }
  for (const url of Object.values(objectUrls.value) as string[]) URL.revokeObjectURL(url);
  objectUrls.value = {};
  historyItems.value = [];
  activeHistoryId.value = "";
  activeImageUrl.value = "";
  persistHistory();
}

function downloadImage(image: StoredImageRecord) {
  const url = imageUrl(image);
  if (!url) return;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${image.id}.${image.mimeType.includes("jpeg") ? "jpg" : image.mimeType.split("/")[1] || outputFormat.value}`;
  anchor.click();
}

async function copyImageUrl(image: StoredImageRecord) {
  const url = imageUrl(image);
  if (!url || !navigator.clipboard) return;
  await navigator.clipboard.writeText(url);
  copiedMessage.value = "Image URL copied.";
  setTimeout(() => copiedMessage.value = "", 1600);
}

async function copyImageBlob(image: StoredImageRecord) {
  const blob = await getImageBlob(image.id).catch(() => null);
  const ClipboardItemCtor = (window as any).ClipboardItem;
  if (!blob || !navigator.clipboard || !ClipboardItemCtor) {
    await copyImageUrl(image);
    return;
  }
  await navigator.clipboard.write([new ClipboardItemCtor({ [blob.type || "image/png"]: blob })]);
  copiedMessage.value = "Image copied.";
  setTimeout(() => copiedMessage.value = "", 1600);
}

function applyPreset(value: string) {
  sizeMode.value = "preset";
  size.value = value;
}

function resetForm() {
  prompt.value = "";
  mode.value = "generate";
  sizeMode.value = "preset";
  size.value = "1024x1024";
  customWidth.value = 1024;
  customHeight.value = 1024;
  quality.value = "auto";
  count.value = 1;
  background.value = "auto";
  outputFormat.value = "png";
  outputCompression.value = 90;
  moderation.value = "auto";
  sourceImages.value = [];
  maskImage.value = "";
  errorMessage.value = "";
  responseJson.value = null;
}

async function submit() {
  errorMessage.value = "";
  copiedMessage.value = "";
  if (!canSubmit.value) {
    errorMessage.value = customSizeError.value || "Please complete required fields.";
    return;
  }
  loading.value = true;
  try {
    const payload: Record<string, unknown> = {
      mode: isEditMode.value ? "edit" : "generation",
      provider: {
        base: baseUrl.value.trim(),
        imageEndpoint: endpointPath.value,
        key: apiKey.value.trim(),
        model: model.value.trim(),
      },
      prompt: prompt.value.trim(),
      size: effectiveSize.value,
      quality: quality.value,
      n: Math.max(1, Math.min(MAX_IMAGES, Number(count.value) || 1)),
      b64_json: true,
      background: background.value,
      output_format: outputFormat.value,
      moderation: moderation.value,
    };
    if (shouldSendCompression.value) payload.output_compression = outputCompression.value;
    if (isEditMode.value) {
      payload.image = sourceImages.value;
      if (maskImage.value) payload.mask = maskImage.value;
    }
    const response = await fetch("/api/chat/image-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    responseJson.value = data;
    if (!response.ok || data?.ok === false) throw new Error(data?.error?.message || "Generation failed.");
    const urls = Array.isArray(data?.images) ? data.images.map((item: unknown) => String(item || "").trim()).filter(Boolean) : [];
    if (!urls.length) throw new Error("No image returned.");
    const images = await Promise.all(urls.map(storeResultImage));
    const item: HistoryItem = {
      id: uid("history"),
      createdAt: new Date().toISOString(),
      mode: mode.value,
      prompt: prompt.value.trim(),
      model: model.value.trim(),
      size: effectiveSize.value,
      quality: quality.value,
      count: images.length,
      outputFormat: outputFormat.value,
      background: background.value,
      moderation: moderation.value,
      costUsd: estimateCost(),
      images,
      sourceImages: isEditMode.value ? sourceImages.value.map(redactDataUrl) : [],
      maskImage: maskImage.value ? redactDataUrl(maskImage.value) : "",
      request: requestPreview.value,
      response: data,
    };
    historyItems.value = [item, ...historyItems.value].slice(0, 80);
    activeHistoryId.value = item.id;
    activeImageUrl.value = imageUrl(images[0]);
    historyDetailsOpen.value = true;
    persistHistory();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="playground-shell">
    <header class="hero">
      <div>
        <p class="eyebrow">GPT Image Playground</p>
        <h1>Generate, edit, inspect, and keep every image locally.</h1>
        <p class="hero-copy">
          OpenAI-compatible BYOK playground with custom sizes, detailed parameters, IndexedDB storage, and fast send-to-edit workflows.
        </p>
      </div>
      <div class="hero-stats">
        <span>{{ historyItems.length }} runs</span>
        <strong>${{ totalCost.toFixed(4) }}</strong>
        <small>estimated historical cost</small>
      </div>
    </header>

    <section class="workspace">
      <form class="control-stack" @submit.prevent="submit">
        <section class="panel provider-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Provider</p>
              <h2>Model and endpoint</h2>
            </div>
            <div class="segmented">
              <button type="button" :class="{ active: mode === 'generate' }" @click="mode = 'generate'">Generate</button>
              <button type="button" :class="{ active: mode === 'edit' }" @click="mode = 'edit'">Edit</button>
            </div>
          </div>
          <div class="field-grid">
            <label>
              <span>Model</span>
              <select v-model="model">
                <option v-for="item in modelOptions" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label>
              <span>API Key</span>
              <input v-model="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-..." />
            </label>
            <label class="wide">
              <span>API Base</span>
              <input v-model="baseUrl" autocomplete="off" spellcheck="false" placeholder="https://api.openai.com" />
            </label>
          </div>
          <p class="endpoint">{{ endpointPreview }}</p>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Prompt</p>
              <h2>{{ isEditMode ? "Edit instruction" : "Image prompt" }}</h2>
            </div>
            <button type="button" class="ghost" @click="resetForm">Reset</button>
          </div>
          <textarea v-model="prompt" class="prompt" rows="7" maxlength="5000" placeholder="Describe the image you want..." />
          <div v-if="isEditMode" class="edit-inputs">
            <div class="drop-card">
              <strong>Source images</strong>
              <p>Upload or paste images. Generated images can be sent here from the result grid.</p>
              <label class="upload-button">
                <input type="file" accept="image/*" multiple @change="addSourceFiles" />
                Add source image
              </label>
            </div>
            <div v-if="sourceImages.length" class="thumb-grid">
              <div v-for="(image, index) in sourceImages" :key="image + index" class="thumb">
                <img :src="displayImageUrl(image)" alt="Source image" />
                <button type="button" @click="removeSourceImage(index)">Remove</button>
              </div>
            </div>
            <div class="mask-row">
              <label class="upload-button">
                <input type="file" accept="image/*" @change="setMaskFile" />
                Upload mask
              </label>
              <button type="button" class="ghost" :disabled="!maskSourceImage" @click="openMaskTool">Draw mask</button>
              <button v-if="maskImage" type="button" class="ghost" @click="clearMask">Clear mask</button>
              <span>{{ maskImage ? "Mask attached" : "Mask optional" }}</span>
            </div>
            <div v-if="maskToolOpen" class="mask-tool">
              <div class="mask-tool-head">
                <div>
                  <strong>Mask brush</strong>
                  <p>Paint the area you want the model to edit. The painted area is exported as transparent mask pixels.</p>
                </div>
                <button type="button" class="ghost" @click="closeMaskTool">Close</button>
              </div>
              <div class="mask-stage">
                <img :src="displayImageUrl(maskSourceImage)" alt="Mask source image" />
                <canvas
                  ref="maskCanvas"
                  class="mask-canvas"
                  @pointerdown.prevent="startMaskStroke"
                  @pointermove.prevent="moveMaskStroke"
                  @pointerup.prevent="endMaskStroke"
                  @pointercancel.prevent="endMaskStroke"
                  @pointerleave="endMaskStroke"
                />
              </div>
              <div class="mask-controls">
                <label>
                  <span>Brush size {{ maskBrushSize }}px</span>
                  <input v-model.number="maskBrushSize" type="range" min="8" max="180" step="2" />
                </label>
                <button type="button" class="ghost" :disabled="!maskStrokes.length" @click="undoMaskStroke">Undo</button>
                <button type="button" class="ghost" :disabled="!maskStrokes.length" @click="clearMask">Clear drawing</button>
                <button type="button" :disabled="!maskStrokes.length" @click="applyDrawnMask">Apply mask</button>
              </div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Parameters</p>
              <h2>Full API control</h2>
            </div>
          </div>
          <div class="preset-grid">
            <button
              v-for="preset in sizePresets"
              :key="preset.value"
              type="button"
              :class="{ active: sizeMode === 'preset' && size === preset.value }"
              @click="applyPreset(preset.value)"
            >
              <strong>{{ preset.label }}</strong>
              <small>{{ preset.hint }}</small>
            </button>
          </div>
          <div class="custom-size">
            <label class="switch-row">
              <input v-model="sizeMode" type="radio" value="custom" />
              <span>Custom resolution for GPT Image 2</span>
            </label>
            <div class="field-grid compact">
              <label>
                <span>Width</span>
                <input v-model.number="customWidth" type="number" min="16" max="3840" step="16" />
              </label>
              <label>
                <span>Height</span>
                <input v-model.number="customHeight" type="number" min="16" max="3840" step="16" />
              </label>
            </div>
            <p :class="customSizeError ? 'validation bad' : 'validation good'">
              {{ customSizeError || `Valid custom size: ${effectiveSize}` }}
            </p>
          </div>
          <div class="field-grid">
            <label>
              <span>Quality</span>
              <select v-model="quality">
                <option v-for="item in qualityOptions" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label>
              <span>Count</span>
              <input v-model.number="count" type="number" min="1" max="10" />
            </label>
            <label>
              <span>Output format</span>
              <select v-model="outputFormat">
                <option v-for="item in outputFormatOptions" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label>
              <span>Compression</span>
              <input v-model.number="outputCompression" type="number" min="0" max="100" :disabled="!shouldSendCompression" />
            </label>
            <label>
              <span>Background</span>
              <select v-model="background">
                <option v-for="item in backgroundOptions" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <label>
              <span>Moderation</span>
              <select v-model="moderation">
                <option v-for="item in moderationOptions" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>
          <div class="actions">
            <button type="submit" :disabled="!canSubmit">{{ loading ? "Generating..." : isEditMode ? "Edit image" : "Generate image" }}</button>
            <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
          </div>
        </section>
      </form>

      <aside class="result-stack">
        <section class="panel output-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Output</p>
              <h2>Result view</h2>
            </div>
            <span v-if="copiedMessage" class="pill">{{ copiedMessage }}</span>
          </div>
          <div v-if="loading" class="empty-state">Generating images...</div>
          <div v-else-if="currentImages.length" class="output-layout">
            <button v-if="activeImageUrl" type="button" class="large-preview" @click="activeImageUrl = ''">
              <img :src="activeImageUrl" alt="Selected result" />
            </button>
            <div class="image-grid">
              <article v-for="image in currentImages" :key="image.id" class="image-card">
                <button type="button" class="image-button" @click="activeImageUrl = imageUrl(image)">
                  <img :src="imageUrl(image)" alt="Generated image" />
                </button>
                <div class="image-actions">
                  <button type="button" @click="sendToEdit(image)">Send to Edit</button>
                  <button type="button" @click="downloadImage(image)">Download</button>
                  <button type="button" @click="copyImageBlob(image)">Copy</button>
                  <button type="button" @click="copyImageUrl(image)">URL</button>
                </div>
              </article>
            </div>
          </div>
          <div v-else class="empty-state">Your generated images will appear here.</div>
        </section>

        <section class="panel history-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">History</p>
              <h2>Local runs</h2>
            </div>
            <button type="button" class="ghost" :disabled="!historyItems.length" @click="clearHistory">Clear</button>
          </div>
          <div v-if="historyItems.length" class="history-list">
            <article
              v-for="item in historyItems"
              :key="item.id"
              :class="{ active: item.id === activeHistoryId }"
              class="history-item"
              @click="selectHistory(item)"
            >
              <img v-if="item.images[0]" :src="imageUrl(item.images[0])" alt="History preview" />
              <div>
                <strong>{{ item.prompt || "Untitled" }}</strong>
                <span>{{ item.mode }} · {{ item.model }} · {{ item.size }}</span>
                <small>{{ new Date(item.createdAt).toLocaleString() }} · ${{ item.costUsd.toFixed(4) }}</small>
              </div>
              <button type="button" @click.stop="deleteHistory(item)">Delete</button>
            </article>
          </div>
          <div v-else class="empty-mini">No local history yet.</div>
        </section>

        <section class="panel details-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Inspect</p>
              <h2>Request and response</h2>
            </div>
            <button type="button" class="ghost" @click="historyDetailsOpen = !historyDetailsOpen">
              {{ historyDetailsOpen ? "Hide" : "Show" }}
            </button>
          </div>
          <div v-if="historyDetailsOpen" class="json-grid">
            <div>
              <h3>Request</h3>
              <pre>{{ activeHistory ? JSON.stringify(activeHistory.request, null, 2) : requestText }}</pre>
            </div>
            <div>
              <h3>Response</h3>
              <pre>{{ activeHistory ? JSON.stringify(activeHistory.response, null, 2) : responseText }}</pre>
            </div>
          </div>
        </section>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.playground-shell {
  min-height: 100dvh;
  padding: 2rem 1rem;
  background: hsl(0 0% 100%);
  color: hsl(0 0% 9%);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
.hero,
.workspace,
.control-stack,
.result-stack,
.panel,
.edit-inputs,
.history-list {
  display: grid;
  gap: 1rem;
}
.hero {
  grid-template-columns: 1fr;
  place-items: center;
  margin: 0 auto 2rem;
  max-width: 72rem;
  text-align: center;
}
.hero h1 {
  max-width: 54rem;
  margin: 0;
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.035em;
}
.hero-copy {
  max-width: 42rem;
  margin: 0.75rem auto 0;
  color: hsl(0 0% 45%);
  font-size: 0.95rem;
  line-height: 1.65;
}
.hero-stats {
  display: inline-grid;
  grid-template-columns: auto auto auto;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
  margin-top: 1rem;
  border: 1px solid hsl(0 0% 90%);
  border-radius: 999px;
  background: hsl(0 0% 98%);
  padding: 0.45rem 0.75rem;
  box-shadow: none;
}
.hero-stats span,
.hero-stats small,
.eyebrow,
.endpoint,
.history-item span,
.history-item small,
.drop-card p,
.validation {
  color: hsl(0 0% 45%);
  font-size: 0.75rem;
}
.hero-stats strong {
  display: block;
  margin: 0;
  font-size: 0.9rem;
  font-weight: 700;
}
.workspace {
  grid-template-columns: minmax(360px, 0.92fr) minmax(0, 1.08fr);
  align-items: start;
  max-width: 86rem;
  margin: 0 auto;
  gap: 1.5rem;
}
.panel {
  min-width: 0;
  border: 1px solid hsl(0 0% 90%);
  border-radius: 0.75rem;
  background: hsl(0 0% 100%);
  padding: 1.25rem;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.eyebrow {
  margin: 0 0 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}
h2,
h3,
p,
pre {
  margin: 0;
}
h2 {
  font-size: 1.05rem;
  font-weight: 700;
}
h3 {
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
  font-weight: 700;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}
.field-grid.compact {
  margin-top: 0.75rem;
}
.wide {
  grid-column: 1 / -1;
}
label,
.switch-row {
  display: grid;
  gap: 0.45rem;
  color: hsl(0 0% 18%);
  font-size: 0.875rem;
  font-weight: 600;
}
.switch-row {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
}
input,
textarea,
select {
  width: 100%;
  min-width: 0;
  border: 1px solid hsl(0 0% 89%);
  border-radius: 0.5rem;
  background: hsl(0 0% 100%);
  color: hsl(0 0% 9%);
  padding: 0.55rem 0.75rem;
  font: inherit;
  outline: none;
}
input:focus,
textarea:focus,
select:focus {
  border-color: hsl(0 0% 65%);
  box-shadow: 0 0 0 2px hsl(0 0% 90%);
}
textarea.prompt {
  min-height: 10rem;
  resize: vertical;
}
.segmented {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(5.5rem, 1fr));
  gap: 0.25rem;
  border: 1px solid hsl(0 0% 90%);
  border-radius: 0.625rem;
  background: hsl(0 0% 96%);
  padding: 0.25rem;
}
button,
.upload-button {
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: 0.5rem;
  background: hsl(0 0% 9%);
  color: #fff;
  padding: 0.55rem 0.8rem;
  cursor: pointer;
  font-weight: 600;
  font: inherit;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}
button:hover,
.upload-button:hover {
  background: hsl(0 0% 18%);
}
button.ghost,
.image-actions button,
.history-item button,
.upload-button,
.preset-grid button,
.segmented button {
  border: 1px solid hsl(0 0% 89%);
  background: hsl(0 0% 100%);
  color: hsl(0 0% 9%);
}
button.ghost:hover,
.image-actions button:hover,
.history-item button:hover,
.upload-button:hover,
.preset-grid button:hover,
.segmented button:hover {
  background: hsl(0 0% 96%);
}
button.active,
.segmented button.active,
.preset-grid button.active {
  border-color: hsl(0 0% 9%);
  background: hsl(0 0% 9%);
  color: #fff;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.upload-button input {
  display: none;
}
.endpoint {
  overflow: hidden;
  border: 1px solid hsl(0 0% 90%);
  border-radius: 0.5rem;
  background: hsl(0 0% 96%);
  padding: 0.45rem 0.65rem;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.preset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}
.preset-grid button {
  justify-items: start;
  gap: 0.15rem;
  text-align: left;
}
.preset-grid small {
  opacity: 0.72;
}
.custom-size {
  border: 1px dashed hsl(0 0% 84%);
  border-radius: 0.75rem;
  padding: 0.8rem;
  background: hsl(0 0% 98%);
}
.validation {
  margin-top: 0.5rem;
  font-weight: 600;
}
.validation.good {
  color: hsl(142 71% 31%);
}
.validation.bad,
.error-box {
  color: #b91c1c;
}
.drop-card,
.mask-row,
.mask-controls,
.actions,
.image-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.drop-card {
  justify-content: space-between;
  border: 1px dashed hsl(0 0% 84%);
  border-radius: 0.75rem;
  background: hsl(0 0% 98%);
  padding: 0.85rem;
}
.mask-tool {
  display: grid;
  gap: 0.75rem;
  border: 1px solid hsl(0 0% 90%);
  border-radius: 0.75rem;
  background: hsl(0 0% 98%);
  padding: 0.85rem;
}
.mask-tool-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
.mask-tool-head p {
  margin-top: 0.25rem;
  color: hsl(0 0% 45%);
  font-size: 0.75rem;
  line-height: 1.5;
}
.mask-stage {
  position: relative;
  overflow: hidden;
  border: 1px solid hsl(0 0% 90%);
  border-radius: 0.75rem;
  background: hsl(0 0% 4%);
}
.mask-stage img,
.mask-canvas {
  display: block;
  width: 100%;
  height: auto;
}
.mask-stage img {
  max-height: 520px;
  object-fit: contain;
}
.mask-canvas {
  position: absolute;
  inset: 0;
  height: 100%;
  cursor: crosshair;
  touch-action: none;
}
.mask-controls label {
  flex: 1 1 180px;
}
.mask-controls input {
  padding: 0;
}
.thumb-grid,
.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.75rem;
}
.thumb,
.image-card {
  overflow: hidden;
  border: 1px solid hsl(0 0% 90%);
  border-radius: 0.75rem;
  background: hsl(0 0% 98%);
}
.thumb img,
.image-button img,
.history-item img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}
.thumb button {
  width: 100%;
  border-radius: 0;
  background: hsl(0 0% 9%);
}
.output-layout {
  display: grid;
  gap: 0.875rem;
}
.large-preview {
  overflow: hidden;
  border: 1px solid hsl(0 0% 90%);
  border-radius: 0.75rem;
  background: hsl(0 0% 4%);
  padding: 0;
}
.large-preview img {
  display: block;
  width: 100%;
  max-height: 58vh;
  object-fit: contain;
}
.image-button {
  width: 100%;
  padding: 0;
  border-radius: 0;
  background: hsl(0 0% 96%);
}
.image-actions {
  padding: 0.5rem;
}
.image-actions button {
  flex: 1 1 auto;
  padding: 0.42rem 0.5rem;
  font-size: 0.75rem;
}
.empty-state,
.empty-mini {
  min-height: 16rem;
  display: grid;
  place-items: center;
  border: 1px dashed hsl(0 0% 84%);
  border-radius: 0.75rem;
  background: hsl(0 0% 98%);
  color: hsl(0 0% 45%);
  font-weight: 600;
}
.empty-mini {
  min-height: 6rem;
}
.history-item {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.7rem;
  border: 1px solid hsl(0 0% 90%);
  border-radius: 0.75rem;
  background: hsl(0 0% 100%);
  padding: 0.5rem;
  cursor: pointer;
}
.history-item.active {
  border-color: hsl(0 0% 9%);
  background: hsl(0 0% 96%);
}
.history-item img {
  border-radius: 0.5rem;
}
.history-item strong,
.history-item span,
.history-item small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pill {
  border-radius: 999px;
  background: hsl(0 0% 96%);
  color: hsl(0 0% 18%);
  padding: 0.3rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 700;
}
.json-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}
pre {
  max-height: 16rem;
  overflow: auto;
  border: 1px solid hsl(0 0% 90%);
  border-radius: 0.75rem;
  background: hsl(0 0% 98%);
  color: hsl(0 0% 18%);
  padding: 0.75rem;
  font-size: 0.75rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.error-box {
  flex: 1 1 100%;
  border: 1px solid hsl(0 84% 85%);
  border-radius: 0.5rem;
  background: hsl(0 86% 97%);
  padding: 0.55rem 0.7rem;
  font-weight: 600;
}
@media (max-width: 1080px) {
  .workspace {
    grid-template-columns: 1fr;
  }
  .hero-stats {
    grid-template-columns: 1fr;
    text-align: center;
  }
}
@media (max-width: 640px) {
  .playground-shell {
    padding: 1rem;
  }
  .field-grid,
  .preset-grid,
  .json-grid,
  .history-item {
    grid-template-columns: 1fr;
  }
  .segmented {
    width: 100%;
  }
}
</style>
