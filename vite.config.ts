import { defineConfig } from "vite";

// base: "./" para servir desde cualquier subcarpeta (GitHub Pages: DEPLOY_BASE=/hekatan-geotechnic/)
export default defineConfig({
  base: process.env.DEPLOY_BASE || "./",
  server: { port: 4700, open: false },
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
  worker: { format: "es" },
});
