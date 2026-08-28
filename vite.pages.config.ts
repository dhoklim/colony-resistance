import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";

export default defineConfig(({ command }) => {
  const apiUrl = new URL(
    process.env.VITE_PUBLIC_API_ORIGIN ||
      "https://colony-resistance.dhoklim.chatgpt.site",
  );
  const localPreview = command === "serve" && apiUrl.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(apiUrl.hostname);
  if (apiUrl.protocol !== "https:" && !localPreview)
    throw new Error("Pages requires an HTTPS event API.");
  const apiOrigin = apiUrl.origin;

  return {
    root: fileURLToPath(new URL("./github-pages", import.meta.url)),
    base: process.env.PAGES_BASE_PATH || "/colony-resistance/",
    publicDir: fileURLToPath(new URL("./public", import.meta.url)),
    plugins: [react()],
    css: { postcss: { plugins: [tailwindcss()] } },
    resolve: {
      alias: {
        "next/link": fileURLToPath(
          new URL("./github-pages/link.tsx", import.meta.url),
        ),
      },
    },
    define: {
      "import.meta.env.VITE_PUBLIC_API_ORIGIN": JSON.stringify(apiOrigin),
    },
    build: {
      outDir: fileURLToPath(new URL("./dist-pages", import.meta.url)),
      emptyOutDir: true,
      sourcemap: false,
    },
  };
});
