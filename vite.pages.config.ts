import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";

const apiOrigin = new URL(
  process.env.VITE_PUBLIC_API_ORIGIN ||
    "https://colony-resistance.dhoklim.chatgpt.site",
).origin;
if (!apiOrigin.startsWith("https://"))
  throw new Error("Pages requires an HTTPS event API.");

export default defineConfig({
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
});
