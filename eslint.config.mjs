import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

/**
 * ESLint en configuration plate — revue du 07/10/2026, M19 étape 2.
 *
 * `next lint` est retiré par Next 16 (étape 3) et `.eslintrc.json` n'est
 * plus lu par ESLint 10 (étape 9) : la configuration passe au format plat
 * d'abord, seule, pour que l'étape suivante n'ait rien d'autre à porter.
 *
 * Les règles sont celles d'avant, à l'identique : les préréglages de Next
 * repris par `FlatCompat`, et la seule règle du dépôt. Relevé à la
 * migration : 98 règles, mêmes sévérités, sur trois fichiers témoins.
 * `tests/configuration-eslint.test.ts` garde ce qui compte.
 *
 * Le périmètre reste celui de `next lint` : `src` (script `lint`). Lire
 * aussi `tests`, `scripts` et `docs` relève 33 remarques que `next lint`
 * n'a jamais vues ; les y faire entrer est un lot à part.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const configuration = [
  {
    ignores: [".next/**", "node_modules/**", "dist/**", "coverage/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];

export default configuration;
