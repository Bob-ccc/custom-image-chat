import { createError, defineEventHandler, getQuery } from "h3";
import { fetchWithTimeout } from "../../lib/chat-image-proxy";

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (host.includes(":") && (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:"))) return true;
  return false;
}

function parseImageUrl(raw: unknown) {
  const value = String(raw || "").trim();
  if (!value) {
    throw createError({ statusCode: 400, message: "图片 URL 不能为空。", data: { code: "IMAGE_PREVIEW_URL_REQUIRED" } });
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw createError({ statusCode: 400, message: "图片 URL 格式不合法。", data: { code: "IMAGE_PREVIEW_URL_INVALID" } });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw createError({ statusCode: 400, message: "图片预览代理仅支持 http(s) URL。", data: { code: "IMAGE_PREVIEW_PROTOCOL_UNSUPPORTED" } });
  }
  if (isBlockedHost(url.hostname)) {
    throw createError({ statusCode: 400, message: "图片预览代理不支持本机或内网地址。", data: { code: "IMAGE_PREVIEW_PRIVATE_HOST_BLOCKED" } });
  }
  return url.toString();
}

export default defineEventHandler(async (event) => {
  const sourceUrl = parseImageUrl(getQuery(event).url);
  const upstream = await fetchWithTimeout(sourceUrl, {
    method: "GET",
    headers: { Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" },
  });
  if (!upstream.ok) {
    throw createError({ statusCode: upstream.status, message: `图片预览代理读取失败：HTTP ${upstream.status}` });
  }
  const contentType = upstream.headers.get("content-type") || "image/*";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw createError({ statusCode: 415, message: "图片预览代理读取到的不是图片。", data: { code: "IMAGE_PREVIEW_UNSUPPORTED_TYPE", contentType } });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=600",
    },
  });
});
