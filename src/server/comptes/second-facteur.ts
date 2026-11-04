import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { estUneCoursePerdue } from "@/server/http/concurrence";
import { journaliser } from "@/server/acces/journal";
import { correspond, empreinteRapide, jeton } from "@/server/securite/secret";
import { CleAbsente, chiffrer, cleMaitresse, dechiffrer, empreinteDeSecours } from "@/server/securite/chiffrement";
import { codesDeSecoursNeufs, hmacSha1, secretNeuf } from "@/server/securite/totp";
import {
  ESSAIS_PAR_DEFI,
  VALIDITE_DEFI_MINUTES,
  adresseOtpauth,
  apresUnEchec,
  depuisBase32,
  etatDuBlocage,
  formaterCodeDeSecours,
  DESACTIVATION_INTERDITE_INTERNE,
  libelleDuRefus,
  lireLaSaisie,
  verifierLeCode,
} from "@/domain/comptes/deux-facteurs";
import { MOTIF_MAX, MOTIF_MIN } from "@/domain/comptes/role";
import { exigeSecondFacteur, type RoleDeCompte } from "@/domain/comptes/hierarchie";

/**
 * Double authentification — S.214, WF-02.
 *
 * Le domaine décide (`domain/comptes/deux-facteurs`) ; ce module lit et
 * écrit, sous trois règles :
 *
 * - **chaque acceptation est une écriture conditionnelle.** Le pas de temps
 *   accepté ne s'écrit que s'il dépasse le dernier ; un code de secours ne
 *   se consomme que s'il ne l'était pas ; un défi ne s'achève qu'une fois.
 *   Deux envois simultanés du même code n'ouvrent qu'une session ;
 * - **chaque échec s'incrémente en base** et le blocage se décide sur la
 *   valeur rendue, jamais sur une lecture faite avant (la leçon de M3) ;
 * - **chaque changement d'état** — activation, désactivation, nouveaux
 *   codes, réinitialisation par un super-administrateur — s'écrit avec sa
 *   ligne de journal et la fermeture des sessions, dans une transaction.
 *
 * Aucune fonction ne rend un secret chiffré, une empreinte ou un jeton de
 * session : le secret en clair n'est rendu qu'une fois, à la préparation de
 * l'enrôlement, à la personne qui vient de ressaisir son mot de passe ; les
 * codes de secours, une fois, à leur génération.
 */

export const COOKIE_DEFI = "immipro_defi";

const MINUTE = 60_000;

/** Le serveur sait-il chiffrer ? Sans clé, aucun enrôlement ne commence. */
export const secondFacteurDisponible = (): boolean => cleMaitresse() !== null;

const exigerLaCle = () => {
  if (!secondFacteurDisponible()) {
    throw echec("etat_incompatible", {
      corps:
        "La double authentification n'est pas encore activée sur ce serveur. Ton compte reste protégé par ton mot de passe ; réessaie plus tard ou écris au support depuis la page Contact.",
    });
  }
};

const motDePasseFaux = () =>
  echec("champs_invalides", {
    champs: { motDePasse: "Ce mot de passe ne correspond pas à ton compte. Ressaisis celui de ta connexion." },
  });

async function exigerLeMotDePasse(userId: string, motDePasse: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await correspond(motDePasse, user.passwordHash))) throw motDePasseFaux();
}

/* ------------------------------------------------------------------ *
 * État affiché par « Sécurité ».
 * ------------------------------------------------------------------ */

export interface EtatDuSecondFacteur {
  /** Le serveur porte une clé : l'enrôlement est possible. */
  disponible: boolean;
  active: boolean;
  activeLe: string | null;
  /** Enrôlement commencé, code de confirmation pas encore saisi. */
  enCours: boolean;
  codesRestants: number;
}

export async function etatDuSecondFacteur(userId: string): Promise<EtatDuSecondFacteur> {
  const [facteur, codesRestants] = await Promise.all([
    db.secondFacteur.findUnique({ where: { userId }, select: { activeLe: true } }),
    db.codeDeSecours.count({ where: { userId, utiliseLe: null } }),
  ]);
  return {
    disponible: secondFacteurDisponible(),
    active: Boolean(facteur?.activeLe),
    activeLe: facteur?.activeLe?.toISOString() ?? null,
    enCours: Boolean(facteur && !facteur.activeLe),
    codesRestants: facteur?.activeLe ? codesRestants : 0,
  };
}

