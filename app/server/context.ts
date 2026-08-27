import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";
import { EventApi } from "./api";
import { EventService } from "./service";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function createApi(): EventApi {
  if (!env.DB) throw new Error("Event database binding is unavailable.");
  return new EventApi(new EventService(env.DB.withSession("first-primary")), {
    canonicalOrigin: process.env.SITE_URL || env.SITE_URL || undefined,
    adminEmails: adminEmails(),
    getUser: getChatGPTUser,
  });
}
