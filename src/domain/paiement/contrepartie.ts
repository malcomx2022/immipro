/**
 * Ce que le candidat reçoit pour son argent — arbitrage du 22/09/2026.
 *
 * ── Ce qui n'allait pas ─────────────────────────────────────────────
 *
 * Trois achats traversent le tunnel de paiement, et ses deux derniers
 * écrans n'en connaissaient qu'un. $-03 annonçait « Nous recevons la
 * confirmation, ton pack s'ouvre » et $-04 « Ton dossier est ouvert » —
 * à qui venait de payer quarante-cinq minutes d'entretien avec un
 * consultant, ou dix analyses de pièces.
 *
 * Ce n'est pas un défaut de vocabulaire. Ces deux phrases sont les seules
 * de tout le parcours qui nomment la **contrepartie** : ce que la somme
 * achète. Les lire fausses au moment où l'on vient de payer, c'est douter
 * d'avoir acheté la bonne chose — et pour une consultation, c'était
 * exact : rien n'allait s'ouvrir, un créneau allait se réserver.
 *
 * ── Pourquoi un module à part ───────────────────────────────────────
 *
 * Parce que la même question se pose deux fois, au futur et au passé, sur
 * deux écrans différents. Écrite dans chacun, elle a déjà divergé une
 * fois : $-03 disait « pack » là où $-04 disait « dossier », pour le même
 * achat. Ici, les deux formulations d'une catégorie se lisent côte à
 * côte, et un `switch` exhaustif force à répondre pour toute catégorie
 * nouvelle — c'est la règle de `domain/payments/achat.ts`, appliquée à ce
 * que l'achat donne au lieu de ce qu'il coûte.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import type { Achat } from "../payments/achat";

/**
 * Au futur — dernière étape du fil de $-03, pendant que le paiement se
 * confirme. « Nous recevons la confirmation, … »
 */
export function ceQuiSOuvre(achat: Achat): string {
  switch (achat.type) {
    case "pack":
      return "ton pack s'ouvre";
    case "recharge":
      return "tes analyses sont créditées";
    case "consultation":
      return "ton créneau est réservé";
    default: {
      const jamais: never = achat;
      throw new Error(`Achat sans contrepartie annoncée : ${JSON.stringify(jamais)}`);
    }
  }
}

/**
 * Au passé — première phrase de $-04, une fois la notification signée
 * passée. Phrase entière et non fragment : une phrase à trous autour de
 * la contrepartie produirait les accords faux qu'O.A a déjà payés une
 * fois sur le nom des émetteurs.
 *
 * Aucune ne promet quoi que ce soit de la décision administrative
 * (INV-1) : ce qui est ouvert est un dossier à préparer, pas une issue.
 */
export function phraseDeConfirmation(achat: Achat): string {
  switch (achat.type) {
    case "pack":
      return "Ton dossier est ouvert.";
    case "recharge":
      return "Tes analyses supplémentaires sont créditées.";
    case "consultation":
      return "Ton rendez-vous est réservé.";
    default: {
      const jamais: never = achat;
      throw new Error(`Achat sans phrase de confirmation : ${JSON.stringify(jamais)}`);
    }
  }
}

/**
 * Ce que le bouton de suite propose.
 *
 * Après un pack, la checklist : c'est là que le travail commence. Après
 * une consultation, le dossier — le rendez-vous s'y retrouve, et la
 * checklist n'a pas changé du fait de l'avoir pris.
 */
export function actionApresLAchat(achat: Achat): string {
  switch (achat.type) {
    case "pack":
      return "Ouvrir ma checklist";
    case "recharge":
      return "Revenir à ma pièce";
    case "consultation":
      return "Revenir à mon dossier";
    default: {
      const jamais: never = achat;
      throw new Error(`Achat sans suite proposée : ${JSON.stringify(jamais)}`);
    }
  }
}
