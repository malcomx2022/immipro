import { PACKS } from "./pricing";

/**
 * Ce que chaque pack donne, tel que la page publique l'annonce — P-06.
 *
 * ── Pourquoi ces phrases quittent l'écran ───────────────────────────
 *
 * Elles y vivaient, sans aucun lien avec la grille qu'elles décrivent, et
 * deux d'entre elles étaient fausses :
 *
 * - **« Comparateur des trois dossiers en parallèle »**, vendu avec Pro.
 *   C-03 compare des **destinations** publiées, pas des dossiers, et il est
 *   ouvert à tout candidat authentifié — il est dans la navigation
 *   principale, sans aucune garde de pack. Le pack vendait donc une chose
 *   que tout le monde a déjà, sous un nom qui désigne autre chose.
 * - **« Rédaction assistée de la lettre de motivation »**, vendue avec
 *   Dossier. Les routes de rédaction ne vérifient aucun pack : elles
 *   débitent le quota d'analyses, et un acheteur d'Essentiel en a dix. La
 *   rédaction est donc disponible dès le premier pack payant, et l'annoncer
 *   au seul Dossier laissait entendre le contraire.
 *
 * Le reste était exact, y compris pour le pack gratuit : un brouillon fige
 * sa version de règle à l'ouverture, il reçoit donc bien les alertes de
 * changement.
 *
 * ── Ce qui décide de ces lignes ─────────────────────────────────────
 *
 * Les nombres sont ceux de `PACKS`, et un test les compare un à un : une
 * grille qui change sans que la page suive est exactement ce qui a produit
 * le défaut précédent — un pack annonçant trois destinations et n'en
 * servant qu'une.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/**
 * Le pack Dossier n'a que deux lignes, et ce n'est pas un oubli.
 *
 * Ce qui le distingue d'Essentiel est son volume d'analyses, et rien
 * d'autre : même destination, mêmes écrans, même rédaction. Lui inventer
 * une troisième ligne pour égaliser les cartes aurait été la même faute que
 * celle qu'on corrige — un avantage écrit pour remplir une place.
 */
export const AVANTAGES: Readonly<Record<string, readonly string[]>> = {
  decouverte: [
    "Simulateur complet et fiches destination",
    "Aperçu de la checklist, sans analyse de pièces",
    "Alertes de changement de règles",
  ],
  essentiel: [
    "Checklist complète et échéancier jusqu'au dépôt",
    `Analyse de ${paquet("essentiel").analyses} pièces, avec message de correction`,
    "Complétude du dossier et prochaine action",
    "Rédaction assistée de la lettre de motivation",
  ],
  dossier: [
    "Tout l'Essentiel, sur une destination",
    `Analyse de ${paquet("dossier").analyses} pièces`,
  ],
  pro: [
    "Tout le pack Dossier, sur trois destinations",
    `Analyse de ${paquet("pro").analyses} pièces`,
    "Les trois destinations s'ouvrent quand tu veux, sans repayer",
  ],
};

export const SOUS_TITRES: Readonly<Record<string, string>> = {
  decouverte: "Pour savoir où tu en es.",
  essentiel: "Un dossier, une destination.",
  dossier: "Une destination, analyse étendue.",
  pro: "Trois destinations, ouvertes à ton rythme.",
};

/**
 * Le pack par son code, ou une erreur explicite.
 *
 * Les nombres des avantages viennent de la grille et ne sont jamais
 * recopiés : un littéral se désynchronise en silence, et c'est le
 * mécanisme exact du défaut que ce module corrige.
 */
function paquet(code: string) {
  const pack = PACKS.find((p) => p.code === code);
  if (!pack) throw new Error(`Avantage écrit pour un pack absent de la grille : ${code}`);
  return pack;
}
