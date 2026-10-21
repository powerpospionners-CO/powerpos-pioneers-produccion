import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Identificador constante de la compilación, también fuera de Vercel.
  env: {
    POWERPOS_BUILD_VERSION: process.env.VERCEL_GIT_COMMIT_SHA || process.env.POWERPOS_BUILD_VERSION || `build-${Date.now()}`,
  },
};

export default nextConfig;
