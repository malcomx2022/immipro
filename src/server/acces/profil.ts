import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { FUSEAUX_PROPOSES } from "@/domain/dossiers/preferences-rappels";
import {
  CONSENTEMENTS_REFUSES_AU_MINEUR,
  estMineur,
  validerIdentite,
  type SaisieDIdentite,
} from "@/domain/comptes/profil";
import { jourCivil } from "@/domain/format/fuseau";
import { GENRE_DU_CONSENTEMENT, VERSION_TEXTES } from "@/server/acces/consentements";
import { echec } from "@/server/http/echecs";

/**
 * Enregistrement du profil — C-02, WF-02 étapes 3 et 4.
 *
 * ── L'enregistrement effaçait ce qu'on ne lui donnait pas ───────────
 *
 * La route composait ses colonnes ainsi :
 *
 *     objectif: corps.objectif ?? null,
 *     fieldOfStudy: corps.domaine ?? null,
 *     yearsExperience: corps.anneesExperience ?? null,
 *     budgetTotal: corps.budgetTotal ?? null,
 *     budgetCurrency: corps.budgetDevise ?? null,
 *
 * Un `??` sur une valeur absente n'est pas un effacement demandé, c'est un
 * effacement subi : C-02 n'envoie ni objectif, ni domaine, ni expérience,
 * ni budget, et les vidait donc à chaque clic sur « Enregistrer ». Exécuté
 * avant correction, sur une base réelle :
 *
 *     avant : objectif "Étudier", fieldOfStudy "Informatique",
 *             yearsExperience 3, budgetTotal 4000000, budgetCurrency "XOF"
 *     après : objectif null, fieldOfStudy null, yearsExperience null,
 *             budgetTotal null, budgetCurrency null
 *
 * L'en-tête de la route dit pourtant ce que ces colonnes portent : « les
 * réponses du simulateur alimentent le profil à la création — le candidat
 * ne resaisit rien ». Le seul écran qui écrit ce profil les effaçait.
 *
 * ── Absent, vide, et la différence entre les deux ───────────────────
 *
 * `undefined` laisse la colonne intacte : ce que l'appelant n'a pas
 * mentionné ne lui appartient pas. La chaîne vide, elle, est un geste — le
 * candidat a effacé le champ — et elle vide la colonne. Sans cette seconde
 * règle, le correctif rendrait les champs ineffaçables, ce qui serait le
 * défaut inverse.
 *
 * ── Pourquoi l'écriture vit ici ─────────────────────────────────────
 *
 * La même raison que `server/regles/publication`, `server/revue/decision`
 * et `server/veille/releve` : dans sa route, elle était derrière
 * `next/headers`, donc hors de portée de toute fumée. Un effacement de
 * colonnes ne se voit qu'en relisant la ligne après coup.
 */

export interface CorpsDuProfil {
  prenom?: string;
  nom?: string;
  telephone?: string;
  /** Identité de facturation (M.C, 04/10/2026) : figée sur chaque facture. */
  facturationNom?: string;
  facturationAdresse?: string;
  pays?: string;
  objectif?: string;
  diplome?: string;
  domaine?: string;
  anneesExperience?: number;
  langues?: Record<string, string>;
  budgetTotal?: number;
  budgetDevise?: "XOF" | "EUR";
}

/**
 * Absent → la clé n'est pas dans l'objet, et Prisma ne touche pas la
 * colonne. Vide → la clé y est, à `null`, et la colonne se vide. C'est
 * l'omission qui protège, pas une valeur sentinelle.
 */
const texte = (valeur: string | undefined): { valeur: string | null } | undefined =>
  valeur === undefined ? undefined : { valeur: valeur.trim() === "" ? null : valeur.trim() };

const nombre = (valeur: number | undefined): { valeur: number } | undefined =>
  valeur === undefined ? undefined : { valeur };

/**
 * Les langues arrivent en bloc et se remplacent en bloc : le contrat porte
 * un dictionnaire, pas des entrées. Un dictionnaire dont toutes les valeurs
 * sont vides vaut un effacement — c'est ce que C-02 envoie quand le
 * candidat efface son niveau d'anglais, seule langue qu'il saisit.
 */
