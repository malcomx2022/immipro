import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { correspond, empreinte, aRecalculer, empreinteRapide, codeANChiffres } from "@/server/securite/secret";
import { fermerToutesLesSessions } from "@/server/securite/session";
import { motDePasseRecevable } from "@/domain/comptes/mot-de-passe";
import { LONGUEUR_CODE, VALIDITE_MINUTES } from "@/domain/comptes/code-verification";
import {
  aBloquer,
  finDuBlocage,
  libelleEchec,
  verdictDeConnexion,
  type Verdict,
} from "@/domain/comptes/connexion";

/**
 * Comptes — WF-02.
 *
 * Ce module porte les deux endroits où une erreur d'écriture se paie cher :
 * la connexion, qui doit refuser sans rien apprendre à qui insiste, et le
 * changement de mot de passe, qui doit fermer les sessions ouvertes.
 */

export const normaliserEmail = (email: string): string => email.trim().toLowerCase();

export interface Inscription {
  email: string;
  motDePasse: string;
  prenom?: string;
  nom?: string;
  pays?: string;
}

/**
 * Création de compte.
 *
 * Une adresse déjà prise ne produit pas d'erreur distincte : la réponse est
 * la même que pour une création réussie, et c'est l'email qui dit laquelle
 * des deux a eu lieu — « te voilà inscrit » ou « tu as déjà un compte ici,
 * voici comment te connecter ». Un message d'écran qui dirait « adresse déjà
 * utilisée » transformerait le formulaire d'inscription en outil de
 * vérification d'adresses.
 */
export async function inscrire(donnees: Inscription): Promise<{ user: User | null; existait: boolean }> {
  if (!motDePasseRecevable(donnees.motDePasse)) {
    throw echec("champs_invalides", {
      champs: { motDePasse: "Au moins dix caractères." },
    });
  }
  const email = normaliserEmail(donnees.email);
  const existant = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existant) return { user: null, existait: true };

  const user = await db.user.create({
    data: {
      email,
      passwordHash: await empreinte(donnees.motDePasse),
      firstName: donnees.prenom ?? null,
      lastName: donnees.nom ?? null,
      countryCode: donnees.pays ?? null,
    },
  });
  return { user, existait: false };
}

export type ResultatConnexion =
  | { ouverte: true; user: User }
  | { ouverte: false; verdict: Verdict; message: string };

/**
 * Connexion.
 *
 * Le calcul d'empreinte a lieu même quand l'adresse est inconnue. Sans cela,
 * une adresse sans compte répondrait en une milliseconde et une adresse avec
 * compte en cent : le temps de réponse dirait ce que le message tait.
 *
 * ── Et le compte bloqué sortait sans passer par là ──────────────────
 *
 * Le blocage rendait sa réponse **avant** l'empreinte. Mesuré, médiane de
 * cinq appels avec un mauvais mot de passe :
 *
 *     adresse inconnue        196 ms
 *     adresse connue          241 ms
 *     adresse connue, bloquée   1 ms
 *
 * Deux cents fois plus vite, et c'est un oracle que l'attaquant déclenche
 * lui-même : cinq essais faux sur n'importe quelle adresse, puis un
 * sixième. S'il revient en une milliseconde, l'adresse existe — une
 * adresse sans compte ne se bloque jamais, donc elle met toujours les deux
 * cents millisecondes. La liste de clients que le message refuse de dire,
 * le chronomètre la dictait.
 *
 * L'empreinte est donc calculée avant toute branche. Elle coûte, et ce
 * coût est borné par ailleurs : `limite: "sensible"` plafonne à dix appels
 * par minute, exactement comme pour une adresse inconnue, qui paie déjà le
 * leurre.
 *
 * Il reste un écart d'une quarantaine de millisecondes entre adresse
 * connue et inconnue — l'écriture du compteur d'échecs, qu'une adresse
 * sans compte n'a pas à faire. Le combler demanderait de tenir un délai
 * constant, ce qu'un runtime ne promet pas, et cette décision n'est pas
 * prise ici.
 */
export async function connecter(
  emailSaisi: string,
  motDePasse: string,
  maintenant = new Date(),
): Promise<ResultatConnexion> {
  const email = normaliserEmail(emailSaisi);
  const user = await db.user.findUnique({ where: { email } });

  /*
    Avant toute branche, y compris celle du blocage : c'est la seule
    position où le temps de réponse ne distingue pas les trois cas.
  */
  const juste = user?.passwordHash
    ? await correspond(motDePasse, user.passwordHash)
    : await correspond(motDePasse, LEURRE);

  const verdictAvant = verdictDeConnexion(
    user?.failedLogins ?? 0,
    user?.lockedUntil ?? null,
    maintenant,
  );
  if (verdictAvant.bloque) {
    return { ouverte: false, verdict: verdictAvant, message: libelleEchec(verdictAvant) };
  }

  if (!user || !juste || user.suspendedAt) {
    if (user) {
      const echecs = user.failedLogins + 1;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLogins: echecs,
          lockedUntil: aBloquer(echecs) ? finDuBlocage(maintenant) : null,
        },
      });
      const apres = verdictDeConnexion(
        echecs,
        aBloquer(echecs) ? finDuBlocage(maintenant) : null,
        maintenant,
      );
      return { ouverte: false, verdict: apres, message: libelleEchec(apres) };
    }
    const apres = verdictDeConnexion(0, null, maintenant);
    return { ouverte: false, verdict: apres, message: libelleEchec(apres) };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      failedLogins: 0,
      lockedUntil: null,
      // Empreinte produite avec des paramètres dépassés : elle se réécrit à
      // la connexion réussie, sans migration ni réinitialisation de masse.
      ...(aRecalculer(user.passwordHash!)
        ? { passwordHash: await empreinte(motDePasse) }
        : {}),
    },
  });
  return { ouverte: true, user };
}

