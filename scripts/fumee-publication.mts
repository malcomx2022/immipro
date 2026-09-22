/**
 * La publication d'une règle, de bout en bout — WF-14 étapes 4 et 5, WF-11.
 *
 * ── Ce qu'elle tient, et pourquoi il fallait une base ───────────────
 *
 * Deux défauts se touchaient sur le même objet : la **valeur** d'une
 * condition bloquante.
 *
 * La comparaison de versions ne regardait que les codes. Un seuil qui
 * passe de 4 357 € à 1 000 € garde le sien, et la propagation sortait donc
 * sans prévenir personne — sur le changement que RG-14.3 annonce comme le
 * plus régulier du produit, « les montants IND changent au 1er janvier ».
 *
 * Et WF-14 §4 — « relecture par un second opérateur pour toute
 * modification de condition bloquante » — n'avait aucun mécanisme : les
 * quatre garde-fous de la publication laissaient passer une version qui
 * divise un seuil par quatre, écrite et publiée par la même personne.
 *
 * Le second ne s'éprouve qu'en publiant pour de bon : la décision lit la
 * version en base, la compare à celle en vigueur, et regarde qui a écrit.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:publication
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_publication_${process.pid}`;
const administration = new URL(source);
administration.pathname = "/postgres";
administration.searchParams.delete("schema");
const cible = new URL(source);
cible.pathname = `/${nomBase}`;
cible.searchParams.set("schema", "public");

const echecs: string[] = [];
const verifier = (condition: boolean, message: string): void => {
  console.log(condition ? `  ✓ ${message}` : `  ✗ ${message}`);
  if (!condition) echecs.push(message);
};

async function surLAdministration(texte: string): Promise<void> {
  const client = new Client({ connectionString: administration.toString() });
  await client.connect();
  try {
    await client.query(texte);
  } finally {
    await client.end();
  }
}

console.log(`Publication d'une règle sur une base jetable (${nomBase})`);
await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
await surLAdministration(`CREATE DATABASE ${nomBase}`);
process.env.DATABASE_URL = cible.toString();

const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  encoding: "utf8",
  env: { ...process.env, DATABASE_URL: cible.toString() },
});
if (migration.status !== 0) {
  console.error(`${migration.stdout ?? ""}${migration.stderr ?? ""}`);
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
  process.exit(1);
}

const { db } = await import("../src/lib/db");
const { getQueue } = await import("../src/lib/queue");
const { publierLaRegle } = await import("../src/server/regles/publication");
const { propagerLaPublication } = await import("../src/server/jobs/divergence");
const { depublierLesFichesEchues } = await import("../src/server/jobs/veille");
const { recalculerCompletude } = await import("../src/server/acces/dossiers");
const { versDossier } = await import("../src/server/vue/dossier");
const { declarerLeDepot } = await import("../src/server/dossiers/parcours");
const { arbitrerLaDivergence } = await import("../src/server/dossiers/migration");
const { ouvrirDossier } = await import("../src/server/acces/dossiers");
const { remplacementDeLEcheancier } = await import("../src/server/dossiers/echeancier");
const { divergenceAArbitrer } = await import("../src/server/lecture/alertes");
const { payload } = await import("../src/server/acces/regles");
const { MENTION_EN_PAUSE } = await import("../src/domain/dossiers/dossier");
const { editorialDe } = await import("../src/lib/contenu/destinations");
const { REGLES_DE_REFERENCE } = await import("../prisma/seed/visa-rules.data");

const brute = REGLES_DE_REFERENCE.find(
  (r) => r.countryCode === "NL" && r.visaType === "emploi_kennismigrant",
)!;
const RULES = brute.rules as never as {
  conditions: { code: string; bloquant: boolean; valeur: number | string }[];
  pieces_requises: { code: string; libelle: string; obligatoire: boolean }[];
};
const SEUIL = "salaire_min_moins_30_ans";
const ACTUEL = RULES.conditions.find((c) => c.code === SEUIL)!.valeur as number;

const avecSeuil = (valeur: number) => ({
  ...(brute.rules as object),
  conditions: RULES.conditions.map((c) => (c.code === SEUIL ? { ...c, valeur } : c)),
});

const REDACTEUR = { id: "", email: "veilleur@immipro.test" };
const AUTRE = { id: "", email: "admin@immipro.test" };

let rang = 0;

async function version(payload: unknown, statut: "PUBLISHED" | "DRAFT", ecritePar: string) {
  rang += 1;
  return db.visaRule.create({
    data: {
      countryCode: "NL",
      visaType: "emploi_kennismigrant",
      category: "EMPLOI",
      version: rang,
      effectiveFrom: new Date("2026-01-01"),
      rules: payload as never,
      sourceUrl: brute.sourceUrl,
      sourceTier: "OFFICIEL",
      verifiedAt: new Date(),
      verifiedBy: ecritePar,
      nextReviewAt: new Date("2027-01-01"),
      status: statut,
      // Ce qu'écrit une vraie mise en vigueur. Sans elle, la fixture décrit
      // une version publiée que personne n'a jamais mise en vigueur, et la
      // succession ne la trouve pas — à juste titre.
      publishedAt: statut === "PUBLISHED" ? new Date("2026-01-01") : null,
    },
  });
}

/** Un candidat, son dossier prêt, rattaché à la version en vigueur. */
async function dossierPret(regleId: string) {
  rang += 1;
  const user = await db.user.create({
    data: { email: `fumee-pub-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
  });
  const application = await db.application.create({
    data: { userId: user.id, visaRuleId: regleId, status: "ACTIF" },
  });
  await db.document.createMany({
    data: RULES.pieces_requises.map((p) => ({
      applicationId: application.id,
      code: p.code,
      label: p.libelle,
      family: p.obligatoire ? ("OBLIGATOIRE" as const) : ("COMPLEMENTAIRE" as const),
      required: p.obligatoire,
      status: "CONFORME" as const,
    })),
  });
  await recalculerCompletude(application.id);
  return { user, application };
}

const codeDe = (erreur: unknown): string => {
  const porte = erreur as { echec?: { code?: unknown; corps?: unknown } } | null;
  return porte?.echec?.code ? String(porte.echec.code) : String(erreur);
};
const corpsDe = (erreur: unknown): string => {
  const porte = erreur as { echec?: { corps?: unknown } } | null;
  return String(porte?.echec?.corps ?? "");
};

try {
  /* Les deux comptes du back-office. */
  const redacteur = await db.user.create({
    data: { email: REDACTEUR.email, role: "VEILLEUR" },
  });
  const autre = await db.user.create({ data: { email: AUTRE.email, role: "ADMIN" } });
  REDACTEUR.id = redacteur.id;
  AUTRE.id = autre.id;

  console.log("\nWF-14 §4 — celui qui a écrit la version ne la publie pas seul");
  {
    const v1 = await version(brute.rules, "PUBLISHED", REDACTEUR.email);
    const v2 = await version(avecSeuil(1000), "DRAFT", REDACTEUR.email);

    let refuse = false;
    let corps = "";
    try {
      await publierLaRegle(v2.id, REDACTEUR, "Alignement sur la circulaire");
    } catch (erreur) {
      refuse = codeDe(erreur) === "etat_incompatible";
      corps = corpsDe(erreur);
    }
    verifier(refuse, `le rédacteur ne peut pas publier sa propre version (${corps.slice(0, 60)}…)`);
    verifier(corps.includes(SEUIL), "et le refus nomme la condition en cause");

    const apres = await db.visaRule.findUniqueOrThrow({ where: { id: v2.id } });
    verifier(apres.status === "DRAFT", `la version reste en brouillon (${apres.status})`);
    const enVigueur = await db.visaRule.findUniqueOrThrow({ where: { id: v1.id } });
    verifier(enVigueur.status === "PUBLISHED", "et la version en vigueur n'est pas archivée");

    /* Un second opérateur, et elle passe. */
    const publiee = await publierLaRegle(v2.id, AUTRE, "Relue et publiée");
    verifier(publiee.publiee === v2.id, "un second opérateur la publie");
    verifier(publiee.archivee === v1.id, "la version en vigueur est archivée");
    verifier(publiee.divergenceMiseEnFile, "et la divergence part en file");

    const journal = await db.auditLog.findFirst({
      where: { action: "regle.publication", target: `visaRule:${v2.id}` },
    });
    const details = journal?.metadata as { redigeePar?: string; bloquantesTouchees?: string[] } | null;
    verifier(
      details?.redigeePar === REDACTEUR.email,
      `le journal garde qui a rédigé (${details?.redigeePar})`,
    );
    verifier(
      (details?.bloquantesTouchees ?? []).includes(SEUIL),
      "et ce qui a bougé parmi les bloquantes — la preuve de diligence de RG-14.4",
    );
  }

  console.log("\nWF-14 §4 — une version qui ne touche aucune bloquante se publie seule");
  {
    rang += 10; // une autre procédure, pour ne pas croiser la précédente
    const socle = await db.visaRule.create({
      data: {
        countryCode: "CH", visaType: "etudes_permis_b", category: "ETUDES", version: 1,
        effectiveFrom: new Date("2026-01-01"),
        rules: REGLES_DE_REFERENCE.find((r) => r.countryCode === "CH")!.rules as never,
        sourceUrl: "https://exemple.test/ch", sourceTier: "INSTITUTIONNEL",
        verifiedAt: new Date(), verifiedBy: REDACTEUR.email,
        nextReviewAt: new Date("2027-01-01"), status: "PUBLISHED",
        publishedAt: new Date("2026-01-01"),
      },
    });
    const ch = REGLES_DE_REFERENCE.find((r) => r.countryCode === "CH")!.rules as never as {
      conditions: { code: string; bloquant: boolean; message_echec: string }[];
    };
    const facultative = ch.conditions.find((c) => !c.bloquant)!;
    const v2 = await db.visaRule.create({
      data: {
        countryCode: "CH", visaType: "etudes_permis_b", category: "ETUDES", version: 2,
        effectiveFrom: new Date("2026-01-01"),
        rules: {
          ...(REGLES_DE_REFERENCE.find((r) => r.countryCode === "CH")!.rules as object),
          conditions: ch.conditions.map((c) =>
            c.code === facultative.code
              ? { ...c, message_echec: `${c.message_echec} Précision ajoutée.` }
              : c,
          ),
        } as never,
        sourceUrl: "https://exemple.test/ch", sourceTier: "INSTITUTIONNEL",
        verifiedAt: new Date(), verifiedBy: REDACTEUR.email,
        nextReviewAt: new Date("2027-01-01"), status: "DRAFT",
      },
    });
    /*
      Le refus est nommé plutôt que laissé filer : une clarification de
      formulation qui exigerait un second opérateur ferait de la relecture
      une formalité qu'on apprend à contourner.
    */
    let publiee: Awaited<ReturnType<typeof publierLaRegle>> | null = null;
    let refus = "";
    try {
      publiee = await publierLaRegle(v2.id, REDACTEUR, "Précision de formulation");
    } catch (erreur) {
      refus = corpsDe(erreur) || String(erreur);
    }
    verifier(
      publiee !== null,
      `le rédacteur publie lui-même une clarification${refus ? ` (refusée : ${refus.slice(0, 70)}…)` : ""}`,
    );
    verifier(publiee?.archivee === socle.id, "et la version précédente est archivée");
  }

  console.log("\nINV-1 — une formulation refusée n'entre pas en base, par aucun chemin");
  {
    /*
      Une règle entre en base par deux chemins : cette publication, et la
      graine qui charge le référentiel livré. Ils appliquaient des
      contrôles différents — la graine ignorait le vocabulaire —, et le
      référentiel portait donc « moins de 50 % de ses crédits annuels »
      dans un `message_echec`, c'est-à-dire une phrase que le candidat lit
      sur sa pièce et que cette route refuse.

      Les deux appellent `refusDuReferentiel` désormais. Ce bloc éprouve
      le chemin de la publication, sur le texte exact qui était en base.
    */
    rang += 10;
    const v1 = await version(brute.rules, "PUBLISHED", REDACTEUR.email);
    const fautif = {
      ...(brute.rules as object),
      conditions: RULES.conditions.map((c) =>
        c.code === SEUIL
          ? { ...c, message_echec: "Moins de 50 % du salaire de référence." }
          : c,
      ),
    };
    const v2 = await version(fautif, "DRAFT", REDACTEUR.email);

    let refus = "";
    try {
      await publierLaRegle(v2.id, AUTRE, "Tentative avec un pourcentage");
    } catch (erreur) {
      refus = corpsDe(erreur);
    }
    verifier(refus !== "", `la publication est refusée (${refus.slice(0, 50)}…)`);
    verifier(refus.includes("50 %"), "et le refus cite l'extrait fautif");
    verifier(
      /message_echec/u.test(refus),
      "et le chemin où il se trouve, pour que l'auteur sache quoi reprendre",
    );

    const relu = await db.visaRule.findUniqueOrThrow({ where: { id: v2.id } });
    verifier(relu.status === "DRAFT", `la version reste en brouillon (${relu.status})`);
    const enVigueur = await db.visaRule.findUniqueOrThrow({ where: { id: v1.id } });
    verifier(enVigueur.status === "PUBLISHED", "et la version en vigueur n'est pas archivée");
  }

  console.log("\nWF-11 — un seuil relevé met les dossiers en pause et écrit à chacun");
  {
    rang += 10;
    const v1 = await db.visaRule.create({
      data: {
        countryCode: "AE", visaType: "etudes_residence_etudiante", category: "ETUDES", version: 1,
        effectiveFrom: new Date("2026-01-01"), rules: brute.rules as never,
        sourceUrl: brute.sourceUrl, sourceTier: "OFFICIEL",
        verifiedAt: new Date(), verifiedBy: REDACTEUR.email,
        nextReviewAt: new Date("2027-01-01"), status: "PUBLISHED",
        publishedAt: new Date("2026-01-01"),
      },
    });
    const p = await dossierPret(v1.id);
    const v2 = await db.visaRule.create({
      data: {
        countryCode: "AE", visaType: "etudes_residence_etudiante", category: "ETUDES", version: 2,
        effectiveFrom: new Date("2026-01-01"), rules: avecSeuil(ACTUEL + 1500) as never,
        sourceUrl: brute.sourceUrl, sourceTier: "OFFICIEL",
        verifiedAt: new Date(), verifiedBy: REDACTEUR.email,
        nextReviewAt: new Date("2027-01-01"), status: "DRAFT",
      },
    });

    await publierLaRegle(v2.id, AUTRE, "Montants IND au 1er janvier");
    const bilan = await propagerLaPublication(v2.id);
    verifier(
      bilan.critiques === 1,
      `le seuil relevé met le dossier en pause (${JSON.stringify(bilan)})`,
    );
    const dossier = await db.application.findUniqueOrThrow({
      where: { id: p.application.id },
    });
    verifier(dossier.status === "SUSPENDU", `le dossier est suspendu (${dossier.status})`);

    /*
      Et ce que le candidat lit sur son dossier. L'état existait en base et
      n'avait pas de mot à l'écran : le bandeau disait « Actif », la
      prochaine action « Rien ne bloque un dépôt » — sur le seul dossier
      dont le dépôt était bloqué —, et le refus du dépôt l'envoyait
      chercher des pièces manquantes qu'il n'avait pas.
    */
    const avecPieces = await db.application.findUniqueOrThrow({
      where: { id: p.application.id },
      include: { documents: true, visaRule: true },
    });
    const vue = versDossier(
      avecPieces,
      avecPieces.documents,
      /*
        La fiche éditoriale vient de la règle **du dossier** : recopier un
        couple pays/type en dur, c'est ce qui avait laissé passer un
        `editorialDe("AE")` à un seul argument, masqué par le `as never` —
        la fiche rendue était `undefined`, et le nom de destination avec.
      */
      editorialDe(
        avecPieces.visaRule!.countryCode,
        avecPieces.visaRule!.visaType,
      ) as never,
      avecPieces.visaRule,
      "2026-09-22",
    );
    verifier(vue.statut === "EN_PAUSE", `le bandeau dit la pause (${vue.statut})`);
    verifier(
      vue.completude.palier === "COMPLET",
      `alors que rien ne manque à la checklist (${vue.completude.palier})`,
    );
    verifier(
      vue.prochaineAction === MENTION_EN_PAUSE,
      `et la prochaine action dit quoi faire (${vue.prochaineAction.slice(0, 40)}…)`,
    );

    let refus = "";
    try {
      await declarerLeDepot(avecPieces);
    } catch (erreur) {
      refus = corpsDe(erreur);
    }
    verifier(refus === MENTION_EN_PAUSE, `« Je dépose » dit la pause (${refus.slice(0, 40)}…)`);
    verifier(
      !refus.includes("pièces obligatoires"),
      "et n'envoie pas chercher des pièces qui ne manquent pas",
    );

    const migration = await db.ruleMigration.findFirstOrThrow({
      where: { applicationId: p.application.id },
    });
    const diff = migration.diff as { champ: string; avant: unknown; apres: unknown }[];
    verifier(
      diff.some((c) => c.champ === `condition.${SEUIL}.valeur`),
      `l'arbitrage montre le seuil, des deux côtés (${JSON.stringify(diff[0] ?? {})})`,
    );
  }

  console.log("\nRG-14.1 — une fiche dépubliée pour retard reste la version en vigueur");
  {
    /*
      Deux passes justes, prises séparément, et un défaut à leur rencontre.

      La veille de 3 h repasse en `DRAFT` une fiche dont la relecture est
      dépassée : elle cesse de s'afficher, mais elle reste la version que
      des dossiers ont figée. La publication de la suivante cherchait son
      prédécesseur par `status = 'PUBLISHED'` et n'en trouvait plus : elle
      se croyait première, n'archivait rien, ne mettait aucune divergence
      en file. Le candidat dont le seuil montait n'apprenait rien.

      La relecture par défaut étant de quatre-vingt-dix jours, tout retard
      du veilleur ouvre la fenêtre — et une version se publie précisément
      quand il vient de relire.
    */
    rang += 10;
    const v1 = await db.visaRule.create({
      data: {
        countryCode: "CA", visaType: "emploi_kennismigrant", category: "EMPLOI", version: 1,
        effectiveFrom: new Date("2026-01-01"), rules: brute.rules as never,
        sourceUrl: brute.sourceUrl, sourceTier: "OFFICIEL",
        verifiedAt: new Date("2026-01-01"), verifiedBy: REDACTEUR.email,
        // Relecture dépassée : c'est ce que la veille cherche.
        nextReviewAt: new Date("2026-09-01"), status: "PUBLISHED",
        publishedAt: new Date("2026-01-01"),
      },
    });
    const p = await dossierPret(v1.id);
    const v2 = await db.visaRule.create({
      data: {
        countryCode: "CA", visaType: "emploi_kennismigrant", category: "EMPLOI", version: 2,
        effectiveFrom: new Date("2026-01-01"), rules: avecSeuil(ACTUEL + 1500) as never,
        sourceUrl: brute.sourceUrl, sourceTier: "OFFICIEL",
        verifiedAt: new Date(), verifiedBy: REDACTEUR.email,
        nextReviewAt: new Date("2027-01-01"), status: "DRAFT",
      },
    });

    const depubliees = await depublierLesFichesEchues(new Date("2026-09-22"));
    verifier(depubliees >= 1, `la veille dépublie la fiche en retard (${depubliees})`);
    const demotee = await db.visaRule.findUniqueOrThrow({ where: { id: v1.id } });
    verifier(demotee.status === "DRAFT", `elle repasse en brouillon (${demotee.status})`);
    verifier(
      demotee.publishedAt !== null && demotee.effectiveTo === null,
      "mais elle reste en vigueur : sa mise en vigueur tient, sa fin n'est pas posée",
    );

    const publiee = await publierLaRegle(v2.id, AUTRE, "Montants IND au 1er janvier");
    verifier(publiee.archivee === v1.id, `la version dépubliée est bien archivée (${publiee.archivee})`);
    verifier(publiee.divergenceMiseEnFile, "et la divergence part en file");

    const bilan = await propagerLaPublication(v2.id);
    verifier(bilan.critiques === 1, `le dossier est prévenu (${JSON.stringify(bilan)})`);
    const dossier = await db.application.findUniqueOrThrow({
      where: { id: p.application.id },
    });
    verifier(dossier.status === "SUSPENDU", `et mis en pause (${dossier.status})`);

    const close = await db.visaRule.findUniqueOrThrow({ where: { id: v1.id } });
    verifier(
      close.effectiveTo !== null,
      "la version remplacée porte enfin sa date de fin — la diligence de RG-14.4",
    );

    /*
      Et la chaîne continue : une v3 doit trouver la v2 comme
      prédécesseur. C'est la publication qui a posé la mise en vigueur de
      la v2 — si elle ne l'écrivait pas, la succession s'arrêterait à la
      première version publiée par le produit lui-même.
    */
    const v2EnVigueur = await db.visaRule.findUniqueOrThrow({ where: { id: v2.id } });
    verifier(
      v2EnVigueur.publishedAt !== null,
      "la publication pose la mise en vigueur de la version qu'elle publie",
    );

    const v3 = await db.visaRule.create({
      data: {
        countryCode: "CA", visaType: "emploi_kennismigrant", category: "EMPLOI", version: 3,
        effectiveFrom: new Date("2026-01-01"), rules: avecSeuil(ACTUEL + 2000) as never,
        sourceUrl: brute.sourceUrl, sourceTier: "OFFICIEL",
        verifiedAt: new Date(), verifiedBy: REDACTEUR.email,
        nextReviewAt: new Date("2027-01-01"), status: "DRAFT",
      },
    });
    const troisieme = await publierLaRegle(v3.id, AUTRE, "Second relèvement");
    verifier(
      troisieme.archivee === v2.id,
      `la v3 trouve la v2 comme prédécesseur (${troisieme.archivee === v2.id ? "oui" : troisieme.archivee})`,
    );

    /*
      Enfin, une republication de la même version ne réécrit pas sa date
      d'entrée en vigueur : c'est elle qui ordonne la succession, et la
      déplacer à chaque remise en ligne ferait passer une vieille version
      devant une plus récente.
    */
    const dateDOrigine = (
      await db.visaRule.findUniqueOrThrow({ where: { id: v3.id } })
    ).publishedAt!;
    await db.visaRule.update({ where: { id: v3.id }, data: { status: "DRAFT" } });
    await publierLaRegle(v3.id, AUTRE, "Remise en ligne après relecture");
    const rechargee = await db.visaRule.findUniqueOrThrow({ where: { id: v3.id } });
    verifier(
      rechargee.publishedAt?.getTime() === dateDOrigine.getTime(),
      `la republication garde la date d'origine (${rechargee.publishedAt?.toISOString()})`,
    );
  }

  console.log("\nWF-11 — un seuil abaissé prévient sans mettre en pause");
  {
    rang += 10;
    const v1 = await db.visaRule.create({
      data: {
        countryCode: "DE", visaType: "emploi_kennismigrant", category: "EMPLOI", version: 1,
        effectiveFrom: new Date("2026-01-01"), rules: brute.rules as never,
        sourceUrl: brute.sourceUrl, sourceTier: "OFFICIEL",
        verifiedAt: new Date(), verifiedBy: REDACTEUR.email,
        nextReviewAt: new Date("2027-01-01"), status: "PUBLISHED",
        publishedAt: new Date("2026-01-01"),
      },
    });
    const p = await dossierPret(v1.id);
    const v2 = await db.visaRule.create({
      data: {
        countryCode: "DE", visaType: "emploi_kennismigrant", category: "EMPLOI", version: 2,
        effectiveFrom: new Date("2026-01-01"), rules: avecSeuil(ACTUEL - 1500) as never,
        sourceUrl: brute.sourceUrl, sourceTier: "OFFICIEL",
        verifiedAt: new Date(), verifiedBy: REDACTEUR.email,
        nextReviewAt: new Date("2027-01-01"), status: "DRAFT",
      },
    });

    await publierLaRegle(v2.id, AUTRE, "Seuil abaissé par l'IND");
    const bilan = await propagerLaPublication(v2.id);
    verifier(
      bilan.alertes === 1 && bilan.critiques === 0,
      `le dossier est prévenu sans être mis en pause (${JSON.stringify(bilan)})`,
    );
    const dossier = await db.application.findUniqueOrThrow({
      where: { id: p.application.id },
    });
    verifier(dossier.status === "PRET", `et il reste prêt à déposer (${dossier.status})`);
  }
  console.log("\nRG-09.3 — un délai modifié prévient, et le recalcul suit l'arbitrage");
  {
    /*
      Le second défaut de ce lot, et celui qu'aucun test pur n'atteint :
      migrer changeait la version figée et la checklist, jamais
      l'échéancier. Le dossier repartait sur une règle annonçant 150 jours
      d'instruction avec des dates calculées sur 90.
    */
    rang += 10;
    const DELAI = (max: number) => ({ ...(brute.rules as object), delai_traitement_jours: { min: 60, max } });
    /*
      Et une pièce obligatoire de plus, pour éprouver la seconde moitié de
      ce que l'écran d'arbitrage montre. Le libellé compte autant que le
      code : c'est lui que le candidat lit, et le diff stocké ne le porte
      pas.
    */
    const PIECE_EN_PLUS = {
      code: "assurance_maladie",
      libelle: "Assurance maladie",
      obligatoire: true,
      traduction_assermentee: false,
      legalisation: false,
    };
    const AVEC_PIECE = (max: number) => ({
      ...DELAI(max),
      pieces_requises: [...RULES.pieces_requises, PIECE_EN_PLUS],
    });
    const v1 = await db.visaRule.create({
      data: {
        countryCode: "BE", visaType: "emploi_kennismigrant", category: "EMPLOI", version: 1,
        effectiveFrom: new Date("2026-01-01"), rules: DELAI(90) as never,
        sourceUrl: brute.sourceUrl, sourceTier: "OFFICIEL",
        verifiedAt: new Date(), verifiedBy: REDACTEUR.email,
        nextReviewAt: new Date("2027-01-01"), status: "PUBLISHED",
        publishedAt: new Date("2026-01-01"),
      },
    });

    const user = await db.user.create({
      data: { email: `fumee-delai-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const CIBLE = new Date("2027-09-01T00:00:00Z");
    const ouvert = await ouvrirDossier(user.id, v1.id, CIBLE);
    await db.application.update({ where: { id: ouvert.id }, data: { status: "ACTIF" } });

    const jour = (d: Date) => d.toISOString().slice(0, 10);
    const depotDe = async () =>
      jour(
        (await db.deadline.findFirstOrThrow({
          where: { applicationId: ouvert.id, code: "depot" },
        })).dueAt,
      );

    const avant = await depotDe();
    verifier(avant === "2027-06-03", `le dépôt est calculé sur 90 jours (${avant})`);

    /*
      Une échéance déjà faite : elle doit traverser le recalcul. Une
      donnée détruite par un recalcul ne se retrouve pas.
    */
    await db.deadline.updateMany({
      where: { applicationId: ouvert.id, code: "depot" },
      data: { doneAt: new Date("2026-10-01") },
    });

    /*
      Le second candidat s'ouvre **avant** la publication : elle archive
      v1, et `ouvrirDossier` ne sert que les versions en vigueur. Une
      fixture qui l'ouvrirait après décrirait un dossier que personne ne
      peut ouvrir.
    */
    rang += 1;
    const autre = await db.user.create({
      data: { email: `fumee-delai-b-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const conserve = await ouvrirDossier(autre.id, v1.id, CIBLE);
    await db.application.update({ where: { id: conserve.id }, data: { status: "ACTIF" } });

    const v2 = await db.visaRule.create({
      data: {
        countryCode: "BE", visaType: "emploi_kennismigrant", category: "EMPLOI", version: 2,
        effectiveFrom: new Date("2026-01-01"), rules: AVEC_PIECE(150) as never,
        sourceUrl: brute.sourceUrl, sourceTier: "OFFICIEL",
        verifiedAt: new Date(), verifiedBy: REDACTEUR.email,
        nextReviewAt: new Date("2027-01-01"), status: "DRAFT",
      },
    });
    await publierLaRegle(v2.id, AUTRE, "Délai d'instruction allongé par l'autorité");

    const bilan = await propagerLaPublication(v2.id);
    verifier(
      bilan.dossiers === 2 && bilan.alertes === 2,
      `les deux candidats sont prévenus (${JSON.stringify(bilan)})`,
    );
    verifier(bilan.critiques === 0, "et aucun dossier n'est mis en pause pour autant");

    const alerte = await db.notification.findFirstOrThrow({
      where: { applicationId: ouvert.id, kind: "REGLEMENTATION" },
    });
    verifier(
      alerte.body.includes("60–150 jours") && alerte.body.includes("avance de 60 jours"),
      "et l'alerte dit le nouveau délai et l'avance qu'il impose",
    );

    // INV-3 : rien n'a bougé tant qu'il n'a pas tranché.
    verifier(
      (await depotDe()) === avant,
      "tant qu'il n'a pas tranché, son échéancier ne bouge pas (INV-3)",
    );

    const migration = await db.ruleMigration.findFirstOrThrow({
      where: { applicationId: ouvert.id, toRuleId: v2.id },
    });
    /*
      Ce que l'écran d'arbitrage T-02 recevra, lu depuis le référentiel
      réel. Le délai y est facultatif : sans cette vérification, il
      pourrait cesser de remonter sans que rien ne le signale, et les deux
      cartes afficheraient « non renseigné » pour toujours.
    */
    const vue = await divergenceAArbitrer(migration.id, user.id);
    verifier(
      vue.ancienne.delai?.max === 90 && vue.nouvelle.delai?.max === 150,
      `l'arbitrage reçoit les deux délais (${JSON.stringify([vue.ancienne.delai, vue.nouvelle.delai])})`,
    );
    verifier(
      vue.pieces.ajoutees.length === 1 &&
        vue.pieces.ajoutees[0]?.libelle === "Assurance maladie",
      `et la pièce exigée en plus, avec son libellé (${JSON.stringify(vue.pieces.ajoutees)})`,
    );

    const dossier = await db.application.findUniqueOrThrow({ where: { id: ouvert.id } });
    await arbitrerLaDivergence(dossier, migration.id, "MIGRER");

    const apres = await depotDe();
    verifier(apres === "2027-04-04", `migrer recalcule l'échéancier (${apres})`);

    const ligne = await db.deadline.findFirstOrThrow({
      where: { applicationId: ouvert.id, code: "depot" },
    });
    verifier(
      ligne.doneAt !== null,
      "et une échéance déjà faite le reste après recalcul",
    );

    // Et le dossier qui conserve garde sa version, donc son calendrier.
    const m2 = await db.ruleMigration.findFirstOrThrow({
      where: { applicationId: conserve.id, toRuleId: v2.id },
    });
    await arbitrerLaDivergence(
      await db.application.findUniqueOrThrow({ where: { id: conserve.id } }),
      m2.id,
      "CONSERVER",
    );
    const depotConserve = jour(
      (await db.deadline.findFirstOrThrow({
        where: { applicationId: conserve.id, code: "depot" },
      })).dueAt,
    );
    verifier(
      depotConserve === "2027-06-03",
      `conserver sa version garde son calendrier (${depotConserve})`,
    );

    /*
      WF-09 étape 4 — l'autre appelant du remplacement, jusqu'ici couvert
      par rien du tout. Ce que la route PUT exécute, sans la couche HTTP :
      le même couple, dans la même transaction. Extraire une décision sans
      éprouver ses deux appelants n'aurait déplacé le défaut que d'un cran.
    */
    const regleConservee = await db.visaRule.findUniqueOrThrow({ where: { id: v1.id } });
    const REPORTEE = new Date("2027-11-01T00:00:00Z");
    await db.$transaction([
      ...(await remplacementDeLEcheancier(conserve.id, payload(regleConservee), REPORTEE)),
      db.application.update({ where: { id: conserve.id }, data: { targetDate: REPORTEE } }),
    ]);
    const replanifie = jour(
      (await db.deadline.findFirstOrThrow({
        where: { applicationId: conserve.id, code: "depot" },
      })).dueAt,
    );
    verifier(
      replanifie === "2027-08-03",
      `replanifier recalcule sur la version figée, pas sur la publiée (${replanifie})`,
    );
  }
  console.log("\nRG-14.1 — une version retirée ne se propose plus, et ne s'accepte plus");
  {
    /*
      « Une donnée non relue ne peut pas continuer à se présenter comme
      fiable. » La veille dépubliait, et l'arbitrage proposait quand même :
      le candidat acceptait, et son dossier se figeait sur une règle DRAFT.
      `ouvrirDossier` la refuse pourtant — la plateforme refusait d'y
      commencer et acceptait d'y aller.
    */
    rang += 10;
    const commune = {
      countryCode: "IT" as const, visaType: "emploi_kennismigrant" as const,
      category: "EMPLOI" as const, effectiveFrom: new Date("2026-01-01"),
      rules: brute.rules as never, sourceUrl: brute.sourceUrl, sourceTier: "OFFICIEL" as const,
      verifiedAt: new Date("2026-01-01"), verifiedBy: REDACTEUR.email,
      publishedAt: new Date("2026-01-01"),
    };
    const ancienne = await db.visaRule.create({
      data: { ...commune, version: 1, nextReviewAt: new Date("2029-01-01"),
        status: "ARCHIVED", effectiveTo: new Date("2026-06-01") },
    });
    // Relecture dépassée : c'est elle que la veille va retirer.
    const visee = await db.visaRule.create({
      data: { ...commune, version: 2, nextReviewAt: new Date("2027-01-01"), status: "PUBLISHED" },
    });

    const MOMENT = new Date("2027-04-01T08:00:00Z");
    rang += 1;
    const candidat = await db.user.create({
      data: { email: `fumee-veille-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const sien = await db.application.create({
      data: { userId: candidat.id, visaRuleId: ancienne.id, status: "ACTIF" },
    });
    const aArbitrer = await db.ruleMigration.create({
      data: {
        applicationId: sien.id, fromRuleId: ancienne.id, toRuleId: visee.id,
        impact: "MAJEUR", diff: [] as never, alertedAt: MOMENT,
      },
    });

    verifier(
      (await divergenceAArbitrer(aArbitrer.id, candidat.id)).blocage === "AUCUN",
      "tant qu'elle est en vigueur, la migration est proposée",
    );

    const retirees = await depublierLesFichesEchues(MOMENT);
    verifier(retirees >= 1, `la veille retire la version visée (${retirees})`);

    verifier(
      (await divergenceAArbitrer(aArbitrer.id, candidat.id)).blocage === "EN_RELECTURE",
      "l'écran ne la propose plus, et dit que la relecture est en cause",
    );

    const dossierDuCandidat = await db.application.findUniqueOrThrow({ where: { id: sien.id } });
    const refus = await arbitrerLaDivergence(dossierDuCandidat, aArbitrer.id, "MIGRER", MOMENT)
      .then(() => null)
      .catch((e: { echec?: { corps?: string } }) => e.echec?.corps ?? "refus sans motif");
    verifier(
      refus?.includes("nos veilleurs la revérifient") === true,
      `et le serveur la refuse, avec son motif (${refus?.slice(0, 44)}…)`,
    );
    verifier(
      (await db.application.findUniqueOrThrow({ where: { id: sien.id } })).visaRuleId ===
        ancienne.id,
      "le dossier garde sa version",
    );

    /* « Conserver » reste ouvert : c'est le choix sûr, et il met fin à la pause. */
    const garde = await arbitrerLaDivergence(
      await db.application.findUniqueOrThrow({ where: { id: sien.id } }),
      aArbitrer.id,
      "CONSERVER",
      MOMENT,
    );
    verifier(garde.decision === "CONSERVER", "et conserver reste possible");
  }
  console.log("\nWF-11 — le dossier resté deux versions en arrière est rattrapé");
  {
    /*
      La propagation ne visait que les dossiers de la version
      immédiatement précédente. Un candidat qui n'arbitre pas restait sur
      v1 : la publication de v3 ciblait les dossiers de v2, et il
      n'entendait plus jamais parler de rien. Depuis que migrer vers une
      version archivée est refusé (RG-14.1), il était même sans issue —
      sa seule divergence pointait une v2 que v3 avait archivée.
    */
    rang += 10;
    const socle = {
      countryCode: "PT" as const, visaType: "etudes_mvv_vvr" as const,
      category: "ETUDES" as const, effectiveFrom: new Date("2026-01-01"),
      sourceUrl: brute.sourceUrl, sourceTier: "OFFICIEL" as const,
      verifiedAt: new Date("2026-01-01"), verifiedBy: REDACTEUR.email,
      nextReviewAt: new Date("2029-01-01"), publishedAt: new Date("2026-01-01"),
    };
    const avecFonds = (valeur: number) => ({
      ...(brute.rules as object),
      preuve_fonds: { valeur, devise: "EUR", periodicite: "annuel" },
    });

    const un = await db.visaRule.create({
      data: { ...socle, version: 1, rules: avecFonds(10000) as never,
        status: "ARCHIVED", effectiveTo: new Date("2026-06-01") },
    });
    rang += 1;
    const distrait = await db.user.create({
      data: { email: `fumee-succ-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const sonDossier = await db.application.create({
      data: { userId: distrait.id, visaRuleId: un.id, status: "ACTIF" },
    });

    /*
      Et un candidat qui a demandé l'oubli. Une alerte réglementaire part
      par courrier : RG-10.4 vaut ici comme pour les passes de nuit, et
      cette passe-ci ne filtrait rien.
    */
    rang += 1;
    const partant = await db.user.create({
      data: {
        email: `fumee-succ-partant-${rang}-${process.pid}@exemple.test`,
        role: "CANDIDAT",
        deletionRequestedAt: new Date("2027-03-30"),
      },
    });
    const dossierDuPartant = await db.application.create({
      data: { userId: partant.id, visaRuleId: un.id, status: "ACTIF" },
    });

    const deux = await db.visaRule.create({
      data: { ...socle, version: 2, rules: avecFonds(12000) as never, status: "PUBLISHED" },
    });
    verifier(
      (await propagerLaPublication(deux.id)).alertes === 1,
      "v2 le prévient",
    );
    verifier(
      (await db.notification.count({ where: { applicationId: dossierDuPartant.id } })) === 0,
      "et celui qui a demandé l'oubli n'est pas prévenu (RG-10.4)",
    );

    /* Il n'arbitre pas. v3 paraît. */
    await db.visaRule.update({
      where: { id: deux.id },
      data: { status: "ARCHIVED", effectiveTo: new Date("2026-09-01") },
    });
    const trois = await db.visaRule.create({
      data: { ...socle, version: 3, rules: avecFonds(15000) as never, status: "PUBLISHED" },
    });
    const bilanTrois = await propagerLaPublication(trois.id);
    verifier(
      bilanTrois.alertes === 1,
      `et v3 le rattrape, deux versions plus loin (${JSON.stringify(bilanTrois)})`,
    );

    const vers3 = await db.ruleMigration.findFirstOrThrow({
      where: { applicationId: sonDossier.id, toRuleId: trois.id },
    });
    verifier(
      vers3.fromRuleId === un.id,
      "la divergence part de SA version, pas de celle que v3 remplace",
    );

    /*
      Et le diff qu'il lit est celui de v1 à v3 : lui montrer v2→v3 lui
      cacherait la moitié de ce qui a changé pour lui. 10 000 → 15 000, et
      non 12 000 → 15 000.
    */
    const lignes = vers3.diff as unknown as { champ: string; avant: unknown; apres: unknown }[];
    const fonds = lignes.find((l) => l.champ === "preuve_fonds");
    verifier(
      fonds?.avant === 10000 && fonds?.apres === 15000,
      `et il porte l'écart depuis sa version (${JSON.stringify(fonds)})`,
    );

    verifier(
      (await divergenceAArbitrer(vers3.id, distrait.id)).blocage === "AUCUN",
      "cette fois, il peut migrer",
    );

    /*
      Et la divergence morte dit la **vraie** cause. v2 n'est pas en
      relecture — la sienne est au 2029 — elle est remplacée. Annoncer une
      vérification ferait attendre une remise en vigueur qui n'aura jamais
      lieu, alors qu'une divergence arbitrable l'attend déjà.
    */
    const vers2 = await db.ruleMigration.findFirstOrThrow({
      where: { applicationId: sonDossier.id, toRuleId: deux.id },
    });
    verifier(
      (await divergenceAArbitrer(vers2.id, distrait.id)).blocage === "REMPLACEE",
      `la comparaison morte se dit remplacée, non en relecture (${(await divergenceAArbitrer(vers2.id, distrait.id)).blocage})`,
    );
    const motifServeur = await arbitrerLaDivergence(
      await db.application.findUniqueOrThrow({ where: { id: sonDossier.id } }),
      vers2.id,
      "MIGRER",
    )
      .then(() => null)
      .catch((e: { echec?: { corps?: string } }) => e.echec?.corps ?? "");
    verifier(
      motifServeur?.includes("plus récente") === true &&
        motifServeur?.includes("revérifi") === false,
      `et le serveur dit la même chose (${motifServeur?.slice(0, 46)}…)`,
    );

    /*
      L'écran ouvre la divergence qui vise la version la plus récente. La
      plus ancienne non arbitrée lui présentait d'abord une comparaison
      morte, qu'il devait écarter avant de voir celle qui compte.
    */
    const ouverte = await db.ruleMigration.findFirstOrThrow({
      where: { decision: null, application: { userId: distrait.id } },
      orderBy: { toRule: { version: "desc" } },
      include: { toRule: true },
    });
    verifier(
      ouverte.toRule.version === 3,
      `et l'écran ouvre celle qui compte (v${ouverte.toRule.version})`,
    );
  }

  console.log("\nWF-11 — migrer accepte la nouvelle version en entier, pas seulement ses pièces neuves");
  {
    /*
      L'arbitrage n'ajoutait que les pièces dont le **code** était inconnu.
      Une pièce qui survit gardait donc le libellé, le caractère
      obligatoire, le remède et la durée de validité de l'ancienne version
      — alors que l'écran de divergence l'annonce « ajoutée » dès qu'elle
      devient obligatoire. L'écran promettait une ligne que la migration
      ne posait pas.

      Ce bloc ouvre son propre pays : les dossiers des blocs précédents
      vivent sur les mêmes procédures, et une propagation vise toutes les
      versions antérieures.
    */
    rang += 10;
    const socle = {
      countryCode: "MA" as const, visaType: "etudes_mvv_vvr" as const,
      category: "ETUDES" as const, effectiveFrom: new Date("2026-01-01"),
      sourceUrl: brute.sourceUrl, sourceTier: "OFFICIEL" as const,
      verifiedAt: new Date("2026-01-01"), verifiedBy: REDACTEUR.email,
      nextReviewAt: new Date("2029-01-01"), publishedAt: new Date("2026-01-01"),
    };
    const PIECES = (brute.rules as never as {
      pieces_requises: { code: string; libelle: string; obligatoire: boolean }[];
    }).pieces_requises;
    const avecDiplome = (diplome: Record<string, unknown>) => ({
      ...(brute.rules as object),
      pieces_requises: PIECES.map((x) => (x.code === "diplome" ? { ...x, ...diplome } : x)),
    });

    /*
      v1 est en vigueur le temps que le dossier s'ouvre dessus :
      `ouvrirDossier` est le seul créateur de dossiers, et il refuse une
      version archivée. Une fixture qui poserait un dossier sur une v1
      déjà retirée décrirait un état que le produit ne sait pas produire.
    */
    const v1 = await db.visaRule.create({
      data: {
        ...socle, version: 1, status: "PUBLISHED",
        rules: avecDiplome({ obligatoire: false, libelle: "Diplôme" }) as never,
      },
    });

    rang += 1;
    const candidat = await db.user.create({
      data: { email: `fumee-pub-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const dossier = await ouvrirDossier(candidat.id, v1.id, new Date("2027-09-01"));
    await db.application.update({ where: { id: dossier.id }, data: { status: "ACTIF" } });

    await db.visaRule.update({
      where: { id: v1.id },
      data: { status: "ARCHIVED", effectiveTo: new Date("2026-06-01") },
    });
    const v2 = await db.visaRule.create({
      data: {
        ...socle, version: 2, status: "PUBLISHED",
        rules: avecDiplome({
          obligatoire: true,
          libelle: "Diplôme le plus élevé, légalisé",
          validite_mois: 6,
          nature: "demarche",
        }) as never,
      },
    });

    const initiale = await db.document.findFirstOrThrow({
      where: { applicationId: dossier.id, code: "diplome" },
    });
    verifier(
      !initiale.required && initiale.validityMonths === null,
      `sur la v1, le diplôme est complémentaire et ne périme pas (obligatoire=${initiale.required})`,
    );

    /* Le candidat a déjà fourni sa pièce, et elle est conforme. */
    await db.document.update({
      where: { applicationId_code: { applicationId: dossier.id, code: "diplome" } },
      data: { status: "CONFORME", feedback: "Lisible et complet.", expiresAt: new Date("2027-03-01") },
    });

    await propagerLaPublication(v2.id);
    const migration = await db.ruleMigration.findFirstOrThrow({
      where: { applicationId: dossier.id, toRuleId: v2.id },
    });
    const vue = await divergenceAArbitrer(migration.id, candidat.id);
    verifier(
      vue.pieces.ajoutees.some((x) => x.code === "diplome"),
      `l'écran annonce le diplôme parmi les pièces gagnées (${vue.pieces.ajoutees.map((x) => x.code).join(", ")})`,
    );

    const frais = await db.application.findUniqueOrThrow({ where: { id: dossier.id } });
    const rendu = await arbitrerLaDivergence(frais, migration.id, "MIGRER");
    verifier(
      rendu.piecesAjoutees.includes("Diplôme le plus élevé, légalisé"),
      `et l'arbitrage rend la même pièce (${JSON.stringify(rendu.piecesAjoutees)})`,
    );
    /*
      Et elle seule : réaligner toute la checklist ferait nommer au
      candidat des pièces qui n'ont pas bougé, et la mention de
      confirmation n'apprendrait plus rien.
    */
    verifier(
      rendu.piecesAjoutees.length === 1,
      `et rien d'autre — les pièces inchangées ne sont pas nommées (${rendu.piecesAjoutees.length})`,
    );

    const apres = await db.document.findFirstOrThrow({
      where: { applicationId: dossier.id, code: "diplome" },
    });
    verifier(
      apres.required && apres.family === "OBLIGATOIRE",
      `la pièce devenue obligatoire l'est en base (obligatoire=${apres.required}, ${apres.family})`,
    );
    verifier(
      apres.remedy === "DEMARCHE",
      `le remède suit la nouvelle version (${apres.remedy})`,
    );
    verifier(
      apres.validityMonths === 6,
      `et sa durée de validité aussi (${apres.validityMonths})`,
    );
    verifier(
      apres.label === "Diplôme le plus élevé, légalisé",
      `le libellé décrit l'exigence du dossier (« ${apres.label} »)`,
    );

    /* RG-11.1 — on ajoute et on réaligne, on ne retire pas. */
    verifier(
      apres.status === "CONFORME" && apres.feedback === "Lisible et complet.",
      `ce que le candidat a produit traverse intact (${apres.status})`,
    );
    verifier(
      apres.expiresAt?.toISOString().slice(0, 10) === "2027-03-01",
      `et la péremption calculée au dépôt n'est pas déplacée (${apres.expiresAt?.toISOString().slice(0, 10)})`,
    );
    const total = await db.document.count({ where: { applicationId: dossier.id } });
    verifier(total === PIECES.length, `aucune pièce n'est retirée (${total})`);
  }

  console.log("\nWF-11 — la pièce que la nouvelle version ne demande plus cesse de bloquer");
  {
    /*
      Le symétrique du bloc précédent, et aussi silencieux. Une pièce
      absente de `pieces_requises` n'était ni créée ni réalignée : elle
      restait obligatoire et requise, donc comptée parmi les requises par
      `computeCompleteness`. L'écran disait « ta checklist perd : Diplôme
      — elle ne se demande plus », le candidat migrait, et son dossier
      restait ACTIF pour une pièce que plus personne ne réclame.
    */
    rang += 10;
    const socle = {
      countryCode: "SN" as const, visaType: "emploi_kennismigrant" as const,
      category: "EMPLOI" as const, effectiveFrom: new Date("2026-01-01"),
      sourceUrl: brute.sourceUrl, sourceTier: "OFFICIEL" as const,
      verifiedAt: new Date("2026-01-01"), verifiedBy: REDACTEUR.email,
      nextReviewAt: new Date("2029-01-01"), publishedAt: new Date("2026-01-01"),
    };
    const PIECES_K = (brute.rules as never as {
      pieces_requises: { code: string; libelle: string; obligatoire: boolean }[];
    }).pieces_requises;

    const v1 = await db.visaRule.create({
      data: {
        ...socle, version: 1, status: "PUBLISHED",
        rules: {
          ...(brute.rules as object),
          pieces_requises: PIECES_K.map((x) =>
            x.code === "diplome" ? { ...x, obligatoire: true } : x,
          ),
        } as never,
      },
    });

    rang += 1;
    const candidat = await db.user.create({
      data: { email: `fumee-pub-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const dossier = await ouvrirDossier(candidat.id, v1.id, new Date("2027-09-01"));
    await db.application.update({ where: { id: dossier.id }, data: { status: "ACTIF" } });

    /* Tout est fourni, sauf le diplôme — que la v2 va cesser d'exiger. */
    await db.document.updateMany({
      where: { applicationId: dossier.id, code: { not: "diplome" } },
      data: { status: "CONFORME" },
    });
    await recalculerCompletude(dossier.id);
    const avant = await db.application.findUniqueOrThrow({ where: { id: dossier.id } });
    verifier(
      avant.status === "ACTIF",
      `le diplôme manquant empêche le dossier d'être prêt (${avant.status})`,
    );

    await db.visaRule.update({
      where: { id: v1.id },
      data: { status: "ARCHIVED", effectiveTo: new Date("2026-06-01") },
    });
    const v2 = await db.visaRule.create({
      data: {
        ...socle, version: 2, status: "PUBLISHED",
        rules: {
          ...(brute.rules as object),
          pieces_requises: PIECES_K.filter((x) => x.code !== "diplome"),
        } as never,
      },
    });
    await propagerLaPublication(v2.id);

    const migration = await db.ruleMigration.findFirstOrThrow({
      where: { applicationId: dossier.id, toRuleId: v2.id },
    });
    const vue = await divergenceAArbitrer(migration.id, candidat.id);
    verifier(
      vue.pieces.retirees.some((x) => x.code === "diplome" && !x.encoreDemandee),
      `l'écran annonce le diplôme retiré et plus demandé (${JSON.stringify(vue.pieces.retirees)})`,
    );

    const frais = await db.application.findUniqueOrThrow({ where: { id: dossier.id } });
    const rendu = await arbitrerLaDivergence(frais, migration.id, "MIGRER");
    verifier(
      rendu.piecesLiberees.includes("Diplôme"),
      `et l'arbitrage la rend parmi les pièces libérées (${JSON.stringify(rendu.piecesLiberees)})`,
    );

    await recalculerCompletude(dossier.id);
    const doc = await db.document.findFirstOrThrow({
      where: { applicationId: dossier.id, code: "diplome" },
    });
    verifier(
      !doc.required && doc.family === "COMPLEMENTAIRE",
      `la pièce ne bloque plus (obligatoire=${doc.required}, ${doc.family})`,
    );
    verifier(doc.status === "ATTENDUE", `et sa ligne reste — RG-11.1 (${doc.status})`);

    const apres = await db.application.findUniqueOrThrow({ where: { id: dossier.id } });
    verifier(
      apres.status === "PRET" && apres.readyAt !== null,
      `le dossier devient prêt sur une exigence que plus personne ne réclame (${apres.status})`,
    );
  }

  console.log("\nRG-06.6 — une durée de validité qui change ne passe plus en silence");
  {
    /*
      `comparerLesVersions` ne regardait pas la durée de validité. Une
      version qui ne changeait qu'elle rendait `MINEUR` avec un diff vide,
      et la propagation passe son chemin sur ce couple : aucune
      divergence, aucune notification, et un dossier qui gardait
      l'ancienne durée pour toujours — l'arbitrage étant le seul chemin
      qui réaligne sa checklist.

      Le sens compte : raccourcie, elle rend périmée le jour du dépôt une
      pièce demandée à la date que l'échéancier annonçait.
    */
    rang += 10;
    const socle = {
      countryCode: "CI" as const, visaType: "etudes_mvv_vvr" as const,
      category: "ETUDES" as const, effectiveFrom: new Date("2026-01-01"),
      sourceUrl: brute.sourceUrl, sourceTier: "OFFICIEL" as const,
      verifiedAt: new Date("2026-01-01"), verifiedBy: REDACTEUR.email,
      nextReviewAt: new Date("2029-01-01"), publishedAt: new Date("2026-01-01"),
    };
    const PIECES_V = (brute.rules as never as {
      pieces_requises: { code: string; libelle: string; obligatoire: boolean }[];
    }).pieces_requises;
    const avecValidite = (valeur: number) => ({
      ...(brute.rules as object),
      pieces_requises: PIECES_V.map((x) =>
        x.code === "diplome" ? { ...x, obligatoire: true, validite_mois: valeur } : x,
      ),
    });

    const v1 = await db.visaRule.create({
      data: { ...socle, version: 1, status: "PUBLISHED", rules: avecValidite(6) as never },
    });

    rang += 1;
    const candidat = await db.user.create({
      data: { email: `fumee-pub-${rang}-${process.pid}@exemple.test`, role: "CANDIDAT" },
    });
    const dossier = await ouvrirDossier(candidat.id, v1.id, new Date("2027-09-01"));
    await db.application.update({ where: { id: dossier.id }, data: { status: "ACTIF" } });

    const initiale = await db.document.findFirstOrThrow({
      where: { applicationId: dossier.id, code: "diplome" },
    });
    verifier(initiale.validityMonths === 6, `la pièce vaut six mois (${initiale.validityMonths})`);

    await db.visaRule.update({
      where: { id: v1.id },
      data: { status: "ARCHIVED", effectiveTo: new Date("2026-06-01") },
    });
    const v2 = await db.visaRule.create({
      data: { ...socle, version: 2, status: "PUBLISHED", rules: avecValidite(3) as never },
    });

    /* La seule différence entre les deux versions est cette durée. */
    const bilan = await propagerLaPublication(v2.id);
    verifier(
      bilan.alertes === 1,
      `la publication prévient, alors qu'elle ne change qu'une durée (${JSON.stringify(bilan)})`,
    );

    const migration = await db.ruleMigration.findFirstOrThrow({
      where: { applicationId: dossier.id, toRuleId: v2.id },
    });
    verifier(migration.impact === "MAJEUR", `elle gêne sans rendre inéligible (${migration.impact})`);

    const vue = await divergenceAArbitrer(migration.id, candidat.id);
    const ligne = vue.pieces.validites.find((x) => x.code === "diplome");
    verifier(
      ligne?.avant === 6 && ligne.apres === 3,
      `l'écran porte les deux durées avant qu'il tranche (${JSON.stringify(ligne)})`,
    );

    const frais = await db.application.findUniqueOrThrow({ where: { id: dossier.id } });
    await arbitrerLaDivergence(frais, migration.id, "MIGRER");
    const apres = await db.document.findFirstOrThrow({
      where: { applicationId: dossier.id, code: "diplome" },
    });
    verifier(
      apres.validityMonths === 3,
      `et la checklist porte la nouvelle durée après migration (${apres.validityMonths})`,
    );
  }
} catch (erreur) {
  console.error(`\n✗ ${erreur instanceof Error ? erreur.stack : String(erreur)}`);
  echecs.push("exception");
} finally {
  /*
    La publication poste un job : pg-boss tient donc ses propres
    connexions sur la base jetable. Les laisser ouvertes fait échouer le
    `DROP` — et, pire, la coupure remonte en `error` non traité qui masque
    le bilan de la fumée.
  */
  await (await getQueue()).stop({ wait: true }).catch(() => {});
  await db.$disconnect();
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nLa publication et la propagation tiennent.");
