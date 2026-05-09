import { defineEventHandler, readBody } from "h3";
import {
  assertProvider,
  buildEndpoint,
  endpointHint,
  extractVideoUrls,
  fail,
  fetchWithTimeout,
  normalizeTaskStatus,
  providerFromBody,
  readUpstreamJson,
  withQuery,
} from "../../lib/chat-image-proxy";

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) || {};
  const { base, key } = providerFromBody(body);
  const taskId = String(body.taskId || body.task_id || "").trim();
  const channel = String(body.channel || body.videoChannel || "").trim();
  const grokOpenAIChannel = ["grok", "sora", "grok-openai"].includes(channel);
  const grokUnifiedChannel = ["grok-unified", "xai-video"].includes(channel);
  const veoUnifiedChannel = ["veo-unified", "yunwu-veo-unified"].includes(channel);
  const veoOpenAIChannel = ["veo-openai", "yunwu-veo-openai"].includes(channel);
  const zhipuCogVideoChannel = ["zhipu-cogvideo", "zhipu", "cogvideox", "cogvideox-3"].includes(channel);
  const yunwuUnifiedChannel = grokUnifiedChannel || veoUnifiedChannel;

  const providerError = assertProvider(event, base, key);
  if (providerError) return providerError;
  if (!taskId) return fail(event, 400, "BAD_REQUEST", "task id 不能为空。");

  let upstreamUrl = "";

  try {
    upstreamUrl = buildEndpoint(
      base,
      zhipuCogVideoChannel
        ? `/async-result/${encodeURIComponent(taskId)}`
        : veoOpenAIChannel
        ? `/v1/videos/${encodeURIComponent(taskId)}`
        : yunwuUnifiedChannel
        ? "/v1/video/query"
        : grokOpenAIChannel
          ? "/v1/video/query"
          : `/v2/videos/generations/${encodeURIComponent(taskId)}`,
    );
    const upstream = yunwuUnifiedChannel || grokOpenAIChannel
      ? await fetchWithTimeout(withQuery(upstreamUrl, { id: taskId }), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${key}`,
          },
        })
      : await fetchWithTimeout(upstreamUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
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
          ? "视频任务查询超时或上游返回 504，请确认真实运行 API Base。"
          : data?.error?.message || data?.message || rawText || "视频任务查询失败。") + endpointHint(upstreamUrl),
        { upstreamStatus: upstream.status, upstreamUrl },
      );
    }

    const { status, progress, failReason } = normalizeTaskStatus(data);
    const videos = extractVideoUrls(data);

    return {
      ok: true,
      taskId,
      status,
      progress,
      failReason,
      upstreamUrl,
      videos,
      data,
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return fail(
      event,
      isAbort ? 504 : 502,
      isAbort ? "UPSTREAM_TIMEOUT" : "BAD_GATEWAY",
      (isAbort
        ? "视频任务查询超时，请确认真实运行 API Base。"
        : "视频任务查询代理请求失败：" + (error instanceof Error ? error.message : String(error))) + endpointHint(upstreamUrl),
      upstreamUrl ? { upstreamUrl } : undefined,
    );
  }
});