/** Le second facteur est-il exigé à la connexion de ce compte ? */
export async function secondFacteurExige(userId: string): Promise<boolean> {
  const facteur = await db.secondFacteur.findUnique({ where: { userId }, select: { activeLe: true } });
  return Boolean(facteur?.activeLe);
}

/* ------------------------------------------------------------------ *
 * Vérification d'une saisie — partagée par la connexion et les gestes
 * qui la redemandent (désactivation, nouveaux codes).
 * ------------------------------------------------------------------ */

type IssueDeLaSaisie =
  | { acceptee: true; genre: "totp" | "secours"; codesRestants: number }
  | { acceptee: false; message: string; bloque: boolean; vientDeBloquer: boolean };

export async function verifierUneSaisie(
  userId: string,
  saisie: string,
  maintenant = new Date(),
): Promise<IssueDeLaSaisie> {
  const facteur = await db.secondFacteur.findUnique({ where: { userId } });
  if (!facteur?.activeLe) {
    return { acceptee: false, message: "La double authentification n'est pas active sur ce compte.", bloque: false, vientDeBloquer: false };
  }

  // Un blocage levé fait redescendre le compteur au seuil intermédiaire,
  // et non à zéro : c'est l'hystérésis. L'écriture est conditionnée à
  // l'échéance lue, pour qu'une levée simultanée ne l'applique qu'une fois.
  let etat = etatDuBlocage(facteur.echecs, facteur.bloqueJusqua, maintenant);
  if (!etat.bloque && facteur.bloqueJusqua) {
    await db.secondFacteur.updateMany({
      where: { id: facteur.id, bloqueJusqua: facteur.bloqueJusqua },
      data: { echecs: etat.echecs, bloqueJusqua: null },
    });
  }
  if (etat.bloque) {
    return { acceptee: false, message: libelleDuRefus("faux", etat), bloque: true, vientDeBloquer: false };
  }

  const lue = lireLaSaisie(saisie);
  let raison: "format" | "faux" | "rejeu" | "secours" = "format";

  if (lue.genre === "totp") {
    const clair = dechiffrer(facteur.secretChiffre, userId);
    const secret = clair ? depuisBase32(clair) : null;
    if (!secret) {
      // Une enveloppe illisible n'est pas une erreur de saisie : elle ne
      // compte pas comme un échec, et l'exploitation doit la voir.
      console.error(`[second-facteur] secret illisible pour user:${userId}`);
      throw echec("service_indisponible", { diagnostic: { service: "second-facteur", survenuA: maintenant.toISOString() } });
    }
    const verdict = verifierLeCode({
      saisie: lue.code,
      secret,
      maintenantMs: maintenant.getTime(),
      dernierPas: facteur.dernierPas === null ? null : Number(facteur.dernierPas),
      derive: facteur.derive,
      hmac: hmacSha1,
    });
    if (verdict.accepte) {
      // Anti-rejeu en base : le pas ne s'écrit que s'il est neuf. Deux
      // envois simultanés du même code : un seul passe.
      const { count } = await db.secondFacteur.updateMany({
        where: {
          id: facteur.id,
          OR: [{ dernierPas: null }, { dernierPas: { lt: BigInt(verdict.pas) } }],
          // Un blocage posé entre la lecture et l'écriture l'emporte.
          AND: [{ OR: [{ bloqueJusqua: null }, { bloqueJusqua: { lte: maintenant } }] }],
        },
        data: { dernierPas: BigInt(verdict.pas), derive: verdict.derive, echecs: 0, bloqueJusqua: null },
      });
      if (count === 1) {
        const codesRestants = await db.codeDeSecours.count({ where: { userId, utiliseLe: null } });
        return { acceptee: true, genre: "totp", codesRestants };
      }
      raison = "rejeu";
    } else {
      raison = verdict.raison;
    }
  } else if (lue.genre === "secours") {
    const { count } = await db.codeDeSecours.updateMany({
      where: { userId, empreinte: empreinteDeSecours(lue.code, userId), utiliseLe: null },
      data: { utiliseLe: maintenant },
    });
    if (count === 1) {
      await db.secondFacteur.update({ where: { id: facteur.id }, data: { echecs: 0, bloqueJusqua: null } });
      const codesRestants = await db.codeDeSecours.count({ where: { userId, utiliseLe: null } });
      return { acceptee: true, genre: "secours", codesRestants };
    }
    // Un code de secours qui existe mais a déjà servi est un rejeu, pas
    // un essai au hasard : même traitement que pour un code TOTP.
    const dejaServi = await db.codeDeSecours.findUnique({
      where: { userId_empreinte: { userId, empreinte: empreinteDeSecours(lue.code, userId) } },
      select: { id: true },
    });
    raison = dejaServi ? "rejeu" : "secours";
  }

  /*
    Un rejeu ne compte pas comme un échec : il demande un code juste, que
    l'attaquant n'apprend pas en le rejouant, et il arrive à la personne
    elle-même (double envoi, deux onglets). Le compter bloquerait le
    titulaire pour un geste anodin sans rien coûter à qui devine.
  */
  if (raison === "rejeu") {
    return {
      acceptee: false,
      message: libelleDuRefus(lue.genre === "secours" ? "secours" : "rejeu", etat),
      bloque: false,
      vientDeBloquer: false,
    };
  }

  // L'échec s'incrémente en base ; le blocage se décide sur la valeur rendue.
  const { echecs } = await db.secondFacteur.update({
    where: { id: facteur.id },
    data: { echecs: { increment: 1 } },
    select: { echecs: true },
  });
  const suite = apresUnEchec({ ...etat, echecs: echecs - 1 }, maintenant);
  if (suite.bloqueJusqua) {
    await db.secondFacteur.update({ where: { id: facteur.id }, data: { bloqueJusqua: suite.bloqueJusqua } });
  }
  etat = etatDuBlocage(echecs, suite.bloqueJusqua, maintenant);
  return {
    acceptee: false,
    message: libelleDuRefus(raison, etat),
    bloque: etat.bloque,
    vientDeBloquer: Boolean(suite.bloqueJusqua),
  };
}

