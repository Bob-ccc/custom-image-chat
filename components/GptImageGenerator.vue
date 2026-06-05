<script setup lang="ts">
type GptImageMode = "text-to-image" | "image-to-image";
type QualityKey = "low" | "medium" | "high" | "auto";
type RestoreRecord = {
  id: string;
  mode?: string;
  model?: string;
  base?: string;
  prompt?: string;
  size?: string;
  quality?: QualityKey;
  n?: number;
  imageInputValue?: string;
  images?: string[];
  response?: unknown;
  config?: Record<string, unknown>;
};

const props = defineProps<{ embedded?: boolean; restoreRecord?: RestoreRecord | null }>();
const emit = defineEmits<{
  generated: [payload: {
    data: unknown;
    images: string[];
    imageMode: GptImageMode;
    model: string;
    base: string;
    prompt: string;
    size: string;
    quality: QualityKey;
    count: number;
    sourceImages: string[];
    imageEndpoint: string;
  }];
}>();

const API_KEYS_STORAGE_KEY = "goodscheck:chat-api-keys:v1";
const CUSTOM_IMAGE_PROVIDER_STORAGE_KEY = "goodscheck:chat-custom-image-provider:v1";
const DEFAULT_MODEL = "gpt-image-2";
const DEFAULT_BASE_URL = "https://api.openai.com";
const MAX_SOURCE_IMAGES = 10;

