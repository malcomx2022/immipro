/** L4 : vraie base, traitements de production ; acteur/adaptateur injectés.
 * Le POST authentifié et le navigateur sont éprouvés séparément. */
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { REGLES_DE_REFERENCE } from "../../prisma/seed/visa-rules.data";
import {
  reserverLaRelecture,
  commencerLaRelecture,
  publierLaRelecture,
  refuserLaRelecture,
} from "../../src/server/redaction/relecture-reservation";
import { rendreLesReservationsDeRedactionEchues } from "../../src/server/acces/quota";

export async function recetteRelectureExclusive(db: PrismaClient) {
  let assertions = 0;
  const exige = (v: boolean, message: string) => {
    if (!v) throw new Error(message);
    assertions++;
    console.log(`✓ ${message}`);
  };
  let n = 0;
  const modele = REGLES_DE_REFERENCE.find((r) => r.countryCode === "NL")!;
  const regle = await db.visaRule.create({
    data: {
      countryCode: "NL",
      visaType: modele.visaType,
      category: "ETUDES",
      version: 9904,
      effectiveFrom: new Date(),
      rules: modele.rules,
      sourceUrl: "https://exemple.test/regle",
      sourceTier: "OFFICIEL",
      verifiedAt: new Date(),
      verifiedBy: "recette",
      nextReviewAt: new Date("2027-01-01"),
      status: "PUBLISHED",
    },
  });
  const fixture = async (quota = 1) => {
    const user = await db.user.create({
      data: { email: `exclusive-${++n}@exemple.test`, emailVerified: new Date() },
    });
    const app = await db.application.create({
      data: { userId: user.id, visaRuleId: regle.id, status: "ACTIF" },
    });
    const paiement = await db.transaction.create({
      data: {
        reference: `IMP-L4-${n}`,
        userId: user.id,
        applicationId: app.id,
        packCode: "dossier",
        amountMajor: 29,
        currency: "EUR",
        provider: "STRIPE",
        status: "CONFIRMEE",
        confirmedAt: new Date(),
      },
    });
    await db.analysisCredit.create({
      data: {
        applicationId: app.id,
        delta: quota,
        reason: "ACHAT_PACK",
        transactionId: paiement.id,
      },
    });
    const doc = await db.document.create({
      data: {
        applicationId: app.id,
        code: "lettre_motivation",
        label: "Lettre de motivation",
        remedy: "REDIGER",
      },
    });
    const version = await db.documentVersion.create({
      data: { documentId: doc.id, rank: 1, body: "Lettre de recette synthétique.", wordCount: 5 },
    });
    return {
      user,
      app,
      doc,
      version,
      contexte: { params: { id: app.id, type: "lettre-motivation" }, acteur: { id: user.id } },
    };
  };
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const bilan = async (f: Fixture) => {
    const lignes = await db.analysisCredit.findMany({ where: { applicationId: f.app.id } });
    return {
      solde: lignes.reduce((s, l) => s + l.delta, 0),
      debits: lignes.filter((l) => l.delta === -1),
      rendus: lignes.filter((l) => l.reason === "ANALYSE_RENDUE"),
      version: await db.documentVersion.findUniqueOrThrow({
        where: { id: f.version.id },
        include: { findings: true },
      }),
      reservations: await db.relectureReservation.findMany({ where: { versionId: f.version.id } }),
      usages: await db.aiUsage.findMany({ where: { applicationId: f.app.id } }),
    };
  };
  const prendre = async (f: Fixture) => {
    const r = await reserverLaRelecture(f.app.id, f.version.id, "lettre_motivation");
    if (r.etat !== "RESERVEE") throw new Error(`Prise refusée : ${r.etat}`);
    return r;
  };
  const vieillir = async (id: string) => {
    const r = await db.relectureReservation.findUniqueOrThrow({ where: { id } });
    const avant = new Date(Date.now() - 60_000);
    await db.relectureReservation.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 31 * 60_000), expiresAt: avant },
    });
    await db.analysisCredit.update({ where: { id: r.creditId }, data: { reservedUntil: avant } });
  };
  const remarques = [
    {
      genre: "A_RENFORCER" as const,
      titre: "Préciser le retour",
      corps: "Ajoute la date et l'activité envisagées.",
    },
  ];
  const avis = {
    etat: "RELUE",
    remarques,
    jetonsEntree: 120,
    jetonsSortie: 30,
    appel: { fournisseur: "openai_compatible", modele: "synthetique" },
  };
  await mkdir(".recette", { recursive: true });
  const temp = await mkdtemp(resolve(".recette/exclusive-"));
  const fichier = join(temp, "route.mjs");
  let module:
    | {
        db: PrismaClient;
        POST: {
          traiter(c: unknown): Promise<{ relue: boolean; enCours?: boolean; motif?: string }>;
        };
        poser(v: unknown, suspendre?: boolean): void;
        attendre(): Promise<void>;
        liberer(): void;
        appels(): number;
      }
    | undefined;
  const anciennes = {
    AI_FOURNISSEUR_REDACTION: process.env.AI_FOURNISSEUR_REDACTION,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };
  process.env.AI_FOURNISSEUR_REDACTION = "anthropic";
  process.env.ANTHROPIC_API_KEY = "synthetique";
  try {
    await build({
      stdin: {
        contents:
          'export { POST } from "./src/app/api/dossiers/[id]/redaction/[type]/relecture/route"; export { db } from "./src/lib/db"; export * from "@/server/redaction/service";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
      outfile: fichier,
      plugins: [
        {
          name: "checkpoint-de-recette",
          setup(b) {
            b.onResolve(
              { filter: /^@\/server\/(http\/route|redaction\/service|redaction\/usage)$/ },
              (args) => ({
                path: args.path,
                namespace: "recette",
              }),
            );
            b.onLoad({ filter: /.*/, namespace: "recette" }, (args) => ({
              loader: "js",
              resolveDir: process.cwd(),
              contents: args.path.endsWith("http/route")
                ? "export const route = d => d;"
                : args.path.endsWith("redaction/usage")
                  ? "import { noterLesJetons as noter } from '@/server/ia/appel'; export const noterLesJetons=async(...args)=>{const resultat=await noter(...args);if(process.env.RECETTE_ARRET_APRES_USAGE==='1') process.exit(86);return resultat;};"
                  : `let avis, compte=0, debut, relacher, attente, signal; export const poser=(v, lent=false)=>{avis=v;compte=0; signal=new Promise(ok=>debut=ok); attente=lent?new Promise(ok=>relacher=ok):Promise.resolve();}; export const attendre=()=>signal; export const liberer=()=>relacher?.(); export const appels=()=>compte; export const laCritique=()=>async()=>{compte++;debut();if(compte===1)await attente;if(avis==='lever') throw Error('Incident synthétique');return avis;};`,
            }));
          },
        },
      ],
    });
    module = await import(pathToFileURL(fichier).href);
    if (!module) throw new Error("Module absent");
    // Un seul appel, même avec un solde d'une seule analyse, et aucun verrou
    // SQL tenu pendant que l'adaptateur attend.
    for (const quota of [1, 30]) {
      const f = await fixture(quota);
      module.poser(avis, true);
      const premier = module.POST.traiter(f.contexte);
      await module.attendre();
      const second = await module.POST.traiter(f.contexte);
      exige(
        second.enCours === true && !second.relue && module.appels() === 1,
        `quota ${quota} : second traitement EN_COURS sans appel`,
      );
      const pendant = await bilan(f);
      exige(
        pendant.solde === quota - 1 &&
          pendant.debits.length === 1 &&
          pendant.reservations.length === 1 &&
          !pendant.version.critiquedAt,
        "une seule réservation durable avant résultat",
      );
      module.liberer();
      exige((await premier).relue, "la propriétaire termine après la réponse retardée");
      const fin = await bilan(f);
      exige(
        fin.solde === quota - 1 &&
          fin.rendus.length === 0 &&
          fin.version.findings.length === 1 &&
          !!fin.version.critiquedAt &&
          fin.reservations[0]?.state === "RELUE",
        "avis unique, daté et débit soldé ensemble",
      );
      exige(
        fin.usages.length === 1 && fin.usages[0]?.inputTokens === 120,
        "consommation mesurée une seule fois",
      );
      exige(
        (await module.POST.traiter(f.contexte)).relue && module.appels() === 1,
        "rejeu séquentiel sans nouvelle dépense",
      );
    }
    // Une v2 peut être écrite pendant l'appel ; la v1 ne publie jamais sur v2.
    {
      const f = await fixture(2);
      module.poser(avis, true);
      const premier = module.POST.traiter(f.contexte);
      await module.attendre();
      const v2 = await db.documentVersion.create({
        data: { documentId: f.doc.id, rank: 2, body: "Nouvelle lettre synthétique." },
      });
      module.liberer();
      exige(
        (await premier).motif === "version_remplacee",
        "réponse ancienne explicitement obsolète",
      );
      const fin = await bilan(f);
      exige(
        fin.solde === 2 &&
          fin.rendus.length === 1 &&
          !fin.version.critiquedAt &&
          fin.version.findings.length === 0 &&
          fin.usages.length === 1,
        "v1 sans avis ni coût candidat, usage fournisseur gardé",
      );
      exige(
        (await module.POST.traiter(f.contexte)).relue &&
          (await db.critiqueFinding.count({ where: { versionId: v2.id } })) === 1,
        "v2 obtient son propre avis",
      );
      exige((await bilan(f)).solde === 1, "seule v2 consomme une analyse");
      exige(
        (await reserverLaRelecture(f.app.id, f.version.id, "lettre_motivation")).etat ===
          "OBSOLETE",
        "ancienne version refusée avant débit",
      );
    }
    // v2 répond avant v1 : le résultat affiché reste celui de v2.
    {
      const f = await fixture(2);
      module.poser(avis, true);
      const ancienne = module.POST.traiter(f.contexte);
      await module.attendre();
      const v2 = await db.documentVersion.create({
        data: { documentId: f.doc.id, rank: 2, body: "Lettre v2 synthétique." },
      });
      exige(
        (await module.POST.traiter(f.contexte)).relue,
        "v2 rapide publie pendant l'appel v1 lent",
      );
      module.liberer();
      exige((await ancienne).motif === "version_remplacee", "v1 lente ne remplace pas l'avis v2");
      const fin = await bilan(f);
      exige(
        module.appels() === 2 &&
          fin.solde === 1 &&
          fin.rendus.length === 1 &&
          fin.usages.length === 2 &&
          !fin.version.critiquedAt &&
          fin.version.findings.length === 0 &&
          (await db.critiqueFinding.count({ where: { versionId: v2.id } })) === 1,
        "deux versions, seul avis v2 visible et payé, deux usages conservés",
      );
    }
    for (const reponse of [
      {
        etat: "SANS_AVIS",
        cause: "injoignable",
        detail: "synthétique",
        jetonsEntree: null,
        jetonsSortie: null,
        appel: { fournisseur: "openai_compatible", modele: "synthetique" },
      },
      "lever",
    ]) {
      const f = await fixture();
      module.poser(reponse);
      try {
        await module.POST.traiter(f.contexte);
      } catch {
        exige(reponse === "lever", "exception contrôlée propagée après restitution");
      }
      const fin = await bilan(f);
      exige(
        fin.solde === 1 &&
          fin.rendus.length === 1 &&
          !fin.version.critiquedAt &&
          fin.version.findings.length === 0 &&
          fin.reservations[0]?.state !== "EN_COURS",
        "échec fournisseur/exception : restitution et libération uniques",
      );
      exige(
        !(await refuserLaRelecture(f.app.id, fin.reservations[0]!.id, "rejeu")),
        "refus rejoué sans second rendu",
      );
      module.poser(avis);
      exige(
        (await module.POST.traiter(f.contexte)).relue,
        "un geste ultérieur peut reprendre après échec",
      );
    }
    // Expiration puis course de reprise ; l'ancienne propriétaire est clôturée.
    for (const appelee of [false, true]) {
      const f = await fixture();
      const ancienne = await prendre(f);
      if (appelee) {
        exige(await commencerLaRelecture(f.app.id, ancienne.reservation), "marque d'appel acquise");
        exige(
          !(await commencerLaRelecture(f.app.id, ancienne.reservation)),
          "même jeton ne commence pas deux appels",
        );
      }
      await vieillir(ancienne.reservation);
      const reprises = await Promise.all([
        reserverLaRelecture(f.app.id, f.version.id, "lettre_motivation"),
        reserverLaRelecture(f.app.id, f.version.id, "lettre_motivation"),
      ]);
      exige(
        reprises.filter((r) => r.etat === "RESERVEE").length === 1 &&
          reprises.filter((r) => r.etat === "EN_COURS").length === 1,
        "expiration : une seule reprise, même à quota 1",
      );
      const r = reprises.find((r) => r.etat === "RESERVEE")!;
      if (r.etat !== "RESERVEE") throw Error("Reprise absente");
      exige(
        !(await commencerLaRelecture(f.app.id, ancienne.reservation)),
        "ancienne requête arrêtée avant appel reste neutralisée",
      );
      exige(
        (await publierLaRelecture(f.app.id, ancienne.reservation, remarques)) === "INTERROMPUE",
        "réponse tardive ne peut publier après la reprise",
      );
      exige(
        !(await refuserLaRelecture(f.app.id, ancienne.reservation, "tardif")),
        "ancien refus ne rend pas le débit de la reprise",
      );
      exige(
        (await commencerLaRelecture(f.app.id, r.reservation)) &&
          (await publierLaRelecture(f.app.id, r.reservation, remarques)) === "RELUE",
        "nouvelle propriétaire publie son avis",
      );
      const fin = await bilan(f);
      exige(
        fin.solde === 0 &&
          fin.debits.length === 2 &&
          fin.rendus.length === 1 &&
          fin.version.findings.length === 1,
        "deux tentatives historiques, un coût net et un avis",
      );
    }
    // Requête suspendue après acquisition : pas d'appel après l'échéance.
    {
      const f = await fixture();
      const r = await prendre(f);
      await vieillir(r.reservation);
      exige(
        !(await commencerLaRelecture(f.app.id, r.reservation)),
        "réservation expirée avant départ : aucun appel autorisé",
      );
      const fin = await bilan(f);
      exige(
        fin.solde === 1 &&
          fin.rendus.length === 1 &&
          !fin.reservations[0]?.callStartedAt &&
          fin.reservations[0]?.state === "EXPIREE",
        "avant appel expiré : rendu unique et jeton fermé",
      );
    }
    // Reprise horaire concurrente et résultat : restitution unique, jamais gratuit.
    {
      const f = await fixture();
      const r = await prendre(f);
      await commencerLaRelecture(f.app.id, r.reservation);
      await vieillir(r.reservation);
      await Promise.all([
        rendreLesReservationsDeRedactionEchues(),
        rendreLesReservationsDeRedactionEchues(),
        publierLaRelecture(f.app.id, r.reservation, remarques),
      ]);
      const fin = await bilan(f);
      exige(
        fin.solde === 1 &&
          fin.rendus.length === 1 &&
          !fin.version.critiquedAt &&
          fin.version.findings.length === 0 &&
          fin.reservations[0]?.state === "EXPIREE",
        "reprise horaire et réponse expirée : pas d'avis gratuit ni double rendu",
      );
    }
    // Interruption réelle d'un processus : avant appel puis après appel.
    for (const apresAppel of [false, true]) {
      const f = await fixture();
      const script = apresAppel
        ? `const m=await import(${JSON.stringify(pathToFileURL(fichier).href)});m.poser({"etat":"RELUE","remarques":[],"jetonsEntree":120,"jetonsSortie":30,"appel":{"fournisseur":"openai_compatible","modele":"synthetique"}});await m.POST.traiter(${JSON.stringify(f.contexte)});`
        : `const m=await import(${JSON.stringify(pathToFileURL(resolve("src/server/redaction/relecture-reservation.ts")).href)});await m.reserverLaRelecture(${JSON.stringify(f.app.id)},${JSON.stringify(f.version.id)},'lettre_motivation');process.exit(86);`;
      const enfant = spawn(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", script],
        {
          env: { ...process.env, RECETTE_ARRET_APRES_USAGE: apresAppel ? "1" : "0" },
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      let erreurs = "";
      enfant.stderr.on("data", (b) => (erreurs += b));
      const delai = setTimeout(() => enfant.kill("SIGKILL"), 20_000);
      const code = await new Promise<number | null>((ok, ko) => {
        enfant.on("error", ko);
        enfant.on("exit", ok);
      });
      clearTimeout(delai);
      exige(code === 86, `arrêt réel ${apresAppel ? "après" : "avant"} appel (${erreurs})`);
      const interrompu = await bilan(f);
      exige(
        interrompu.solde === 0 &&
          interrompu.reservations.length === 1 &&
          !interrompu.version.critiquedAt &&
          interrompu.version.findings.length === 0,
        "arrêt : débit durable sans faux résultat",
      );
      exige(
        Boolean(interrompu.reservations[0]!.callStartedAt) === apresAppel,
        "checkpoint d'appel durable",
      );
      exige(
        interrompu.usages.length === (apresAppel ? 1 : 0),
        "arrêt : usage observé durable après retour adaptateur",
      );
      await vieillir(interrompu.reservations[0]!.id);
      exige(
        (await rendreLesReservationsDeRedactionEchues()).rendues === 1,
        "arrêt : reprise horaire rend la réservation",
      );
      module.poser(avis);
      exige(
        (await module.POST.traiter(f.contexte)).relue,
        "après arrêt : reprise explicite aboutie",
      );
      const fin = await bilan(f);
      exige(
        fin.solde === 0 && fin.rendus.length === 1 && fin.version.findings.length === 1,
        "arrêt : un avis final, un coût candidat net",
      );
    }
    // L'index de base tient même hors du service ; échec de publication atomique.
    {
      const f = await fixture(2);
      const r = await prendre(f);
      let refuse = false;
      try {
        await db.$transaction(async (tx) => {
          const debit = await tx.analysisCredit.create({
            data: { applicationId: f.app.id, delta: -1, reason: "ANALYSE" },
          });
          await tx.relectureReservation.create({
            data: {
              versionId: f.version.id,
              creditId: debit.id,
              expiresAt: new Date(Date.now() + 60_000),
            },
          });
        });
      } catch (e) {
        refuse = (e as { code?: string }).code === "P2002";
      }
      exige(refuse, "index partiel : deuxième propriétaire refusée en SQL");
      exige((await bilan(f)).debits.length === 1, "échec d'unicité : second débit annulé");
      for (const [sql, nom] of [
        [
          () =>
            db.$executeRaw`UPDATE "RelectureReservation" SET "finishedAt" = CURRENT_TIMESTAMP WHERE id = ${r.reservation}`,
          "EN_COURS ne porte pas une date de fin",
        ],
        [
          () =>
            db.$executeRaw`UPDATE "RelectureReservation" SET state = 'RELUE' WHERE id = ${r.reservation}`,
          "une issue exige sa date",
        ],
        [
          () =>
            db.$executeRaw`UPDATE "RelectureReservation" SET "expiresAt" = "createdAt" WHERE id = ${r.reservation}`,
          "une échéance suit la création",
        ],
      ] as const) {
        let refusee = false;
        try {
          await sql();
        } catch (e) {
          refusee = /23514/.test(String(e)) && /relecture_issue_et_date|relecture_echeance/.test(String(e));
        }
        exige(refusee, `contrainte SQL : ${nom}`);
      }
      await commencerLaRelecture(f.app.id, r.reservation);
      let tombe = false;
      try {
        await publierLaRelecture(f.app.id, r.reservation, [
          { genre: "INEXISTANT", titre: "x", corps: "y" } as never,
        ]);
      } catch {
        tombe = true;
      }
      const fin = await bilan(f);
      exige(
        tombe &&
          !fin.version.critiquedAt &&
          fin.version.findings.length === 0 &&
          fin.reservations[0]?.state === "EN_COURS",
        "erreur de persistance : date, remarques et solde annulés ensemble",
      );
      await refuserLaRelecture(f.app.id, r.reservation, "fin de recette");
    }
    console.log(`✓ Relecture exclusive : ${assertions} assertions positives.`);
  } finally {
    await module?.db.$disconnect();
    for (const [k, v] of Object.entries(anciennes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await rm(temp, { recursive: true, force: true });
  }
}
