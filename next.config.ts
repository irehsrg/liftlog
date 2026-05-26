import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ["@libsql/client", "@prisma/adapter-libsql", "libsql"],
};

export default nextConfig;
