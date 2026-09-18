/**
 * Vocabulaire interdit — INV-1, INV-2.
 *
 * Source unique. Le script `check:copy`, le test de l'interface candidat et,
 * demain, la validation à l'enregistrement côté back-office lisent tous cette
 * liste. Un administrateur qui saisit une promesse dans un guide pays doit
 * buter sur la même règle qu'un développeur : sinon le garde-fou ne protège
 * que le code, et la dérive viendra du contenu.
 *
 * Deux portées, parce que deux interdits différents :
 *
 * - `INTERDITS_PARTOUT` — les promesses de résultat. Elles n'ont leur place
 *   nulle part, ni dans l'interface, ni dans le contenu, ni dans un seed.
 * - `INTERDITS_INTERFACE_CANDIDAT` — le vocabulaire de la note de dossier.
 *   Il est légitime dans `domain/completeness/` où le barème interne vit ;
 *   il ne l'est pas sur un écran candidat (arbitrage C-09).
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface MotifInterdit {
  code: string;
  motif: RegExp;
  raison: string;
}

export const INTERDITS_PARTOUT: readonly MotifInterdit[] = [
  { code: "chances-obtention", motif: /chances?\s+d['’]obtention/iu, raison: "INV-1 — aucun avis sur les chances d'obtention" },
  { code: "chances-succes", motif: /chances?\s+de\s+succ[èe]s/iu, raison: "INV-1 — le score s'appelle « complétude du dossier »" },
  { code: "probabilite", motif: /probabilit[ée]\s+(de\s+)?(succ[èe]s|r[ée]ussite|acceptation|obtention)/iu, raison: "INV-1 — pas de prédiction d'acceptation" },
  { code: "taux-acceptation", motif: /taux\s+d['’]acceptation/iu, raison: "INV-1 — un taux passé se lit comme une promesse" },
  { code: "garantie-obtention", motif: /garantie?\s+d['’]obtention/iu, raison: "INV-2 — aucune promesse de résultat" },
  { code: "visa-garanti", motif: /visa\s+(garanti|assur[ée])/iu, raison: "INV-2 — aucune promesse de résultat" },
  { code: "reussite-garantie", motif: /r[ée]ussite\s+garantie/iu, raison: "INV-2 — aucune promesse de résultat" },
  { code: "sans-risque", motif: /sans\s+risque\s+de\s+refus/iu, raison: "INV-2 — le refus reste possible, toujours" },
  { code: "on-soccupe-de-tout", motif: /on\s+s['’]occupe\s+de\s+tout/iu, raison: "INV-1 — la plateforme prépare, elle ne se substitue pas" },
  { code: "depot-a-votre-place", motif: /nous\s+(remplissons|d[ée]posons|soumettons)\s+(votre|ton|vos|tes)/iu, raison: "INV-1 — la plateforme ne dépose rien à la place du candidat" },
  { code: "conseil-juridique", motif: /nous\s+vous\s+conseillons\s+juridiquement/iu, raison: "INV-1 — la plateforme informe, elle ne conseille pas juridiquement" },
  { code: "notre-avocat", motif: /(notre|nos)\s+avocats?\b/iu, raison: "INV-1 — aucun conseil juridique n'est fourni" },
];

export const INTERDITS_INTERFACE_CANDIDAT: readonly MotifInterdit[] = [
  { code: "score", motif: /\bscores?\b/iu, raison: "arbitrage C-09 — le dossier a un palier, pas une note" },
  { code: "chances", motif: /\bchances?\b/iu, raison: "INV-1 — aucun écran ne parle des chances du candidat" },
  // `\d+` et non `\d` : le motif reconnaît les mêmes textes, mais l'extrait
  // rendu porte le nombre entier. « 95 % » cité « 5 % » dans un message de
  // refus fait chercher à l'auteur ce qui cloche dans le mauvais chiffre.
  { code: "pourcentage", motif: /\d+\s?%/u, raison: "arbitrage C-09 — aucune part affichée sur le dossier" },
  { code: "sur-100", motif: /\bsur\s*100\b/iu, raison: "arbitrage C-09 — aucune note sur cent" },
  { code: "probabilite-nue", motif: /probabilit/iu, raison: "INV-1 — pas de prédiction" },
  { code: "garanti-nu", motif: /garanti/iu, raison: "INV-2 — aucune promesse de résultat" },
];

/**
 * Marqueurs de négation. Une négation ne peut pas devenir une promesse :
 * « ImmiPro ne garantit pas l'obtention du visa » est exactement la phrase
 * qui protège, et l'interdit brut l'empêchait d'être écrite.
 */
const NEGATIONS =
  /\b(ne|n['’]|pas|aucune?s?|sans|jamais|ni|non)\b|n['’]/iu;

/** Bornes de proposition : au-delà, la négation ne porte plus. */
const BORNES = [".", ";", ":", "!", "?", ",", "…", "—"];

/**
 * La négation est cherchée dans la seule proposition qui précède le motif.
 * « pas de doute, visa garanti » reste donc refusé : la virgule coupe la
 * portée de la négation, comme à la lecture.
 */
export function precedeDUneNegation(texte: string, indexMotif: number): boolean {
  const avant = texte.slice(0, indexMotif);
  const derniereBorne = Math.max(...BORNES.map((b) => avant.lastIndexOf(b)));
  const proposition = avant.slice(derniereBorne + 1);
  return NEGATIONS.test(proposition);
}

export interface Faute {
  code: string;
  raison: string;
  extrait: string;
}

/**
 * Cherche les motifs dans un texte. Un motif nié n'est pas une faute.
 * Les appelants ajoutent ensuite leurs exceptions déclarées.
 */
export function verifierTexte(
  texte: string,
  interdits: readonly MotifInterdit[],
): Faute[] {
  const fautes: Faute[] = [];
  for (const { code, motif, raison } of interdits) {
    const rx = new RegExp(motif.source, motif.flags.includes("g") ? motif.flags : `${motif.flags}g`);
    for (const trouve of texte.matchAll(rx)) {
      const index = trouve.index ?? 0;
      if (precedeDUneNegation(texte, index)) continue;
      fautes.push({ code, raison, extrait: trouve[0] });
    }
  }
  return fautes;
}

/** Les deux portées réunies — ce qu'applique un écran candidat. */
export const INTERDITS_ECRAN_CANDIDAT: readonly MotifInterdit[] = [
  ...INTERDITS_PARTOUT,
  ...INTERDITS_INTERFACE_CANDIDAT,
];