const modelOptions = ["gpt-image-2", "gpt-image-2-all", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini", "chatgpt-image-latest"];
const sizeOptions = [
  { value: "1024x1024", label: "1024x1024 · 1K 方图 · 1:1" },
  { value: "1536x1024", label: "1536x1024 · 1K 横图 · 3:2" },
  { value: "1024x1536", label: "1024x1536 · 1K 竖图 · 2:3" },
  { value: "2048x2048", label: "2048x2048 · 2K 方图 · 1:1" },
  { value: "2048x1152", label: "2048x1152 · 2K 横图 · 16:9" },
  { value: "3840x2160", label: "3840x2160 · 4K 横图 · 16:9" },
  { value: "2160x3840", label: "2160x3840 · 4K 竖图 · 9:16" },
  { value: "auto", label: "auto · 自动默认" },
];
const qualityOptions: QualityKey[] = ["auto", "low", "medium", "high"];

const imageMode = ref<GptImageMode>("text-to-image");
const apiKey = ref("");
const baseUrl = ref(DEFAULT_BASE_URL);
const model = ref(DEFAULT_MODEL);
const prompt = ref("");
const size = ref("1024x1024");
const quality = ref<QualityKey>("auto");
const count = ref(1);
const sourceImages = ref([""]);
const loading = ref(false);
const errorMessage = ref("");
const responseJson = ref<unknown>(null);
const previewUrls = ref<string[]>([]);

const endpointPath = computed(() => imageMode.value === "image-to-image" ? "/v1/images/edits" : "/v1/images/generations");
const endpointPreview = computed(() => buildEndpoint(baseUrl.value, endpointPath.value));
const cleanSourceImages = computed(() => {
  return Array.from(new Set(sourceImages.value.map((url: string) => url.trim()).filter(Boolean))).slice(0, MAX_SOURCE_IMAGES);
});
const requestJson = computed(() => JSON.stringify({
  mode: imageMode.value === "image-to-image" ? "edit" : "generation",
  provider: {
    base: baseUrl.value.trim(),
    imageEndpoint: endpointPath.value,
    key: apiKey.value ? "Bearer ***REDACTED***" : "",
    model: model.value.trim(),
  },
  prompt: prompt.value,
  size: size.value,
  quality: quality.value,
  n: count.value,
  image: imageMode.value === "image-to-image" ? cleanSourceImages.value : undefined,
}, null, 2));
const responseText = computed(() => responseJson.value ? JSON.stringify(responseJson.value, null, 2) : "");
const responseStatus = computed(() => {
  const value = responseJson.value as { ok?: boolean } | null;
  return value?.ok === true ? "ok" : value?.ok === false ? "error" : "idle";
});

onMounted(() => {
  loadStoredProvider();
  applyRestoreRecord(props.restoreRecord);
  window.addEventListener("chat:use-resource-image", handleResourceImageEvent);
});

onBeforeUnmount(() => {
  window.removeEventListener("chat:use-resource-image", handleResourceImageEvent);
});

watch([apiKey, baseUrl, imageMode], persistStoredProvider);
watch(() => props.restoreRecord?.id, () => {
  applyRestoreRecord(props.restoreRecord);
});

function handleResourceImageEvent(event: Event) {
  const url = String((event as CustomEvent<{ url?: string }>).detail?.url || "").trim();
  if (!url) return;
  appendSourceImage(url);
}

function readStoredApiKeys(): Record<string, string> {
  if (!import.meta.client) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(API_KEYS_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredApiKeys(keys: Record<string, string>) {
  if (!import.meta.client) return;
  localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
}

function loadStoredProvider() {
  if (!import.meta.client) return;
  try {
    const keys = readStoredApiKeys();
    apiKey.value = keys["custom-image"] || "";
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_IMAGE_PROVIDER_STORAGE_KEY) || "{}");
    baseUrl.value = String(parsed?.base || DEFAULT_BASE_URL);
    imageMode.value = parsed?.mode === "image-to-image" ? "image-to-image" : "text-to-image";
  } catch {}
}

function persistStoredProvider() {
  if (!import.meta.client) return;
  try {
    const keys = readStoredApiKeys();
    keys["custom-image"] = apiKey.value.trim();
    writeStoredApiKeys(keys);
    localStorage.setItem(CUSTOM_IMAGE_PROVIDER_STORAGE_KEY, JSON.stringify({
      base: baseUrl.value.trim(),
      mode: imageMode.value,
    }));
  } catch {}
}

function recordConfigString(config: Record<string, unknown>, key: string, fallback = "") {
  const value = config[key];
  return typeof value === "string" ? value : fallback;
}

function recordConfigStringArray(config: Record<string, unknown>, key: string) {
  return Array.isArray(config[key]) ? (config[key] as unknown[]).map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function applyRestoreRecord(record?: RestoreRecord | null) {
  if (!record) return;
  const config = record.config || {};
  imageMode.value = config.customImageMode === "image-to-image" || record.mode === "edit" ? "image-to-image" : "text-to-image";
  baseUrl.value = recordConfigString(config, "customImageBaseUrl", record.base || baseUrl.value);
  model.value = record.model || model.value;
  prompt.value = record.prompt || "";
  size.value = record.size || size.value;
  quality.value = record.quality || quality.value;
  count.value = Number.isFinite(Number(record.n)) ? Number(record.n) : count.value;
  const restoredImages = recordConfigStringArray(config, "generationImageUrls");
  const legacyImages = String(record.imageInputValue || "").split(/\n+/).map((url: string) => url.trim()).filter(Boolean);
  const nextImages = restoredImages.length ? restoredImages : legacyImages;
  sourceImages.value = nextImages.length ? [...nextImages, ""].slice(0, MAX_SOURCE_IMAGES) : [""];
  responseJson.value = record.response ?? null;
  previewUrls.value = Array.isArray(record.images) ? [...record.images] : [];
  errorMessage.value = "";
}

function buildEndpoint(baseRaw: string, path: string) {
  const base = baseRaw.trim().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : "/" + path;
  if (!base) return normalizedPath;
  if (/\/v[12]$/i.test(base) && /^\/v[12]\//i.test(normalizedPath)) {
    return base.replace(/\/v[12]$/i, "") + normalizedPath;
  }
  if (base.endsWith(normalizedPath)) return base;
  const withoutKnownEndpoint = base.replace(/\/v[12]\/(?:images\/(?:generations|edits)|chat\/completions)$/i, "");
  return withoutKnownEndpoint + normalizedPath;
}

function addSourceImage() {
  if (sourceImages.value.length >= MAX_SOURCE_IMAGES) return;
  sourceImages.value = [...sourceImages.value, ""];
}

function appendSourceImage(url: string) {
  imageMode.value = "image-to-image";
  const current = sourceImages.value.map((item: string) => item.trim());
  const existingIndex = current.findIndex(Boolean);
  if (current.includes(url)) return;
  const emptyIndex = current.findIndex((item: string) => !item);
  if (emptyIndex >= 0) {
    const next = [...sourceImages.value];
    next[emptyIndex] = url;
    sourceImages.value = next;
    return;
  }
  if (sourceImages.value.length < MAX_SOURCE_IMAGES) {
    sourceImages.value = [...sourceImages.value, url];
    return;
  }
  if (existingIndex >= 0) {
    const next = [...sourceImages.value];
    next[existingIndex] = url;
    sourceImages.value = next;
  }
}

function removeSourceImage(index: number) {
  if (sourceImages.value.length <= 1) {
    sourceImages.value = [""];
    return;
  }
  sourceImages.value = sourceImages.value.filter((_item: string, itemIndex: number) => itemIndex !== index);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败。"));
    reader.readAsDataURL(file);
  });
}

async function handleFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  if (!files.length) return;
  try {
    const available = Math.max(0, MAX_SOURCE_IMAGES - cleanSourceImages.value.length);
    const dataUrls = await Promise.all(files.slice(0, available).map(fileToDataUrl));
    const current = sourceImages.value.map((url: string) => url.trim()).filter(Boolean);
    sourceImages.value = [...current, ...dataUrls, ""].slice(0, MAX_SOURCE_IMAGES);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    input.value = "";
  }
}

