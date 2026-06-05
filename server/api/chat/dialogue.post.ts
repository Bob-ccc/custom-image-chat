import { defineEventHandler, readBody } from "h3";
import {
  assertProvider,
  buildEndpoint,
  endpointHint,
  fail,
  postJson,
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

function contentToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          if (typeof record.text === "string") return record.text;
          if (typeof record.content === "string") return record.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function providerNameFromBody(body: Record<string, unknown>): DialogueProviderName {
  return body.providerName === "chatgpt" ? "chatgpt" : "zhipu";
}

function responseOutputText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text.trim();
  if (!Array.isArray(data?.output)) return "";
  return data.output
    .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .filter((part: any) => part?.type === "output_text")
    .map((part: any) => contentToText(part?.text))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function assistantContent(data: any, providerName: DialogueProviderName) {
  if (providerName === "chatgpt") return responseOutputText(data);
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  return contentToText(choice?.message?.content || choice?.delta?.content || data?.content || data?.message).trim();
}

function upstreamErrorMessage(data: any, rawText: string) {
  return data?.error?.message || data?.message || rawText || "对话请求失败。";
}

function openAIResponsesPayload(model: string, messages: Array<{ role: string; content: string }>) {
  const payload: Record<string, unknown> = {
    model,
    input: messages,
    stream: false,
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
  const payload = providerName === "chatgpt"
    ? openAIResponsesPayload(model, messages as Array<{ role: string; content: string }>)
    : {
        model,
        messages,
        stream: false,
      };

  try {
    const upstream = await postJson(upstreamUrl, key, payload);
    const { data, rawText } = await readUpstreamJson(upstream);
    if (!upstream.ok) {
      return fail(event, upstream.status || 502, "UPSTREAM_ERROR", upstreamErrorMessage(data, rawText) + endpointHint(upstreamUrl), {
        upstreamStatus: upstream.status,
        upstreamUrl,
        rawText: rawText?.slice(0, 2000),
      });
    }
    const content = assistantContent(data, providerName);
    return {
      ok: true,
      upstreamUrl,
      model,
      content,
      data,
    };
  } catch (error) {
    return fail(event, 502, "REQUEST_FAILED", error instanceof Error ? error.message : String(error), {
      upstreamUrl,
    });
  }
});
