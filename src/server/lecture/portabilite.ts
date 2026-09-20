import { db } from "@/lib/db";
import { consultable } from "@/domain/dossiers/quarantaine";
import { echec } from "@/server/http/echecs";
import { versFiche, mentionDe } from "@/server/acces/regles";
import { versPiece } from "@/server/vue/dossier";
import { LIBELLE_PALIER } from "@/domain/completeness/score";
import { completudeDesPieces } from "@/domain/dossiers/piece";
import { A_PROPOS, VERSION_EXPORT } from "@/domain/comptes/portabilite";
import { CONSENTEMENTS } from "@/domain/comptes/consentements";
import { GENRE_DU_CONSENTEMENT } from "@/server/acces/consentements";
import type { Piece } from "@/domain/dossiers/piece";

/**
 * Portabilité et archive — A-05, C-11, WF-15.
 *
 * Une règle tient tout ce module : **l'export rend ce que le candidat voit,
 * pas ce que la base garde.** La différence n'est pas théorique. Le barème
 * interne de WF-07 est une donnée sur la personne, et l'arbitrage C-09
 * interdit qu'elle lui soit montrée — l'exporter la lui montrerait par la
 * porte de derrière, et un nombre sur cent lu dans un fichier se retient
 * comme un pronostic aussi sûrement qu'affiché à l'écran. L'export porte
 * donc la complétude telle que les écrans la disent : un palier et un
 * dénombrement. Le point mérite une réponse juridique, pas seulement
 * produit (voir ECARTS, annexe L).
 *
 * Ce qui n'y est pas non plus, et pour une raison mécanique cette fois :
 * les fichiers. Ils se téléchargent un par un, par une URL signée créée au
 * clic (règle d'architecture 4).
 */

const iso = (d: Date | null) => d?.toISOString() ?? null;
const jour = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

export interface ExportCompte {
  meta: { version: string; genereLe: string; aPropos: string };
  compte: Record<string, unknown>;
  profil: Record<string, unknown> | null;
  consentements: unknown[];
  dossiers: unknown[];
  paiements: unknown[];
  alertes: unknown[];
  rendezVous: unknown[];
}

/**
 * Tout ce que le compte porte, en une lecture.
 *
 * Volontairement une seule requête large plutôt qu'une dizaine : l'export
 * doit être cohérent avec lui-même, et une purge qui tomberait entre deux
 * requêtes rendrait un fichier où une pièce est présente dans la checklist
 * et absente de ses versions.
 */
