import { VALIDITE_MINUTES } from "@/domain/comptes/code-verification";
import { CONFIRMATION_AU_CANDIDAT } from "@/domain/paiement/remboursement";
import {
  libelleFormat,
  libelleLimiteAnnulation,
  libelleRendezVous,
  type Creneau,
} from "@/domain/consultants/rendez-vous";
import { verifierTexte, INTERDITS_PARTOUT } from "@/domain/copy/vocabulaire-interdit";
import { traceDEnvoi, type DernierFait, type Envoi } from "@/domain/courrier/transport";
import { sondeDuConstat, type Constat } from "@/domain/exploitation/constats";
import { noterLeConstat } from "@/server/exploitation/constats";
import type { Sonde } from "@/domain/exploitation/dependances";
import { configurationLisible, envoyerParSmtp } from "@/server/courrier/smtp";

/**
 * Courriers transactionnels — A-03, $-04, T-05 ; transport branché le
 * 22/09/2026.
 *
 * **Le transport part maintenant pour de bon.** `SMTP_URL` lue et
 * valide, les codes de vérification, les réinitialisations, les reçus,
 * les confirmations d'entretien et de remboursement sont remis à un
 * serveur SMTP (`courrier/smtp.ts`). Absente, la dégradation ne change
 * pas : rien ne part, l'appelant le sait, et la messagerie reste
 * bloquante pour l'ouverture au public.
 *
 * ── Ce qui a changé pour les appelants ──────────────────────────────
 *
 * `expedier` **rend une issue** au lieu de ne rien rendre. Tant que rien
 * ne partait, ne rien rendre était tolérable ; maintenant qu'un envoi
 * peut échouer pour cinq raisons distinctes, un appelant qui n'apprend
 * rien affirme des choses fausses. La route de renvoi de code répondait
 * `{ envoye: true }` devant un transport muet, et l'écran affichait « un
 * nouveau code est parti » — il n'en partait aucun.
 *
 * ── Ce qui ne se journalise pas ─────────────────────────────────────
 *
 * Ni l'objet, ni le corps. L'objet paraissait anodin : il **est** le
 * code de vérification (`481920 — ton code de vérification ImmiPro`).
 * Le transport de repli l'écrivait à chaque envoi, ce qui mettait le
 * code d'ouverture de chaque compte dans le journal du serveur — donc
 * dans un agrégateur conservé des semaines, hors de toute purge. La
 * règle et sa raison vivent dans `domain/courrier/transport.ts`.
 *
 * **Le vocabulaire interdit s'applique ici aussi.** INV-2 dit « aucune
 * promesse de résultat, nulle part : interface, emails, documents
 * générés ». La vérification a lieu avant le transport, quel qu'il
 * soit : un courrier fautif ne part pas.
 */

export interface Courrier {
  destinataire: string;
  objet: string;
  corps: string;
  /**
   * De quel courrier il s'agit, pour le journal. Donné, jamais déduit de
   * l'objet : déduire du texte reviendrait à en journaliser un morceau,
   * et un jour ce morceau porterait un code.
   */
  genre: string;
}

export type Transport = (courrier: Courrier) => Promise<Envoi>;

/**
 * Transport par défaut. Il écrit une trace au journal — genre, domaine,
 * issue — et signale l'absence de configuration une fois par démarrage,
 * pas à chaque envoi : un avertissement répété mille fois ne se lit plus.
 *
 * Il rend `journalise`, jamais `envoye` : c'est toute la différence
 * entre une dégradation honnête et un service qui ment.
 */
let signale = false;

const journaliser: Transport = async (courrier) => {
  if (!signale) {
    signale = true;
    console.warn(
      "[courrier] transport non branché : les courriers sont tracés, pas expédiés.",
    );
  }
  console.info(traceDEnvoi(courrier.genre, courrier.destinataire, "journalise"));
  return { issue: "journalise" };
};

/**
 * Le transport par défaut, exporté pour que l'état de service puisse le
 * reconnaître : tant que `leTransport()` rend celui-ci, aucun courrier ne
 * part, quelle que soit la valeur de `SMTP_URL`. C'est exactement le cas
 * qui faisait répondre « ok » à une installation muette.
 */
export const TRANSPORT_JOURNAL: Transport = journaliser;

/**
 * Le transport SMTP, qui remet réellement le message.
 *
 * Il est construit paresseusement par `courrier/smtp.ts` : ce module-ci
 * n'ouvre aucune connexion, et une commande hors ligne qui l'importe
 * n'en ouvre pas davantage.
 */
export const TRANSPORT_SMTP: Transport = async (courrier) => {
  const issue = await envoyerParSmtp(courrier);
  console.info(traceDEnvoi(courrier.genre, courrier.destinataire, issue.issue));
  return issue;
};

let remplacant: Transport | null = null;

/** Point d'entrée des tests et d'un branchement explicite. */
export const brancherTransport = (nouveau: Transport | null): void => {
  remplacant = nouveau;
};

