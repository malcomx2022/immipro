import type { Config } from "tailwindcss";

/**
 * Source unique de vérité des tokens. Toute valeur de couleur, d'espacement
 * ou de rayon utilisée dans l'interface vient d'ici — jamais en dur.
 * Référence : DOC-12, §2.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          50: "#EEF4FB", 100: "#D7E5F5", 500: "#2E75B6",
          600: "#255F95", 700: "#1F4E79",
        },
        ink: {
          100: "#F7F7F7", 300: "#DDDDDD", 500: "#767676",
          700: "#40403F", 900: "#1A1A1A",
        },
        success: "#0F7B4F",
        warning: "#B45309",
        danger: "#B3261E",
      },
      borderRadius: { sm: "8px", md: "12px", lg: "16px" },
      boxShadow: {
        e1: "0 1px 2px rgba(0,0,0,.06)",
        e2: "0 6px 16px rgba(0,0,0,.08)",
        e3: "0 12px 32px rgba(0,0,0,.12)",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" },
    },
  },
  plugins: [],
} satisfies Config;