/* ------------------------------------------------------------------ *
 * Enrôlement.
 * ------------------------------------------------------------------ */

export interface Enrolement {
  /** Le secret en base32, montré une fois pour la saisie manuelle. */
  secret: string;
  /** L'adresse `otpauth://` que porte le code QR. */
  adresse: string;
}

/**
 * Prépare l'enrôlement : mot de passe ressaisi, secret neuf, chiffré. Le
 * second facteur n'est pas actif tant qu'un premier code n'a pas été
 * saisi. Recommencer remplace le secret en attente.
 */
export async function preparerLEnrolement(
  acteur: { id: string; email: string },
  motDePasse: string,
): Promise<Enrolement> {
  exigerLaCle();
  await exigerLeMotDePasse(acteur.id, motDePasse);
  const existant = await db.secondFacteur.findUnique({ where: { userId: acteur.id }, select: { activeLe: true } });
  if (existant?.activeLe) {
    throw echec("etat_incompatible", {
      corps: "La double authentification est déjà active. Pour changer de téléphone, désactive-la puis active-la de nouveau.",
    });
  }
  const secret = secretNeuf();
  const secretChiffre = chiffrer(secret, acteur.id);
  // La condition `activeLe: null` empêche de remplacer un secret activé
  // entre la lecture et l'écriture.
  const { count } = await db.secondFacteur.updateMany({
    where: { userId: acteur.id, activeLe: null },
    data: { secretChiffre, dernierPas: null, derive: 0, echecs: 0, bloqueJusqua: null },
  });
  if (count === 0) {
    try {
      await db.secondFacteur.create({ data: { userId: acteur.id, secretChiffre } });
    } catch (erreur) {
      if ((erreur as { code?: unknown } | null)?.code === "P2002") {
        throw echec("etat_incompatible", { corps: "Un autre onglet vient de modifier la double authentification : recharge la page." });
      }
      throw erreur;
    }
  }
  return { secret, adresse: adresseOtpauth(acteur.email, secret) };
}

/**
 * Active le second facteur avec un premier code juste. Rend les dix codes
 * de secours, une seule fois. Les autres sessions du compte se ferment :
 * elles ont été ouvertes sans second facteur.
 */
