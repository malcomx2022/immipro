/**
 * Changer le rôle d'un compte — S.115, 05/10/2026.
 *
 * Aucun écran ne donne un rôle, et c'est voulu : un administrateur qui en
 * nomme un autre depuis le back-office est exactement le geste qu'une
 * session volée ferait en premier. Le rôle se change donc depuis la
 * console du serveur, par quelqu'un qui y a accès. Jusqu'ici, cela se
 * faisait par une requête SQL — sans motif, sans auteur, sans trace au
 * journal d'audit, alors que toute autre action sensible y est inscrite
 * (RG-15.1).
 *
 * Ce module décide ce qui est permis ; le serveur écrit le changement et
 * sa ligne de journal dans la même transaction.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import {
  ROLES,
  SUPER_ADMINS_MINIMUM,
  couvre,
  peutChangerLesRoles,
  rang,
  type RoleDeCompte,
} from "./hierarchie";

/*
  La liste des rôles vit dans `hierarchie` depuis S.210 (SUPER_ADMIN) :
  elle est réexportée ici pour la ligne de commande et ses tests.
*/
export { ROLES, type RoleDeCompte };

/** Un motif se relit dans six mois : il dit pourquoi, pas seulement quoi. */
export const MOTIF_MIN = 10;
export const MOTIF_MAX = 500;

/** Le préfixe d'auteur d'une écriture faite depuis la console du serveur. */
export const PREFIXE_CONSOLE = "console:";

export interface DemandeDeChangement {
  email: string;
  role: RoleDeCompte;
  motif: string;
  /** Qui lance la commande : un nom, pas un compte — le premier administrateur n'en a pas encore. */
  par: string;
}

export const USAGE =
  'Usage : node dist/changer-role.mjs --email <adresse> --role CANDIDAT|VEILLEUR|ADMIN|SUPER_ADMIN --par "<nom de l\'opérateur>" --motif "<pourquoi>"';

/**
 * Lit la ligne de commande. Rend la demande, ou la liste de ce qui manque
 * — chaque message dit quoi corriger.
 */
export function lireLaDemande(
  argv: readonly string[],
): { ok: true; demande: DemandeDeChangement } | { ok: false; erreurs: string[] } {
  const valeur = (nom: string): string => {
    const i = argv.indexOf(`--${nom}`);
    return i >= 0 && i + 1 < argv.length ? (argv[i + 1] ?? "").trim() : "";
  };
  const email = valeur("email").toLowerCase();
  const role = valeur("role").toUpperCase();
  const motif = valeur("motif");
  const par = valeur("par");

  const erreurs: string[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    erreurs.push("--email : une adresse électronique valide est attendue.");
  }
  if (!(ROLES as readonly string[]).includes(role)) {
    erreurs.push(`--role : ${ROLES.join(", ")} (reçu : « ${role || "rien"} »).`);
  }
  if (par.length < 2) {
    erreurs.push("--par : le nom de l'opérateur qui lance la commande ; il figure au journal comme auteur du changement.");
  }
  if (motif.length < MOTIF_MIN || motif.length > MOTIF_MAX) {
    erreurs.push(
      `--motif : entre ${MOTIF_MIN} et ${MOTIF_MAX} caractères, qui disent pourquoi (par exemple « Responsable de la revue manuelle désigné par la direction le 03/10 »).`,
    );
  }
  if (erreurs.length > 0) return { ok: false, erreurs };
  return { ok: true, demande: { email, role: role as RoleDeCompte, motif, par } };
}

/** L'identifiant d'auteur porté au journal : la console, et le nom déclaré. */
export const auteurConsole = (par: string): string =>
  `${PREFIXE_CONSOLE}${par.trim().replace(/\s+/gu, " ")}`;

export interface CompteCible {
  /** Identifiant du compte, quand l'acteur est un compte (back-office). */
  id?: string;
  role: RoleDeCompte;
  emailVerifie: boolean;
  suspendu: boolean;
  supprime: boolean;
}

export type Verdict =
  | { permis: true }
  | { permis: false; inchange: true; raison: string }
  | { permis: false; inchange?: false; raison: string };

const eleve = (role: RoleDeCompte) => role !== "CANDIDAT";

