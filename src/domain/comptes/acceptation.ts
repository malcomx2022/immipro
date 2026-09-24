import { PAGES_PUBLIQUES, type PagePublique } from "@/domain/exploitation/pages-publiques";

/**
 * Ce qu'une case d'acceptation nomme, et ce qu'on peut en lire — 24/09/2026.
 *
 * ── Deux écrans faisaient accepter des documents qui n'existent pas ──
 *
 * Le pied de page portait neuf adresses qui répondaient 404, dont les trois
 * pages légales. P.A les a retirées, et son motif est le bon : « le lien,
 * lui, promettait déjà ce document sans l'avoir ». Q.A a ensuite consigné
 * qui doit les écrire et ce qui manque pour le faire.
 *
 * Les cases d'acceptation, elles, n'ont pas été relues. L'inscription fait
 * cocher « j'accepte les conditions d'utilisation et la politique de
 * confidentialité », le récapitulatif de paiement « j'accepte les conditions
 * d'utilisation » — deux pages que le registre déclare absentes et
 * bloquantes, vers lesquelles rien ne mène, et dont aucun des deux écrans ne
 * dit qu'elles n'existent pas.
 *
 * Nommer un document sans lien est plus discret qu'un lien mort, et pire :
 * un 404 se voit, une mention non cliquable se lit comme un texte qu'on
 * pourrait retrouver ailleurs. La personne coche donc en croyant qu'il y a
 * quelque chose à lire.
 *
 * ── Ce que ce module ne fait pas ────────────────────────────────────
 *
 * Il ne réécrit pas le libellé. Ce que la personne accepte au juste est la
 * question de Q.A, et la trancher dans du code produirait un engagement
 * contractuel écrit par la mauvaise main. Il ne fait qu'une chose : dire
 * l'absence là où l'acceptation la tait — comme le classement dit les deux
 * critères qu'il ne pèse pas, et comme une fiche pays dit qu'aucune réserve
 * n'est relevée.
 *
 * La phrase **disparaît d'elle-même** le jour où la page est publiée : elle
 * se déduit du registre, elle n'est pas écrite à côté de lui.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/**
 * Les documents qu'une case d'acceptation peut nommer.
 *
 * `pluriel` porte le nombre **grammatical** du nom, et non le nombre de
 * documents : « les conditions d'utilisation » est un titre au pluriel, et
 * accorder le verbe sur le décompte donnait « Les conditions d'utilisation
 * n'est pas encore publiée ». La sonde l'a montré avant qu'un test ne le
 * fasse — celui que j'avais écrit accordait au singulier dès qu'il n'y avait
 * qu'un document, et validait donc la faute.
 */
export const DOCUMENTS_ACCEPTES = {
  conditions: {
    adresse: "/conditions",
    nom: "les conditions d'utilisation",
    pluriel: true,
  },
  donnees: {
    adresse: "/donnees-personnelles",
    nom: "la politique de confidentialité",
    pluriel: false,
  },
} as const;

export type DocumentAccepte = keyof typeof DOCUMENTS_ACCEPTES;

/**
 * Le registre ne liste que ce qui manque — « une page déclarée absente l'est
 * réellement, et rien ne pointe vers elle ». Y figurer, c'est donc être
 * absente, et disparaître du registre, c'est exister.
 */
export const pageAbsente = (
  adresse: string,
  registre: readonly PagePublique[] = PAGES_PUBLIQUES,
): boolean => registre.some((p) => p.adresse === adresse);

/**
 * Ce que l'écran ajoute sous la case, ou `null` quand tout ce qu'elle nomme
 * est publié.
 *
 * L'ordre suit celui du libellé : une phrase qui énumère dans un autre ordre
 * que le texte juste au-dessus se lit deux fois.
 */
export function reserveDeLAcceptation(
  nommes: readonly DocumentAccepte[],
  registre: readonly PagePublique[] = PAGES_PUBLIQUES,
): string | null {
  const absents = nommes
    .map((cle) => DOCUMENTS_ACCEPTES[cle])
    .filter((d) => pageAbsente(d.adresse, registre));
  if (absents.length === 0) return null;

  const noms = absents.map((d) => d.nom);
  const liste =
    noms.length === 1
      ? noms[0]!
      : `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]!}`;
  // Pluriel dès qu'il y a plusieurs documents, ou dès que le seul nommé
  // porte un titre au pluriel.
  const pluriel = absents.length > 1 || absents[0]!.pluriel;
  const accord = pluriel ? "ne sont pas encore publiées" : "n'est pas encore publiée";

  return `${majuscule(liste)} ${accord} : il n'existe à ce jour aucun texte à lire derrière cette case.`;
}

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