export async function activerLeSecondFacteur(
  acteur: { id: string },
  saisie: string,
  jetonDeSessionCourante: string | undefined,
  maintenant = new Date(),
): Promise<{ codesDeSecours: string[]; sessionsFermees: number }> {
  exigerLaCle();
  const facteur = await db.secondFacteur.findUnique({ where: { userId: acteur.id } });
  if (!facteur) {
    throw echec("etat_incompatible", { corps: "Commence par « Activer la double authentification » : le code QR n'a pas encore été généré." });
  }
  if (facteur.activeLe) {
    throw echec("etat_incompatible", { corps: "La double authentification est déjà active sur ce compte." });
  }
  const clair = dechiffrer(facteur.secretChiffre, acteur.id);
  const secret = clair ? depuisBase32(clair) : null;
  if (!secret) {
    throw echec("etat_incompatible", { corps: "Le code QR a expiré. Recommence l'activation pour en générer un nouveau." });
  }
  const verdict = verifierLeCode({
    saisie,
    secret,
    maintenantMs: maintenant.getTime(),
    dernierPas: null,
    derive: 0,
    hmac: hmacSha1,
  });
  if (!verdict.accepte) {
    throw echec("champs_invalides", {
      champs: {
        code:
          verdict.raison === "format"
            ? "Saisis les six chiffres affichés par ton application d'authentification."
            : "Ce code ne correspond pas. Vérifie que l'heure de ton téléphone est réglée automatiquement, puis saisis le code affiché.",
      },
    });
  }

  const codes = codesDeSecoursNeufs();
  const sessionsFermees = await db.$transaction(async (tx) => {
    const { count } = await tx.secondFacteur.updateMany({
      where: { id: facteur.id, activeLe: null, secretChiffre: facteur.secretChiffre },
      data: { activeLe: maintenant, dernierPas: BigInt(verdict.pas), derive: verdict.derive, echecs: 0, bloqueJusqua: null },
    });
    if (count !== 1) {
      throw echec("etat_incompatible", { corps: "Un autre onglet vient de modifier la double authentification : recharge la page." });
    }
    await tx.codeDeSecours.deleteMany({ where: { userId: acteur.id } });
    await tx.codeDeSecours.createMany({
      data: codes.map((code) => ({ userId: acteur.id, empreinte: empreinteDeSecours(code, acteur.id) })),
    });
    const fermees = await tx.session.deleteMany({
      where: {
        userId: acteur.id,
        ...(jetonDeSessionCourante ? { NOT: { tokenHash: empreinteRapide(jetonDeSessionCourante) } } : {}),
      },
    });
    await journaliser(
      {
        acteurId: acteur.id,
        action: "compte.second_facteur.activation",
        cible: `user:${acteur.id}`,
        motif: "Double authentification activée par le titulaire du compte.",
        details: { codesDeSecours: codes.length, sessionsFermees: fermees.count },
      },
      tx,
    );
    return fermees.count;
  });
  return { codesDeSecours: codes.map(formaterCodeDeSecours), sessionsFermees };
}

/** Désactive : mot de passe et code (ou code de secours) redemandés. */
export async function desactiverLeSecondFacteur(
  acteur: { id: string },
  motDePasse: string,
  saisie: string,
  jetonDeSessionCourante: string | undefined,
): Promise<{ sessionsFermees: number }> {
  // S.215 : un compte interne ne retire pas son second facteur. Le rôle est
  // relu en base, pas pris de la session : une promotion récente compte.
  const compte = await db.user.findUnique({ where: { id: acteur.id }, select: { role: true } });
  if (compte && exigeSecondFacteur(compte.role as RoleDeCompte)) {
    throw echec("etat_incompatible", { corps: DESACTIVATION_INTERDITE_INTERNE });
  }
  await exigerLeMotDePasse(acteur.id, motDePasse);
  const issue = await verifierUneSaisie(acteur.id, saisie);
  if (!issue.acceptee) throw echec("champs_invalides", { champs: { code: issue.message } });
  const sessionsFermees = await db.$transaction(async (tx) => {
    await tx.secondFacteur.deleteMany({ where: { userId: acteur.id } });
    await tx.codeDeSecours.deleteMany({ where: { userId: acteur.id } });
    await tx.defiDeConnexion.deleteMany({ where: { userId: acteur.id } });
    const fermees = await tx.session.deleteMany({
      where: {
        userId: acteur.id,
        ...(jetonDeSessionCourante ? { NOT: { tokenHash: empreinteRapide(jetonDeSessionCourante) } } : {}),
      },
    });
    await journaliser(
      {
        acteurId: acteur.id,
        action: "compte.second_facteur.desactivation",
        cible: `user:${acteur.id}`,
        motif: "Double authentification désactivée par le titulaire du compte.",
        details: { confirmePar: issue.genre, sessionsFermees: fermees.count },
      },
      tx,
    );
    return fermees.count;
  });
  return { sessionsFermees };
}