export async function donneesDuCompte(userId: string): Promise<ExportCompte> {
  const compte = await db.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      consents: { orderBy: { grantedAt: "asc" } },
      transactions: { orderBy: { createdAt: "asc" } },
      notifications: { orderBy: { createdAt: "asc" } },
      applications: {
        orderBy: { createdAt: "asc" },
        include: {
          visaRule: true,
          deadlines: { orderBy: { dueAt: "asc" } },
          credits: { orderBy: { createdAt: "asc" } },
          appointments: { orderBy: { startsAt: "asc" }, include: { consultant: true } },
          documents: {
            orderBy: [{ family: "asc" }, { createdAt: "asc" }],
            include: {
              interview: { orderBy: { rank: "asc" } },
              versions: {
                orderBy: { rank: "asc" },
                include: {
                  analyses: { orderBy: { analyzedAt: "asc" } },
                  findings: { orderBy: { createdAt: "asc" } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!compte) throw echec("introuvable");

  const libelleConsentement = new Map(CONSENTEMENTS.map((c) => [GENRE_DU_CONSENTEMENT[c.code], c.titre]));

  return {
    meta: {
      version: VERSION_EXPORT,
      genereLe: new Date().toISOString(),
      aPropos: A_PROPOS,
    },
    compte: {
      email: compte.email,
      prenom: compte.firstName,
      nom: compte.lastName,
      telephone: compte.phone,
      pays: compte.countryCode,
      langue: compte.locale,
      inscritLe: iso(compte.createdAt),
      emailVerifieLe: iso(compte.emailVerified),
    },
    profil: compte.profile
      ? {
          objectif: compte.profile.objectif,
          diplomeLePlusEleve: compte.profile.highestDegree,
          domaine: compte.profile.fieldOfStudy,
          anneesExperience: compte.profile.yearsExperience,
          langues: compte.profile.languages,
          budget: compte.profile.budgetTotal,
          budgetDevise: compte.profile.budgetCurrency,
          misAJourLe: iso(compte.profile.updatedAt),
        }
      : null,
    consentements: compte.consents.map((c) => ({
      autorisation: libelleConsentement.get(c.kind) ?? c.kind,
      accorde: c.granted,
      versionDesTextes: c.version,
      accordeLe: iso(c.grantedAt),
      retireLe: iso(c.revokedAt),
    })),
    dossiers: compte.applications.map((a) => {
      const fiche = a.visaRule ? versFiche(a.visaRule) : null;
      const pieces: Piece[] = a.documents.map(versPiece);
      const completude = completudeDesPieces(pieces);
      return {
        destination: fiche
          ? { pays: fiche.pays, intitule: fiche.intitule, code: fiche.code }
          : null,
        // INV-8 : la règle appliquée porte sa source et sa date. Sans
        // elles, l'export dit ce qui était exigé sans dire par qui.
        //
        // Ici l'adresse **complète**, contrairement à l'écran qui n'affiche
        // que le domaine : un fichier destiné à être relu par un autre
        // service doit permettre de retrouver la page exacte, et il n'a pas
        // de largeur à tenir.
        regleAppliquee: a.visaRule
          ? {
              version: a.visaRule.version,
              source: a.visaRule.sourceUrl,
              verifieeLe: jour(a.visaRule.verifiedAt),
            }
          : null,
        statut: a.status,
        ouvertLe: iso(a.createdAt),
        depotVise: jour(a.targetDate),
        deposeLe: iso(a.submittedAt),
        issue: a.issue,
        // Le barème interne n'est pas ici : l'export rend ce que les écrans
        // disent, un palier et un dénombrement (arbitrage C-09).
        completude: {
          palier: LIBELLE_PALIER[completude.palier],
          conformes: completude.compteurs.conformes,
          obligatoiresManquantes: completude.compteurs.obligatoiresManquantes,
          facultativesManquantes: completude.compteurs.facultativesManquantes,
        },
        purgePrevueLe: jour(a.purgeDueAt),
        purgeeLe: iso(a.purgedAt),
        pieces: a.documents.map((d) => ({
          code: d.code,
          libelle: d.label,
          famille: d.family,
          etat: d.status,
          remede: d.remedy,
          constat: d.finding,
          consigne: d.feedback,
          entretien: d.interview.map((r) => ({
            section: r.section,
            question: r.question,
            reponse: r.answer,
          })),
          versions: d.versions.map((v) => ({
            rang: v.rank,
            deposeeLe: iso(v.uploadedAt),
            motif: v.changeNote,
            // Le texte d'une pièce rédigée est dans l'export : il n'existe
            // nulle part ailleurs, et c'est ce que la suppression emporte.
            texte: v.body,
            nomDuFichier: v.objectKey ? v.objectKey.split("/").at(-1) : null,
            typeDeFichier: v.mimeType,
            tailleOctets: v.sizeBytes,
            purgeeLe: iso(v.purgedAt),
            analyses: v.analyses.map((an) => ({
              verdict: an.verdict,
              titre: an.title,
              corps: an.body,
              champsLus: an.fields,
              analyseeLe: iso(an.analyzedAt),
            })),
            remarques: v.findings.map((f) => ({
              genre: f.kind,
              titre: f.title,
              corps: f.body,
              ecarts: f.gaps,
              resolueLe: iso(f.resolvedAt),
            })),
          })),
        })),
        echeances: a.deadlines.map((e) => ({
          code: e.code,
          libelle: e.label,
          echeanceLe: jour(e.dueAt),
          faiteLe: iso(e.doneAt),
        })),
        analyses: a.credits.map((c) => ({
          mouvement: c.delta,
          motif: c.reason,
          le: iso(c.createdAt),
        })),
        rendezVous: a.appointments.map((r) => ({
          reference: r.reference,
          consultant: r.consultant.name,
          cabinet: r.consultant.firm,
          debut: iso(r.startsAt),
          dureeMinutes: r.durationMin,
          statut: r.status,
        })),
      };
    }),
    paiements: compte.transactions.map((t) => ({
      reference: t.reference,
      pack: t.packCode,
      montant: t.amount,
      devise: t.currency,
      operateur: t.provider,
      statut: t.status,
      creeLe: iso(t.createdAt),
      confirmeLe: iso(t.confirmedAt),
    })),
    alertes: compte.notifications.map((n) => ({
      genre: n.kind,
      titre: n.title,
      corps: n.body,
      source: n.sourceUrl,
      echeanceLe: jour(n.dueAt),
      recueLe: iso(n.createdAt),
      lueLe: iso(n.readAt),
    })),
    // Les rendez-vous sont rattachés à leur dossier ci-dessus ; ce champ
    // reste pour qu'un lecteur qui cherche « rendezVous » à la racine
    // trouve où regarder plutôt que de conclure qu'il n'y en a pas.
    rendezVous: [],
  };
}

/**
 * Archive d'un dossier — C-11.
 *
 * Pensée pour être imprimée. Les textes rédigés y sont **en entier** : ce
 * sont les seules pièces qui n'existent nulle part ailleurs, et quelqu'un
 * qui clôture doit repartir avec sa lettre, pas avec son titre.
 *
 * Les fichiers téléversés, eux, ne sont que nommés. Leur lien se demande au
 * clic et vaut cinq minutes (règle d'architecture 4) : le poser dans la
 * page le rendrait mort avant qu'on y arrive, et imprimé, il serait mort
 * pour toujours.
 */
export interface PieceArchivee {
  id: string;
  code: string;
  libelle: string;
  famille: string;
  etat: string;
  constat: string | null;
  /** Vrai quand un fichier reste à télécharger. Faux après la purge. */
  telechargeable: boolean;
  purgeeLe: string | null;
  /** Texte d'une pièce rédigée, en entier. Vide pour un fichier. */
  textes: { rang: number; motif: string | null; texte: string }[];
  analyses: { verdict: string; titre: string; corps: string; analyseeLe: string }[];
}

export interface Archive {
  dossier: {
    id: string;
    pays: string;
    intitule: string;
    code: string;
    statut: string;
    ouvertLe: string;
    depotVise: string | null;
    purgePrevueLe: string | null;
    purgeeLe: string | null;
  };
  /**
   * INV-8 : la règle appliquée porte sa source et sa date de vérification.
   *
   * `source` est le **domaine**, pas l'adresse complète, comme partout
   * ailleurs dans l'application (`mentionDe`). La première version rendait
   * l'URL entière : cent trente caractères qui s'étalaient sur six lignes
   * en 390 px et repoussaient le reste. Ce qui prouve la provenance, c'est
   * l'autorité et la date, pas le chemin d'accès.
   */
  regle: { version: number; source: string; verifieeLe: string } | null;
  pieces: PieceArchivee[];
  echeances: { libelle: string; echeanceLe: string; faite: boolean }[];
}

export async function archiveDuDossier(
  applicationId: string,
  userId: string,
): Promise<Archive> {
  const a = await db.application.findFirst({
    where: { id: applicationId, userId },
    include: {
      visaRule: true,
      deadlines: { orderBy: { dueAt: "asc" } },
      documents: {
        orderBy: [{ family: "asc" }, { createdAt: "asc" }],
        include: {
          versions: {
            orderBy: { rank: "asc" },
            include: { analyses: { orderBy: { analyzedAt: "asc" } } },
          },
        },
      },
    },
  });
  if (!a) throw echec("introuvable");

  const fiche = a.visaRule ? versFiche(a.visaRule) : null;

  return {
    dossier: {
      id: a.id,
      pays: fiche?.pays ?? a.visaRule?.countryCode ?? "—",
      intitule: fiche?.intitule ?? "—",
      code: fiche?.code ?? a.visaRule?.countryCode ?? "—",
      statut: a.status,
      ouvertLe: iso(a.createdAt)!,
      depotVise: jour(a.targetDate),
      purgePrevueLe: jour(a.purgeDueAt),
      purgeeLe: jour(a.purgedAt),
    },
    regle: a.visaRule
      ? {
          version: a.visaRule.version,
          source: mentionDe(a.visaRule).source,
          verifieeLe: jour(a.visaRule.verifiedAt)!,
        }
      : null,
    pieces: a.documents.map((d) => {
      const derniere = d.versions.at(-1);
      return {
        id: d.id,
        code: d.code,
        libelle: d.label,
        famille: d.family,
        etat: d.status,
        constat: d.finding,
        // I.D — un fichier encore en quarantaine ne se télécharge pas plus
        // depuis l'export que depuis l'écran.
        telechargeable: Boolean(
          derniere?.objectKey && !derniere.purgedAt && consultable(derniere.scanState),
        ),
        purgeeLe: jour(derniere?.purgedAt ?? null),
        textes: d.versions
          .filter((v) => v.body !== null)
          .map((v) => ({ rang: v.rank, motif: v.changeNote, texte: v.body! })),
        analyses: d.versions.flatMap((v) =>
          v.analyses.map((an) => ({
            verdict: an.verdict,
            titre: an.title,
            corps: an.body,
            analyseeLe: jour(an.analyzedAt)!,
          })),
        ),
      };
    }),
    echeances: a.deadlines.map((e) => ({
      libelle: e.label,
      echeanceLe: jour(e.dueAt)!,
      faite: e.doneAt !== null,
    })),
  };
}
