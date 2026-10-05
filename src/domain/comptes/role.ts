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

export const ROLES = ["CANDIDAT", "VEILLEUR", "ADMIN"] as const;
export type RoleDeCompte = (typeof ROLES)[number];

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
  'Usage : node dist/changer-role.mjs --email <adresse> --role CANDIDAT|VEILLEUR|ADMIN --par "<nom de l\'opérateur>" --motif "<pourquoi>"';

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
 * Le changement est-il permis ? Quatre refus, chacun avec ce qu'il faut
 * faire :
 *
 * - un compte supprimé n'a plus personne à qui donner un rôle ;
 * - un rôle élevé ne se donne qu'à une adresse vérifiée : sinon, quiconque
 *   aurait créé un compte au nom d'un autre recevrait le back-office ;
 * - ni à un compte suspendu ;
 * - le dernier administrateur ne se retire pas : sans lui, plus personne ne
 *   pourrait ouvrir le back-office, et la revue manuelle s'arrêterait.
 */
export function verdictDuChangement(
  cible: CompteCible,
  vers: RoleDeCompte,
  administrateursRestants: number,
): Verdict {
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
  if (cible.role === "ADMIN" && administrateursRestants <= 1) {
    return {
      permis: false,
      raison: "C'est le dernier administrateur : en nommer un autre d'abord, sinon plus personne ne pourra ouvrir le back-office.",
    };
  }
  return { permis: true };
}
