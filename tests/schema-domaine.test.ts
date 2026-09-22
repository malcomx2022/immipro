import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DocumentState } from "@/domain/completeness/score";
import type { StatutDossier } from "@/domain/dossiers/dossier";
import type { EtatStocke } from "@/domain/dossiers/etat";
import type { FamillePiece, RemedePiece } from "@/domain/dossiers/piece";
import type { GenreAlerte } from "@/domain/notifications/alerte";
import type { Arbitrage } from "@/domain/notifications/divergence";
import type { GenreRemarque } from "@/domain/redaction/relecture";
import type { Decision, MotifEchec } from "@/domain/backoffice/revue";
import type { NiveauSource } from "@/domain/backoffice/regle";
import type { CodeConsentement } from "@/domain/comptes/consentements";
import type { EtatProposition, GenrePartenaire } from "@/domain/partenaires/affiliation";
import { CONSENTEMENTS } from "@/domain/comptes/consentements";
import {
  LIBELLE_ETAT as LIBELLE_ETAT_PROPOSITION,
  LIBELLE_GENRE as LIBELLE_GENRE_PARTENAIRE,
} from "@/domain/partenaires/affiliation";
import { LIBELLE_STATUT } from "@/domain/dossiers/dossier";
import { LIBELLE_FAMILLE } from "@/domain/dossiers/piece";
import { LIBELLE_MOTIF } from "@/domain/backoffice/revue";
import { LIBELLE_GENRE } from "@/domain/redaction/relecture";
import { LIBELLE_NIVEAU } from "@/domain/backoffice/regle";
import { LIBELLES_ETAT_PIECE } from "@/components/ui/StatusBadge";

/**
 * Accord entre le schéma de données et le domaine.
 *
 * Les mêmes vocabulaires sont maintenant écrits deux fois : en enums Prisma
 * et en unions TypeScript. C'est inévitable — le domaine doit rester pur, et
 * `prisma generate` demande une base — mais c'est exactement le genre de
 * duplication qui diverge en silence : un état ajouté d'un côté, et une
 * ligne de checklist qui ne s'affiche plus de l'autre.
 *
 * Ce test lit le schéma comme un texte, sans client Prisma ni base, et
 * compare les deux listes. Il échoue le jour où l'une bouge sans l'autre.
 */
const SCHEMA = readFileSync("prisma/schema.prisma", "utf8");

function valeursDeLEnum(nom: string): string[] {
  const bloc = new RegExp(`enum\\s+${nom}\\s*\\{([^}]*)\\}`, "u").exec(SCHEMA);
  if (!bloc) throw new Error(`enum ${nom} absent de prisma/schema.prisma`);
  return bloc[1]!
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/u, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("///"))
    .sort();
}

const trie = (valeurs: readonly string[]) => [...valeurs].sort();

function fichiersTs(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiersTs(p, acc);
    else if (/\.tsx?$/u.test(nom)) acc.push(p);
  }
  return acc;
}

