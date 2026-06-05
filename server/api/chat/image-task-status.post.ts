import { defineEventHandler, readBody } from "h3";
import {
  assertProvider,
  buildEndpoint,
  endpointHint,
  extractPreviewUrls,
  fail,
  fetchWithTimeout,
  normalizeTaskStatus,
  providerFromBody,
  readUpstreamJson,
  toPreviewImageUrls,
} from "../../lib/chat-image-proxy";

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) || {};
  const { base, key } = providerFromBody(body);
  const taskId = String(body.taskId || body.task_id || "").trim();

  const providerError = assertProvider(event, base, key);
  if (providerError) return providerError;
  if (!taskId) return fail(event, 400, "BAD_REQUEST", "task id 不能为空。");

  let upstreamUrl = "";

  try {
    upstreamUrl = buildEndpoint(base, `/v1/images/tasks/${encodeURIComponent(taskId)}`);
    const upstream = await fetchWithTimeout(upstreamUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
    });
    const { data, rawText } = await readUpstreamJson(upstream);

    if (!upstream.ok) {
      const isTimeoutStatus = upstream.status === 504;
      return fail(
        event,
        upstream.status,
        isTimeoutStatus ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
        (isTimeoutStatus
          ? "异步图片任务查询超时或上游返回 504，请确认真实运行 API Base。"
          : data?.error?.message || data?.message || rawText || "异步图片任务查询失败。") + endpointHint(upstreamUrl),
        { upstreamStatus: upstream.status, upstreamUrl },
      );
    }

    const { status, progress, failReason } = normalizeTaskStatus(data);
    const images = toPreviewImageUrls(extractPreviewUrls(data));

    return {
      ok: true,
      taskId,
      status,
      progress,
      failReason,
      upstreamUrl,
      images,
      data,
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return fail(
      event,
      isAbort ? 504 : 502,
      isAbort ? "UPSTREAM_TIMEOUT" : "BAD_GATEWAY",
      (isAbort
        ? "异步图片任务查询超时，请确认真实运行 API Base。"
        : "异步图片任务查询代理请求失败：" + (error instanceof Error ? error.message : String(error))) + endpointHint(upstreamUrl),
      upstreamUrl ? { upstreamUrl } : undefined,
    );
  }
});
