import { defineEventHandler, readBody } from "h3";
import {
  assertProvider,
  buildEndpoint,
  endpointHint,
  fail,
  fetchWithTimeout,
  providerFromBody,
  readUpstreamJson,
} from "../../lib/chat-image-proxy";

const SUPPORTED_ZHIPU_MODELS = new Set(["glm-4.7", "glm-4.6v", "glm-4.5-air"]);
const SUPPORTED_OPENAI_MODELS = new Set(["gpt-5.5", "gpt-5.1", "gpt-4o"]);
const SUPPORTED_ROLES = new Set(["system", "user", "assistant"]);
type DialogueProviderName = "chatgpt" | "zhipu";

function sanitizeMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const role = String(record.role || "").trim();
      const content = String(record.content || "").trim();
      if (!SUPPORTED_ROLES.has(role) || !content) return null;
      return { role, content };
    })
    .filter(Boolean)
    .slice(-50);
}

function parseJsonOrNull(rawText: string) {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function textPart(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textPart).filter(Boolean).join("");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "output_text", "outputText"]) {
      const text = textPart(record[key]);
      if (text) return text;
    }
  }
  return "";
}

function providerNameFromBody(body: Record<string, unknown>): DialogueProviderName {
  return body.providerName === "chatgpt" ? "chatgpt" : "zhipu";
}

function normalizeChatCompletionDeltaPayload(data: any) {
  const choice = data?.choices?.[0] || {};
  const source = choice.delta || choice.message || data?.delta || data || {};
  const content = textPart(source.content || data?.content || choice.text || data?.output_text || data?.outputText);
  const reasoning = textPart(
    source.reasoning_content ||
    source.reasoningContent ||
    source.reasoning ||
    data?.reasoning_content ||
    data?.reasoningContent ||
    data?.reasoning,
  );
  if (!content && !reasoning) return null;
  return { content, reasoningContent: reasoning };
}

function normalizeResponsesDeltaPayload(data: any) {
  const eventType = String(data?.type || "");
  const content = eventType === "response.output_text.delta" ? textPart(data?.delta) : "";
  const reasoning = eventType === "response.reasoning_summary_text.delta" ? textPart(data?.delta) : "";
  if (!content && !reasoning) return null;
  return { content, reasoningContent: reasoning };
}

function responsesStreamErrorMessage(data: any) {
  const eventType = String(data?.type || "");
  if (eventType !== "response.failed" && eventType !== "error") return "";
  return data?.response?.error?.message || data?.error?.message || data?.message || "OpenAI Responses 流式响应失败。";
}

function sseFrame(data: unknown) {
  return `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`;
}

function nextSseSeparator(buffer: string) {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf < 0 && crlf < 0) return null;
  if (lf < 0) return { index: crlf, length: 4 };
  if (crlf < 0) return { index: lf, length: 2 };
  return lf < crlf ? { index: lf, length: 2 } : { index: crlf, length: 4 };
}

function upstreamErrorMessage(data: any, rawText: string) {
  return data?.error?.message || data?.message || rawText || "对话请求失败。";
}

