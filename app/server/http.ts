import { AppError, isRecord } from "./errors";

export const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export function json(
  value: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return Response.json(value, {
    status,
    headers: { ...responseHeaders, ...headers },
  });
}

export function assertSameOrigin(
  request: Request,
  canonicalOrigin?: string,
  participantOrigin?: string,
): void {
  const expected = new URL(canonicalOrigin || request.url).origin;
  if (participantOrigin && request.headers.get("origin") === participantOrigin)
    return;
  if (
    request.headers.get("origin") !== expected ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new AppError(403, "이 사이트에서 직접 요청해 주세요.");
  }
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  const maxBytes = 4096;
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new AppError(415, "JSON 요청이 필요합니다.");
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new AppError(413, "입력 내용이 너무 깁니다.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "입력 내용을 확인해 주세요.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AppError(413, "입력 내용이 너무 깁니다.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(body),
    );
    if (!isRecord(value)) throw new Error("Object required.");
    return value;
  } catch {
    throw new AppError(400, "입력 내용을 읽지 못했습니다. 다시 시도해 주세요.");
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError)
    return json(
      { error: error.message, code: error.code },
      error.status,
      error.status === 429 ? { "Retry-After": "60" } : {},
    );
  console.error(
    JSON.stringify({
      event: "request_failed",
      kind: error instanceof Error ? error.name : "unknown",
    }),
  );
  return json(
    {
      error: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      code: "server_error",
    },
    500,
  );
}