const langues = (
  valeur: Record<string, string> | undefined,
): { valeur: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue } | undefined => {
  if (valeur === undefined) return undefined;
  const retenues = Object.fromEntries(
    Object.entries(valeur).filter(([, v]) => v.trim() !== ""),
  );
  // Une colonne `Json?` se vide par `DbNull` — le `null` de JSON est une
  // valeur, et les deux ne se disent pas du même mot chez Prisma.
  return { valeur: Object.keys(retenues).length === 0 ? Prisma.DbNull : retenues };
};

/**
 * Ne garde que les colonnes mentionnées, et les déballe.
 *
 * Paramétrée par le type Prisma de la table : une colonne mal nommée, ou
 * une valeur du mauvais type, ne compile pas. Un `Record<string, never>`
 * aurait fait passer les deux.
 */
const mentionnees = <T,>(entrees: { [K in keyof T]?: { valeur: T[K] } }): T =>
  Object.fromEntries(
    Object.entries(entrees)
      .filter(([, v]) => v !== undefined)
      .map(([cle, v]) => [cle, (v as { valeur: unknown }).valeur]),
  ) as T;

/** Les colonnes que cette écriture touche, et aucune autre. */
type ColonnesDuCompte = Pick<
  Prisma.UserUpdateInput,
  "firstName" | "lastName" | "phone" | "countryCode" | "billingName" | "billingAddress"
>;
type ColonnesDuProfil = Omit<
  Prisma.ProfileUncheckedCreateInput,
  "id" | "userId" | "updatedAt"
>;

export async function enregistrerLeProfil(userId: string, corps: CorpsDuProfil): Promise<void> {
  const compte = mentionnees<ColonnesDuCompte>({
    firstName: texte(corps.prenom),
    lastName: texte(corps.nom),
    phone: texte(corps.telephone),
    billingName: texte(corps.facturationNom),
    billingAddress: texte(corps.facturationAdresse),
    countryCode: texte(corps.pays),
  });
  if (Object.keys(compte).length > 0) {
    await db.user.update({ where: { id: userId }, data: compte });
  }

  const profil = mentionnees<ColonnesDuProfil>({
    objectif: texte(corps.objectif),
    highestDegree: texte(corps.diplome),
    fieldOfStudy: texte(corps.domaine),
    yearsExperience: nombre(corps.anneesExperience),
    languages: langues(corps.langues),
    budgetTotal: nombre(corps.budgetTotal),
    budgetCurrency: texte(corps.budgetDevise),
  });
  if (Object.keys(profil).length === 0) return;

  // `upsert` et non `update` : le profil n'existe pas tant que rien n'a
  // été saisi. Les colonnes non mentionnées sont absentes des deux côtés.
  await db.profile.upsert({
    where: { userId },
    create: { userId, ...profil },
    update: profil,
  });
}

/* ------------------------------------------------------------------ *
 * L'identité du compte — « Mon compte » (/compte), S.210.
 * ------------------------------------------------------------------ */


export interface IdentiteDuCompte {
  email: string;
  emailVerifie: boolean;
  prenom: string;
  nom: string;
  nomAffiche: string;
  telephone: string;
  dateNaissance: string;
  pays: string;
  langue: string;
  fuseau: string;
}

/** `AAAA-MM-JJ` d'une colonne `@db.Date`, lue à minuit UTC. */
const versJourCivil = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : "");

/** Ce que l'écran affiche. Ni empreinte, ni jeton, ni compteur d'échecs. */
export async function identiteDuCompte(userId: string): Promise<IdentiteDuCompte> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      emailVerified: true,
      firstName: true,
      lastName: true,
      displayName: true,
      phone: true,
      birthDate: true,
      countryCode: true,
      locale: true,
      reminderTimeZone: true,
    },
  });
  if (!u) throw echec("authentification_requise");
  return {
    email: u.email,
    emailVerifie: u.emailVerified !== null,
    prenom: u.firstName ?? "",
    nom: u.lastName ?? "",
    nomAffiche: u.displayName ?? "",
    telephone: u.phone ?? "",
    dateNaissance: versJourCivil(u.birthDate),
    pays: u.countryCode ?? "",
    langue: u.locale,
    fuseau: u.reminderTimeZone,
  };
}

