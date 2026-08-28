import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@google-cloud/tasks", "google-auth-library"],
};

export default nextConfig;
