/**
 * Quarantaine et balayage antivirus — I.D, tranché le 20/09/2026.
 *
 * WF-06 étape 2 demande « une analyse antivirus synchrone avant stockage ».
 * Prise au mot, la phrase ne se tient pas : le moteur doit bien accéder aux
 * octets quelque part, et les octets sont écrits directement dans le
 * stockage par le navigateur, sans transiter par l'application.
 *
 * La frontière utile n'est donc pas « avant toute écriture », elle est
 * **avant l'admission dans le stockage de confiance**. Le fichier est
 * déposé dans une zone de quarantaine dont rien ne sort : ni lecture, ni
 * aperçu, ni extraction. Il n'en est promu qu'une fois balayé.
 *
 * Trois états, et pas un de plus. L'indisponibilité du balayeur n'en est
 * pas un quatrième : un fichier que personne n'a pu lire reste
 * `EN_QUARANTAINE`, c'est-à-dire en attente. Lui inventer un état « balayé,
 * probablement sain » serait exactement ce que la décision refuse — mieux
 * vaut un fichier en attente qu'un fichier accepté par défaut.
 *
 * Les contrôles de nom, de taille et de type MIME restent. Ils ne
 * remplacent rien : un PDF de la bonne taille et du bon type peut porter
 * une charge, et c'est précisément le cas que ces contrôles ne voient pas.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import { ATTENTE_AU_CONTROLE, type CauseDIndisponibilite } from "../securite/balayage";

export type EtatBalayage =
  /** Déposé, pas encore balayé. Rien n'en sort. */
  | "EN_QUARANTAINE"
  /** Balayé sans rien trouver, promu dans le stockage de confiance. */
  | "SAINE"
  /** Balayé, une menace nommée. Les octets sont détruits. */
  | "INFECTEE";

/**
 * Les trois sorties que la décision ferme : téléchargeable, prévisualisable,
 * transmis à l'extraction. Une seule fonction les commande, pour qu'une
 * quatrième sortie ajoutée un jour ait à passer par ici.
 */
export const consultable = (etat: EtatBalayage): boolean => etat === "SAINE";
export const transmissibleALAnalyse = (etat: EtatBalayage): boolean => etat === "SAINE";

/**
 * Ce que le candidat lit sous une pièce qu'il vient de déposer.
 *
 * Elle ne dit pas « analyse antivirus en cours » : le mot n'apprend rien à
 * qui envoie une photo de passeport, et il inquiète. Elle dit ce qui se
 * passe, combien de temps, et surtout que l'attente ne demande rien.
 */
export const MENTION_EN_QUARANTAINE =
  "Ton fichier est en cours de contrôle. Il sera consultable dans quelques instants, tu n'as rien à faire.";

/**
 * Au-delà, « quelques instants » a cessé d'être vrai.
 *
 * Un balayage ordinaire prend quelques secondes. Ce seuil couvre le cas
 * où **rien** n'a été tenté — un worker arrêté, une file qui n'a pas
 * démarré : aucune tentative, donc aucun incident, donc aucun signal.
 * Sans lui, une pièce déposée un vendredi soir devant un worker éteint
 * lirait « dans quelques instants » jusqu'au lundi.
 */
export const ATTENTE_ORDINAIRE_MS = 15 * 60 * 1000;

/** Ce qu'on sait de l'attente d'une pièce encore en quarantaine. */
export interface AttenteAuControle {
  /** Quand la version a été déposée. */
  depuis: Date;
  /** La cause de l'incident ouvert, s'il y en a un. */
  cause?: CauseDIndisponibilite;
}

