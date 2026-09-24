import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  HORIZON_VEILLE_JOURS,
  MENTION_DEPUBLICATION_A_LECHEANCE,
  MENTION_SOURCE_MUETTE_SANS_EFFET,
  PERIODICITE_AVANT_REVISION_JOURS,
  PERIODICITE_RELECTURE_JOURS,
  SANS_INDEX_DES_REGLES,
  prochaineRelecture,
} from "@/domain/backoffice/veille";
import { sansCommentaires } from "@/domain/copy/source";

const lire = (f: string) => readFileSync(f, "utf8");
const jour = (iso: string) => new Date(`${iso}T00:00:00Z`);
const court = (d: Date) => d.toISOString().slice(0, 10);

/**
 * B-01 — la veille dit la vérité sur la dépublication, et sait relire.
 *
 * L'écran annonçait, sous la file : « Rien n'est dépublié
 * automatiquement : la décision de retirer une règle appartient à
 * l'opérateur (RG-14.3). » Trois erreurs en une phrase.
 *
 * L'affirmation est fausse — RG-14.1 dit l'inverse : « une fiche dont
 * `nextReviewAt` est dépassée repasse automatiquement en `DRAFT` et
 * disparaît de l'affichage utilisateur », et un cron l'applique chaque
 * nuit à trois heures. La citation est fausse aussi : RG-14.3 parle de
 * périodicité de relecture, pas de dépublication. Et l'effet était le
 * contraire de celui voulu : la phrase rassurait précisément le veilleur
 * que RG-14.1 veut alarmer.
 */

