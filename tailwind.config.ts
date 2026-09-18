import type { Config } from "tailwindcss";

/**
 * Source unique de vérité des tokens. Toute valeur de couleur, d'espacement
 * ou de rayon utilisée dans l'interface vient d'ici — jamais en dur.
 * Référence : DOC-12, §2. Mise à jour 13/09/2026 : ink.500 et échelle de tailles
 * (passe de contraste et de tailles du prototype).
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    // Échelle fermée : neuf tailles, aucune autre valeur n'est écrivable.
    // Remplace (et non étend) fontSize pour que text-[17px] reste possible
    // mais visible en revue, et que text-lg / text-xl n'existent plus.
    fontSize: {
      "13": ["13px", { lineHeight: "18px" }],
      "14": ["14px", { lineHeight: "20px" }],
      "15": ["15px", { lineHeight: "22px" }],
      "16": ["16px", { lineHeight: "24px" }],
      "19": ["19px", { lineHeight: "26px" }],
      "24": ["24px", { lineHeight: "30px", letterSpacing: "-0.01em" }],
      "28": ["28px", { lineHeight: "34px", letterSpacing: "-0.01em" }],
      "32": ["32px", { lineHeight: "38px", letterSpacing: "-0.02em" }],
      "44": ["44px", { lineHeight: "50px", letterSpacing: "-0.02em" }],
    },
    extend: {
      colors: {
        accent: {
          50: "#EEF4FB", 100: "#D7E5F5", 500: "#2E75B6",
          600: "#255F95", 700: "#1F4E79",
        },
        ink: {
          // #767676 échouait à 4,5:1 sur ink.100 (4,24) et accent.50 (4,10).
          // #6B6B6B : 5,33 sur blanc, 4,97 sur ink.100, 4,81 sur accent.50.
          100: "#F7F7F7", 300: "#DDDDDD", 500: "#6B6B6B",
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
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" },
    },
  },
  plugins: [],
} satisfies Config;
