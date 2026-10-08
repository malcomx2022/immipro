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
      // Cibles tactiles du prototype : 44 px minimum partout, 48 px pour les
      // boutons, 52 px pour l'action principale mobile, 60 px pour une ligne
      // de choix du simulateur (DOC-12, Fondations §6).
      minHeight: { touch: "44px", bouton: "48px", action: "52px", option: "60px" },
      // Largeurs de mise en page — revue du 07/10/2026, F7 (D-20 : un jeton
      // par valeur, sans regroupement). Cent trente et une valeurs
      // arbitraires (`max-w-[640px]`…) vivaient dans les écrans ; elles ont
      // un nom ici, à la valeur près, et `tests/jetons-de-mise-en-page.test.ts`
      // refuse qu'une nouvelle revienne. Un regroupement (760 vers 720, 68ch
      // vers 70ch…) se décide écran par écran, en changeant la valeur ici.
      maxWidth: {
        gabarit: "1120px",
        comptes: "1000px",
        dossier: "880px",
        texte: "760px",
        colonne: "720px",
        decision: "640px",
        reglages: "560px",
        etroit: "520px",
        connexion: "480px",
        "lecture-large": "80ch",
        "lecture-75": "75ch",
        lecture: "70ch",
        redaction: "68ch",
        "lecture-courte": "60ch",
        ecran: "calc(100vw - 4rem)",
      },
      width: {
        nav: "264px",
        "nav-admin": "232px",
        formulaire: "520px",
        "formulaire-large": "560px",
        dialogue: "600px",
        panneau: "340px",
        "panneau-large": "420px",
        aside: "300px",
        filtre: "220px",
        "filtre-etroit": "200px",
        // La colonne des versions d'une rédaction ; la recherche de B-03.
        versions: "320px",
        recherche: "240px",
      },
      minWidth: { touch: "44px", tableau: "640px", "tableau-large": "840px" },
      maxHeight: { feuille: "85vh" },
      gridTemplateColumns: {
        // Les tableaux du back-office, en largeur de bureau.
        // B-05, revue des pièces : pièce, dossier, attente, motif.
        revue: "1fr 1.4fr 6rem 1fr",
        // B-01, file de veille : pays, procédure, niveau de source, vérifiée le…
        veille: "2.5rem 1fr 10rem 6rem 8rem 7rem",
        // B-03, utilisateurs : compte, inscrit le, dossiers, pack, statut.
        utilisateurs: "1.6fr 8rem 4rem 7rem 9rem",
      },
      // 22 px : case à cocher. 13 (52 px) : largeur de l'interrupteur et
      // action principale mobile. 18 (72 px) : hauteur d'une ligne de
      // checklist. Trois crans qui manquent aux valeurs natives de Tailwind.
      spacing: { 5.5: "22px", 13: "52px", 18: "72px" },
      // Pastille de choix exclusif pleine (Bibliothèque §3).
      borderWidth: { 6: "6px" },
      // Saisie du code de vérification (A-03), espacée pour se relire.
      letterSpacing: { code: "0.24em" },
      // Règle clavier 3 : contour 2 px accent-700 à 3 px de décalage sur les
      // actions, anneau accent-100 de 3 px sur les champs. Ni l'un ni l'autre
      // n'est écrivable sans ces deux crans.
      outlineOffset: { 3: "3px" },
      ringWidth: { 3: "3px" },
    },
  },
  plugins: [],
} satisfies Config;