describe("les deux cas ne se confondent plus", () => {
  it("une source muette ne dépublie rien", () => {
    expect(MENTION_SOURCE_MUETTE_SANS_EFFET).toMatch(/ne dépublie rien/u);
    expect(MENTION_SOURCE_MUETTE_SANS_EFFET).toMatch(/dernière collecte réussie/u);
  });

  it("une relecture en retard dépublie, et la mention le dit", () => {
    expect(MENTION_DEPUBLICATION_A_LECHEANCE).toMatch(/automatiquement en brouillon/u);
    expect(MENTION_DEPUBLICATION_A_LECHEANCE).toMatch(/RG-14\.1/u);
    // L'heure compte : un veilleur doit savoir quand la fiche part.
    expect(MENTION_DEPUBLICATION_A_LECHEANCE).toMatch(/3 h/u);
  });

  /**
   * Le job faisait ce que la règle demande ; c'est l'écran qui disait le
   * contraire. Ce test tient les deux ensemble, pour qu'on ne corrige
   * jamais l'un en croyant l'autre faux.
   */
  it("le cron applique bien RG-14.1, et c'est la mention qui le décrit", () => {
    const job = lire("src/server/jobs/veille.ts");
    expect(job).toMatch(/status: "PUBLISHED", nextReviewAt: \{ lt: jour \}/u);
    expect(job).toMatch(/data: \{ status: "DRAFT" \}/u);
    // La cadence annoncée par la mention est celle que le worker planifie.
    expect(lire("src/server/jobs/worker.ts")).toContain('JOBS.VEILLE_ECHEANCE, "0 3 * * *"');
  });

  /** Et la phrase fausse ne revient nulle part. */
  it("plus aucune surface ne dit que rien n'est dépublié", () => {
    for (const f of [
      "src/domain/backoffice/veille.ts",
      "src/app/(admin)/veille/FileDeVeille.tsx",
    ]) {
      expect(sansCommentaires(lire(f)), f).not.toMatch(/[Rr]ien n'est dépublié/u);
    }
  });
});

describe("la prochaine relecture se compte depuis la relecture", () => {
  it("quatre-vingt-dix jours par défaut (RG-14.3)", () => {
    expect(PERIODICITE_RELECTURE_JOURS).toBe(90);
    expect(court(prochaineRelecture(jour("2026-09-21"), null))).toBe("2026-12-20");
  });

  /**
   * Repartir de l'ancienne échéance enchaînerait les retards : une fiche
   * relue avec trois semaines de retard serait déjà à relire dans
   * soixante-neuf jours, et le retard se reporterait indéfiniment.
   */
  it("un retard ne se reporte pas sur l'échéance suivante", () => {
    // La fiche était due le 1er septembre, relue le 21 : les 90 jours
    // courent du 21, pas du 1er.
    expect(court(prochaineRelecture(jour("2026-09-21"), null))).toBe("2026-12-20");
    expect(court(prochaineRelecture(jour("2026-09-01"), null))).toBe("2026-11-30");
  });

  /**
   * RG-14.3, seconde moitié : « ramenée à 30 jours avant une date connue
   * de révision ». Les montants IND changent au 1er janvier, et une fiche
   * relue en novembre ne doit pas dormir jusqu'en février.
   */
  it("une révision connue avance l'échéance de trente jours", () => {
    expect(PERIODICITE_AVANT_REVISION_JOURS).toBe(30);
    const relue = jour("2026-11-15");
    // Échéance ordinaire : 2027-02-13. Révision au 1er janvier → 2026-12-02.
    expect(court(prochaineRelecture(relue, jour("2027-01-01")))).toBe("2026-12-02");
  });

  it("une révision lointaine ne change rien", () => {
    const relue = jour("2026-09-21");
    expect(court(prochaineRelecture(relue, jour("2028-01-01")))).toBe("2026-12-20");
  });

  /**
   * Une révision imminente ne doit pas produire une échéance déjà passée :
   * la fiche serait en retard à la seconde où on la relit, et le cron de
   * trois heures la dépublierait la nuit suivante.
   */
  it("une révision imminente ne place jamais l'échéance dans le passé", () => {
    const relue = jour("2026-09-21");
    const echeance = prochaineRelecture(relue, jour("2026-09-25"));
    expect(echeance.getTime()).toBeGreaterThan(relue.getTime());
    expect(court(echeance)).toBe("2026-12-20");
  });
});

describe("la route de relecture écrit ce que WF-14 demande", () => {
  const route = lire("src/app/api/admin/veille/route.ts");

  it("elle met à jour la preuve de diligence, sans créer de version", () => {
    const put = route.slice(route.indexOf("export const PUT"));
    // RG-14.4 : sourceUrl, verifiedAt et verifiedBy sont la preuve.
    expect(put).toMatch(/verifiedAt: jour/u);
    expect(put).toMatch(/verifiedBy: acteur!\.email/u);
    expect(put).toMatch(/nextReviewAt: echeance/u);
    // « pas de nouvelle version » : WF-14 étape 2, branche inchangé.
    expect(put).not.toMatch(/visaRule\.create|version: /u);
  });

  /**
   * Pas de ligne d'audit, et c'est voulu : RG-14.4 désigne `verifiedBy`
   * comme la preuve de diligence. En ajouter une doublerait la preuve
   * sans l'améliorer, et les deux finiraient par diverger.
   */
  it("la preuve reste le champ, pas une seconde écriture", () => {
    const put = route.slice(route.indexOf("export const PUT"));
    expect(put).not.toContain("journaliser(");
    expect(route).toMatch(/RG-14\.4/u);
  });

  /**
   * Le retour en brouillon par échéance dit « personne n'a relu », pas
   * « cette règle est douteuse ». Une fois relue, la raison du retrait
   * n'existe plus — mais un brouillon en préparation n'est pas republié
   * pour autant.
   */
  it("seule une fiche dépubliée par l'échéance est republiée", () => {
    const put = route.slice(route.indexOf("export const PUT"));
    expect(put).toMatch(
      /const republier =\s*fiche\.status === "DRAFT" && fiche\.nextReviewAt < jour/u,
    );
    expect(put).toMatch(/\.\.\.\(republier \? \{ status: "PUBLISHED" as const \} : \{\}\)/u);
  });

  it("une version archivée ne se relit pas", () => {
    expect(route).toMatch(/fiche\.status === "ARCHIVED"[\s\S]{0,200}etat_incompatible/u);
  });

  /**
   * Aucune colonne ne porte la date de révision connue d'une source. La
   * route passe donc `null`, et le dit : inventer une colonne au passage
   * ferait décider à une route ce qu'un veilleur doit saisir.
   */
  it("le manque de donnée est nommé, pas comblé au passage", () => {
    expect(route).toContain("prochaineRelecture(jour, null)");
    expect(route).toMatch(/Aucune colonne ne porte la date de révision connue/u);
    expect(lire("prisma/schema.prisma")).not.toMatch(/revisionConnue|knownRevisionAt/u);
  });
});

/* ------------------------------------------------------------------ *
 * L'état vide n'offre plus une porte qui répond 404
 * ------------------------------------------------------------------ */

describe("l'état vide dit par où une fiche revient", () => {
  /**
   * « Voir les règles publiées » menait à `/regles/nl-etudes`. Le back-office
   * n'a pas d'index des règles : `/regles/[id]` attend un `VisaRule.id`, que
   * Prisma génère, et la graine n'en produit aucun qui s'appelle ainsi.
   * `editionDeLaRegle("nl-etudes")` rend `null` et la page appelle
   * `notFound()` — exécuté sur une base jetable portant le référentiel livré.
   */
  it("aucun lien ne part de la file vide, et le texte dit pourquoi", () => {
    const ecran = lire("src/app/(admin)/veille/FileDeVeille.tsx");
    expect(ecran).not.toMatch(/nl-etudes/u);
    // Le seul lien littéral de l'écran était celui-là : il n'en reste aucun.
    expect(sansCommentaires(ecran)).not.toMatch(/href="\/regles/u);
    // Et la phrase vient du domaine : l'écran la rend, il ne la retape pas.
    expect(sansCommentaires(ecran)).not.toContain("index des règles");
  });

  /**
   * La phrase annonce l'horizon de la file, et il n'y a qu'un horizon : la
   * requête de la lecture serveur lit la même constante. Deux nombres
   * auraient fini par se contredire, et c'est l'écran qui aurait menti.
   */
  it("la phrase et la requête lisent le même horizon", () => {
    expect(SANS_INDEX_DES_REGLES).toContain(`${HORIZON_VEILLE_JOURS} jours`);
    const lecture = lire("src/server/lecture/backoffice.ts");
    expect(lecture).toContain("HORIZON_VEILLE_JOURS");
    expect(lecture).not.toMatch(/export const HORIZON_VEILLE_JOURS/u);
  });

  /** Et elle nomme l'absence plutôt que de la contourner. */
  it("elle dit qu'il n'y a pas d'index, au lieu d'en promettre un", () => {
    expect(SANS_INDEX_DES_REGLES).toMatch(/pas d'autre index des règles/u);
    expect(SANS_INDEX_DES_REGLES).toMatch(/depuis cette file/u);
  });
});
