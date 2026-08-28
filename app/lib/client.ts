/// <reference types="vite/client" />

export function createApiClient(
  origin = "",
  storage?: Pick<Storage, "getItem" | "setItem">,
) {
  const storageKey = `colony-session:${origin}`;
  return async function requestJson<T>(
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
      if (!path.startsWith("/api/") || path.startsWith("//"))
        throw new Error("올바르지 않은 API 경로입니다.");
      const participantRoute = /^\/api\/(participant|answer)(?:\?|$)/.test(path);
      const browserStorage = origin && participantRoute
        ? (storage ?? window.localStorage)
        : undefined;
      const headers = new Headers(
        body === undefined ? undefined : { "Content-Type": "application/json" },
      );
      const token = browserStorage?.getItem(storageKey);
      if (token && /^[a-f0-9]{64}$/.test(token))
        headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(origin + path, {
        method: body === undefined ? "GET" : "POST",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: origin ? "omit" : "same-origin",
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
      if (
        browserStorage &&
        path === "/api/participant" &&
        body === undefined &&
        data &&
        typeof data === "object" &&
        "sessionToken" in data &&
        typeof data.sessionToken === "string" &&
        /^[a-f0-9]{64}$/.test(data.sessionToken)
      ) {
        const persistedToken = browserStorage.getItem(storageKey);
        if (
          persistedToken &&
          /^[a-f0-9]{64}$/.test(persistedToken) &&
          persistedToken !== data.sessionToken
        ) {
          // Another tab may have already registered while this request waited.
          if (persistedToken === token)
            throw new Error("참여 기록을 확인하지 못했습니다. 다시 시도해 주세요.");
          return requestJson<T>(path, undefined, signal);
        }
        browserStorage.setItem(storageKey, data.sessionToken);
      }
      return data as T;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };
}

export const apiOrigin = import.meta.env?.VITE_PUBLIC_API_ORIGIN ?? "";
export const apiJson = createApiClient(apiOrigin);

export function friendlyError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError")
    return "연결이 지연되고 있습니다. 선택은 유지되니 다시 시도해 주세요.";
  return error instanceof Error
    ? error.message
    : "연결을 확인하고 다시 시도해 주세요.";
}
