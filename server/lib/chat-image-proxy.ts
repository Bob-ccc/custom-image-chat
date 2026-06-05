import { setResponseStatus } from "h3";
import type { H3Event } from "h3";
import { ProxyAgent } from "undici";

export const UPSTREAM_TIMEOUT_MS = 20 * 60 * 1000;
export const APIFOX_DOC_HOST = "value-apiqk.apifox.cn";
export const SUPPORTED_QUALITIES = new Set(["low", "medium", "high", "auto"]);

const IMAGE_URL_RE = /https?:\/\/[^\s"'()[\]<>]+?\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'()[\]<>]*)?/gi;
const VIDEO_URL_RE = /https?:\/\/[^\s"'()[\]<>]+?\.(?:mp4|webm|mov|m4v)(?:\?[^\s"'()[\]<>]*)?/gi;
const STRUCTURED_IMAGE_URL_KEY_RE = /^(?:url|image|image_url|imageUrl|output|output_url|outputUrl|result|result_url|resultUrl|displayUrl|localUrl|externalUrl|assetUrl|thumbnailUrl|coverUrl)$/i;
const STRUCTURED_VIDEO_URL_KEY_RE = /^(?:url|video_url|videoUrl|video|output|result|video_url_hd|videoUrlHd|play_url|playUrl|download_url|downloadUrl)$/i;
const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi;
const MARKDOWN_LINK_RE = /\[[^\]]+]\((https?:\/\/[^)\s]+)\)/gi;
let cachedProxyUrl = "";
let cachedProxyAgent: ProxyAgent | null = null;

export function fail(
  event: H3Event,
  statusCode: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  setResponseStatus(event, statusCode);
  return {
    ok: false,
    error: {
      code,
      message,
      ...(extra || {}),
    },
  };
}

export function normalizeBearerToken(raw: unknown) {
  let value = String(raw == null ? "" : raw);
  value = value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  value = value.replace(/^Bearer\s+/i, "");
  value = value.replace(/^["'`\u2018\u2019\u201C\u201D\u300C\u300D\u300E\u300F\uFF02\uFF07]+/, "");
  value = value.replace(/["'`\u2018\u2019\u201C\u201D\u300C\u300D\u300E\u300F\uFF02\uFF07]+$/, "");
  return value.replace(/\s+/g, "");
}

export function assertHeaderLatin1(label: string, value: string) {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 255) {
      throw new Error(`${label} 包含中文或其他非常规字符，无法写入请求头。`);
    }
  }
}

export function trimBase(baseRaw: unknown) {
  return String(baseRaw || "").trim().replace(/\/+$/, "");
}

export function buildEndpoint(baseRaw: unknown, path: string) {
  const base = trimBase(baseRaw);
  if (!base) return "";
  const normalizedPath = path.startsWith("/") ? path : "/" + path;
  if (base.endsWith(normalizedPath)) return base;
  const withoutKnownEndpoint = base
    .replace(/\/v[12]\/(?:(?:images|videos)\/(?:generations(?:\/[^/]+)?|edits|tasks\/[^/]+)|video\/(?:create|query|generations)|videos(?:\/[^/]+)?|chat\/completions)$/i, "")
    .replace(/\/ent\/v2\/(?:img2video|start-end2video|tasks\/[^/]+\/creations)$/i, "");
  return withoutKnownEndpoint + normalizedPath;
}

export function buildCustomEndpoint(baseRaw: unknown, endpointRaw: unknown) {
  const endpoint = String(endpointRaw || "").trim();
  if (!endpoint) return "";
  if (/^https?:\/\//i.test(endpoint)) return trimBase(endpoint);
  const base = trimBase(baseRaw);
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : "/" + endpoint;
  if (/\/v[12]$/i.test(base) && /^\/v[12]\//i.test(normalizedEndpoint)) {
    return base.replace(/\/v[12]$/i, "") + normalizedEndpoint;
  }
  return buildEndpoint(base, normalizedEndpoint);
}

export function withQuery(endpoint: string, params: Record<string, string>) {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export function isApifoxDocumentationUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.hostname === APIFOX_DOC_HOST;
  } catch {
    return value.includes(APIFOX_DOC_HOST);
  }
}

export function endpointHint(upstreamUrl: string) {
  if (!isApifoxDocumentationUrl(upstreamUrl)) return "";
  return " 当前请求地址看起来使用了 Apifox 文档域名，请确认真实运行 API Base 后重试。";
}

export function toPositiveInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function normalizeQuality(value: unknown) {
  const requestedQuality = String(value || "auto").trim();
  return SUPPORTED_QUALITIES.has(requestedQuality) ? requestedQuality : "auto";
}

export function isDataUrl(value: string) {
  return /^data:[^;,]+;base64,/i.test(value);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function inferImageMimeType(base64: string) {
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  return "image/png";
}

export function b64JsonToDataUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isDataUrl(raw)) return raw;
  return `data:${inferImageMimeType(raw)};base64,${raw}`;
}

export function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] || "application/octet-stream" });
}

