import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const api = `http://127.0.0.1:${process.env.MIGRATE_API_PORT ?? 4800}`

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
  },
  server: {
    port: 5180,
    proxy: {
      "/api": { target: api, changeOrigin: true },
    },
  },
})
