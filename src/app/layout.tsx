import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { default: "ImmiPro", template: "%s — ImmiPro" },
  description: "Préparez votre dossier d'immigration, pièce par pièce.",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  openGraph: { images: ["/brand/og-image-1200x630.png"], locale: "fr_FR" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