export async function imageSourceToBlob(source: string) {
  const value = source.trim();
  if (!value) return null;
  if (isDataUrl(value)) return dataUrlToBlob(value);
  if (/^https?:\/\//i.test(value)) {
    const response = await fetch(value);
    if (!response.ok) {
      throw new Error(`读取输入图片失败：HTTP ${response.status}`);
    }
    return await response.blob();
  }
  return null;
}

function extractTextContent(value: unknown): string[] {
  const found: string[] = [];
  if (typeof value === "string") {
    found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) found.push(...extractTextContent(item));
    return found;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) found.push(...extractTextContent(item));
  }
  return found;
}

function collectImageFields(value: unknown, urls: string[]) {
  if (Array.isArray(value)) {
    for (const item of value) collectImageFields(item, urls);
    return;
  }
  if (typeof value === "string") {
    const raw = value.trim();
    if (isDataUrl(raw) || isHttpUrl(raw)) urls.push(raw);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const b64Url = b64JsonToDataUrl(record.b64_json);
  if (b64Url) urls.push(b64Url);
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === "string") {
      const raw = item.trim();
      if (STRUCTURED_IMAGE_URL_KEY_RE.test(key) && (isDataUrl(raw) || isHttpUrl(raw))) {
        urls.push(raw);
      }
    }
    collectImageFields(item, urls);
  }
}

function collectVideoFields(value: unknown, urls: string[]) {
  if (Array.isArray(value)) {
    for (const item of value) collectVideoFields(item, urls);
    return;
  }
  if (typeof value === "string") {
    for (const match of value.matchAll(VIDEO_URL_RE)) {
      if (match[0]) urls.push(match[0]);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === "string") {
      const raw = item.trim();
      if (STRUCTURED_VIDEO_URL_KEY_RE.test(key) && isHttpUrl(raw)) {
        urls.push(raw);
      }
      VIDEO_URL_RE.lastIndex = 0;
    }
    collectVideoFields(item, urls);
  }
}

export function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function extractPreviewUrls(data: unknown) {
  const urls: string[] = [];
  collectImageFields(data, urls);
  const text = extractTextContent(data).join("\n");
  for (const match of text.matchAll(MARKDOWN_IMAGE_RE)) {
    if (match[1]) urls.push(match[1]);
  }
  for (const match of text.matchAll(IMAGE_URL_RE)) {
    if (match[0]) urls.push(match[0]);
  }
  return unique(urls);
}

export function toPreviewImageUrl(url: string) {
  const value = String(url || "").trim();
  if (!/^http:\/\//i.test(value)) return value;
  return "/api/chat/image-preview?url=" + encodeURIComponent(value);
}

export function toPreviewImageUrls(urls: string[]) {
  return urls.map(toPreviewImageUrl);
}

export function extractVideoUrls(data: unknown) {
  const urls: string[] = [];
  collectVideoFields(data, urls);
  const text = extractTextContent(data).join("\n");
  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    if (match[1] && VIDEO_URL_RE.test(match[1])) urls.push(match[1]);
    VIDEO_URL_RE.lastIndex = 0;
  }
  for (const match of text.matchAll(VIDEO_URL_RE)) {
    if (match[0]) urls.push(match[0]);
  }
  return unique(urls);
}