function openAIResponsesPayload(model: string, messages: Array<{ role: string; content: string }>) {
  const payload: Record<string, unknown> = {
    model,
    input: messages,
    stream: true,
    store: false,
  };
  if (model.startsWith("gpt-5")) {
    payload.reasoning = { summary: "auto" };
  }
  return payload;
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) || {};
  const providerName = providerNameFromBody(body as Record<string, unknown>);
  const { base, key, model } = providerFromBody(body);
  const messages = sanitizeMessages((body as Record<string, unknown>).messages);

  const providerError = assertProvider(event, base, key, model);
  if (providerError) return providerError;
  if (providerName === "chatgpt" && !SUPPORTED_OPENAI_MODELS.has(model)) {
    return fail(event, 400, "UNSUPPORTED_MODEL", "ChatGPT 对话仅支持 gpt-5.5、gpt-5.1、gpt-4o。");
  }
  if (providerName === "zhipu" && !SUPPORTED_ZHIPU_MODELS.has(model)) {
    return fail(event, 400, "UNSUPPORTED_MODEL", "智谱对话仅支持 glm-4.7、glm-4.6v、glm-4.5-air。");
  }
  if (!messages.length) return fail(event, 400, "BAD_REQUEST", "消息不能为空。");

  const upstreamUrl = buildEndpoint(base, providerName === "chatgpt" ? "/responses" : "/chat/completions");
  const upstreamPayload = providerName === "chatgpt"
    ? openAIResponsesPayload(model, messages as Array<{ role: string; content: string }>)
    : {
        model,
        messages,
        stream: true,
      };
  const upstream = await fetchWithTimeout(upstreamUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
      "Accept-Encoding": "identity",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(upstreamPayload),
  });

  if (!upstream.ok) {
    const { data, rawText } = await readUpstreamJson(upstream);
    return fail(event, upstream.status || 502, "UPSTREAM_ERROR", upstreamErrorMessage(data, rawText) + endpointHint(upstreamUrl), {
      upstreamStatus: upstream.status,
      upstreamUrl,
      rawText: rawText?.slice(0, 2000),
    });
  }
  if (!upstream.body?.getReader) {
    return fail(event, 502, "BAD_UPSTREAM_RESPONSE", "上游接口未返回可用流式响应体。", { upstreamUrl });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  const startedAt = Date.now();
  let buffer = "";
  let content = "";
  let reasoningContent = "";
  let chunkCount = 0;
  let firstChunkMs: number | null = null;

  async function consumePayload(payload: string, send: (value: string) => void) {
    if (!payload) return false;
    if (payload === "[DONE]") return true;
    const data = parseJsonOrNull(payload);
    if (!data) return false;
    const streamError = providerName === "chatgpt" ? responsesStreamErrorMessage(data) : "";
    if (streamError) throw new Error(streamError);
    const normalized = providerName === "chatgpt" ? normalizeResponsesDeltaPayload(data) : normalizeChatCompletionDeltaPayload(data);
    if (!normalized) return false;
    chunkCount += 1;
    if (firstChunkMs == null) firstChunkMs = Date.now() - startedAt;
    content += normalized.content;
    reasoningContent += normalized.reasoningContent;
    send(sseFrame({
      type: "delta",
      model,
      content: normalized.content,
      reasoningContent: normalized.reasoningContent,
      chunkCount,
    }));
    return false;
  }

  async function consumeFrame(frame: string, send: (value: string) => void) {
    const payloadLines = frame
      .split("\n")
      .map((line) => line.replace(/\r$/, ""))
      .filter((line) => line.trimStart().startsWith("data:"))
      .map((line) => line.slice(line.indexOf("data:") + 5).trim());
    if (!payloadLines.length) return false;
    return consumePayload(payloadLines.join("\n"), send);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (value: string) => controller.enqueue(encoder.encode(value));
      send(sseFrame({ type: "meta", ok: true, model, upstreamUrl }));
      try {
        outer: for (;;) {
          const read = await reader.read();
          if (read.done) break;
          buffer += decoder.decode(read.value, { stream: true });
          for (;;) {
            const separator = nextSseSeparator(buffer);
            if (!separator) break;
            const frame = buffer.slice(0, separator.index);
            buffer = buffer.slice(separator.index + separator.length);
            const done = await consumeFrame(frame, send);
            if (done) break outer;
          }
        }
        if (buffer.trim()) {
          await consumeFrame(buffer.trim(), send);
        }
        send(sseFrame({
          type: "final",
          ok: true,
          model,
          upstreamUrl,
          content,
          reasoningContent,
          diagnostics: {
            chunkCount,
            contentLength: content.length,
            reasoningLength: reasoningContent.length,
            firstChunkMs,
            elapsedMs: Date.now() - startedAt,
          },
        }));
        send(sseFrame("[DONE]"));
        controller.close();
      } catch (error) {
        send(sseFrame({
          ok: false,
          error: {
            code: "STREAM_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
        }));
        send(sseFrame("[DONE]"));
        controller.close();
      }
    },
    cancel() {
      reader.cancel().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});
