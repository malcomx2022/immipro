/**
 * L'adaptateur SMTP — arbitrage du 22/09/2026.
 *
 * ── Pourquoi nodemailer ─────────────────────────────────────────────
 *
 * Parler SMTP à la main demande d'implémenter EHLO, STARTTLS, AUTH
 * (PLAIN, LOGIN, CRAM-MD5 selon le serveur), l'encodage MIME et
 * l'échappement des en-têtes. Le dernier point n'est pas une commodité :
 * une injection CRLF dans un en-tête laisse ajouter un destinataire à un
 * message qu'on croit adresser à une seule personne, et nos objets sont
 * composés à l'exécution.
 *
 * `nodemailer` est la bibliothèque de référence de l'écosystème Node
 * pour cela, encore publiée, et **déjà présente dans l'arbre** :
 * `next-auth` la déclare en pair facultatif. L'ajouter ne fait donc pas
 * entrer une nouvelle famille de code dans le dépôt — elle y était,
 * simplement personne ne s'en servait.
 *
 * Version 10, et pas la 7 que le pair facultatif de `next-auth`
 * réclamait : la 7 porte dix avis de sécurité ouverts, dont deux de
 * gravité haute — parmi eux une complexité quadratique de l'analyseur
 * d'adresses, atteignable puisque nos destinataires sont des adresses
 * saisies à l'inscription. Le conflit de pair est résolu par un
 * `overrides` dans `package.json`, et non par `--legacy-peer-deps` :
 * `npm ci` doit reproduire le même arbre que `npm install`.
 *
 * ── Ce que cet adaptateur ne fait pas ────────────────────────────────
 *
 * Il ne journalise ni l'objet, ni le corps, ni le mot de passe. La règle
 * et sa raison vivent dans `domain/courrier/transport.ts` : l'objet d'un
 * code de vérification **est** le code.
 *
 * Il ne se construit qu'au premier envoi, et se garde ensuite : ouvrir un
 * pool de connexions au chargement du module ferait qu'un script de
 * migration, un test ou une commande hors ligne tiendrait une connexion
 * SMTP ouverte sans jamais envoyer un courrier.
 */
import nodemailer, { type Transporter } from "nodemailer";
import {
  DELAI_ACCUEIL_MS,
  DELAI_CONNEXION_MS,
  DELAI_ENVOI_MS,
  MOTIF_DEFAUT,
  analyserUrlSmtp,
  type Envoi,
} from "@/domain/courrier/transport";
import type { Courrier } from "@/server/courrier";

/**
 * Les clés lues. `SMTP_FROM` est exigée : un serveur de soumission refuse
 * en général une enveloppe dont l'expéditeur n'est pas le sien, et
 * déduire l'expéditeur de l'identifiant de connexion marcherait chez un
 * hébergeur sur deux. Mieux vaut le dire que le deviner.
 */
export const CLES_SMTP = ["SMTP_URL", "SMTP_FROM"] as const;

interface Construit {
  transporteur: Transporter;
  expediteur: string;
}

/** Mémoïsé par la configuration lue : un `.env` modifié reconstruit. */
let cache: { signature: string; construit: Construit } | null = null;

export const oublierLeTransporteur = (): void => {
  cache = null;
};

export type Construction =
  | { issue: "construit"; construit: Construit }
  | { issue: "non_configure"; detail: string };

/**
 * Construit le transport, ou dit ce qui l'en empêche.
 *
 * Le détail rendu décrit la **forme** attendue et ne cite jamais la
 * valeur lue : une URL SMTP porte son mot de passe, et un détail finit
 * toujours par atteindre un journal.
 */
/**
 * La configuration est-elle lisible ? Sans rien construire.
 *
 * L'état de service passe par ici : construire un transporteur — même
 * sans connexion — à chaque interrogation de `/api/health` reviendrait à
 * fabriquer un objet de pool par appel d'un répartiteur de charge.
 */
export function configurationLisible(
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): { lisible: true } | { lisible: false; detail: string } {
  const lue = analyserUrlSmtp(environnement.SMTP_URL);
  if (!lue.valide) return { lisible: false, detail: MOTIF_DEFAUT[lue.defaut] };
  if ((environnement.SMTP_FROM ?? "").trim() === "") {
    return {
      lisible: false,
      detail: "SMTP_FROM n'est pas renseignée : aucune adresse d'expéditeur à présenter.",
    };
  }
  return { lisible: true };
}

