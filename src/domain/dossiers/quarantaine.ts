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

/** Ce qu'un aperçu refusé dit, par état. `null` quand la pièce s'ouvre. */
export function mentionApercu(etat: EtatBalayage): string | null {
  switch (etat) {
    case "EN_QUARANTAINE":
      return MENTION_EN_QUARANTAINE;
    case "INFECTEE":
      return "Ce fichier a été écarté au contrôle et n'a pas été conservé. Dépose une nouvelle version de la pièce.";
    default:
      return null;
  }
}

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
