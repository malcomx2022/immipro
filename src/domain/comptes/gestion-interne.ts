/**
 * Gestion des comptes internes depuis le back-office — S.208, B-03.
 *
 * Jusqu'ici, un rôle ne se changeait que depuis la console du serveur
 * (S.115) et aucun écran ne créait de compte interne. Le rôle
 * SUPER_ADMIN ouvre ces gestes au back-office, et à lui seul. Ce module
 * décide ce qui est permis ; le serveur écrit le geste, ferme les sessions
 * et journalise, dans la même transaction.
 *
 * Trois gestes :
 *
 * - **créer un compte interne** (veilleur ou administrateur). Le compte
 *   naît sans mot de passe : la personne le choisit par « Mot de passe
 *   oublié », dont le code arrive à son adresse. Nul ne peut donc entrer
 *   dans un compte créé au nom d'un autre sans lire sa messagerie. Le
 *   rôle de super-administrateur ne se donne jamais à la création : il se
 *   donne ensuite, par changement de rôle, à une adresse vérifiée ;
 * - **changer un rôle**, avec une double confirmation : le bouton, puis
 *   l'adresse du compte ressaisie. Un clic ne suffit pas à nommer
 *   quelqu'un administrateur ;
 * - **suspendre ou rétablir**. Un candidat se suspend depuis le rôle
 *   administrateur, comme avant (WF-15). Un compte interne, depuis le
 *   rôle super-administrateur seulement : sinon un administrateur pourrait
 *   écarter celui qui gère les rôles.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import { couvre, estInterne, SUPER_ADMINS_MINIMUM, type RoleDeCompte } from "./hierarchie";
import { MOTIF_MAX, MOTIF_MIN } from "./role";

/** Les rôles qu'un compte peut recevoir à sa création. */
export const ROLES_A_LA_CREATION = ["VEILLEUR", "ADMIN"] as const satisfies readonly RoleDeCompte[];
export type RoleALaCreation = (typeof ROLES_A_LA_CREATION)[number];

export const BORNES_NOM_INTERNE = { min: 1, max: 80 } as const;

const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export interface SaisieDeCreation {
  email: string;
  prenom: string;
  nom: string;
  role: string;
  motif: string;
}

export interface CreationInterne {
  email: string;
  prenom: string;
  nom: string;
  role: RoleALaCreation;
  motif: string;
}

/**
 * Lit la saisie de création. Chaque refus nomme le champ et dit quoi
 * corriger — la même liste sert à l'écran (avant l'envoi) et à la route.
 */
export function lireLaCreation(
  saisie: SaisieDeCreation,
): { ok: true; creation: CreationInterne } | { ok: false; champs: Record<string, string> } {
  const email = saisie.email.trim().toLowerCase();
  const prenom = saisie.prenom.trim().replace(/\s+/gu, " ");
  const nom = saisie.nom.trim().replace(/\s+/gu, " ");
  const motif = saisie.motif.trim();
  const champs: Record<string, string> = {};

  if (!ADRESSE.test(email) || email.length > 254) {
    champs.email = "Une adresse électronique valide est attendue, par exemple prenom.nom@immipro.app.";
  }
  if (prenom.length < BORNES_NOM_INTERNE.min || prenom.length > BORNES_NOM_INTERNE.max) {
    champs.prenom = `Le prénom tient entre ${BORNES_NOM_INTERNE.min} et ${BORNES_NOM_INTERNE.max} caractères.`;
  }
  if (nom.length < BORNES_NOM_INTERNE.min || nom.length > BORNES_NOM_INTERNE.max) {
    champs.nom = `Le nom tient entre ${BORNES_NOM_INTERNE.min} et ${BORNES_NOM_INTERNE.max} caractères.`;
  }
  if (!(ROLES_A_LA_CREATION as readonly string[]).includes(saisie.role)) {
    champs.role =
      saisie.role === "SUPER_ADMIN"
        ? "Le rôle de super-administrateur ne se donne pas à la création : crée le compte, laisse la personne vérifier son adresse, puis change son rôle."
        : "Choisis Analyste réglementaire ou Administration.";
  }
  if (motif.length < MOTIF_MIN || motif.length > MOTIF_MAX) {
    champs.motif = `Écris pourquoi, entre ${MOTIF_MIN} et ${MOTIF_MAX} caractères : le motif part au journal d'audit.`;
  }
  if (Object.keys(champs).length > 0) return { ok: false, champs };
  return { ok: true, creation: { email, prenom, nom, role: saisie.role as RoleALaCreation, motif } };
}

/**
 * La seconde confirmation d'un changement de rôle : l'adresse du compte,
 * ressaisie. Casse et blancs ignorés, rien d'autre.
 */
export const confirmationJuste = (saisie: string, email: string): boolean =>
  saisie.trim().toLowerCase() === email.trim().toLowerCase() && email.trim().length > 0;

export interface CibleDeSuspension {
  id: string;
  role: RoleDeCompte;
  suspendu: boolean;
  supprime: boolean;
}

export type VerdictDeSuspension = { permis: true } | { permis: false; raison: string };

/**
 * Suspendre (ou rétablir) est-il permis ?
 *
 * - un compte supprimé n'a plus personne à suspendre ;
 * - personne ne se suspend soi-même depuis le back-office ;
 * - un compte interne ne se suspend ou ne se rétablit que depuis le rôle
 *   super-administrateur ;
 * - le dernier super-administrateur actif ne se suspend pas.
 */
export function verdictDeSuspension(
  acteur: { id: string; role: RoleDeCompte },
  cible: CibleDeSuspension,
  suspendre: boolean,
  superAdminsActifs: number,
): VerdictDeSuspension {
  if (!couvre(acteur.role, "ADMIN")) {
    return { permis: false, raison: "Suspendre un compte demande le rôle administrateur." };
  }
  if (cible.supprime) {
    return { permis: false, raison: "Ce compte est supprimé : il n'y a plus personne à suspendre ni à rétablir." };
  }
  if (cible.id === acteur.id) {
    return { permis: false, raison: "Un compte ne se suspend pas lui-même. Un autre super-administrateur peut le faire." };
  }
  if (estInterne(cible.role) && acteur.role !== "SUPER_ADMIN") {
    return {
      permis: false,
      raison: "Ce compte est un compte interne : seul un super-administrateur le suspend ou le rétablit.",
    };
  }
  if (
    suspendre &&
    cible.role === "SUPER_ADMIN" &&
    !cible.suspendu &&
    superAdminsActifs < SUPER_ADMINS_MINIMUM
  ) {
    return {
      permis: false,
      raison: `C'est le dernier super-administrateur actif : il en faut au moins ${SUPER_ADMINS_MINIMUM} pour en suspendre un. Nomme d'abord un autre super-administrateur.`,
    };
  }
  return { permis: true };
}

/**
 * Un compte interne ne se supprime pas lui-même (RG-10.4) : la suppression
 * anonymise le compte et ses traces nominatives, alors que ses gestes au
 * journal d'audit doivent rester attribuables. Il se retire depuis B-03 —
 * rôle rendu à candidat par un super-administrateur, puis suppression.
 */
export const SUPPRESSION_INTERNE_REFUSEE =
  "Un compte interne ne se supprime pas depuis cet écran. Demande à un super-administrateur de lui retirer son rôle depuis Utilisateurs ; la suppression devient alors possible.";
