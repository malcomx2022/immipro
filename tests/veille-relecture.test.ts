import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AUCUN_RELEVE,
  HORIZON_VEILLE_JOURS,
  MENTION_DEPUBLICATION_A_LECHEANCE,
  MENTION_SOURCE_MUETTE_SANS_EFFET,
  PERIODICITE_AVANT_REVISION_JOURS,
  PERIODICITE_RELECTURE_JOURS,
  RELEVE_VAUT_VERIFICATION,
  SANS_INDEX_DES_REGLES,
  SUITE_DE_LA_CONCLUSION,
  MENTION_FILE_VIDE,
  prochaineRelecture,
  resumeCollecte,
  resumeFileVide,
  type EtatSource,
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
    expect(MENTION_SOURCE_MUETTE_SANS_EFFET).toMatch(/dernier relevé réussi/u);
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
  /*
    Le corps est passé dans `server/veille/releve.ts` — la même raison que
    `server/regles/publication`, `server/regles/edition` et
    `server/revue/decision` : dans sa route, la décision était derrière
    `next/headers`, donc hors de portée de toute fumée. Elle écrit deux
    tables et compte des tentatives, ce qu'on ne vérifie qu'en l'exécutant.
    Ces essais lisent donc le module, et la fumée de publication l'exécute.
  */
  const route = lire("src/server/veille/releve.ts");

  it("elle met à jour la preuve de diligence, sans créer de version", () => {
    const put = route.slice(route.indexOf("export async function consignerLeReleve"));
    // RG-14.4 : sourceUrl, verifiedAt et verifiedBy sont la preuve.
    expect(put).toMatch(/verifiedAt: jour/u);
    expect(put).toMatch(/verifiedBy: veilleur\.email/u);
    expect(put).toMatch(/nextReviewAt: echeance/u);
    // « pas de nouvelle version » : WF-14 étape 2, branche inchangé.
    expect(put).not.toMatch(/visaRule\.create/u);
  });

  /**
   * ── Deux faits, deux traces, et une seule était posée ───────────────
   *
   * La relecture ne se journalise pas, et c'est voulu : RG-14.4 désigne
   * `verifiedAt` et `verifiedBy` comme la preuve de diligence, et en
   * ajouter une seconde la doublerait sans l'améliorer.
   *
   * Mais le raisonnement couvrait aussi la **republication**, qu'il ne
   * regarde pas. Ces deux champs disent qui a relu ; ils ne disent pas
   * qu'une règle est redevenue visible pour les candidats. C'est le même
   * effet que `publierLaRegle`, qui le journalise — et une règle qui
   * rentre à l'affichage sans trace est ce qu'un contrôle vient chercher.
   */
  it("la relecture reste le champ, la remise en ligne laisse une ligne", () => {
    const put = route.slice(route.indexOf("export async function consignerLeReleve"));
    expect(route).toMatch(/RG-14\.4/u);
    // Une seule ligne, et seulement quand la visibilité change.
    expect([...put.matchAll(/journaliser\(/gu)]).toHaveLength(1);
    expect(put).toMatch(/if \(republier\) \{[\s\S]{0,120}journaliser\(/u);
    expect(put).toContain('action: "regle.republication"');
  });

  /**
   * Le retour en brouillon par échéance dit « personne n'a relu », pas
   * « cette règle est douteuse ». Une fois relue, la raison du retrait
   * n'existe plus — mais un brouillon en préparation n'est pas republié
   * pour autant.
   */
  it("seule une fiche dépubliée par l'échéance est republiée", () => {
    const put = route.slice(route.indexOf("export async function consignerLeReleve"));
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

/**
 * Le relevé du veilleur — WF-14 étape 2, 24/09/2026.
 *
 * `SourceCheck` porte `checkedAt`, `reachable`, `attempts` et
 * `difference` ; `collecte()` les lit ; l'écran les affiche ; **seule la
 * graine de démonstration en écrivait**. En production la table restait
 * vide pour toujours, et trois phrases promettaient un collecteur :
 *
 *     « le relevé automatique des sources n'a pas encore tourné »
 *     « Les 14 sources ont répondu ce matin et aucune ne diverge »
 *     « La prochaine collecte est programmée demain »
 *
 * Le registre des tables sans écrivain nommait bien `SourceCheck`, avec
 * cette justification : « la collecte automatique des sources n'existe
 * pas, et B-01 le dit ». Il couvrait une phrase et pas les deux autres.
 */
describe("le relevé dit ce qu'il a trouvé, et rien de plus", () => {
  it("seule la conclusion « à jour » vaut vérification", () => {
    /*
      RG-14.4 fait de `verifiedAt` la preuve de diligence. L'avancer sur
      « je n'ai pas pu joindre la source » dirait que la règle a été
      vérifiée alors qu'elle ne l'a pas été — et la fiche sortirait de la
      file de veille, qui est précisément l'endroit où elle doit rester.
    */
    expect(RELEVE_VAUT_VERIFICATION.A_JOUR).toBe(true);
    const sansVerification = (Object.keys(RELEVE_VAUT_VERIFICATION) as EtatSource[]).filter(
      (c) => !RELEVE_VAUT_VERIFICATION[c],
    );
    expect(sansVerification.sort()).toEqual(["A_ARBITRER", "PERIME"]);
  });

  it("et chaque conclusion dit ce qu'elle ne touche pas", () => {
    // La réciproque : une conclusion qui ne vérifie pas doit l'annoncer.
    // Sans cela, le veilleur croirait la fiche relue.
    for (const conclusion of Object.keys(RELEVE_VAUT_VERIFICATION) as EtatSource[]) {
      const suite = SUITE_DE_LA_CONCLUSION[conclusion];
      expect(suite, conclusion).toBeTruthy();
      if (!RELEVE_VAUT_VERIFICATION[conclusion]) {
        expect(suite, conclusion).toMatch(/dates (de relecture )?ne bougent pas/u);
      }
    }
    // Et celle qui vérifie dit la durée que la fiche repart chercher.
    expect(SUITE_DE_LA_CONCLUSION.A_JOUR).toMatch(
      new RegExp(`${PERIODICITE_RELECTURE_JOURS} jours`, "u"),
    );
  });

  it("aucune phrase de l'écran n'annonce un relevé que personne ne fait", () => {
    /*
      Les trois phrases se lisent ici directement : celle de l'absence de
      relevé et celle de l'état vide ne s'affichent que dans des branches
      que le rendu d'essai ne traverse pas toutes, et c'est ainsi que
      deux d'entre elles ont survécu au registre.
    */
    const phrases = [
      AUCUN_RELEVE,
      resumeFileVide({ sources: 14, relevees: 14, faiteLe: "2026-09-20T08:00:00Z" }, (i) => i),
      resumeCollecte({ sources: 14, relevees: 14, faiteLe: "2026-09-20T08:00:00Z" }, (i) => i),
      MENTION_FILE_VIDE,
      MENTION_SOURCE_MUETTE_SANS_EFFET,
    ];
    for (const phrase of phrases) {
      expect(phrase, phrase).not.toMatch(/automatique/u);
      expect(phrase, phrase).not.toMatch(/prochaine collecte|pas encore/iu);
      expect(phrase, phrase).not.toMatch(/ont répondu/u);
    }
    // Et celle de l'absence dit par où un relevé s'écrit.
    expect(AUCUN_RELEVE).toMatch(/consultes la source/u);
  });

  it("rien ne promet une prochaine collecte, faute de collecteur", () => {
    // Le champ valait « dernier relevé + un jour » et l'écran l'annonçait.
    // Un champ calculé pour tenir une promesse que personne ne tient vaut
    // mieux supprimé qu'expliqué.
    expect(lire("src/domain/backoffice/veille.ts")).not.toMatch(/prochaineLe: string/u);
    expect(sansCommentaires(lire("src/server/lecture/backoffice.ts"))).not.toMatch(
      /prochaineLe:/u,
    );
  });

  it("le dernier relevé de chaque source décide, pas le nombre de lignes", () => {
    /*
      `sources: duJour.length` comptait les **relevés** du jour : trois
      relevés sur une même adresse se lisaient « 3 sources relevées ». Et
      la source muette était n'importe quelle ligne en échec de la
      journée, même si un relevé plus récent avait joint la source — le
      bandeau d'incident survivait à la réparation.
    */
    const lecture = sansCommentaires(lire("src/server/lecture/backoffice.ts"));
    const bloc = lecture.slice(lecture.indexOf("export async function collecte"));
    expect(bloc).toMatch(/distinct: \["sourceUrl"\]/u);
    expect(bloc).not.toMatch(/duJour/u);
    expect(bloc).toMatch(/sources: etats\.length/u);
  });
});
