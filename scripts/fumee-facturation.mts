/**
 * Factures et avoirs, sur une base réelle — avis comptable M.C du
 * 04/10/2026.
 *
 * Ce qu'aucun test sans base ne peut montrer : la suite sans trou sous
 * émissions simultanées, une seule pièce par vente sous double appel,
 * l'avoir adossé à sa facture, l'immuabilité tenue par la base, la série
 * réelle fermée tant que la facturation n'est pas en place, et le paiement
 * réel refusé avant toute écriture.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:facturation
 */
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_facturation_${process.pid}`;
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

console.log(`Facturation sur une base jetable (${nomBase})`);
await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
await surLAdministration(`CREATE DATABASE ${nomBase}`);
process.env.DATABASE_URL = cible.toString();
// Espace de test, FedaPay seul, régime non déclaré : l'état du pilote.
process.env.FEDAPAY_ENVIRONMENT = "sandbox";
process.env.PAIEMENT_FOURNISSEURS = "FEDAPAY";
delete process.env.FACTURATION_TVA;

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

/**
 * Ce que le fournisseur annonce avoir encaissé : le montant décidé par la
 * plateforme, en unités mineures (revue du 07/10/2026, E2). Une
 * confirmation sans montant ne crédite plus rien.
 */
const encaisse = async (reference: string) => {
  const { prixPayeMineur } = await import("../src/domain/facturation/montants");
  const t = await db.transaction.findUniqueOrThrow({
    where: { reference },
    select: { amountMajor: true, currency: true },
  });
  return {
    montantMineur: prixPayeMineur(t),
    devise: t.currency,
    rembourseMineur: null,
  };
};
/** Une notification qui ne dit rien de l'argent : un échec, une attente, un remboursement FedaPay. */
const sansMontant = { montantMineur: null, devise: null, rembourseMineur: null };
const { etablirLaFacture, etablirLAvoir, emettreLesPiecesEnSouffrance } = await import(
  "../src/server/facturation/emission"
);
const { appliquerLaNotification, suspensionDeLEncaissement } = await import(
  "../src/server/acces/paiements"
);
const { pieceDuClient } = await import("../src/server/lecture/factures");
const { exerciceDe } = await import("../src/domain/facturation/numerotation");

const annee = exerciceDe(new Date());
let compteur = 0;

try {
  const candidat = await db.user.create({
    data: {
      email: `facture-${process.pid}@exemple.test`,
      role: "CANDIDAT",
      billingName: "Awa Koffi",
      billingAddress: "Quartier Haie Vive, Cotonou, Bénin",
    },
  });
  const regle = await db.visaRule.create({
    data: {
      countryCode: "NL", visaType: "ETUDES", category: "ETUDES", version: 1,
      effectiveFrom: new Date("2026-01-01"), rules: {}, sourceUrl: "https://exemple.test/regle",
      sourceTier: "OFFICIEL", verifiedAt: new Date("2026-01-01"), verifiedBy: "fumée",
      nextReviewAt: new Date("2027-01-01"), status: "PUBLISHED",
    },
  });
  const dossier = await db.application.create({ data: { userId: candidat.id, visaRuleId: regle.id } });

  const vente = (statut: "CONFIRMEE" | "REMBOURSEE" | "INITIEE" = "CONFIRMEE", montant = 5000) => {
    compteur += 1;
    return db.transaction.create({
      data: {
        reference: `FAC-${process.pid}-${compteur}`,
        userId: candidat.id,
        applicationId: dossier.id,
        packCode: "essentiel",
        amountMajor: montant,
        currency: "XOF",
        provider: "FEDAPAY",
        providerTxId: statut === "INITIEE" ? null : `fedapay:${process.pid}${compteur}`,
        status: statut,
        ...(statut !== "INITIEE" ? { confirmedAt: new Date() } : {}),
        // Un remboursement suppose une obligation (E3) : la base l'exige.
        ...(statut === "REMBOURSEE"
          ? { refundDueAt: new Date(), refundBasis: "Geste de support — fumée", refundedAt: new Date() }
          : {}),
      },
    });
  };

  console.log("\nUne facture d'essai par vente confirmée, en bac à sable");
  const premiere = await vente();
  const f1 = await etablirLaFacture(premiere.id);
  verifier(
    f1.issue === "emise" && f1.numero === `ESSAI-RD-${annee}-00001`,
    `la première vente reçoit ESSAI-RD-${annee}-00001 (${JSON.stringify(f1)})`,
  );
  const rejeu = await etablirLaFacture(premiere.id);
  verifier(
    rejeu.issue === "deja_emise" && rejeu.numero === `ESSAI-RD-${annee}-00001`,
    "la rappeler rend la même pièce, sans en émettre une seconde",
  );
  const piece = await db.invoice.findFirstOrThrow({ where: { transactionId: premiere.id } });
  verifier(piece.clientName === "Awa Koffi" && piece.clientAddress?.includes("Cotonou") === true, "le nom et l'adresse de facturation sont figés sur la pièce");
  verifier(piece.amountIncl === 5000 && piece.vatAmount === 0 && piece.amountInWords === "cinq mille francs CFA", "montant, TVA nulle sans régime déclaré, somme en lettres");
  verifier(piece.series === "ESSAI" && piece.emitter === null, "pièce d'essai, émetteur non saisi : elle le dit au lieu de compléter");
  verifier(
    piece.performedAt.getTime() === premiere.confirmedAt!.getTime(),
    "la pièce porte la date de la vente (revue F5)",
  );
  const sansVente = await etablirLaFacture((await vente("INITIEE")).id);
  verifier(sansVente.issue === "sans_objet", "un paiement non confirmé n'a pas de facture");

  console.log("\nUne suite sans trou, sous émissions simultanées");
  const lot = await Promise.all(Array.from({ length: 6 }, () => vente()));
  const issues = await Promise.all(lot.map((t) => etablirLaFacture(t.id)));
  const rangs = (await db.invoice.findMany({ where: { kind: "FACTURE", series: "ESSAI" }, orderBy: { rank: "asc" } })).map((f) => f.rank);
  verifier(issues.every((i) => i.issue === "emise"), "six ventes simultanées, six factures");
  verifier(JSON.stringify(rangs) === JSON.stringify([1, 2, 3, 4, 5, 6, 7]), `rangs continus, sans doublon ni trou (${rangs.join(", ")})`);
  const double = await vente();
  const [a, b] = await Promise.all([etablirLaFacture(double.id), etablirLaFacture(double.id)]);
  const pieces = await db.invoice.count({ where: { transactionId: double.id } });
  verifier(pieces === 1, `deux émissions simultanées de la même vente n'en font qu'une (${a.issue}, ${b.issue})`);
  const suite = await db.invoiceSequence.findUniqueOrThrow({
    where: { series_kind_fiscalYear: { series: "ESSAI", kind: "FACTURE", fiscalYear: annee } },
  });
  verifier(suite.last === 8, `la suite n'a pas consommé de place pour le perdant (${suite.last})`);

  console.log("\nVendue le 31/12, facturée le 02/01 par le filet (revue F5, D-14)");
  // 31/12 à 23 h 50 à Cotonou (UTC+1), émission le 02/01 suivant. Relatif
  // à l'année courante : la suite de l'an prochain est encore vide.
  const venduLe = `${annee}-12-31T22:50:00.000Z`;
  const emisLe = `${annee + 1}-01-02T08:00:00.000Z`;
  const sylvestre = await vente();
  await db.transaction.update({
    where: { id: sylvestre.id },
    data: { confirmedAt: new Date(venduLe) },
  });
  const nouvelAn = await etablirLaFacture(sylvestre.id, process.env, new Date(emisLe));
  const tardive = await db.invoice.findFirstOrThrow({ where: { transactionId: sylvestre.id } });
  verifier(
    nouvelAn.issue === "emise" && nouvelAn.numero === `ESSAI-RD-${annee + 1}-00001` && tardive.fiscalYear === annee + 1,
    `numéro et exercice de l'émission, la suite reste chronologique (${JSON.stringify(nouvelAn)})`,
  );
  verifier(
    tardive.performedAt.toISOString() === venduLe,
    `la date de la prestation est celle de la vente (${tardive.performedAt.toISOString()})`,
  );
  const lueTardive = await pieceDuClient(tardive.number, candidat.id);
  verifier(
    lueTardive.prestationLe === venduLe && lueTardive.emiseLe === emisLe,
    "le client lit les deux dates sur sa pièce",
  );

  console.log("\nUn avoir pour chaque remboursement");
  await db.transaction.update({
    where: { id: premiere.id },
    data: {
      status: "REMBOURSEE",
      refundDueAt: new Date(),
      refundBasis: "Geste de support — fumée",
      refundedAt: new Date(),
    },
  });
  const avoir = await etablirLAvoir(premiere.id);
  verifier(avoir.issue === "emise" && avoir.numero === `ESSAI-AV-${annee}-00001`, `l'avoir a sa propre suite (${JSON.stringify(avoir)})`);
  const avoirLu = await db.invoice.findFirstOrThrow({ where: { transactionId: premiere.id, kind: "AVOIR" } });
  verifier(avoirLu.originId === piece.id && avoirLu.amountIncl === piece.amountIncl, "il cite la facture d'origine et en reprend le montant");
  const rendueLe = (await db.transaction.findUniqueOrThrow({ where: { id: premiere.id } })).refundedAt!;
  verifier(avoirLu.performedAt.getTime() === rendueLe.getTime(), "l'avoir porte la date du remboursement");
  const remboursee = await vente("REMBOURSEE");
  const avant = await etablirLAvoir(remboursee.id);
  const deux = await db.invoice.findMany({ where: { transactionId: remboursee.id }, orderBy: { issuedAt: "asc" } });
  verifier(avant.issue === "emise" && deux.map((d) => d.kind).join(",") === "FACTURE,AVOIR", "remboursée avant d'être facturée : la facture vient d'abord, puis l'avoir");

  console.log("\nUn remboursement partiel : l'avoir porte la somme rendue (RG-15.2)");
  // La facture est émise sous un régime assujetti à 18 % ; le régime du
  // jour change avant l'avoir, qui doit garder celui de la facture.
  process.env.FACTURATION_TVA = "18";
  const entamee = await vente();
  await etablirLaFacture(entamee.id);
  delete process.env.FACTURATION_TVA;
  const decidee = new Date(Date.now() - 60_000);
  await db.transaction.update({
    where: { id: entamee.id },
    data: {
      // Essentiel 5 000 F, 10 analyses, 4 consommées : 3 000 F rendus.
      refundDueAt: decidee,
      refundBasis: "Geste de support — fumée du prorata",
      refundAmountMinor: 3000,
      status: "REMBOURSEE",
      refundedAt: new Date(),
    },
  });
  const avoirPartiel = await etablirLAvoir(entamee.id);
  const pieceEntamee = await db.invoice.findFirstOrThrow({ where: { transactionId: entamee.id, kind: "FACTURE" } });
  const avoirEntame = await db.invoice.findFirstOrThrow({ where: { transactionId: entamee.id, kind: "AVOIR" } });
  verifier(avoirPartiel.issue === "emise", `l'avoir partiel s'émet (${JSON.stringify(avoirPartiel)})`);
  verifier(
    pieceEntamee.amountIncl === 5000 && avoirEntame.amountIncl === 3000,
    `la facture garde le prix payé, l'avoir porte la somme rendue (${pieceEntamee.amountIncl} / ${avoirEntame.amountIncl})`,
  );
  verifier(
    avoirEntame.vatRateBp === 1800 &&
      avoirEntame.amountExcl === 2542 &&
      avoirEntame.vatAmount === 458 &&
      avoirEntame.amountExcl + avoirEntame.vatAmount === 3000 &&
      avoirEntame.vatNote === pieceEntamee.vatNote,
    `ventilé sous le régime de la facture, et non celui du jour (${avoirEntame.amountExcl} + ${avoirEntame.vatAmount} à ${avoirEntame.vatRateBp})`,
  );
  verifier(avoirEntame.amountInWords === "trois mille francs CFA", `somme en lettres du montant rendu (${avoirEntame.amountInWords})`);
  verifier(
    avoirEntame.originId === pieceEntamee.id &&
      avoirEntame.designation.startsWith(`Remboursement partiel de la facture ${pieceEntamee.number}`),
    "il cite la facture d'origine, et se dit partiel",
  );

  console.log("\nLa base tient l'immuabilité");
  const suppression = await db.invoice.delete({ where: { id: piece.id } }).then(() => true, () => false);
  verifier(!suppression, "une pièce émise ne se supprime pas");
  const reecriture = await db.invoice.update({ where: { id: piece.id }, data: { amountIncl: 1, amountExcl: 1 } }).then(() => true, () => false);
  verifier(!reecriture, "son montant ne se réécrit pas");
  const redatee = await db.invoice.update({ where: { id: piece.id }, data: { performedAt: new Date("2020-01-01") } }).then(() => true, () => false);
  verifier(!redatee, "sa date de la prestation non plus (revue F5)");
  const annulation = await db.invoice.update({ where: { id: piece.id }, data: { cancelledAt: new Date(), cancelReason: "Essai d'annulation tracée" } }).then(() => true, () => false);
  verifier(annulation, "l'annulation tracée s'y ajoute");
  const reannulation = await db.invoice.update({ where: { id: piece.id }, data: { cancelReason: "Autre motif" } }).then(() => true, () => false);
  verifier(!reannulation, "et ne se réécrit pas ensuite");
  const avoirSansOrigine = await db.invoice.create({
    data: {
      number: "ESSAI-AV-1999-00001", kind: "AVOIR", series: "ESSAI", fiscalYear: 1999, rank: 1,
      transactionId: double.id, performedAt: new Date(), designation: "x", currency: "XOF", amountIncl: 1, amountExcl: 1,
      vatAmount: 0, vatNote: "x", amountInWords: "un franc CFA", paymentMethod: "x",
    },
  }).then(() => true, () => false);
  verifier(!avoirSansOrigine, "un avoir sans facture d'origine est refusé");

  console.log("\nLa notification signée émet la pièce");
  const ouverte = await vente("INITIEE");
  await db.transaction.update({ where: { id: ouverte.id }, data: { providerTxId: `fedapay:notif${process.pid}` } });
  const confirmation = await appliquerLaNotification({
    providerEventId: `fedapay:notif${process.pid}:approved`,
    providerTxId: `fedapay:notif${process.pid}`,
    reference: ouverte.reference,
    statut: "CONFIRMEE",
    ...(await encaisse(ouverte.reference)),
  });
  const apres = await db.invoice.findMany({ where: { transactionId: ouverte.id } });
  verifier(confirmation.issue === "creditee" && apres.length === 1 && apres[0]!.kind === "FACTURE", `la confirmation émet la facture (${confirmation.issue})`);
  // Un remboursement décidé et initié : seul celui-là se solde (E3, D-8).
  await db.transaction.update({
    where: { id: ouverte.id },
    data: {
      refundDueAt: new Date(),
      refundBasis: "Geste de support — fumée",
      refundAttemptedAt: new Date(),
      refundAttempts: 1,
    },
  });
  const retour = await appliquerLaNotification({
    providerEventId: `fedapay:notif${process.pid}:refunded`,
    providerTxId: `fedapay:notif${process.pid}`,
    reference: ouverte.reference,
    statut: "REMBOURSEE",
    ...sansMontant,
  });
  const avoirs = await db.invoice.count({ where: { transactionId: ouverte.id, kind: "AVOIR" } });
  verifier(avoirs === 1, `le remboursement confirmé émet l'avoir (${retour.issue})`);

  console.log("\nLe filet de la réconciliation");
  const oubliee = await vente();
  const emises = await emettreLesPiecesEnSouffrance();
  verifier(emises >= 1 && (await db.invoice.count({ where: { transactionId: oubliee.id } })) === 1, `une vente confirmée sans facture est reprise (${emises})`);

  console.log("\nLe client lit sa pièce, et lui seul");
  const lue = await pieceDuClient(`ESSAI-RD-${annee}-00002`, candidat.id).then((p) => p, () => null);
  verifier(lue !== null && lue.client.nom === "Awa Koffi", "le client lit sa facture");
  const autre = await db.user.create({ data: { email: `autre-${process.pid}@exemple.test`, role: "CANDIDAT" } });
  const volee = await pieceDuClient(`ESSAI-RD-${annee}-00002`, autre.id).then(() => true, () => false);
  verifier(!volee, "un autre compte ne la lit pas");

  console.log("\nEn espace réel, la série réelle reste fermée");
  process.env.FEDAPAY_ENVIRONMENT = "live";
  const reelle = await vente();
  const bloquee = await etablirLaFacture(reelle.id);
  verifier(
    bloquee.issue === "bloquee" && bloquee.raisons.includes("certification_absente") && bloquee.raisons.includes("regime_tva_non_declare"),
    `aucune facture réelle sans certification ni régime déclaré (${JSON.stringify(bloquee)})`,
  );
  verifier((await db.invoiceSequence.count({ where: { series: "REELLE" } })) === 0, "la suite réelle n'a pas consommé de place");

  const sansConditions = await suspensionDeLEncaissement(candidat.id, "FEDAPAY");
  verifier(sansConditions === "conditions", `sans conditions publiées, c'est la première raison (${sansConditions})`);
  await db.legalPublication.create({
    data: {
      page: "conditions", rang: 1, kind: "VALIDATION", templateHash: "fumee", title: "Conditions",
      standfirst: "x", body: [], variables: {}, reviewer: "Juriste de fumée", reviewedAt: new Date(),
      publishedBy: candidat.id, reason: "fumée",
    },
  });
  const sansFacturation = await suspensionDeLEncaissement(candidat.id, "FEDAPAY");
  verifier(sansFacturation === "facturation", `conditions publiées, la facturation manque encore (${sansFacturation})`);
  process.env.FEDAPAY_ENVIRONMENT = "sandbox";
  const essai = await suspensionDeLEncaissement(candidat.id, "FEDAPAY");
  verifier(essai === null, "en bac à sable, rien ne suspend le paiement");

  /*
    S.158 (RF-6, préparation de M.C) — une certification qui échoue ne perd
    rien. Avant, l'erreur remontait après l'enregistrement de la pièce :
    le journal ne s'écrivait pas, et rien ne reprenait une pièce réelle
    restée sans code, le filet ne cherchant que les ventes sans pièce.
    Aucun adaptateur n'existe : les certificateurs ci-dessous sont ceux de
    la fumée, passés en paramètre — aucune variable d'environnement ne
    sait en choisir un.
  */
  console.log("\nUne certification qui échoue ne perd rien, et se reprend (S.158)");
  {
    const { certifierLesPiecesEnAttente, piecesEnAttenteDeCertification } = await import(
      "../src/server/facturation/emission"
    );
    const { NON_BRANCHE } = await import("../src/server/facturation/certification");
    const { CLES_EMETTEUR_FACTURE } = await import("../src/domain/facturation/facture");
    for (const cle of CLES_EMETTEUR_FACTURE) {
      await db.legalVariable.upsert({
        where: { key: cle },
        create: { key: cle, value: `${cle} de fumée`, updatedBy: "fumée" },
        update: {},
      });
    }
    process.env.FACTURATION_TVA = "18";
    process.env.FEDAPAY_ENVIRONMENT = "live";
    const recus: { numero: string; origine: string | null }[] = [];
    const echoue = async () => {
      throw new Error("dispositif injoignable");
    };
    let n = 0;
    const reussit = async (piece: { numero: string; origine: string | null }) => {
      recus.push(piece);
      n += 1;
      return { code: `CODE-FUMEE-${n}`, le: new Date() };
    };
    const avant = await db.auditLog.count({ where: { action: "facture.emission" } });

    const vendue = await vente();
    const emise = await etablirLaFacture(vendue.id, process.env, new Date(), echoue);
    const piece = await db.invoice.findFirst({ where: { transactionId: vendue.id, kind: "FACTURE" } });
    verifier(
      emise.issue === "emise" && piece?.series === "REELLE" && piece.certificationCode === null,
      `la pièce réelle est émise, sans code inventé (${emise.issue}, ${piece?.number})`,
    );
    const traces = await db.auditLog.findMany({
      where: { action: "facture.emission" },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    verifier(
      (await db.auditLog.count({ where: { action: "facture.emission" } })) === avant + 1 &&
        traces[0]!.reason.includes("Certification en attente"),
      "l'émission est journalisée, et dit que la certification attend",
    );
    verifier(
      (await piecesEnAttenteDeCertification()).nombre === 1,
      "elle est comptée parmi les pièces en attente de certification",
    );
    const rejouee = await etablirLaFacture(vendue.id, process.env, new Date(), echoue);
    verifier(rejouee.issue === "deja_emise", "rejouée, l'émission ne fait pas une seconde pièce");

    verifier(
      (await certifierLesPiecesEnAttente(process.env, NON_BRANCHE)).certifiees === 0,
      "sans adaptateur, la reprise ne tente rien",
    );

    // Le remboursement de cette vente : l'avoir échoue à son tour.
    await db.transaction.update({
      where: { id: vendue.id },
      data: {
        status: "REMBOURSEE",
        refundDueAt: new Date(),
        refundBasis: "Geste de support — fumée S.158",
        refundedAt: new Date(),
      },
    });
    const avoir = await etablirLAvoir(vendue.id, process.env, new Date(), echoue);
    verifier(avoir.issue === "emise", `l'avoir réel est émis lui aussi (${avoir.issue})`);
    verifier((await piecesEnAttenteDeCertification()).nombre === 2, "deux pièces attendent leur code");

    // Deux passes simultanées : chaque pièce reçoit un code, et un seul.
    const [a, b] = await Promise.all([
      certifierLesPiecesEnAttente(process.env, reussit),
      certifierLesPiecesEnAttente(process.env, reussit),
    ]);
    const certifiees = await db.invoice.findMany({ where: { transactionId: vendue.id } });
    verifier(
      certifiees.every((p) => p.certificationCode?.startsWith("CODE-FUMEE-") && p.certifiedAt),
      `la reprise certifie la facture et l'avoir (${a.certifiees}+${b.certifiees})`,
    );
    verifier(
      a.certifiees + b.certifiees === 2 && recus.length === 2,
      `deux passes simultanées : un seul appel au dispositif par pièce (${recus.length} appel(s))`,
    );
    verifier(
      (await piecesEnAttenteDeCertification()).nombre === 0,
      "plus aucune pièce n'attend",
    );
    const facture = certifiees.find((p) => p.kind === "FACTURE")!;
    verifier(
      recus.some((r) => r.origine === facture.number),
      "l'avoir part à la certification avec le numéro de sa facture",
    );
    verifier(
      (await db.auditLog.count({ where: { action: "facture.certification" } })) >= 2,
      "chaque certification reprise est journalisée",
    );
    const encore = await certifierLesPiecesEnAttente(process.env, reussit);
    const relues = await db.invoice.findMany({ where: { transactionId: vendue.id } });
    const codes = new Map(certifiees.map((p) => [p.id, p.certificationCode]));
    verifier(
      encore.certifiees === 0 && relues.every((p) => p.certificationCode === codes.get(p.id)),
      "une passe de plus ne recertifie rien",
    );
    delete process.env.FACTURATION_TVA;
    process.env.FEDAPAY_ENVIRONMENT = "sandbox";
  }
} catch (erreur) {
  console.error(`\n✗ ${erreur instanceof Error ? erreur.stack : String(erreur)}`);
  echecs.push("exception");
} finally {
  await db.$disconnect();
  await surLAdministration(`DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nChaque vente a sa facture, chaque remboursement son avoir, et rien de réel ne s'émet sans facturation en place.");
