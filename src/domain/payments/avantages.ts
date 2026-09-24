import { PACKS, analysesParDestination } from "./pricing";

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
 *   Dossier alors que les routes ne vérifiaient aucun pack. Depuis
 *   l'arbitrage S.80, elles vérifient la couverture du dossier, et la ligne
 *   est revenue à Dossier — cette fois parce que le code la tient.
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
 * Arbitrage S.80 : la rédaction assistée est un droit de Dossier et de
 * Dossier Pro.
 *
 * Elle était annoncée avec Essentiel, et c'était exact tant que ses routes
 * ne vérifiaient aucun pack. Elles vérifient désormais la couverture du
 * dossier (`server/acces/droits`). Essentiel annonce donc ce qu'il garde —
 * écrire soi-même, avec l'entretien, les versions et les exports —, et
 * Dossier ce que le service ajoute. La ligne se lit dans la grille
 * (`redactionAssistee`), et un test vérifie qu'elle est annoncée là où elle
 * s'ouvre, et nulle part ailleurs.
 *
 * Pro se présente pour ce qu'il donne : trois couvertures Dossier. Le
 * comparateur de dossiers n'est pas en V1 et ne s'annonce pas ; celui des
 * destinations est ouvert à tous et ne s'annonce pas non plus.
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
    "Entretien guidé pour écrire tes pièces, avec versions et exports",
  ],
  dossier: [
    "Tout l'Essentiel, sur une destination",
    `Analyse de ${paquet("dossier").analyses} pièces`,
    "Rédaction assistée : proposition de texte à partir de tes réponses, et relecture critique",
  ],
  pro: [
    `Trois couvertures Dossier : ${paquet("pro").destinations} destinations, ouvertes à ton rythme`,
    `${analysesParDestination(paquet("pro"))} analyses par destination, ${paquet("pro").analyses} en tout`,
    "La rédaction assistée sur chacune",
  ],
};

export const SOUS_TITRES: Readonly<Record<string, string>> = {
  decouverte: "Pour savoir où tu en es.",
  essentiel: "Un dossier, une destination.",
  dossier: "Une destination, analyse étendue et rédaction assistée.",
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
