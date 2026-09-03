import { cloudflare } from "@cloudflare/vite-plugin";
import { sites } from "@openai/sites-vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";
import { SECURITY_HEADERS } from "./security-headers.ts";

export default defineConfig({
  plugins: [
    vinext(),
    sites(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      config: {
        main: "./worker/index.ts",
        compatibility_flags: ["nodejs_compat"],
        assets: { binding: "ASSETS" },
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
    headers: SECURITY_HEADERS,
  },
  preview: {
    host: "127.0.0.1",
    headers: SECURITY_HEADERS,
  },
});