/**
 * Empreinte factice, calculée quand l'adresse est inconnue pour que le temps
 * de réponse soit le même. Sa valeur n'a pas d'importance, seul son coût en
 * a — elle ne correspond à aucun mot de passe.
 */
const LEURRE =
  "scrypt$65536$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/**
 * Émission d'un code de vérification (A-03).
 *
 * Les codes précédents sont consommés d'office : sans cela, trois demandes
 * successives laisseraient trois codes valides, et le compteur d'essais de
 * chacun se remettrait à zéro — la borne contre la recherche par essais
 * tomberait d'elle-même.
 */
export async function emettreUnCode(
  userId: string,
  kind: "VERIFICATION_EMAIL" | "REINITIALISATION_MOT_DE_PASSE",
): Promise<string> {
  const code = codeANChiffres(LONGUEUR_CODE);
  await db.$transaction([
    db.authSecret.updateMany({
      where: { userId, kind, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    db.authSecret.create({
      data: {
        userId,
        kind,
        secretHash: empreinteRapide(code),
        expiresAt: new Date(Date.now() + VALIDITE_MINUTES * 60_000),
      },
    }),
  ]);
  return code;
}

export const ESSAIS_PAR_CODE = 5;

/**
 * Vérification d'un code. Le compteur d'essais est incrémenté avant la
 * comparaison : un processus interrompu au mauvais moment doit laisser
 * l'essai compté, jamais l'inverse.
 */
export async function consommerUnCode(
  userId: string,
  kind: "VERIFICATION_EMAIL" | "REINITIALISATION_MOT_DE_PASSE",
  code: string,
): Promise<boolean> {
  const secret = await db.authSecret.findFirst({
    where: { userId, kind, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!secret) return false;
  if (secret.attempts >= ESSAIS_PAR_CODE) return false;

  await db.authSecret.update({
    where: { id: secret.id },
    data: { attempts: { increment: 1 } },
  });
  if (secret.secretHash !== empreinteRapide(code)) return false;

  await db.authSecret.update({ where: { id: secret.id }, data: { consumedAt: new Date() } });
  return true;
}

/**
 * Correction de l'adresse d'un compte non vérifié — A-03, « Mauvaise
 * adresse ? ».
 *
 * Le lien menait à `/consentements`, où rien ne permet de changer
 * d'adresse : un candidat qui s'était trompé d'une lettre à l'inscription
 * n'avait aucune issue que de recréer un compte.
 *
 * Trois garde-fous :
 *
 * - **seulement tant que l'adresse n'est pas vérifiée**. Une adresse vérifiée
 *   est celle où partent les alertes et la réinitialisation du mot de passe ;
 *   la changer depuis une session suffirait à prendre le compte de qui a
 *   laissé son téléphone ouvert. Ce cas passe par le support ;
 * - **le mot de passe est redemandé**, pour la même raison ;
 * - **une adresse déjà prise ne se dit pas** : la réponse est la même que
 *   pour une adresse libre, et c'est le courrier envoyé à cette adresse qui
 *   informe son titulaire — la règle de l'inscription, appliquée ici.
 *
 * Le code précédent est annulé à l'émission du suivant : un code envoyé à la
 * mauvaise adresse ne vérifie jamais la nouvelle.
 */
export type IssueDeLaCorrection =
  | { issue: "corrigee"; email: string; code: string }
  | { issue: "deja_prise"; email: string };

export async function corrigerLAdresse(
  userId: string,
  adresseSaisie: string,
  motDePasse: string,
): Promise<IssueDeLaCorrection> {
  const email = normaliserEmail(adresseSaisie);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw echec("authentification_requise");

  const juste = user.passwordHash
    ? await correspond(motDePasse, user.passwordHash)
    : await correspond(motDePasse, LEURRE);
  if (!juste) {
    throw echec("champs_invalides", {
      champs: { motDePasse: "Ce mot de passe ne correspond pas à ton compte. Saisis celui choisi à l'inscription." },
    });
  }
  if (user.emailVerified) {
    throw echec("champs_invalides", {
      champs: {
        email:
          "Ton adresse est déjà vérifiée : elle ne se change pas depuis cet écran. Écris au support depuis la page Contact.",
      },
    });
  }
  if (email === user.email) {
    throw echec("champs_invalides", {
      champs: { email: "C'est déjà l'adresse de ton compte. Vérifie l'orthographe, ou demande un nouveau code." },
    });
  }

  const prise = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (prise) return { issue: "deja_prise", email };

  try {
    await db.user.update({ where: { id: userId }, data: { email } });
  } catch (erreur) {
    // Prise entre la lecture et l'écriture : même réponse qu'une adresse prise.
    if ((erreur as { code?: unknown } | null)?.code === "P2002") return { issue: "deja_prise", email };
    throw erreur;
  }
  const code = await emettreUnCode(userId, "VERIFICATION_EMAIL");
  return { issue: "corrigee", email, code };
}

/**
 * Changement de mot de passe. Il ferme toutes les sessions, y compris celle
 * qui l'a demandé : quelqu'un qui change son mot de passe après un vol de
 * téléphone doit reprendre la main sur l'appareil volé, et l'y laisser
 * connecté annulerait le geste.
 */
export async function changerLeMotDePasse(userId: string, motDePasse: string): Promise<void> {
  if (!motDePasseRecevable(motDePasse)) {
    throw echec("champs_invalides", { champs: { motDePasse: "Au moins dix caractères." } });
  }
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await empreinte(motDePasse), failedLogins: 0, lockedUntil: null },
  });
  await fermerToutesLesSessions(userId);
}
