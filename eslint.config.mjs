import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint en configuration plate — revue du 07/10/2026, M19 étape 2.
 *
 * `next lint` est retiré par Next 16 (étape 3) et `.eslintrc.json` n'est
 * plus lu par ESLint 10 (étape 9) : la configuration passe au format plat
 * d'abord, seule, pour que l'étape suivante n'ait rien d'autre à porter.
 *
 * Les règles sont celles d'avant : les préréglages de Next, et la seule
 * règle du dépôt. Depuis Next 16 (étape 3), `eslint-config-next` exporte
 * lui-même ses préréglages au format plat ; `FlatCompat` n'est plus utile.
 * `tests/configuration-eslint.test.ts` garde ce qui compte.
 *
 * Le périmètre reste celui de `next lint` : `src` (script `lint`). Lire
 * aussi `tests`, `scripts` et `docs` relève 33 remarques que `next lint`
 * n'a jamais vues ; les y faire entrer est un lot à part.
 */
const configuration = [
  {
    ignores: [".next/**", "node_modules/**", "dist/**", "coverage/**", "next-env.d.ts"],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      /*
        Deux règles du React Compiler, apportées par `eslint-plugin-react-hooks`
        v7 avec Next 16. Coupées à la montée (revue M19 étape 3), rétablies
        par S.164 une fois leurs sites réécrits :
        - `set-state-in-effect` : les réponses du simulateur se lisent par
          `useSyncExternalStore` (simulateur, accueil, résultats), les
          chargements au montage n'écrivent l'état qu'à la réponse
          (consentements, résultats), l'état dérivé se calcule au rendu
          (pièce du dossier, menu public) ;
        - `purity` : les pages serveur du journal et des paiements lisent
          l'horloge une seule fois, par `new Date()`.
        Une nouvelle infraction se réécrit selon ces modèles ; elle ne se
        désactive pas.
      */
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/purity": "error",
    },
  },
];

export default configuration;
