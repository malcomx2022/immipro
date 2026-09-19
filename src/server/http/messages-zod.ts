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
};

const FORMATS: Record<string, string> = {
  email: "Vérifie l'adresse : il manque le @ ou le domaine.",
  url: "Adresse web attendue, commençant par https://.",
  uuid: "Identifiant attendu. Reprends depuis l'écran précédent plutôt que de le saisir.",
  datetime: "Date et heure attendues, au format ISO.",
  regex: "Le format attendu n'est pas respecté.",
};

export const messagesFrancais: z.ZodErrorMap = (probleme, contexte) => {
  switch (probleme.code) {
    case z.ZodIssueCode.invalid_type:
      if (probleme.received === "undefined") return { message: "Ce champ est attendu." };
      return { message: `Ce champ attend ${TYPES[probleme.expected] ?? "une autre valeur"}.` };

    case z.ZodIssueCode.invalid_string:
      return {
        message:
          typeof probleme.validation === "string"
            ? (FORMATS[probleme.validation] ?? "Le format attendu n'est pas respecté.")
            : "Le format attendu n'est pas respecté.",
      };

    case z.ZodIssueCode.too_small:
      if (probleme.type === "string") {
        return {
          message:
            probleme.minimum === 1
              ? "Ce champ est attendu."
              : `Au moins ${probleme.minimum} caractères.`,
        };
      }
      return { message: `La valeur minimale est ${probleme.minimum}.` };

    case z.ZodIssueCode.too_big:
      if (probleme.type === "string") return { message: `Au plus ${probleme.maximum} caractères.` };
      return { message: `La valeur maximale est ${probleme.maximum}.` };

    case z.ZodIssueCode.invalid_enum_value:
      return { message: `Valeurs acceptées : ${probleme.options.join(", ")}.` };

    case z.ZodIssueCode.unrecognized_keys:
      return { message: `Champs non attendus : ${probleme.keys.join(", ")}.` };

    default:
      return { message: contexte.defaultError };
  }
};

/**
 * Installée à l'import de ce module, qui est lui-même importé par le
 * composeur de routes : aucune route ne peut répondre sans être passée par
 * là.
 */
z.setErrorMap(messagesFrancais);