/**
 * Le transport que `expedier` utilisera, demandé au moment de l'envoi.
 *
 * Il suit la configuration : une `SMTP_URL` lisible donne le transport
 * SMTP, son absence donne le journal. L'état de service interroge ce
 * même résolveur, si bien qu'il rend compte de ce que l'appelant
 * exécutera — et non de ce que le `.env` laisse espérer.
 */
export const leTransport = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Transport => {
  if (remplacant) return remplacant;
  return configurationLisible(environnement).lisible ? TRANSPORT_SMTP : TRANSPORT_JOURNAL;
};

/**
 * Le dernier fait établi — un envoi réel, ou une vérification de
 * connexion réelle. C'est la seule chose sur laquelle la sonde conclut.
 *
 * **Une URL qui s'analyse ne prouve rien** : c'est la leçon de
 * l'arbitrage du 21/09 sur les capacités, et la retenir ici veut dire
 * que la messagerie ne se déclare opérationnelle qu'après avoir
 * réellement parlé à un serveur. Le worker s'en charge au démarrage
 * (`verifierLaConnexion`), et chaque envoi rafraîchit le constat.
 *
 * ── Il ne traversait pas la frontière des processus (22/09/2026) ────
 *
 * Il vivait ici, dans une variable de module. Le worker le posait, et
 * `/api/health` — qui est dans **l'autre** processus — lisait toujours
 * `null`. La messagerie étant bloquante, l'instance restait inapte
 * indéfiniment, sans qu'aucun déploiement puisse y changer quoi que ce
 * soit. Le constat passe maintenant par la base
 * (`server/exploitation/constats.ts`), qui est le seul état partagé.
 *
 * La variable reste, et ne sert plus qu'au processus courant : elle
 * évite une lecture en base là où le fait vient d'être établi, et elle
 * porte la trace quand aucune base n'est là — les tests, une commande
 * hors ligne. Elle n'est plus ce sur quoi l'état de service conclut.
 *
 * Ce que cette lecture **ne** dit **pas** : que le transport marche en
 * ce moment. Elle dit ce qui s'est passé la dernière fois qu'on a
 * essayé — et, depuis ce lot, **quand**, parce qu'un constat périmé ne
 * conclut plus rien.
 */
let dernier: DernierFait | null = null;

export const noterLeFait = (reussi: boolean, quand = new Date()): void => {
  dernier = { reussi, quand };
};

export const leDernierFait = (): DernierFait | null => dernier;

export const oublierLesFaits = (): void => {
  dernier = null;
  signale = false;
};

/**
 * La sonde de l'état de service. Locale, sans effet de bord, sans réseau.
 *
 * Le constat lui est **passé** : il vient de la base, et c'est ce qui
 * lui permet de conclure sur ce que le worker a établi. À défaut — un
 * test, une commande hors ligne —, elle retombe sur le fait du
 * processus courant.
 */
export const sonderLeCourrier = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
  constat: Constat | undefined = dernier ?? undefined,
  maintenant = new Date(),
): Sonde =>
  sondeDuConstat(configurationLisible(environnement).lisible, constat, maintenant);

/**
 * Expédie, et rend ce qui s'est passé.
 *
 * Le refus pour vocabulaire interdit **lève** plutôt que de rendre une
 * issue : ce n'est pas un incident d'exploitation, c'est un défaut de
 * notre propre texte, et il doit réveiller un développeur plutôt que
 * d'être compté comme un envoi manqué de plus.
 */
export async function expedier(courrier: Courrier): Promise<Envoi> {
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
  const issue = await leTransport()(courrier);
  // Un envoi réel est la meilleure preuve qu'il y ait que le transport
  // fonctionne — et un échec réel, la meilleure qu'il ne fonctionne pas.
  // Le journal, lui, n'établit rien : il n'a parlé à personne.
  if (issue.issue !== "journalise") {
    const reussi = issue.issue === "envoye";
    noterLeFait(reussi);
    /*
      Et le constat va en base — 22/09/2026. Un courrier réel part du
      **processus web**, et c'est la meilleure preuve qui soit ; le
      garder en mémoire le laissait mourir avec le processus, et
      laissait l'état de service dépendre du seul worker. Une écriture
      ratée ne fait rien échouer : le courrier, lui, est parti.
    */
    await noterLeConstat("messagerie", reussi, issue.issue);
  }
  return issue;
}

const SIGNATURE = `
—
ImmiPro prépare et informe. La décision appartient à l'autorité consulaire, et le dépôt de la demande t'appartient.`;

export const envoyerCodeDeVerification = (destinataire: string, code: string) =>
  expedier({
    destinataire,
    genre: "code_verification",
    objet: `${code} — ton code de vérification ImmiPro`,
    corps: `Ton code de vérification est ${code}.

Il est valable ${VALIDITE_MINUTES} minutes. Si tu n'as pas créé de compte, ignore ce message : rien n'est ouvert sans ce code.${SIGNATURE}`,
  });