/** Dix nouveaux codes de secours ; les anciens ne servent plus. Code TOTP redemandé. */
export async function regenererLesCodesDeSecours(
  acteur: { id: string },
  saisie: string,
): Promise<{ codesDeSecours: string[] }> {
  exigerLaCle();
  const lue = lireLaSaisie(saisie);
  if (lue.genre !== "totp") {
    throw echec("champs_invalides", {
      champs: { code: "Saisis le code à six chiffres de ton application : un code de secours ne renouvelle pas les codes de secours." },
    });
  }
  const issue = await verifierUneSaisie(acteur.id, saisie);
  if (!issue.acceptee) throw echec("champs_invalides", { champs: { code: issue.message } });
  const codes = codesDeSecoursNeufs();
  await db.$transaction(async (tx) => {
    await tx.codeDeSecours.deleteMany({ where: { userId: acteur.id } });
    await tx.codeDeSecours.createMany({
      data: codes.map((code) => ({ userId: acteur.id, empreinte: empreinteDeSecours(code, acteur.id) })),
    });
    await journaliser(
      {
        acteurId: acteur.id,
        action: "compte.second_facteur.codes",
        cible: `user:${acteur.id}`,
        motif: "Codes de secours renouvelés par le titulaire du compte.",
        details: { codesDeSecours: codes.length },
      },
      tx,
    );
  });
  return { codesDeSecours: codes.map(formaterCodeDeSecours) };
}

/**
 * Réinitialisation par un super-administrateur — B-03. Le geste de qui a
 * perdu téléphone et codes de secours. Le second facteur part, toutes les
 * sessions du compte se ferment, et la ligne de journal porte le motif,
 * dans la même transaction. Personne ne se réinitialise soi-même ici : le
 * titulaire a « Désactiver » dans « Sécurité ».
 */
export async function reinitialiserLeSecondFacteur(
  acteur: { id: string },
  cibleId: string,
  motif: string,
): Promise<{ reinitialise: boolean; sessionsFermees: number }> {
  const net = motif.trim();
  if (net.length < MOTIF_MIN || net.length > MOTIF_MAX) {
    throw echec("champs_invalides", {
      champs: { motif: `Écris pourquoi, entre ${MOTIF_MIN} et ${MOTIF_MAX} caractères : le motif part au journal d'audit.` },
    });
  }
  if (cibleId === acteur.id) {
    throw echec("etat_incompatible", {
      corps: "Ta propre double authentification se désactive depuis « Sécurité du compte », avec ton mot de passe et un code.",
    });
  }
  try {
  return await db.$transaction(
    async (tx) => {
      const cible = await tx.user.findUnique({ where: { id: cibleId }, select: { id: true, deletedAt: true } });
      if (!cible || cible.deletedAt) throw echec("introuvable");
      const { count } = await tx.secondFacteur.deleteMany({ where: { userId: cibleId } });
      if (count === 0) {
        throw echec("etat_incompatible", { corps: "Ce compte n'a pas de double authentification : rien à réinitialiser." });
      }
      await tx.codeDeSecours.deleteMany({ where: { userId: cibleId } });
      await tx.defiDeConnexion.deleteMany({ where: { userId: cibleId } });
      const fermees = await tx.session.deleteMany({ where: { userId: cibleId } });
      await journaliser(
        {
          acteurId: acteur.id,
          action: "compte.second_facteur.reinitialisation",
          cible: `user:${cibleId}`,
          motif: net,
          details: { sessionsFermees: fermees.count },
        },
        tx,
      );
      return { reinitialise: true, sessionsFermees: fermees.count };
    },
    { isolationLevel: "Serializable" },
  );
  } catch (erreur) {
    if (estUneCoursePerdue(erreur)) {
      throw echec("etat_incompatible", {
        corps: "Ce compte vient d'être modifié par une autre action. Recharge la page pour lire son état actuel, puis recommence.",
      });
    }
    throw erreur;
  }
}

/* ------------------------------------------------------------------ *
 * Le défi de connexion.
 * ------------------------------------------------------------------ */

