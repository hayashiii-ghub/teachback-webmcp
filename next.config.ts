import { SECURITY_HEADERS } from "./security-headers";

const securityHeaders = Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value }));

export default {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};
