import { VALIDITE_MINUTES } from "@/domain/comptes/code-verification";
import { verifierTexte, INTERDITS_PARTOUT } from "@/domain/copy/vocabulaire-interdit";

/**
 * Courriers transactionnels — A-03, $-04, T-05.
 *
 * Le prototype ne les couvre pas (guide de démarrage, §5). Deux conséquences
 * assumées, plutôt qu'une implémentation qui ferait semblant :
 *
 * **Le transport n'est pas branché.** `SMTP_URL` est vide dans
 * `.env.example` et rien ici ne parle à un serveur de messagerie. Ce module
 * met en forme, journalise, et rend la main. Le jour où un transport arrive,
 * c'est `expedier` qui change, pas les appelants.
 *
 * **Un envoi manqué ne se tait pas.** Une adresse non vérifiée bloque le
 * dépôt de pièces, un code non reçu bloque l'inscription : avaler l'échec
 * ferait passer un défaut d'infrastructure pour une erreur de l'utilisateur.
 * Le journal du serveur porte l'échec, et l'appelant décide.
 *
 * **Le vocabulaire interdit s'applique ici aussi.** INV-2 dit « aucune
 * promesse de résultat, nulle part : interface, emails, documents générés ».
 * L'email est le seul de ces trois supports que `npm run check:copy` ne
 * relit pas au même titre qu'un écran, puisque son texte peut être composé
 * à l'exécution — d'où la vérification au moment de l'envoi.
 */

export interface Courrier {
  destinataire: string;
  objet: string;
  corps: string;
}

export type Transport = (courrier: Courrier) => Promise<void>;

/**
 * Transport par défaut. Il écrit dans le journal du serveur et signale
 * l'absence de configuration une fois par démarrage, pas à chaque envoi :
 * un avertissement répété mille fois ne se lit plus.
 */
let signale = false;

const journaliser: Transport = async (courrier) => {
  if (!process.env.SMTP_URL && !signale) {
    signale = true;
    console.warn(
      "[courrier] SMTP_URL absent : les courriers sont journalisés, pas expédiés.",
    );
  }
  console.info(`[courrier] → ${courrier.destinataire} · ${courrier.objet}`);
};

let transport: Transport = journaliser;

/** Point d'entrée du branchement, et des tests. */
export const brancherTransport = (nouveau: Transport): void => {
  transport = nouveau;
};

export async function expedier(courrier: Courrier): Promise<void> {
  const fautes = [
    ...verifierTexte(courrier.objet, INTERDITS_PARTOUT),
    ...verifierTexte(courrier.corps, INTERDITS_PARTOUT),
  ];
  if (fautes.length > 0) {
    // INV-2. Un courrier fautif ne part pas : il est plus facile de réparer
    // un envoi manquant qu'une promesse envoyée à mille adresses.
    throw new Error(
      `INV-2 : courrier refusé, formulation interdite — ${fautes.map((f) => f.extrait).join(", ")}`,
    );
  }
  await transport(courrier);
}

const SIGNATURE = `
—
ImmiPro prépare et informe. La décision appartient à l'autorité consulaire, et le dépôt de la demande t'appartient.`;

export const envoyerCodeDeVerification = (destinataire: string, code: string) =>
  expedier({
    destinataire,
    objet: `${code} — ton code de vérification ImmiPro`,
    corps: `Ton code de vérification est ${code}.

Il est valable ${VALIDITE_MINUTES} minutes. Si tu n'as pas créé de compte, ignore ce message : rien n'est ouvert sans ce code.${SIGNATURE}`,
  });

export const envoyerCodeDeReinitialisation = (destinataire: string, code: string) =>
  expedier({
    destinataire,
    objet: `${code} — code de réinitialisation ImmiPro`,
    corps: `Ton code de réinitialisation est ${code}.

Il est valable ${VALIDITE_MINUTES} minutes. Si tu n'as rien demandé, ignore ce message : ton mot de passe actuel reste valable.${SIGNATURE}`,
  });

/**
 * Adresse déjà inscrite. C'est ce courrier qui distingue les deux issues
 * d'une inscription, puisque l'écran rend la même réponse dans les deux cas.
 */
export const envoyerCompteDejaOuvert = (destinataire: string) =>
  expedier({
    destinataire,
    objet: "Tu as déjà un compte ImmiPro",
    corps: `Quelqu'un vient de demander la création d'un compte avec cette adresse, et un compte existe déjà.

Si c'était toi : connecte-toi avec ton mot de passe habituel, ou demande à le réinitialiser depuis l'écran de connexion.

Si ce n'était pas toi : il n'y a rien à faire, aucun compte n'a été créé et rien n'a changé.${SIGNATURE}`,
  });

/** Reçu de paiement — $-04. Le montant est déjà mis en forme par l'appelant. */
export const envoyerRecu = (destinataire: string, reference: string, montant: string) =>
  expedier({
    destinataire,
    objet: `Reçu ImmiPro ${reference}`,
    corps: `Ton paiement de ${montant} est enregistré sous la référence ${reference}.

Le reçu détaillé est consultable dans ton espace, à tout moment.${SIGNATURE}`,
  });

/**
 * Changement réglementaire critique — RG-11.3 : « un changement critique est
 * doublé d'un email nominatif, pas seulement d'une notification in-app. »
 *
 * Le courrier ne recopie pas le détail de la divergence. Un email ne se
 * recalcule pas à l'ouverture : lu trois semaines plus tard, un texte qui
 * décrit l'écart pourrait contredire l'écran. Il renvoie donc à l'écran, qui
 * dit l'état du jour.
 */
export const envoyerAlerteCritique = (destinataire: string, destination: string) =>
  expedier({
    destinataire,
    objet: `Changement de règle pour ton dossier ${destination}`,
    corps: `Une condition d'éligibilité de ton dossier ${destination} a changé.

Ton dossier est mis en pause le temps que tu regardes : rien n'est supprimé, et ta checklist actuelle reste celle de la version que tu as figée à l'ouverture.

Ouvre ton dossier pour voir ce qui change et décider.${SIGNATURE}`,
  });
