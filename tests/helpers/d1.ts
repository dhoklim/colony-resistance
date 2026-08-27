import { readdir, readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

export async function createTestDatabase() {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: "2026-08-26",
      d1Databases: ["DB"],
    }),
  );
  const db = await runtime.getD1Database("DB");
  const directory = new URL("../../drizzle/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(new URL(file, directory), "utf8");
    for (const statement of sql
      .split("--> statement-breakpoint")
      .filter((part) => part.trim()))
      await db.prepare(statement).run();
  }
  return { db, dispose: () => runtime.dispose() };
}