export interface DefiOuvert {
  valeur: string;
  expireLe: Date;
}

/** Mot de passe juste, second facteur attendu : aucune session n'est ouverte. */
export async function ouvrirUnDefi(
  userId: string,
  memoriser: boolean,
  userAgent: string | null | undefined,
  maintenant = new Date(),
): Promise<DefiOuvert> {
  const valeur = jeton();
  const expireLe = new Date(maintenant.getTime() + VALIDITE_DEFI_MINUTES * MINUTE);
  await db.$transaction([
    // Un seul défi vivant par compte : le précédent ne sert plus.
    db.defiDeConnexion.deleteMany({ where: { userId } }),
    db.defiDeConnexion.create({
      data: {
        jetonHash: empreinteRapide(valeur),
        userId,
        memoriser,
        userAgent: userAgent?.slice(0, 200) ?? null,
        expireLe,
      },
    }),
  ]);
  return { valeur, expireLe };
}

export type IssueDuDefi =
  | { issue: "ouverte"; userId: string; memoriser: boolean; userAgent: string | null; genre: "totp" | "secours"; codesRestants: number }
  | { issue: "refuse"; message: string; bloque: boolean }
  | { issue: "expire" };

export async function repondreAuDefi(
  valeur: string | undefined,
  saisie: string,
  maintenant = new Date(),
): Promise<IssueDuDefi> {
  if (!valeur) return { issue: "expire" };
  if (!secondFacteurDisponible()) {
    throw echec("service_indisponible", { diagnostic: { service: "second-facteur", survenuA: maintenant.toISOString() } });
  }
  const jetonHash = empreinteRapide(valeur);
  // Un essai se réserve avant d'être examiné : cinq par défi, quoi qu'il
  // arrive en parallèle.
  const { count } = await db.defiDeConnexion.updateMany({
    where: { jetonHash, consommeLe: null, expireLe: { gt: maintenant }, essais: { lt: ESSAIS_PAR_DEFI } },
    data: { essais: { increment: 1 } },
  });
  if (count === 0) return { issue: "expire" };
  const defi = await db.defiDeConnexion.findUnique({
    where: { jetonHash },
    include: { user: { select: { suspendedAt: true, deletionRequestedAt: true, deletedAt: true } } },
  });
  if (!defi || defi.user.suspendedAt || defi.user.deletionRequestedAt || defi.user.deletedAt) {
    return { issue: "expire" };
  }

  let issue: Awaited<ReturnType<typeof verifierUneSaisie>>;
  try {
    issue = await verifierUneSaisie(defi.userId, saisie, maintenant);
  } catch (erreur) {
    if (erreur instanceof CleAbsente) {
      throw echec("service_indisponible", { diagnostic: { service: "second-facteur", survenuA: maintenant.toISOString() } });
    }
    throw erreur;
  }
  if (!issue.acceptee) {
    if (issue.vientDeBloquer) {
      await journaliser({
        acteurId: defi.userId,
        action: "compte.second_facteur.blocage",
        cible: `user:${defi.userId}`,
        motif: "Second facteur bloqué après une série de codes faux à la connexion.",
      }).catch((e: unknown) => console.warn("[second-facteur] blocage non journalisé", e));
    }
    return { issue: "refuse", message: issue.message, bloque: issue.bloque };
  }

  // Le défi ne s'achève qu'une fois : deux réponses justes simultanées
  // n'ouvrent pas deux sessions.
  const acheve = await db.defiDeConnexion.updateMany({
    where: { id: defi.id, consommeLe: null },
    data: { consommeLe: maintenant },
  });
  if (acheve.count !== 1) return { issue: "expire" };
  if (issue.genre === "secours") {
    await journaliser({
      acteurId: defi.userId,
      action: "compte.second_facteur.secours",
      cible: `user:${defi.userId}`,
      motif: "Connexion avec un code de secours.",
      details: { codesRestants: issue.codesRestants },
    });
  }
  return {
    issue: "ouverte",
    userId: defi.userId,
    memoriser: defi.memoriser,
    userAgent: defi.userAgent,
    genre: issue.genre,
    codesRestants: issue.codesRestants,
  };
}

export const attributsCookieDefi = (expireLe: Date) => ({
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/comptes/session",
  expires: expireLe,
});

export const attributsSuppressionDefi = () => ({
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/comptes/session",
  maxAge: 0,
});
