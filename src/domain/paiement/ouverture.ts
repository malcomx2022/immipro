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

import { formatMineur } from "@/domain/facturation/montants";

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
 * L'encaissement confirmé est-il celui qu'on a décidé ? — INV-7, revue du
 * 07/10/2026, E2 (décisions D-6 et D-7 du 08/10/2026).
 *
 * Une confirmation créditait sur le seul statut : un paiement de 10 000 F
 * ouvrait un pack vendu 15 000 F, et la facture portait 15 000 F. La
 * direction a tranché : tout écart refuse, même au-dessus du prix — rien
 * ne s'ouvre, l'écart s'ouvre, et l'opérateur rembourse l'encaissement
 * réel au tableau de bord.
 *
 * Comparaison en unités mineures. La devise ne se compare que si le
 * fournisseur la nomme (FedaPay peut ne rendre qu'un `currency_id`). Un
 * montant absent ne concorde pas : on ne crédite pas ce qu'on n'a pas lu.
 * FedaPay rend son montant hors frais (vérifié le 08/10/2026, D-7).
 */
export interface Encaissement {
  montantMineur: number | null;
  devise: string | null;
}

export const encaissementConcorde = (
  attenduMineur: number,
  deviseAttendue: string,
  constat: Encaissement,
): boolean =>
  constat.montantMineur !== null &&
  constat.montantMineur === attenduMineur &&
  (constat.devise === null || constat.devise.toUpperCase() === deviseAttendue.toUpperCase());

/** Le constat écrit à l'écart quand l'encaissement ne concorde pas. Jamais au candidat. */
export function motifDEncaissementDivergent(
  providerTxId: string,
  constat: Encaissement,
  attenduMineur: number,
  deviseAttendue: string,
): string {
  const recu =
    constat.montantMineur === null
      ? "sans en indiquer le montant"
      : `pour ${formatMineur(constat.montantMineur, constat.devise ?? deviseAttendue)}`;
  return `Paiement confirmé par le fournisseur (${providerTxId}) ${recu}, alors que la plateforme avait décidé ${formatMineur(attenduMineur, deviseAttendue)} : rien n'a été ouvert ni facturé. Vérifier l'encaissement au tableau de bord du fournisseur et, s'il est réel, y rembourser la somme.`;
}

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

/**
 * L'identifiant d'événement d'une réconciliation — RG-05.4.
 *
 * Déterministe, et dérivé de ce qu'il annonce : deux passes du job qui
 * lisent le même état chez le fournisseur portent le même identifiant, et
 * la seconde est reconnue comme un rejeu par la clé unique. Un identifiant
 * tiré au sort ferait écrire une ligne d'événement à chaque quart d'heure
 * pour la même nouvelle.
 *
 * Préfixé, et donc distinct de celui d'un webhook (`stripe:evt_…`) : la
 * réconciliation et la notification signée peuvent annoncer la même chose
 * sans se prendre l'une pour l'autre. Ce n'est pas la clé qui les
 * départage — c'est la table des transitions, qui refuse de faire
 * progresser un état déjà atteint.
 */
export const cleDEvenementDeReconciliation = (reference: string, statut: string): string =>
  `reconciliation:${reference}:${statut}`;

/* ------------------------------------------------------------------ *
 * Ce que l'ouverture échouée avait à dire — 24/09/2026.
 * ------------------------------------------------------------------ */

/**
 * Les causes d'une ouverture qui n'aboutit pas.
 *
 * ── La cause était calculée, et jetée ───────────────────────────────
 *
 * Le contrat d'ouverture annonce que « les trois issues ne se traitent
 * pas pareil — réessayer, refuser, alerter ». Son unique lecteur les
 * traitait toutes de la même façon :
 *
 *     if (ouverture.issue !== "ouverte") throw echec("paiement_indisponible");
 *
 * Cinq causes distinctes — aucun adaptateur branché, un fournisseur
 * muet, une demande refusée, une réponse hors contrat, une session
 * créée sans adresse — produisaient la même réponse au caractère près,
 * sans diagnostic, et sans ligne de journal : la route ne journalise
 * que ce qui **n'est pas** un échec du catalogue. Le `detail` que
 * chaque adaptateur compose pour être lu — « api_key_expired »,
 * « montant ou devise absents de la session », « url domaine_inattendu »
 * — n'était lu par personne.
 *
 * ── Et la phrase servie n'était vraie que d'une des cinq ────────────
 *
 * « Notre prestataire de paiement n'a pas répondu » est faux quand
 * aucun adaptateur n'est branché — personne n'a été appelé —, quand le
 * fournisseur refuse la demande, quand il répond hors contrat, et quand
 * il a créé la session : dans quatre cas sur cinq, il a répondu, ou il
 * n'a pas été interrogé. « Réessayer » l'est tout autant : une clé
 * expirée rendra le même refus au centième essai.
 */
export type CauseDEchecDOuverture =
  | "aucun_adaptateur"
  | "injoignable"
  | "creee_sans_url"
  | "refusee"
  | "reponse_inattendue";

/**
 * Passagère, ou installée.
 *
 * C'est la seule distinction que le candidat a besoin de lire, et elle
 * décide de tout le reste : ce qu'on lui dit, et ce qu'on lui propose de
 * faire. Une panne passagère se réessaie — le fournisseur peut répondre
 * à la seconde tentative, et une session déjà créée est reprise par
 * `retrouver` plutôt que dupliquée. Une panne installée, non : la
 * configuration ou le contrat est en cause, et seul un opérateur peut y
 * revenir. Lui proposer « Réessayer » lui ferait perdre son temps à la
 * place du nôtre.
 */
export type NatureDEchecDOuverture = "passagere" | "installee";

export const NATURE_DE_LA_CAUSE: Record<CauseDEchecDOuverture, NatureDEchecDOuverture> = {
  // Clé absente, racine d'application absente : rien n'a été appelé.
  aucun_adaptateur: "installee",
  // Réseau, délai, 5xx : la prochaine tentative peut aboutir.
  injoignable: "passagere",
  // L'identifiant est gardé ; la reprise repart de la session existante.
  creee_sans_url: "passagere",
  // Compte, clé, montant hors bornes : le même appel rendra le même refus.
  refusee: "installee",
  // Le contrat a bougé, ou la réponse n'est pas la nôtre : à relire.
  reponse_inattendue: "installee",
};

export const ouvertureReessayable = (cause: CauseDEchecDOuverture): boolean =>
  NATURE_DE_LA_CAUSE[cause] === "passagere";

/**
 * Ce que l'opérateur lit sous l'échec, et retrouve au journal.
 *
 * La référence d'abord : c'est par elle que la transaction se retrouve en
 * base. Puis la cause, puis ce que l'adaptateur a constaté — dans cet
 * ordre, parce que les deux premiers sont toujours là et le troisième
 * pas toujours.
 *
 * Rien du corps reçu n'y entre : les adaptateurs composent un `detail`
 * qui décrit la forme du problème, jamais la réponse elle-même.
 */
export const traceDeLOuverture = (
  /** Nulle quand rien n'a été écrit — aucun adaptateur, aucune transaction. */
  reference: string | null,
  cause: CauseDEchecDOuverture,
  detail?: string,
): string =>
  `${reference ?? "sans référence"} · ${cause}${detail ? ` : ${detail}` : ""}`;

/**
 * Ce qu'on dit au candidat quand la session existe sans son adresse.
 *
 * La phrase du catalogue — « notre prestataire de paiement n'a pas
 * répondu » — est vraie du fournisseur muet et fausse de celui-ci : il a
 * répondu, il a même créé la transaction. La reprise passera par
 * `retrouver`, qui repart de l'identifiant enregistré ; c'est ce que le
 * candidat a besoin de savoir, parce que la question qu'il se pose en
 * recliquant sur « Payer » est celle du double débit.
 */
export const OUVERTURE_SANS_PAGE =
  "Notre prestataire n'a pas rendu la page de paiement. Ta demande est enregistrée chez lui : en reprenant, tu retomberas sur la même, et rien ne sera débité deux fois.";

/**
 * Encaissement réel suspendu tant que les conditions de vente ne sont pas
 * publiées — décision du 03/10/2026. Une seule phrase, lue par le
 * catalogue d'échecs (refus serveur) et par le récapitulatif (avant le
 * clic) : deux copies finiraient par dire deux choses.
 */
export const MENTION_ENCAISSEMENT_SUSPENDU =
  "Nos conditions de vente ne sont pas encore publiées : aucun paiement ne peut être encaissé avant.";

/**
 * Pourquoi un paiement réel ne s'ouvre pas, dans l'ordre où on le dit.
 *
 * - `conditions` : les conditions de vente ne sont pas publiées (03/10) ;
 * - `facturation` : la facturation n'est pas en place — avis comptable
 *   M.C du 04/10/2026, ne pas encaisser avant que le circuit facture +
 *   avoir fonctionne ;
 * - `identite` : il manque au candidat son nom ou son adresse de
 *   facturation, que chaque facture porte.
 *
 * Les deux premières ne dépendent pas du candidat, la troisième si : elle
 * vient en dernier, pour qu'on ne lui demande pas de compléter son profil
 * pour un paiement qui ne s'ouvrirait de toute façon pas. Le bac à sable
 * n'est suspendu par rien de tout cela : ses pièces vont dans la série
 * d'essai.
 */
export type SuspensionDuPaiement = "conditions" | "facturation" | "identite";

export function suspensionDuPaiement(etat: {
  espaceReel: boolean;
  conditionsPubliees: boolean;
  facturationEnPlace: boolean;
  identiteComplete: boolean;
}): SuspensionDuPaiement | null {
  if (!etat.espaceReel) return null;
  if (!etat.conditionsPubliees) return "conditions";
  if (!etat.facturationEnPlace) return "facturation";
  if (!etat.identiteComplete) return "identite";
  return null;
}
