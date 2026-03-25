import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    emptyDirBeforeWrite: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:45200",
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
