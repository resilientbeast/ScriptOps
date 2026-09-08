import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: [
    "@google-cloud/tasks",
    "@google/adk",
    "@google/genai",
    "google-auth-library",
    "parallel-web",
    "@react-pdf/renderer",
    "pdf-parse",
    "fast-xml-parser",
    "@google-cloud/storage",
  ],
};

export default nextConfig;
