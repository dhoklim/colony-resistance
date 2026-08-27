export async function apiJson<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const message =
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
          ? data.error
          : "요청을 처리하지 못했습니다. 다시 시도해 주세요.";
      throw new Error(message);
    }
    return data as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function friendlyError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError")
    return "연결이 지연되고 있습니다. 선택은 유지되니 다시 시도해 주세요.";
  return error instanceof Error
    ? error.message
    : "연결을 확인하고 다시 시도해 주세요.";
}