/**
 * Enregistre l'identité du compte.
 *
 * La validation est celle du domaine (`validerIdentite`), rejouée ici
 * avant toute écriture. Le fuseau est celui des rappels : un fuseau par
 * compte. L'adresse électronique n'est jamais écrite par ce chemin.
 *
 * **Mineur.** Une date de naissance qui dit moins de dix-huit ans retire,
 * dans la même transaction, les autorisations qu'un mineur ne peut pas
 * accorder (propositions de partenaires). Le retrait suit la règle des
 * consentements : la ligne précédente est datée comme retirée, une ligne
 * de refus est écrite — la preuve n'est jamais réécrite.
 *
 * Aucune facture n'est touchée : chacune garde l'identité figée à son
 * émission.
 */
export async function enregistrerLIdentite(
  userId: string,
  saisie: SaisieDIdentite,
  maintenant = new Date(),
): Promise<{ enregistre: true; autorisationsRetirees: number }> {
  const lue = validerIdentite(
    saisie,
    jourCivil(maintenant),
    FUSEAUX_PROPOSES.map((f) => f.id),
  );
  if (!lue.ok) throw echec("champs_invalides", { champs: lue.champs });
  const i = lue.identite;

  return db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        firstName: i.prenom,
        lastName: i.nom,
        displayName: i.nomAffiche,
        phone: i.telephone,
        birthDate: i.dateNaissance ? new Date(`${i.dateNaissance}T00:00:00.000Z`) : null,
        countryCode: i.pays,
        locale: i.langue,
        reminderTimeZone: i.fuseau,
      },
    });
    let autorisationsRetirees = 0;
    if (i.mineur) {
      for (const code of CONSENTEMENTS_REFUSES_AU_MINEUR) {
        const kind = GENRE_DU_CONSENTEMENT[code];
        const { count } = await tx.consent.updateMany({
          where: { userId, kind, revokedAt: null, granted: true },
          data: { revokedAt: maintenant },
        });
        if (count > 0) {
          await tx.consent.create({
            data: { userId, kind, granted: false, version: VERSION_TEXTES, grantedAt: maintenant },
          });
          autorisationsRetirees += count;
        }
      }
    }
    return { enregistre: true as const, autorisationsRetirees };
  });
}

/**
 * Refuse d'accorder une autorisation qu'un mineur ne peut pas donner.
 * Le refus, lui, passe toujours : retirer est un droit, à tout âge.
 */
export async function exigerAutorisationPermise(
  userId: string,
  code: string,
  accorde: boolean,
  maintenant = new Date(),
): Promise<void> {
  if (!accorde || !(CONSENTEMENTS_REFUSES_AU_MINEUR as readonly string[]).includes(code)) return;
  const u = await db.user.findUnique({ where: { id: userId }, select: { birthDate: true } });
  if (estMineur(versJourCivil(u?.birthDate ?? null) || null, jourCivil(maintenant))) {
    throw echec("etat_incompatible", {
      corps:
        "Ta date de naissance indique que tu as moins de dix-huit ans : les propositions de partenaires ne peuvent pas être activées. Si la date est fausse, corrige-la dans Mon compte.",
    });
  }
}

/**
 * Ce que « Sécurité » (/compte/securite) affiche — S.210 : les sessions
 * ouvertes et la plus récente. Ni jeton, ni empreinte, ni agent complet :
 * la date d'ouverture, la dernière activité et le début de l'agent.
 */
export interface EtatDeSecurite {
  sessions: number;
  plusRecente: { ouverteLe: string; vueLe: string; appareil: string | null } | null;
}

export async function etatDeSecurite(userId: string): Promise<EtatDeSecurite> {
  const [sessions, plusRecente] = await Promise.all([
    db.session.count({ where: { userId, expiresAt: { gt: new Date() } } }),
    db.session.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, lastSeenAt: true, userAgent: true },
    }),
  ]);
  return {
    sessions,
    plusRecente: plusRecente
      ? {
          ouverteLe: plusRecente.createdAt.toISOString(),
          vueLe: plusRecente.lastSeenAt.toISOString(),
          appareil: plusRecente.userAgent ? plusRecente.userAgent.slice(0, 60) : null,
        }
      : null,
  };
}
