import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    ] }];
  },
  // Identificador constante de la compilación, también fuera de Vercel.
  env: {
    POWERPOS_BUILD_VERSION: process.env.VERCEL_GIT_COMMIT_SHA || process.env.POWERPOS_BUILD_VERSION || `build-${Date.now()}`,
  },
};

export default nextConfig;
