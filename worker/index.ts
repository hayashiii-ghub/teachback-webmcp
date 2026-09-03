import app from "vinext/server/app-router-entry";
import { SECURITY_HEADERS } from "../security-headers";

type WorkerEnv = Parameters<typeof app.fetch>[1];
type WorkerContext = Parameters<typeof app.fetch>[2];

export default {
  async fetch(request: Request, env?: WorkerEnv, ctx?: WorkerContext) {
    const response = await app.fetch(request, env, ctx);
    // Keep Vinext's internal static-file signal attached to this Response.
    // Re-wrapping it makes public assets look like empty 200 responses to the
    // local production server before Cloudflare's ASSETS binding is present.
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(name, value);
    }
    return response;
  },
};