export const envoyerCodeDeReinitialisation = (destinataire: string, code: string) =>
  expedier({
    destinataire,
    genre: "code_reinitialisation",
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
    genre: "compte_deja_ouvert",
    objet: "Tu as déjà un compte ImmiPro",
    corps: `Quelqu'un vient de demander la création d'un compte avec cette adresse, et un compte existe déjà.

Si c'était toi : connecte-toi avec ton mot de passe habituel, ou demande à le réinitialiser depuis l'écran de connexion.

Si ce n'était pas toi : il n'y a rien à faire, aucun compte n'a été créé et rien n'a changé.${SIGNATURE}`,
  });

/** Reçu de paiement — $-04. Le montant est déjà mis en forme par l'appelant. */
export const envoyerRecu = (destinataire: string, reference: string, montant: string) =>
  expedier({
    destinataire,
    genre: "recu",
    objet: `Reçu ImmiPro ${reference}`,
    corps: `Ton paiement de ${montant} est enregistré sous la référence ${reference}.

Le reçu détaillé est consultable dans ton espace, à tout moment.${SIGNATURE}`,
  });

/**
 * Remboursement confirmé — arbitrage du 21/09/2026.
 *
 * Envoyé à la **confirmation**, jamais à la décision ni à l'envoi de la
 * demande : annoncer « c'est remboursé » quand la demande vient seulement
 * de partir, c'est faire chercher sur un relevé une somme qui n'y est pas
 * encore, et transformer une bonne nouvelle en inquiétude.
 *
 * Il n'annonce aucun délai de notre part — il n'est pas le nôtre — mais
 * dit que le compte peut mettre quelques jours à le montrer, parce que
 * c'est la question que le candidat se posera le lendemain.
 */
export const envoyerRemboursementConfirme = (
  destinataire: string,
  reference: string,
  montant: string,
) =>
  expedier({
    destinataire,
    genre: "remboursement_confirme",
    objet: `Remboursement ImmiPro ${reference}`,
    corps: `${CONFIRMATION_AU_CANDIDAT}

Montant : ${montant}, sous la référence ${reference}, qui ne change pas.${SIGNATURE}`,
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
    genre: "alerte_critique",
    objet: `Changement de règle pour ton dossier ${destination}`,
    corps: `Une condition d'éligibilité de ton dossier ${destination} a changé.

Ton dossier est mis en pause le temps que tu regardes : rien n'est supprimé, et ta checklist actuelle reste celle de la version que tu as figée à l'ouverture.

Ouvre ton dossier pour voir ce qui change et décider.${SIGNATURE}`,
  });

export interface ConfirmationEntretien {
  destinataire: string;
  reference: string;
  creneau: Creneau;
  consultant: string;
  /**
   * « Pays-Bas — Séjour pour études », ou nul quand le dossier n'a pas
   * encore de règle figée. La ligne disparaît alors : « Dossier : ton
   * dossier » ne dit rien que l'objet ne dise déjà.
   */
  dossier: string | null;
  /** Jour où l'accord de partage expire de lui-même, déjà mis en forme. */
  partageExpireLe: string;
}

/**
 * Confirmation d'entretien — T-05, I.E.
 *
 * Aucun courrier ne partait : le candidat réservait quarante-cinq minutes
 * payantes et ne recevait rien, alors que l'écran lui annonçait le
 * contraire.
 *
 * Le partage se fait comme pour l'alerte critique (RG-11.3), et pour la
 * même raison : **un email ne se recalcule pas à l'ouverture.** Ce qui est
 * écrit ici est ce qui ne bougera plus — le créneau, la durée, le
 * consultant, la référence, la limite d'annulation opposable, la date où
 * l'accord expire. Ce qui bouge — l'état de la checklist, les pièces qui
 * restent à traiter — n'est pas recopié mais renvoyé au dossier, qui dit
 * l'état du jour. Relu trois semaines plus tard, un courrier qui
 * énumérerait les pièces manquantes ferait préparer les mauvaises.
 *
 * Les horaires suivent le fuseau d'affichage du parcours, et non celui du
 * serveur : les deux ont divergé d'une heure tant que les formateurs
 * écrivaient en UTC sous une phrase qui promettait l'heure locale.
 */
export const envoyerConfirmationEntretien = ({
  destinataire,
  reference,
  creneau,
  consultant,
  dossier,
  partageExpireLe,
}: ConfirmationEntretien) =>
  expedier({
    destinataire,
    genre: "entretien_confirme",
    objet: `Entretien confirmé — ${libelleRendezVous(creneau)}`,
    corps: `Ton entretien avec ${consultant} est réservé.

${libelleRendezVous(creneau)} · ${libelleFormat()}
${dossier ? `Dossier : ${dossier}\n` : ""}Référence : ${reference}

Annulation ou report sans frais jusqu'au ${libelleLimiteAnnulation(creneau)}. Passé ce délai, la consultation est due.

${consultant} accède à ton dossier jusqu'au ${partageExpireLe}, et tu peux retirer cet accord à tout moment.

Ce qu'il reste à préparer avant l'appel change à mesure que tu déposes tes pièces : ouvre ton dossier pour le voir. Ce courrier ne le recopie pas, il serait faux demain.${SIGNATURE}`,
  });