/**
 * Ce qu'un aperçu refusé dit, par état. `null` quand la pièce s'ouvre.
 *
 * ── « Dans quelques instants », pendant trois jours (22/09/2026) ─────
 *
 * Le message de quarantaine était unique et il promettait une durée :
 * « Il sera consultable dans quelques instants, tu n'as rien à faire. »
 * Vrai pendant les quelques secondes d'un balayage ordinaire.
 *
 * Le lot du balayage a rendu possibles des attentes qui n'en sont pas :
 * une pièce dont le contrôle échoue pour une cause qui ne se reprend
 * pas seule reste en quarantaine **définitivement**, l'incident est
 * ouvert, l'exploitation le voit — et le candidat lisait toujours
 * « quelques instants, tu n'as rien à faire », sur un fichier trop
 * lourd qu'un simple redépôt aurait réglé.
 *
 * C'est ce lot-là qui a créé l'attente longue en refusant de promouvoir
 * ce qui n'a pas été lu ; il lui revenait de finir le travail du côté
 * où on lit.
 */
export function mentionApercu(
  etat: EtatBalayage,
  attente?: AttenteAuControle,
  maintenant = new Date(),
): string | null {
  switch (etat) {
    case "EN_QUARANTAINE":
      return mentionDeLAttente(attente, maintenant);
    case "INFECTEE":
      return "Ce fichier a été écarté au contrôle et n'a pas été conservé. Dépose une nouvelle version de la pièce.";
    default:
      return null;
  }
}

/**
 * Le message d'une pièce encore en quarantaine.
 *
 * Trois cas, et le premier est celui de tous les jours. Sans
 * information sur l'attente — un appelant qui ne la connaît pas —, on
 * retombe sur le message ordinaire : il reste vrai le plus souvent, et
 * inventer une inquiétude serait aussi faux que la taire.
 */
export function mentionDeLAttente(
  attente?: AttenteAuControle,
  maintenant = new Date(),
): string {
  // Une cause connue l'emporte : elle dit ce qui se passe, et parfois
  // quoi faire. C'est plus qu'une durée.
  if (attente?.cause) return ATTENTE_AU_CONTROLE[attente.cause];

  const attendDepuis = attente ? maintenant.getTime() - attente.depuis.getTime() : 0;
  if (attendDepuis > ATTENTE_ORDINAIRE_MS) return MENTION_ATTENTE_PROLONGEE;

  return MENTION_EN_QUARANTAINE;
}

/**
 * Quand l'attente dure sans qu'aucune cause ne soit connue.
 *
 * Il ne promet pas de durée — c'est ce que le message ordinaire faisait
 * et qui devenait faux — et il ne demande rien, parce qu'il n'y a rien
 * à demander : le fichier est là, et c'est de notre côté que ça coince.
 */
export const MENTION_ATTENTE_PROLONGEE =
  "Le contrôle de ton fichier prend plus de temps que prévu. Il est conservé et sera traité dès que possible, tu n'as rien à faire.";

export interface RefusDeContenu {
  titre: string;
  corps: string;
}

/**
 * Le message d'un fichier écarté — RG-06.3 appliqué à un cas où la personne
 * n'a probablement rien fait de mal.
 *
 * Le nom de la menace n'y est pas. Il ne dit rien d'actionnable à un
 * candidat, et il se recopie tel quel dans un moteur de recherche qui rend
 * des pages de désinfection douteuses. Il est écrit en base, pour le
 * back-office, et s'arrête là.
 *
 * La pièce est nommée par son libellé de checklist — « Passeport » — et non
 * par le nom du fichier. La base ne garde pas le nom d'origine : elle garde
 * la clé de stockage, qui est un tirage aléatoire. La première version de ce
 * message affichait donc « 1789932680737-bGA4_uCJbbXacTte », c'est-à-dire
 * rien.
 *
 * Le geste attendu est indiqué, et il est le bon : re-photographier ou
 * réexporter le document depuis l'application d'origine produit un fichier
 * neuf, là où renvoyer le même donnerait le même refus.
 */
export function refusAuControle(libelleDeLaPiece: string): RefusDeContenu {
  return {
    titre: "Ce fichier n'a pas passé le contrôle",
    corps: `Le contrôle de sécurité a écarté le fichier déposé pour « ${libelleDeLaPiece} », et il n'a pas été conservé. Reprends le document à la source — réexporte le PDF depuis ton application bancaire, ou photographie à nouveau la pièce — puis dépose le nouveau fichier.`,
  };
}
