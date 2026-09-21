import type { Paragraphe } from "./versions";

/**
 * Le document Word d'une pièce rédigée — WF-08 étape 6.
 *
 * ── Pourquoi écrire le format à la main ────────────────────────────────
 *
 * L.3 a tranché pour l'archive : « Une bibliothèque de génération pèserait
 * plus que le reste de l'application et rendrait un document moins fidèle
 * que la page elle-même. » Le raisonnement vaut ici pour le PDF — il reste
 * celui du navigateur — mais pas pour le DOCX : personne n'imprime un
 * fichier Word, et une université qui demande un document modifiable ne se
 * contente pas d'un PDF.
 *
 * Un DOCX est une archive ZIP de quelques fichiers XML. Les produire ne
 * demande aucune dépendance : le XML s'écrit ici, en fonction pure du
 * texte, et l'archive se scelle avec le `zlib` de la plateforme. C'est la
 * même discipline que L.2, qui refusait une bibliothèque d'archivage pour
 * empaqueter des pièces — refuser la dépendance, pas la fonction.
 *
 * ── Ce que le document porte, et qui ne se négocie pas ─────────────────
 *
 * La mention de RG-08.1 voyage **dans le fichier**, pas seulement à
 * l'écran. C'est tout l'intérêt de la règle : le document sort de la
 * plateforme, il sera lu par quelqu'un qui n'a pas vu l'écran, et c'est
 * précisément là qu'il doit dire ce qu'il est.
 *
 * Module pur : aucune dépendance à Prisma, Next, au réseau ou à la
 * plateforme. Le XML est une chaîne ; c'est l'appelant qui la scelle.
 */

/**
 * Échappement XML. Les cinq entités, et dans cet ordre : remplacer `&`
 * après `<` rendrait `&lt;` en `&amp;lt;`.
 */
export function echapperXml(valeur: string): string {
  return valeur
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

/** Une pièce du paquet : son chemin dans l'archive, et son contenu. */
export interface PieceDuPaquet {
  chemin: string;
  contenu: string;
}

const ENTETE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const NS_W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/**
 * Un paragraphe WordprocessingML.
 *
 * Les sauts de ligne internes deviennent des `<w:br/>` : un texte rédigé
 * en garde, et les perdre collerait deux phrases que le candidat avait
 * séparées.
 */
type Role = "titre" | "intertitre" | "mention";

/**
 * La mise en forme est **directe**, sans `w:pStyle`.
 *
 * La première version référençait des styles nommés — `Titre`,
 * `Intertitre` — qu'aucun `styles.xml` ne définissait : un traitement de
 * texte les ignore silencieusement, et le document pointait vers ce qui
 * n'existait pas. Embarquer une feuille de styles pour trois niveaux
 * demanderait une pièce de plus et une relation de plus, pour un résultat
 * que le gras et l'italique rendent déjà.
 *
 * C'est la discipline du reste du produit, appliquée à un format de
 * fichier : ne pas nommer ce qui n'est pas là.
 */
const MISE: Record<Role, string> = {
  titre: '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>',
  intertitre: "<w:rPr><w:b/><w:caps/></w:rPr>",
  mention: '<w:rPr><w:i/><w:sz w:val="18"/></w:rPr>',
};

function paragraphe(texte: string, role?: Role): string {
  const runs = texte
    .split("\n")
    .map(
      (ligne, rang) =>
        `${rang > 0 ? "<w:br/>" : ""}<w:t xml:space="preserve">${echapperXml(ligne)}</w:t>`,
    )
    .join("");

  return `<w:p><w:r>${role ? MISE[role] : ""}${runs}</w:r></w:p>`;
}

export interface DocumentRedige {
  /** Le titre de la pièce, tel que la checklist la nomme. */
  titre: string;
  paragraphes: readonly Paragraphe[];
  /** La mention de RG-08.1. Elle voyage dans le fichier, jamais en option. */
  mention: string;
}

/**
 * Le corps du document.
 *
 * L'ordre n'est pas décoratif : le titre, le texte, puis la mention en
 * dernier. Placée en tête, elle serait lue avant la lettre et la
 * présenterait comme un brouillon ; en pied, elle dit ce que le lecteur a
 * sous les yeux après l'avoir lu.
 */
export function documentXml(document: DocumentRedige): string {
  const corps = [
    paragraphe(document.titre, "titre"),
    ...document.paragraphes.flatMap((p) =>
      p.section
        ? [paragraphe(p.section, "intertitre"), paragraphe(p.texte)]
        : [paragraphe(p.texte)],
    ),
    paragraphe(document.mention, "mention"),
  ].join("");

  return `${ENTETE}<w:document ${NS_W}><w:body>${corps}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418"/></w:sectPr></w:body></w:document>`;
}

/**
 * Les types de contenu. Sans ce fichier, un traitement de texte refuse
 * l'archive avant même de la lire : c'est lui qui dit que le paquet est un
 * document Word et non un ZIP quelconque.
 */
const CONTENT_TYPES = `${ENTETE}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

/** La relation racine : elle désigne quelle pièce est le document principal. */
const RELATIONS = `${ENTETE}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

/**
 * Les trois pièces d'un DOCX minimal valide, dans l'ordre où elles doivent
 * entrer dans l'archive : `[Content_Types].xml` en premier, parce que
 * certains lecteurs le cherchent au début du flux plutôt que dans le
 * répertoire central.
 */
export function piecesDuDocument(document: DocumentRedige): PieceDuPaquet[] {
  return [
    { chemin: "[Content_Types].xml", contenu: CONTENT_TYPES },
    { chemin: "_rels/.rels", contenu: RELATIONS },
    { chemin: "word/document.xml", contenu: documentXml(document) },
  ];
}

export const TYPE_MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * « lettre-de-motivation-2026-09-21.docx ». Le nom porte la pièce et le
 * jour : un fichier retrouvé six mois plus tard dans un dossier de
 * téléchargements ne dit rien de lui-même autrement.
 */
export function nomDuFichierRedige(
  libelle: string,
  jour: string,
  extension: string,
): string {
  const base = libelle
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  return `${base}-${jour}.${extension}`;
}
