import app from "vinext/server/app-router-entry";

type WorkerEnv = Parameters<typeof app.fetch>[1];
type WorkerContext = Parameters<typeof app.fetch>[2];

const responseHeaders = {
  "Origin-Agent-Cluster": "?1",
  "Permissions-Policy": "tools=(self)",
  "X-Content-Type-Options": "nosniff",
};

export default {
  async fetch(request: Request, env?: WorkerEnv, ctx?: WorkerContext) {
    const response = await app.fetch(request, env, ctx);
    const headers = new Headers(response.headers);

    for (const [name, value] of Object.entries(responseHeaders)) {
      headers.set(name, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
