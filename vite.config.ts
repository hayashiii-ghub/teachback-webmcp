import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const webMcpHeaders = {
  "Origin-Agent-Cluster": "?1",
  "Permissions-Policy": "tools=(self)",
  "X-Content-Type-Options": "nosniff",
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    headers: webMcpHeaders,
  },
  preview: {
    host: "127.0.0.1",
    headers: webMcpHeaders,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