async function readResponseTextLenient(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } catch (error) {
    if (!chunks.length) throw error;
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}

export async function readUpstreamJson(response: Response) {
  const rawText = await readResponseTextLenient(response);
  if (!rawText) return { data: null, rawText: "" };
  try {
    return { data: JSON.parse(rawText), rawText };
  } catch {
    return { data: null, rawText };
  }
}

function getUpstreamProxyUrl() {
  const config = useRuntimeConfig();
  return String(config.upstreamProxy || "").trim();
}

function getUpstreamProxyDispatcher() {
  const proxyUrl = getUpstreamProxyUrl();
  if (!proxyUrl) return undefined;
  if (proxyUrl !== cachedProxyUrl || !cachedProxyAgent) {
    cachedProxyUrl = proxyUrl;
    cachedProxyAgent = new ProxyAgent(proxyUrl);
  }
  return cachedProxyAgent;
}

export async function fetchWithTimeout(endpoint: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const dispatcher = getUpstreamProxyDispatcher();
    return await fetch(endpoint, { ...init, signal: controller.signal, ...(dispatcher ? { dispatcher } : {}) } as RequestInit);
  } finally {
    clearTimeout(timeout);
  }
}

export async function postJson(endpoint: string, key: string, payload: Record<string, unknown>) {
  return await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "identity",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });
}

export function findFirstStringByKey(value: unknown, keys: string[]): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstStringByKey(item, keys);
      if (found) return found;
    }
    return "";
  }
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    if (typeof direct === "number" && Number.isFinite(direct)) return String(direct);
  }
  for (const item of Object.values(record)) {
    const found = findFirstStringByKey(item, keys);
    if (found) return found;
  }
  return "";
}

export function extractTaskId(data: unknown) {
  if (typeof data === "string") return data.trim();
  if (data && typeof data === "object") {
    const root = data as Record<string, unknown>;
    if (typeof root.data === "string") return root.data.trim();
    return findFirstStringByKey(data, ["request_id", "requestId", "task_id", "taskId", "id"]);
  }
  return "";
}

export function normalizeTaskStatus(data: unknown) {
  const rawStatus = findFirstStringByKey(data, ["status", "state", "task_status", "taskStatus"]) || "IN_PROGRESS";
  const normalizedStatus = rawStatus.toLowerCase();
  const status = normalizedStatus === "complete" || normalizedStatus === "completed" || normalizedStatus === "done" || normalizedStatus === "succeeded" || normalizedStatus === "success" ? "SUCCESS"
    : normalizedStatus === "failed" || normalizedStatus === "fail" || normalizedStatus === "failure" || normalizedStatus === "expired" || normalizedStatus === "error" || normalizedStatus === "cancelled" || normalizedStatus === "canceled" ? "FAILURE"
      : normalizedStatus === "queued" || normalizedStatus === "in_progress" || normalizedStatus === "processing" || normalizedStatus === "pending" || normalizedStatus === "running" ? "IN_PROGRESS"
        : rawStatus;
  const progress = findFirstStringByKey(data, ["progress"]);
  const failReason = findFirstStringByKey(data, ["fail_reason", "failReason", "error_message", "errorMessage", "reason", "message", "error"]);
  return { status, progress, failReason };
}

export function providerFromBody(body: Record<string, unknown>) {
  const provider = body.provider && typeof body.provider === "object" ? body.provider as Record<string, unknown> : {};
  return {
    base: trimBase(provider.base),
    imageEndpoint: String(provider.imageEndpoint || provider.endpoint || "").trim(),
    key: normalizeBearerToken(provider.key),
    model: String(provider.model || body.model || "").trim(),
  };
}

export function assertProvider(event: H3Event, base: string, key: string, model?: string) {
  if (!base) return fail(event, 400, "BAD_REQUEST", "接口地址不能为空。");
  if (!key) return fail(event, 400, "BAD_REQUEST", "API Key 不能为空。");
  if (model != null && !model) return fail(event, 400, "BAD_REQUEST", "模型不能为空。");
  try {
    assertHeaderLatin1("API Key", key);
  } catch (error) {
    return fail(event, 400, "BAD_REQUEST", error instanceof Error ? error.message : String(error));
  }
  return null;
}
