import { z } from "zod";

/**
 * Messages de validation en français.
 *
 * La liste de vérification du projet dit « aucune chaîne de caractères en
 * anglais dans l'interface ». Les messages par défaut de Zod sont anglais
 * — « Invalid uuid », « String must contain at least 10 character(s) » — et
 * l'API les renvoie tels quels sous le champ concerné, où l'écran les
 * affiche. Les traduire schéma par schéma serait un oubli garanti : il
 * suffit d'un champ ajouté sans message pour que l'anglais revienne.
 *
 * La table est donc posée une fois, globalement, et un schéma qui ne dit
 * rien hérite d'un message français. Un schéma qui a mieux à dire garde son
 * message propre — « Vérifie l'adresse : il manque le @ ou le domaine » vaut
 * mieux qu'« adresse email attendue », et cette table ne l'écrase pas.
 *
 * Les messages suivent la doctrine d'erreur : ils disent ce qui est attendu,
 * pas ce qui est faux. « Format attendu : AAAA-MM-JJ » se corrige,
 * « invalide » ne se corrige pas.
 */
const TYPES: Record<string, string> = {
  string: "du texte",
  number: "un nombre",
  boolean: "oui ou non",
  date: "une date",
  array: "une liste",
  object: "un ensemble de champs",
  record: "un ensemble de champs",
};

const FORMATS: Record<string, string> = {
  email: "Vérifie l'adresse : il manque le @ ou le domaine.",
  url: "Adresse web attendue, commençant par https://.",
  uuid: "Identifiant attendu. Reprends depuis l'écran précédent plutôt que de le saisir.",
  // Zod 4 rend `.uuid()` strict (version et variante RFC 9562). Les routes
  // valident par `z.guid()`, le motif permissif de Zod 3 : la montée ne
  // refuse aucun identifiant qui passait (S.165).
  guid: "Identifiant attendu. Reprends depuis l'écran précédent plutôt que de le saisir.",
  datetime: "Date et heure attendues, au format ISO.",
  regex: "Le format attendu n'est pas respecté.",
};

/** Les valeurs qu'un champ accepte, dites telles quelles. */
const valeursAcceptees = (valeurs: readonly unknown[]): string =>
  `Valeurs acceptées : ${valeurs.map(String).join(", ")}.`;

/**
 * Zod 4 — S.165, M19 étape 4.
 *
 * La table est la même ; ce sont les codes qui changent : `invalid_string`
 * devient `invalid_format`, `invalid_enum_value` et `invalid_literal` se
 * rejoignent dans `invalid_value`, le type d'un `too_small` se lit dans
 * `origin`, et un champ absent se reconnaît à son entrée `undefined`.
 *
 * Trois cas tombaient jusqu'ici sur le message anglais de Zod, faute
 * d'entrée dans la table : une union discriminée sur une valeur inconnue
 * (« Invalid discriminator value »), un littéral (« Invalid literal
 * value »), une union de types (« Invalid input »). Ils ont maintenant
 * leur phrase. Un code que la table ne connaît pas garde une phrase
 * française plutôt que l'anglais de la bibliothèque.
 */
export const messagesFrancais = (probleme: z.core.$ZodRawIssue): string => {
  switch (probleme.code) {
    case "invalid_type":
      if (probleme.input === undefined) return "Ce champ est attendu.";
      return `Ce champ attend ${TYPES[probleme.expected] ?? "une autre valeur"}.`;

    case "invalid_format":
      return FORMATS[probleme.format] ?? "Le format attendu n'est pas respecté.";

    case "too_small":
      if (probleme.origin === "string") {
        return Number(probleme.minimum) === 1
          ? "Ce champ est attendu."
          : `Au moins ${probleme.minimum} caractères.`;
      }
      return `La valeur minimale est ${probleme.minimum}.`;

    case "too_big":
      if (probleme.origin === "string") return `Au plus ${probleme.maximum} caractères.`;
      return `La valeur maximale est ${probleme.maximum}.`;

    case "invalid_value":
      // Zod 4 rend aussi par ce code une énumération laissée vide.
      if (probleme.input === undefined) return "Ce champ est attendu.";
      return valeursAcceptees(probleme.values);

    case "unrecognized_keys":
      return `Champs non attendus : ${probleme.keys.join(", ")}.`;

    case "invalid_union": {
      // Union discriminée : les valeurs se lisent sur le schéma lui-même.
      if ("discriminator" in probleme && typeof probleme.discriminator === "string") {
        const valeurs = (
          probleme.inst as { _zod?: { propValues?: Record<string, Set<unknown>> } } | undefined
        )?._zod?.propValues?.[probleme.discriminator];
        if (valeurs && valeurs.size > 0) return valeursAcceptees([...valeurs]);
      }
      if (probleme.input === undefined) return "Ce champ est attendu.";
      // Union : chaque branche dit ce qu'elle attendait. Une valeur permise
      // se dit d'abord — « une liste » tairait qu'une seule valeur suffit.
      const valeurs: unknown[] = [];
      const attendus = new Set<string>();
      for (const branche of probleme.errors ?? []) {
        for (const p of branche) {
          if (p.path.length > 0) continue;
          if (p.code === "invalid_value") valeurs.push(...p.values);
          if (p.code === "invalid_type" && TYPES[p.expected]) attendus.add(TYPES[p.expected]!);
        }
      }
      if (valeurs.length > 0) return valeursAcceptees([...new Set(valeurs)]);
      if (attendus.size > 0) {
        const liste = [...attendus];
        const dernier = liste.pop();
        return `Ce champ attend ${liste.length > 0 ? `${liste.join(", ")} ou ${dernier}` : dernier}.`;
      }
      return "Le format attendu n'est pas respecté.";
    }

    default:
      return "Le format attendu n'est pas respecté.";
  }
};

/**
 * Installée à l'import de ce module, qui est lui-même importé par le
 * composeur de routes : aucune route ne peut répondre sans être passée par
 * là.
 */
z.config({ customError: messagesFrancais });