/**
 * Ce que le changement sait de son contexte — S.210.
 *
 * `superAdminsActifs` : les super-administrateurs ni suspendus ni
 * supprimés, cible comprise. Absent, il vaut zéro : un appelant qui ne
 * l'a pas compté ne retire pas le sommet par mégarde.
 *
 * `acteur` : le compte qui agit depuis le back-office. Absent, l'auteur
 * est la console du serveur (S.115), qui garde son autorité : c'est elle
 * qui nomme le premier super-administrateur.
 */
export interface ContexteDuChangement {
  superAdminsActifs?: number;
  acteur?: { id: string; role: RoleDeCompte };
}

/**
 * Le changement est-il permis ? Chaque refus dit ce qu'il faut faire :
 *
 * - depuis le back-office, seul un super-administrateur change un rôle,
 *   et personne ne s'élève lui-même ;
 * - un compte supprimé n'a plus personne à qui donner un rôle ;
 * - un rôle élevé ne se donne qu'à une adresse vérifiée : sinon, quiconque
 *   aurait créé un compte au nom d'un autre recevrait le back-office ;
 * - ni à un compte suspendu ;
 * - le dernier administrateur ne se retire pas : sans lui, plus personne ne
 *   pourrait ouvrir le back-office, et la revue manuelle s'arrêterait. Un
 *   super-administrateur compte comme administrateur (il en couvre les
 *   droits) ;
 * - un super-administrateur actif ne perd son rôle que s'ils sont au moins
 *   `SUPER_ADMINS_MINIMUM` : lui-même ou un autre, la borne est la même.
 */
export function verdictDuChangement(
  cible: CompteCible,
  vers: RoleDeCompte,
  administrateursRestants: number,
  contexte: ContexteDuChangement = {},
): Verdict {
  const { acteur } = contexte;
  if (acteur && !peutChangerLesRoles(acteur.role)) {
    return {
      permis: false,
      raison:
        "Seul un super-administrateur change un rôle. Demande-le à l'un d'eux, ou passe par la console du serveur.",
    };
  }
  if (acteur && cible.id === acteur.id && rang(vers) > rang(cible.role)) {
    return { permis: false, raison: "Un compte ne s'élève pas lui-même : un autre super-administrateur doit le faire." };
  }
  if (cible.supprime) {
    return { permis: false, raison: "Ce compte est supprimé : il n'y a plus personne à qui donner un rôle." };
  }
  if (cible.role === vers) {
    return { permis: false, inchange: true, raison: `Ce compte a déjà le rôle ${vers} : rien n'est changé, rien n'est journalisé.` };
  }
  if (eleve(vers) && !cible.emailVerifie) {
    return {
      permis: false,
      raison: "L'adresse de ce compte n'est pas vérifiée : la personne doit d'abord se connecter et saisir le code reçu par courriel.",
    };
  }
  if (eleve(vers) && cible.suspendu) {
    return { permis: false, raison: "Ce compte est suspendu : le rétablir depuis /utilisateurs avant de lui donner un rôle." };
  }
  if (couvre(cible.role, "ADMIN") && !couvre(vers, "ADMIN") && administrateursRestants <= 1) {
    return {
      permis: false,
      raison: "C'est le dernier administrateur : en nommer un autre d'abord, sinon plus personne ne pourra ouvrir le back-office.",
    };
  }
  const superAdminsActifs = contexte.superAdminsActifs ?? 0;
  if (
    cible.role === "SUPER_ADMIN" &&
    vers !== "SUPER_ADMIN" &&
    !cible.suspendu &&
    superAdminsActifs < SUPER_ADMINS_MINIMUM
  ) {
    return {
      permis: false,
      raison:
        acteur && cible.id === acteur.id
          ? `Tu es le seul super-administrateur actif : nomme d'abord un autre super-administrateur, il en faut au moins ${SUPER_ADMINS_MINIMUM} pour qu'un seul se retire.`
          : `Il ne reste que ${superAdminsActifs} super-administrateur actif : il en faut au moins ${SUPER_ADMINS_MINIMUM} pour en rétrograder un. Nomme d'abord un autre super-administrateur.`,
    };
  }
  return { permis: true };
}