export function construireLeTransporteur(
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Construction {
  const etat = configurationLisible(environnement);
  if (!etat.lisible) return { issue: "non_configure", detail: etat.detail };

  const lue = analyserUrlSmtp(environnement.SMTP_URL);
  if (!lue.valide) return { issue: "non_configure", detail: MOTIF_DEFAUT[lue.defaut] };
  const expediteur = (environnement.SMTP_FROM ?? "").trim();

  /*
    La signature du cache porte sur l'URL brute, mot de passe compris —
    elle ne quitte jamais ce module et n'est jamais journalisée. Sans
    elle, un changement de mot de passe ne reconstruirait pas le
    transport tant que le processus vit.
  */
  const signature = `${environnement.SMTP_URL ?? ""}\u0000${expediteur}`;
  if (cache?.signature === signature) return { issue: "construit", construit: cache.construit };

  // Les identifiants sont relus ici, sur l'URL brute, et ne transitent
  // par aucune valeur de retour du domaine.
  const brute = new URL((environnement.SMTP_URL ?? "").trim());
  const transporteur = nodemailer.createTransport({
    host: lue.url.hote,
    port: lue.url.port,
    secure: lue.url.implicite,
    ...(lue.url.avecAuth
      ? {
          auth: {
            user: decodeURIComponent(brute.username),
            pass: decodeURIComponent(brute.password),
          },
        }
      : {}),
    connectionTimeout: DELAI_CONNEXION_MS,
    greetingTimeout: DELAI_ACCUEIL_MS,
    socketTimeout: DELAI_ENVOI_MS,
    // Rien de ce que nous envoyons n'a de pièce jointe ni d'image
    // distante : le dire ferme deux familles d'abus d'un coup.
    disableFileAccess: true,
    disableUrlAccess: true,
  });

  const construit = { transporteur, expediteur };
  cache = { signature, construit };
  return { issue: "construit", construit };
}

/**
 * Traduit l'échec de nodemailer en issue.
 *
 * La frontière qui compte est la même que pour les paiements : **une
 * absence de réponse n'est pas un refus**. Un délai dépassé rend
 * `injoignable`, si bien qu'un renvoi reste proposé ; un serveur qui a
 * répondu « non » rend `refuse`, et renvoyer à l'identique ne servirait
 * à rien.
 *
 * Le détail est le code de l'erreur et, s'il existe, le code de réponse
 * SMTP — jamais le message du serveur, qui peut recopier l'adresse du
 * destinataire, et jamais l'erreur brute, qui recopie parfois la
 * commande envoyée.
 */
export function issueDeLErreur(erreur: unknown): Envoi {
  const lu = erreur as { code?: unknown; responseCode?: unknown } | null;
  const code = typeof lu?.code === "string" ? lu.code : "";
  const reponse = typeof lu?.responseCode === "number" ? lu.responseCode : null;
  const detail = reponse === null ? code || "erreur sans code" : `${code || "SMTP"} ${reponse}`;

  switch (code) {
    case "EAUTH":
      return { issue: "refuse", detail: `authentification refusée (${detail})` };
    case "EENVELOPE":
      return { issue: "refuse", detail: `enveloppe refusée (${detail})` };
    case "EMESSAGE":
      return { issue: "refuse", detail: `message refusé (${detail})` };
    case "ETIMEDOUT":
    case "ECONNECTION":
    case "ESOCKET":
    case "EDNS":
      return { issue: "injoignable", detail };
    default:
      /*
        Un code inconnu penche vers l'injoignable, et c'est délibéré :
        entre laisser un candidat sans code de vérification et lui en
        envoyer deux, le second est le moindre mal. Un 5xx qu'on aurait
        mal rangé se verra au journal, qui porte le code.
      */
      return reponse !== null && reponse >= 500
        ? { issue: "refuse", detail }
        : { issue: "injoignable", detail };
  }
}

/**
 * Envoie, et rend l'issue. Ne lève pas : un serveur muet est un cas
 * ordinaire du métier, pas une erreur de programmation.
 */
export async function envoyerParSmtp(
  courrier: Courrier,
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Promise<Envoi> {
  const construction = construireLeTransporteur(environnement);
  if (construction.issue === "non_configure") return construction;

  try {
    const info = await construction.construit.transporteur.sendMail({
      from: construction.construit.expediteur,
      to: courrier.destinataire,
      subject: courrier.objet,
      text: courrier.corps,
    });
    /*
      Un serveur peut accepter la transaction et refuser le destinataire
      dans le même échange : `rejected` le dit, et sans cette lecture on
      compterait un envoi qui n'a atteint personne.
    */
    const refuses = (info as { rejected?: unknown[] }).rejected ?? [];
    if (refuses.length > 0) {
      return { issue: "refuse", detail: `destinataire refusé (${refuses.length})` };
    }
    return { issue: "envoye" };
  } catch (erreur) {
    return issueDeLErreur(erreur);
  }
}

/**
 * La vérification de connexion — sonde sûre, et rien de plus.
 *
 * `verify()` ouvre la connexion, dit bonjour, s'authentifie si besoin, et
 * raccroche : **aucun message n'est remis**. C'est ce qui permet de
 * l'appeler au démarrage du worker sans écrire à personne.
 *
 * Elle n'est pas appelée depuis `/api/health` : cette adresse-là est
 * interrogée par un répartiteur de charge, et la décision de n'en rien
 * faire partir est déjà prise (arbitrage du 21/09). Ce que l'état de
 * service lit est le **dernier fait** — ce que cette sonde ou un envoi
 * réel a établi.
 */
export async function verifierLaConnexion(
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Promise<Envoi> {
  const construction = construireLeTransporteur(environnement);
  if (construction.issue === "non_configure") return construction;
  try {
    await construction.construit.transporteur.verify();
    return { issue: "envoye" };
  } catch (erreur) {
    return issueDeLErreur(erreur);
  }
}
