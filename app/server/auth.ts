import { AppError } from "./errors";

export type AdminIdentity = { userId: string; email: string };
export const COOKIE_NAME = "colony_session";

export function isAllowedAdmin(
  user: AdminIdentity | null,
  allowed: readonly string[],
): boolean {
  return (
    !!user?.userId &&
    allowed.some(
      (email) => email.trim().toLowerCase() === user.email.trim().toLowerCase(),
    )
  );
}

export function requireAdmin(
  user: AdminIdentity | null,
  allowed: readonly string[],
): AdminIdentity {
  if (!user) throw new AppError(401, "운영자 로그인이 필요합니다.");
  if (!isAllowedAdmin(user, allowed))
    throw new AppError(403, "허용된 운영자 계정이 아닙니다.");
  return user;
}

export function sessionToken(
  request: Request,
  allowCookie = true,
): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization)
    return authorization.match(/^Bearer ([a-f0-9]{64})$/)?.[1] ?? null;
  if (!allowCookie) return null;
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export function createSessionToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export async function digest(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function sessionCookie(token: string, request: Request): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
