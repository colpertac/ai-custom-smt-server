import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Required for website/Dockerfile (standalone Node server).
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/wiki/builder",
        destination: "/builder",
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ]
  },
}

export default nextConfig
