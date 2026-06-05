import { createError } from "h3";

type ArchiveUploadedMediaInput = {
  buffer: Buffer | Uint8Array | ArrayBuffer;
  kind: "image" | "video" | "reference";
  provider?: string | null;
  model?: string | null;
  mimeType?: string | null;
  originalFilename?: string | null;
  requireExternalUrl?: boolean;
  metadata?: unknown;
};

export async function archiveUploadedMedia(_event: unknown, input: ArchiveUploadedMediaInput) {
  if (input.requireExternalUrl) {
    throw createError({
      statusCode: 422,
      message: "独立生图项目未配置媒体云端归档，本地上传图片缺少可供上游模型访问的云端地址。请使用图片 URL，或在主项目中配置对象存储后重试。",
      data: { code: "MEDIA_UPLOAD_EXTERNAL_URL_MISSING" },
    });
  }
  throw createError({
    statusCode: 501,
    message: "独立生图项目不支持服务端媒体归档。",
    data: { code: "MEDIA_ARCHIVE_UNSUPPORTED", kind: input.kind, provider: input.provider || undefined, model: input.model || undefined },
  });
}
