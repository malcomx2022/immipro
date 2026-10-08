import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { empreinteRapide, jeton } from "./secret";

/**
 * Sessions serveur — WF-02.
 *
 * Deux durées, et non une. L'absolue est longue parce qu'un dossier de visa
 * se construit sur des mois : déconnecter quelqu'un toutes les semaines lui
 * ferait ressaisir un mot de passe au milieu d'un dépôt de pièces, et c'est
 * ainsi qu'on fabrique des mots de passe courts. L'inactive est courte parce
 * qu'une partie du public se connecte depuis un poste partagé — un
 * cybercafé, le téléphone d'un proche — où la session oubliée est le vrai
 * risque, pas la session longue sur un appareil personnel.
 */
export const DUREE_JOURS = 30;
export const INACTIVITE_JOURS = 7;

/**
 * Session non mémorisée — A-02, « Rester connecté » décoché (décision D-22,
 * 08/10/2026). Le cookie n'a pas d'échéance : le navigateur l'oublie à sa
 * fermeture. Et la ligne en base expire au bout de 24 heures quoi qu'il
 * arrive, parce qu'un navigateur qui restaure ses onglets restaure aussi
 * ses cookies de session : sur un poste de cybercafé jamais fermé, seule
 * l'échéance serveur protège la personne suivante.
 *
 * La case n'était jamais envoyée (revue du 07/10/2026, N1) : toute session
 * durait trente jours, y compris celle que l'écran disait de ne pas garder.
 */
export const DUREE_NON_MEMORISEE_HEURES = 24;

export const COOKIE_SESSION = "immipro_session";

const JOUR = 24 * 60 * 60 * 1000;

/** En dessous, `lastSeenAt` n'est pas réécrit : une écriture par appel pour rien. */
const PAS_DE_RAFRAICHISSEMENT_MS = 60 * 60 * 1000;

export interface Acteur {
  id: string;
  email: string;
  role: Role;
  /** Adresse vérifiée. Certaines actions l'exigent, la connexion non. */
  emailVerifie: boolean;
}

export interface SessionOuverte {
  /** Valeur à poser dans le cookie. Elle n'est jamais stockée telle quelle. */
  valeur: string;
  /** Échéance en base, toujours posée. */
  expireLe: Date;
  /** Échéance du cookie ; `null` pour un cookie que le navigateur oublie à sa fermeture. */
  cookieExpireLe: Date | null;
}

/**
 * `memoriser` vaut vrai par défaut : l'inscription ouvre une session
 * mémorisée, comme avant, et seule la connexion porte la case.
 */
export async function ouvrirSession(
  userId: string,
  userAgent?: string | null,
  memoriser = true,
): Promise<SessionOuverte> {
  const valeur = jeton();
  const expireLe = new Date(
    Date.now() + (memoriser ? DUREE_JOURS * JOUR : DUREE_NON_MEMORISEE_HEURES * 60 * 60 * 1000),
  );
  await db.session.create({
    data: {
      tokenHash: empreinteRapide(valeur),
      userId,
      expiresAt: expireLe,
      userAgent: userAgent?.slice(0, 200) ?? null,
    },
  });
  return { valeur, expireLe, cookieExpireLe: memoriser ? expireLe : null };
}

/**
 * Résout l'acteur d'un appel. Rend `null` dès que l'une des conditions
 * tombe : session inconnue, échue, inactive trop longtemps, ou compte
 * suspendu. La suspension est lue à chaque appel et non à la connexion —
 * c'est tout l'intérêt d'une session en base (WF-15).
 */
export async function lireSession(valeur: string | undefined): Promise<Acteur | null> {
  if (!valeur) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: empreinteRapide(valeur) },
    include: { user: { select: { id: true, email: true, role: true, emailVerified: true, suspendedAt: true } } },
  });
  if (!session) return null;

  const maintenant = Date.now();
  const echue = session.expiresAt.getTime() <= maintenant;
  const dormante = maintenant - session.lastSeenAt.getTime() > INACTIVITE_JOURS * JOUR;
  if (echue || dormante) {
    // Une session morte se retire tout de suite : la laisser en base
    // ferait grossir la table jusqu'à la purge, et rien ne la rouvrira.
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.user.suspendedAt) return null;

  if (maintenant - session.lastSeenAt.getTime() > PAS_DE_RAFRAICHISSEMENT_MS) {
    await db.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date(maintenant) } })
      .catch(() => undefined);
  }

  return {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
    emailVerifie: session.user.emailVerified !== null,
  };
}

export async function fermerSession(valeur: string | undefined): Promise<void> {
  if (!valeur) return;
  await db.session.deleteMany({ where: { tokenHash: empreinteRapide(valeur) } });
}

/**
 * Ferme toutes les sessions d'un compte. Appelée au changement de mot de
 * passe et à la suspension : sans cela, un mot de passe changé après un vol
 * de téléphone ne reprendrait pas la main sur l'appareil volé.
 */
export async function fermerToutesLesSessions(userId: string): Promise<number> {
  const { count } = await db.session.deleteMany({ where: { userId } });
  return count;
}

/**
 * Attributs du cookie de session.
 *
 * `httpOnly` : le jeton n'est jamais lu en JavaScript, une faille XSS ne
 * l'emporte pas. `sameSite: "lax"` : les retours de redirection du
 * fournisseur de paiement sont des navigations GET, `strict` les ferait
 * arriver déconnecté sur $-04. `secure` hors développement seulement, sinon
 * le cookie ne se pose pas sur `http://localhost`.
 *
 * Sans échéance, le cookie est un cookie de session du navigateur : il
 * disparaît à la fermeture (D-22).
 */
export const attributsCookie = (expireLe: Date | null) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  ...(expireLe ? { expires: expireLe } : {}),
});

export const attributsSuppression = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 0,
});
