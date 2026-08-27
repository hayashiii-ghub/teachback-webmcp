const securityHeaders = [
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "Permissions-Policy", value: "tools=(self)" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

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
