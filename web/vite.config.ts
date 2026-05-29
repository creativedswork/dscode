import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  resolve: {
    alias: {
      "@dscode/shared": path.resolve(__dirname, "../src/ui/shared"),
    },
  },
  plugins: [react()],
  base: "/",
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
      "/api": {
        target: "http://localhost:3000",
      },
    },
  },
});
