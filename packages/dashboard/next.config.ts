import type { NextConfig } from "next";
import cliPkg from "../cli/package.json";

const isDev = process.env.NODE_ENV === "development";

// Production is a static export served by the CLI. In dev, proxy /api to a running `batterylens` (port 4545).
const nextConfig: NextConfig = {
  output: isDev ? undefined : "export",
  trailingSlash: !isDev,
  // The dashboard ships inside the CLI package, so show the CLI version.
  env: { NEXT_PUBLIC_VERSION: cliPkg.version },
  ...(isDev && {
    rewrites: async () => [{ source: "/api/:path*", destination: "http://127.0.0.1:4545/api/:path*" }],
  }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
