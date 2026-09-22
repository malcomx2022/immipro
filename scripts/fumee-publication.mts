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
const { recalculerCompletude } = await import("../src/server/acces/dossiers");
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
    const bilan = await propagerLaPublication(v1.id, v2.id);
    verifier(
      bilan.critiques === 1,
      `le seuil relevé met le dossier en pause (${JSON.stringify(bilan)})`,
    );
    const dossier = await db.application.findUniqueOrThrow({
      where: { id: p.application.id },
    });
    verifier(dossier.status === "SUSPENDU", `le dossier est suspendu (${dossier.status})`);

    const migration = await db.ruleMigration.findFirstOrThrow({
      where: { applicationId: p.application.id },
    });
    const diff = migration.diff as { champ: string; avant: unknown; apres: unknown }[];
    verifier(
      diff.some((c) => c.champ === `condition.${SEUIL}.valeur`),
      `l'arbitrage montre le seuil, des deux côtés (${JSON.stringify(diff[0] ?? {})})`,
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
    const bilan = await propagerLaPublication(v1.id, v2.id);
    verifier(
      bilan.alertes === 1 && bilan.critiques === 0,
      `le dossier est prévenu sans être mis en pause (${JSON.stringify(bilan)})`,
    );
    const dossier = await db.application.findUniqueOrThrow({
      where: { id: p.application.id },
    });
    verifier(dossier.status === "PRET", `et il reste prêt à déposer (${dossier.status})`);
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