function resetForm() {
  imageMode.value = "text-to-image";
  model.value = DEFAULT_MODEL;
  prompt.value = "";
  size.value = "1024x1024";
  quality.value = "auto";
  count.value = 1;
  sourceImages.value = [""];
  errorMessage.value = "";
  responseJson.value = null;
  previewUrls.value = [];
}

function displayImageUrl(url: string) {
  const value = String(url || "").trim();
  if (!/^http:\/\//i.test(value)) return value;
  return "/api/chat/image-preview?url=" + encodeURIComponent(value);
}

async function submit() {
  errorMessage.value = "";
  responseJson.value = null;
  previewUrls.value = [];
  if (!prompt.value.trim()) {
    errorMessage.value = "提示词不能为空。";
    return;
  }
  if (!apiKey.value.trim()) {
    errorMessage.value = "API Key 不能为空。";
    return;
  }
  if (!baseUrl.value.trim()) {
    errorMessage.value = "API Base 不能为空。";
    return;
  }
  if (imageMode.value === "image-to-image" && !cleanSourceImages.value.length) {
    errorMessage.value = "图生图需要至少 1 张输入图片。";
    return;
  }
  loading.value = true;
  try {
    const payload: Record<string, unknown> = {
      mode: imageMode.value === "image-to-image" ? "edit" : "generation",
      provider: {
        base: baseUrl.value.trim(),
        imageEndpoint: endpointPath.value,
        key: apiKey.value.trim(),
        model: model.value.trim(),
      },
      prompt: prompt.value,
      size: size.value,
      quality: quality.value,
      n: count.value,
      b64_json: false,
    };
    if (imageMode.value === "image-to-image") payload.image = cleanSourceImages.value;
    const response = await fetch("/api/chat/image-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    responseJson.value = data;
    previewUrls.value = Array.isArray(data?.images) ? data.images : [];
    if (!response.ok || data?.ok === false) {
      errorMessage.value = data?.error?.message || "生成失败。";
    } else if (previewUrls.value.length) {
      emit("generated", {
        data,
        images: previewUrls.value,
        imageMode: imageMode.value,
        model: model.value.trim(),
        base: baseUrl.value.trim(),
        prompt: prompt.value,
        size: size.value,
        quality: quality.value,
        count: Number(count.value) || 1,
        sourceImages: cleanSourceImages.value,
        imageEndpoint: endpointPath.value,
      });
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="gpt-image-page" :class="{ embedded: props.embedded }">
    <form class="gpt-image-workbench" @submit.prevent="submit">
      <section class="panel provider-panel">
        <div class="panel-title">
          <h1>gpt生图</h1>
          <span>{{ imageMode === "image-to-image" ? "图生图" : "文生图" }}</span>
        </div>
        <label>
          <span>模型</span>
          <select v-model="model">
            <option v-for="item in modelOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label>
          <span>API Key</span>
          <input v-model="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-..." />
        </label>
        <label>
          <span>API Base</span>
          <input v-model="baseUrl" autocomplete="off" spellcheck="false" placeholder="https://api.openai.com" />
        </label>
        <div class="segmented">
          <button type="button" :class="{ active: imageMode === 'text-to-image' }" @click="imageMode = 'text-to-image'">文生图</button>
          <button type="button" :class="{ active: imageMode === 'image-to-image' }" @click="imageMode = 'image-to-image'">图生图</button>
        </div>
      </section>

      <section class="panel input-panel">
        <label class="prompt-field">
          <span>提示词</span>
          <textarea v-model="prompt" rows="6" maxlength="5000" />
        </label>
        <div v-if="imageMode === 'image-to-image'" class="source-list">
          <div v-for="(_item, index) in sourceImages" :key="index" class="source-row">
            <label>
              <span>输入图片 {{ index + 1 }}</span>
              <input v-model="sourceImages[index]" autocomplete="off" spellcheck="false" placeholder="https://... 或 data:image/..." />
            </label>
            <button type="button" class="secondary compact" @click="removeSourceImage(index)">移除</button>
          </div>
          <div class="source-actions">
            <button type="button" class="secondary" :disabled="sourceImages.length >= MAX_SOURCE_IMAGES" @click="addSourceImage">添加图片</button>
            <label class="upload-button">
              <input type="file" accept="image/*" multiple @change="handleFiles" />
              上传图片
            </label>
          </div>
        </div>
      </section>

      <section class="panel params-panel">
        <label>
          <span>尺寸</span>
          <select v-model="size">
            <option v-for="item in sizeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label>
          <span>质量</span>
          <select v-model="quality">
            <option v-for="item in qualityOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <label>
          <span>数量</span>
          <input v-model.number="count" type="number" min="1" max="10" />
        </label>
        <div class="actions">
          <button type="button" class="secondary" :disabled="loading" @click="resetForm">重置</button>
          <button type="submit" :disabled="loading">{{ loading ? "生成中..." : "生成" }}</button>
        </div>
        <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
      </section>
    </form>

    <aside class="gpt-image-preview">
      <section class="panel result-panel">
        <div class="panel-title">
          <h2>结果预览</h2>
          <span>{{ previewUrls.length || "idle" }}</span>
        </div>
        <div v-if="loading" class="empty-state">生成中...</div>
        <div v-else-if="previewUrls.length" class="image-grid">
          <a v-for="url in previewUrls" :key="url" :href="displayImageUrl(url)" target="_blank" rel="noreferrer">
            <img :src="displayImageUrl(url)" alt="Generated image" />
          </a>
        </div>
        <div v-else class="empty-state">生成后在这里预览</div>
      </section>

      <section v-if="!props.embedded" class="panel json-panel">
        <div class="panel-title">
          <h2>请求 JSON</h2>
          <span>{{ endpointPreview }}</span>
        </div>
        <pre>{{ requestJson }}</pre>
      </section>

      <section v-if="!props.embedded" class="panel json-panel">
        <div class="panel-title">
          <h2>响应 JSON</h2>
          <span>{{ responseStatus }}</span>
        </div>
        <pre>{{ responseText || "未开始" }}</pre>
      </section>
    </aside>
  </main>
</template>

<style scoped>
.gpt-image-page {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(360px, 0.92fr) minmax(0, 1.08fr);
  gap: 14px;
  padding: 18px;
  background:
    radial-gradient(circle at 12% 8%, rgba(96, 165, 250, 0.18), transparent 32%),
    linear-gradient(135deg, #f8fafc 0%, #eef2ff 44%, #f8fafc 100%);
  color: #0f172a;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.gpt-image-page.embedded {
  min-height: 0;
  grid-column: 1 / -1;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
  align-items: start;
  padding: 0;
  background: transparent;
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
.gpt-image-workbench,
.gpt-image-preview,
.panel,
.source-list {
  display: grid;
  gap: 10px;
}
.panel {
  min-width: 0;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 22px 70px rgba(15, 23, 42, 0.08);
  padding: 14px;
  backdrop-filter: blur(18px);
}
.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
h1,
h2,
p,
pre {
  margin: 0;
}
h1,
h2 {
  font-size: 16px;
}
.panel-title span {
  min-width: 0;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
  padding: 4px 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 900;
}
label {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 13px;
  font-weight: 800;
}
input,
textarea,
select {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.86);
  color: #0f172a;
  padding: 9px 11px;
  font: inherit;
  outline: none;
}
textarea {
  min-height: 132px;
  resize: vertical;
}
.provider-panel,
.params-panel {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: end;
}
.provider-panel .panel-title,
.params-panel .panel-title,
.params-panel .actions,
.params-panel .error-box {
  grid-column: 1 / -1;
}
.segmented {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.segmented button {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(255, 255, 255, 0.84);
  color: #334155;
}
.segmented button.active {
  border-color: rgba(37, 99, 235, 0.46);
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  box-shadow: 0 12px 26px rgba(37, 99, 235, 0.2);
}
button,
.upload-button {
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  padding: 10px 14px;
  cursor: pointer;
  font-weight: 900;
}
button.secondary,
.upload-button {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(255, 255, 255, 0.84);
  color: #0f172a;
}
button.active {
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
}
button.compact {
  align-self: end;
  padding: 8px 10px;
  font-size: 12px;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.source-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.7);
  padding: 10px;
}
.source-actions,
.actions {
  display: flex;
  gap: 8px;
}
.upload-button input {
  display: none;
}
.error-box {
  border: 1px solid rgba(220, 38, 38, 0.22);
  border-radius: 12px;
  background: rgba(254, 242, 242, 0.88);
  color: #b91c1c;
  padding: 8px 10px;
  line-height: 1.5;
}
.empty-state {
  min-height: 240px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background:
    linear-gradient(45deg, rgba(148, 163, 184, 0.14) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(148, 163, 184, 0.14) 25%, transparent 25%),
    #f8fafc;
  background-size: 22px 22px;
  color: #64748b;
}
.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}
.image-grid a {
  display: block;
  overflow: hidden;
  border-radius: 16px;
  background: #e2e8f0;
}
.image-grid img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}
.json-panel pre {
  max-height: 240px;
  overflow: auto;
  border-radius: 14px;
  background: #0f172a;
  color: #dbeafe;
  padding: 12px;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
@media (max-width: 900px) {
  .gpt-image-page {
    grid-template-columns: 1fr;
    padding: 12px;
  }
}
@media (max-width: 560px) {
  .provider-panel,
  .params-panel,
  .source-row {
    grid-template-columns: 1fr;
  }
  .actions,
  .source-actions {
    flex-direction: column;
  }
}
</style>