describe("le schéma et le domaine nomment les mêmes choses", () => {
  it("états de pièce — DocumentStatus / DocumentState", () => {
    const domaine: DocumentState[] = [
      "ATTENDUE",
      "EN_ANALYSE",
      "CONFORME",
      "A_CORRIGER",
      "ILLISIBLE",
      "HORS_SUJET",
      "EXPIREE",
      "PURGEE",
    ];
    expect(valeursDeLEnum("DocumentStatus")).toEqual(trie(domaine));
    // Et chaque état a un libellé affichable : un état sans mot se rend en
    // code technique dans une pastille.
    expect(trie(Object.keys(LIBELLES_ETAT_PIECE))).toEqual(trie(domaine));
  });

  it("statuts de dossier — ApplicationStatus / StatutDossier", () => {
    /*
      Le domaine candidat n'expose pas `ISSUE_DECLAREE`, `ABANDONNE` ni
      `ARCHIVE` : trois fins de vie que l'écran réunit sous « Clôturé ».

      `SUSPENDU` y était aussi, et c'était une erreur : il s'affichait
      « Actif » sur un dossier que WF-11 venait de mettre en pause, et
      l'écran annonçait alors « Rien ne bloque un dépôt » sur le seul
      dossier dont le dépôt était bloqué. Il a son mot depuis le
      23/09/2026 — `EN_PAUSE`, que le courrier de WF-11 employait déjà.
    */
    const candidat: StatutDossier[] = [
      "BROUILLON",
      "ACTIF",
      "PRET",
      "EN_PAUSE",
      "SOUMIS",
      "CLOTURE",
    ];
    const base = valeursDeLEnum("ApplicationStatus");
    for (const statut of candidat) {
      if (statut === "CLOTURE" || statut === "EN_PAUSE") continue;
      expect(base, statut).toContain(statut);
    }
    expect(trie(Object.keys(LIBELLE_STATUT))).toEqual(trie(candidat));

    /*
      Le vocabulaire **stocké**, lui, est complet dans le domaine depuis
      que `miseEnEtat` arbitre le couple `status` / `readyAt` : un état
      ajouté en base sans passer par là écrirait de nouveau l'un sans
      l'autre, et la garde de la base le refuserait en production.
    */
    const stocke: EtatStocke[] = [
      "BROUILLON",
      "ACTIF",
      "PRET",
      "SOUMIS",
      "SUSPENDU",
      "ISSUE_DECLAREE",
      "ABANDONNE",
      "ARCHIVE",
    ];
    expect(base).toEqual(trie(stocke));
  });

  it("familles et remèdes de pièce — DocumentFamily / DocumentRemedy", () => {
    const familles: FamillePiece[] = ["OBLIGATOIRE", "COMPLEMENTAIRE"];
    expect(valeursDeLEnum("DocumentFamily")).toEqual(trie(familles));
    expect(trie(Object.keys(LIBELLE_FAMILLE))).toEqual(trie(familles));

    const remedes: RemedePiece[] = ["TELEVERSER", "REMPLACER", "REDIGER", "DEMARCHE"];
    expect(valeursDeLEnum("DocumentRemedy")).toEqual(trie(remedes));
  });

  it("verdicts d'analyse — AnalysisVerdict / Decision de revue", () => {
    const decisions: Decision[] = ["CONFORME", "A_CORRIGER", "ILLISIBLE", "HORS_SUJET"];
    expect(valeursDeLEnum("AnalysisVerdict")).toEqual(trie(decisions));
  });

  it("motifs d'échec — ReviewReason / MotifEchec", () => {
    const motifs: MotifEchec[] = [
      "SIGNALE_PAR_LE_CANDIDAT",
      "ECHEC_TECHNIQUE",
      "DOCUMENT_NON_RECONNU",
      "NETTETE_INSUFFISANTE",
    ];
    expect(valeursDeLEnum("ReviewReason")).toEqual(trie(motifs));
    expect(trie(Object.keys(LIBELLE_MOTIF))).toEqual(trie(motifs));
  });

  it("genres d'alerte — NotificationKind / GenreAlerte", () => {
    const genres: GenreAlerte[] = [
      "REGLEMENTATION",
      "ECHEANCE",
      "ANALYSE",
      "PAIEMENT",
      "VEILLE",
    ];
    expect(valeursDeLEnum("NotificationKind")).toEqual(trie(genres));
  });

  it("arbitrage de divergence — MigrationDecision / Arbitrage", () => {
    const decisions: Arbitrage[] = ["MIGRER", "CONSERVER"];
    expect(valeursDeLEnum("MigrationDecision")).toEqual(trie(decisions));
  });

  /**
   * L'énumération Prisma couvre ce qui se stocke ; le domaine en nomme un
   * de plus, et l'écart est voulu. `INCOHERENCE_DOSSIER` porte les
   * recoupements déterministes de RG-08.3, qui se recalculent à chaque
   * lecture : les stocker figerait un écart que la correction du texte
   * vient de lever.
   *
   * L'écart est donc borné des deux côtés — toute valeur stockée a son
   * genre, et le seul genre non stocké est nommé ici. Un genre ajouté au
   * domaine sans l'être au schéma, ou l'inverse, casse ce test.
   */
  const GENRE_NON_STOCKE = "INCOHERENCE_DOSSIER";

  it("remarques de relecture — CritiqueKind / GenreRemarque", () => {
    const stockes: GenreRemarque[] = ["INCOHERENCE", "A_RENFORCER", "FORME"];
    expect(valeursDeLEnum("CritiqueKind")).toEqual(trie(stockes));
    expect(trie(Object.keys(LIBELLE_GENRE))).toEqual(trie([...stockes, GENRE_NON_STOCKE]));
  });

  it("le genre non stocké n'est écrit nulle part en base", () => {
    const sources = fichiersTs("src").map((f) => readFileSync(f, "utf8"));
    for (const source of sources) {
      expect(source).not.toMatch(
        new RegExp(`kind:\\s*["'\`]${GENRE_NON_STOCKE}`, "u"),
      );
    }
  });

  it("niveaux de source — SourceTier / NiveauSource", () => {
    const niveaux: NiveauSource[] = ["OFFICIEL", "INSTITUTIONNEL", "SECONDAIRE"];
    expect(valeursDeLEnum("SourceTier")).toEqual(trie(niveaux));
    expect(trie(Object.keys(LIBELLE_NIVEAU))).toEqual(trie(niveaux));
  });
});

