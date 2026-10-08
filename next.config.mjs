/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",          // image Docker minimale
  reactStrictMode: true,
  poweredByHeader: false,
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // Revue F1 : aucun écran ne se sert de ces capacités. La valeur est
        // `POLITIQUE_DES_PERMISSIONS` (domain/securite/politique-de-contenu),
        // que `tests/politique-de-contenu.test.ts` compare à celle-ci.
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      ],
    }];
  },
};
export default nextConfig;
