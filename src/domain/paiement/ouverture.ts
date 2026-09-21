/**
 * L'ouverture d'un paiement chez le fournisseur — WF-05 étapes 2 et 3.
 *
 * Ce module ne parle à personne : il dit ce qu'est une ouverture valable,
 * et le serveur s'en sert pour refuser ce qui ne l'est pas.
 *
 * **Il ne confirme rien, et ne peut rien confirmer.** Une session ouverte
 * est une page où le candidat *pourra* payer. Seule la notification signée
 * écrit `CONFIRMEE` et crédite le quota (RG-05.1, INV-7) — ni l'ouverture,
 * ni le retour du navigateur, ni la relève de statut.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/**
 * La clé d'idempotence d'une ouverture.
 *
 * Dérivée de la référence interne, jamais tirée au sort : deux clics sur
 * « Payer », ou une reprise après une réponse réseau perdue, portent la
 * même clé, et le fournisseur rend la session déjà créée au lieu d'en
 * ouvrir une seconde. C'est ce qui empêche deux débits pour un paiement.
 *
 * Préfixée, et distincte de celle du remboursement : la même référence
 * porte deux opérations au cours de sa vie, et le fournisseur ne doit pas
 * prendre la seconde pour un rejeu de la première.
 *
 * Elle ne se stocke pas : une valeur dérivée qu'on enregistre finit par
 * diverger de ce dont elle est dérivée.
 */
export const cleDOuverture = (reference: string): string => `ouverture:${reference}`;

/**
 * Le verdict sur l'URL que le fournisseur a rendue.
 *
 * Une URL absente, relative, en clair ou sur un domaine étranger n'envoie
 * pas le candidat sur la page de paiement : elle l'envoie ailleurs. Le
 * cas n'est pas théorique — une réponse partielle, un champ renommé, une
 * erreur rendue avec un code 200 produisent exactement cela, et un
 * `window.location` ne pose pas de questions.
 */
export type VerdictDUrl =
  | { valide: true; url: string }
  | { valide: false; raison: "absente" | "malformee" | "non_https" | "domaine_inattendu" };

/**
 * Valide l'URL hébergée rendue par un fournisseur.
 *
 * Le **domaine** est vérifié, pas l'hôte exact : `checkout.stripe.com`
 * aujourd'hui peut devenir un autre sous-domaine demain sans que le
 * paiement change de mains. Un domaine étranger, lui, est toujours une
 * anomalie — et c'est celle qui coûterait le plus cher.
 */
export function verifierLUrlHebergee(
  brute: string | undefined | null,
  domaines: readonly string[],
): VerdictDUrl {
  if (!brute || brute.trim() === "") return { valide: false, raison: "absente" };

  let lue: URL;
  try {
    lue = new URL(brute);
  } catch {
    return { valide: false, raison: "malformee" };
  }

  // Une page de paiement en clair expose le formulaire qui la remplit.
  if (lue.protocol !== "https:") return { valide: false, raison: "non_https" };

  const hote = lue.hostname.toLowerCase();
  // `.` en tête du suffixe : `evilstripe.com` ne doit pas passer pour
  // `stripe.com`, et `stripe.com.exemple.net` non plus.
  const connu = domaines.some((d) => hote === d || hote.endsWith(`.${d}`));
  if (!connu) return { valide: false, raison: "domaine_inattendu" };

  return { valide: true, url: lue.toString() };
}

/**
 * Les devises sans sous-unité, au sens des fournisseurs de paiement.
 *
 * La plateforme compte en unités entières — 12 € s'écrit `12`, 5 000 F
 * s'écrit `5000`. Les fournisseurs, eux, comptent en plus petite unité
 * pour les devises qui en ont une : 12 € valent 1 200 centimes. Le franc
 * CFA n'en a pas, et le convertir le multiplierait par cent.
 *
 * C'est une erreur d'un facteur cent sur un débit réel. Elle vit ici,
 * testée, plutôt que dans un adaptateur où personne ne la relit.
 */
export const SANS_SOUS_UNITE: ReadonlySet<string> = new Set(["XOF"]);

export const versSousUnite = (montant: number, devise: string): number =>
  SANS_SOUS_UNITE.has(devise.toUpperCase()) ? montant : Math.round(montant * 100);

export const depuisSousUnite = (montant: number, devise: string): number =>
  SANS_SOUS_UNITE.has(devise.toUpperCase()) ? montant : montant / 100;

/**
 * Le montant et la devise que le fournisseur a enregistrés sont-ils ceux
 * qu'on lui a demandés ?
 *
 * Recalculés côté serveur à chaque fois, ils ne devraient jamais diverger.
 * S'ils divergent, c'est que la demande a été altérée en chemin ou que la
 * session retrouvée n'est pas la nôtre : dans les deux cas, on n'envoie
 * personne payer une somme qu'on n'a pas décidée.
 */
export const ouvertureConcorde = (
  attendu: { montant: number; devise: string },
  rendu: { montant: number; devise: string },
): boolean =>
  attendu.montant === rendu.montant &&
  attendu.devise.toUpperCase() === rendu.devise.toUpperCase();

/** Ce qu'on écrit à l'écart quand elle ne concorde pas. Jamais au candidat. */
export const motifDeDivergence = (
  attendu: { montant: number; devise: string },
  rendu: { montant: number; devise: string },
): string =>
  `Ouverture refusée : le fournisseur a enregistré ${rendu.montant} ${rendu.devise}, ` +
  `la plateforme avait décidé ${attendu.montant} ${attendu.devise}.`;

/**
 * Ce que le retour du navigateur vaut : rien.
 *
 * Le fournisseur ramène le candidat sur cette adresse avec, souvent, un
 * « succès » dans l'URL. La page qui l'accueille attend la notification
 * signée, et le dit. Écrite ici pour qu'un seul endroit la compose, et
 * pour qu'un test puisse vérifier qu'elle ne porte aucun verdict.
 */
export const cheminDeRetour = (reference: string): string =>
  `/paiement/attente?tx=${encodeURIComponent(reference)}`;