describe("le schéma porte les invariants qu'il peut porter", () => {
  const MIGRATIONS = readFileSync(
    "prisma/migrations/20260918000100_garde_fous/migration.sql",
    "utf8",
  );

  const GARDE_FOUS =
    MIGRATIONS +
    readFileSync(
      "prisma/migrations/20260920000100_garde_fous_suppression_affiliation/migration.sql",
      "utf8",
    );

  it("le barème interne ne porte plus un nom qui invite à le sérialiser", () => {
    // `completeness` se copiait dans une réponse d'API sans qu'on y pense ;
    // `internalScore` demande un instant de réflexion (arbitrage C-09).
    expect(SCHEMA).toContain("internalScore");
    expect(SCHEMA).not.toMatch(/\bcompleteness\s+Int/u);
  });

  it("chaque invariant que la base peut tenir a sa contrainte", () => {
    for (const contrainte of [
      "visa_rule_secondaire_jamais_publiee",
      "visa_rule_source_non_vide",
      "application_version_figee",
      "application_pret_date_coherente",
      "revue_decidee_porte_son_message",
      "credit_delta_non_nul",
      "credit_sens_coherent_avec_motif",
      "acces_consultant_borne_dans_le_temps",
      "rendez_vous_annulation_avant_creneau",
      "version_porte_un_contenu",
      "version_purgee_sans_objet",
      "audit_motif_non_vide",
    ]) {
      expect(MIGRATIONS, contrainte).toContain(contrainte);
    }
  });

  it("une empreinte identique ne se réanalyse pas (RG-06.2)", () => {
    expect(SCHEMA).toContain("@@unique([documentId, checksum])");
  });

  it("un partage de dossier porte une échéance obligatoire (RG-12.2)", () => {
    const bloc = /model ConsultantAccess \{([\s\S]*?)\n\}/u.exec(SCHEMA)![1]!;
    expect(bloc).toMatch(/expiresAt\s+DateTime\s*$/mu);
    expect(bloc).toMatch(/revokedAt\s+DateTime\?/u);
  });

  it("un compte anonymisé ne peut pas garder un nom (RG-10.4)", () => {
    for (const contrainte of [
      "user_suppression_demandee_avant_anonymisation",
      "user_anonymise_ne_nomme_personne",
    ]) {
      expect(GARDE_FOUS, contrainte).toContain(contrainte);
    }
  });

  it("une affiliation ne se propose ni hors contexte ni sans vérification (WF-13)", () => {
    for (const contrainte of [
      "referral_contexte_non_vide",
      "partner_taux_de_commission_borne",
      "referral_commission_au_resultat",
      "referral_aboutie_est_datee",
      "referral_redirection_avant_aboutissement",
      "activation_verification_non_vide",
    ]) {
      expect(GARDE_FOUS, contrainte).toContain(contrainte);
    }
  });
});

/**
 * Trois vocabulaires ajoutés par le lot suppression et affiliation. Le même
 * garde-fou de dérive : une valeur ajoutée d'un côté sans l'autre échoue
 * ici, et non le jour où un écran affiche un code technique.
 */
describe("suppression de compte et affiliation nomment les mêmes choses", () => {
  it("genres de partenaire — PartnerKind / GenrePartenaire", () => {
    const domaine: GenrePartenaire[] = [
      "ASSURANCE_SANTE",
      "LOGEMENT",
      "EQUIVALENCE_DIPLOME",
      "TRANSFERT_FONDS",
      "CONSULTANT",
    ];
    expect(valeursDeLEnum("PartnerKind")).toEqual(trie(domaine));
    expect(trie(Object.keys(LIBELLE_GENRE_PARTENAIRE))).toEqual(trie(domaine));
  });

  it("états de proposition — ReferralStatus / EtatProposition", () => {
    const domaine: EtatProposition[] = [
      "PROPOSEE",
      "REDIRIGEE",
      "ABOUTIE",
      "SANS_SUITE",
      "DECLINEE",
    ];
    expect(valeursDeLEnum("ReferralStatus")).toEqual(trie(domaine));
    expect(trie(Object.keys(LIBELLE_ETAT_PROPOSITION))).toEqual(trie(domaine));
  });

  /**
   * Un genre par autorisation. La première version en regroupait plusieurs
   * par catégorie juridique, et l'écran lisait alors la réponse d'une
   * autorisation pour une autre. Ce test interdit le regroupement plutôt
   * que d'en surveiller les effets.
   */
  it("consentements — ConsentKind / CodeConsentement", () => {
    const codes: CodeConsentement[] = CONSENTEMENTS.map((c) => c.code);
    const base = valeursDeLEnum("ConsentKind");
    expect(base).toContain("CGU");
    expect(base.filter((v) => v !== "CGU")).toEqual(
      trie(codes.map((c) => c.toUpperCase())),
    );
  });
});
