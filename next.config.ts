import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // WP0.5: type checking aktif — Vercel build GAGAL bila ada error TypeScript.
  // Jalankan `npm run typecheck` (bash scripts/typecheck.sh) sebelum push.
  // typescript: { ignoreBuildErrors: false }, // default; sengaja tidak diset
};

export default nextConfig;