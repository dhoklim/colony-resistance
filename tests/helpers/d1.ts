import { readdir, readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

export async function createTestDatabase(migrationCount = Infinity) {
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
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  let applied = 0;
  const migrate = async (count = files.length) => {
    while (applied < Math.min(count, files.length)) {
      const sql = await readFile(new URL(files[applied], directory), "utf8");
      for (const statement of sql
        .split("--> statement-breakpoint")
        .filter((part) => part.trim()))
        await db.prepare(statement).run();
      applied += 1;
    }
  };
  await migrate(migrationCount);
  return { db, migrate, dispose: () => runtime.dispose() };
}
