import type { Application, Document, Prisma, VisaRule } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { appliquerLaCouverture } from "@/server/acces/couverture";
import { codesConformes, conditionsEvaluees } from "@/domain/completeness/conditions";
import { DOSSIERS_MAX } from "@/domain/dossiers/dossier";
import { PURGE_JOURS } from "@/domain/dossiers/cloture";
import { computeCompleteness } from "@/domain/completeness/score";
import { ETATS_FIGES, ETATS_OUVERTS, miseEnEtat } from "@/domain/dossiers/etat";
import { payload, reglePubliee } from "./regles";
import type { VisaRulesPayload } from "@/domain/rules/schema";

/**
 * Accès aux dossiers.
 *
 * Deux règles tiennent ce module :
 *
 * **L'appartenance est dans la requête, pas dans une vérification qui
 * suit.** `where: { id, userId }` ne peut pas s'oublier, là où un `if
 * (dossier.userId !== acteur.id)` écrit après coup s'oublie très bien.
 *
 * **Un dossier qui n'est pas le sien est introuvable, pas interdit.**
 * Répondre « interdit » confirme qu'il existe ; sur des identifiants
 * énumérables cela dresse la liste des dossiers ouverts. La réponse est donc
 * la même que pour un identifiant inventé.
 */

export async function dossierDuCandidat(id: string, userId: string): Promise<Application> {
  const dossier = await db.application.findFirst({ where: { id, userId } });
  if (!dossier) throw echec("introuvable");
  return dossier;
}

/**
 * Le dossier et la **version de règle qu'il a figée** — INV-3.
 *
 * La lecture passe par ici et non par la route, comme toute interrogation
 * du référentiel (INV-4, et un test le vérifie en relisant les routes). La
 * version figée n'est pas filtrée par `filtrePourCandidat` : elle peut
 * avoir été remplacée depuis, et c'est précisément ce qu'INV-3 garantit —
 * une évolution réglementaire ne casse pas une checklist en cours. La
 * filtrer rendrait invisible la règle du dossier le jour où une version
 * suivante paraît.
 */
export async function dossierAvecSaRegle(
  id: string,
  userId: string,
): Promise<Application & { visaRule: VisaRule | null }> {
  const dossier = await db.application.findFirst({
    where: { id, userId },
    include: { visaRule: true },
  });
  if (!dossier) throw echec("introuvable");
  return dossier;
}

export async function dossierAvecPieces(
  id: string,
  userId: string,
): Promise<Application & { documents: Document[]; visaRule: { rules: unknown } | null }> {
  /*
    La règle **figée** vient avec le dossier, et sans le filtre candidat :
    INV-3 la lui garde même archivée ou retirée de la vitrine. Elle porte
    les conditions déterministes, sans lesquelles un écran conclut
    « complet » sur un dossier que le serveur refuse de déclarer prêt.

    Elle est lue ici, dans le module d'accès, et non depuis la route :
    INV-4 veut que le référentiel ne soit interrogé que d'ici, et un test
    d'architecture le vérifie sur le source des routes.
  */
  const dossier = await db.application.findFirst({
    where: { id, userId },
    include: {
      documents: { orderBy: [{ family: "asc" }, { createdAt: "asc" }] },
      visaRule: { select: { rules: true } },
    },
  });
  if (!dossier) throw echec("introuvable");
  return dossier;
}

/** Un dossier déposé ou clôturé garde l'état qu'il avait ce jour-là. */
const FIGES: readonly Application["status"][] = ETATS_FIGES;

export function exigerModifiable(dossier: Application): void {
  if (FIGES.includes(dossier.status)) throw echec("dossier_fige");
}

/**
 * Ouverture d'un dossier — WF-04.
 *
 * `visaRuleId` fige la version en vigueur au moment de l'ouverture (INV-3).
 * C'est la seule écriture de ce champ : une évolution réglementaire crée une
 * `RuleMigration` à arbitrer, elle ne réécrit jamais ce pointeur. Une
 * contrainte de la base refuse d'ailleurs un dossier actif sans version
 * figée.
 *
 * La checklist et l'échéancier sont dérivés du payload au même instant, pour
 * que les trois soient cohérents entre eux : une checklist construite plus
 * tard pourrait l'être depuis une autre version.
 */
export async function ouvrirDossier(
  userId: string,
  visaRuleId: string,
  dateCible: Date | null,
): Promise<Application> {
  const regle = await reglePubliee(visaRuleId);
  if (!regle) throw echec("regle_indisponible");
  const p = payload(regle);

  /*
    Le plafond de C-01, décompté et tenu dans la même transaction — RF-1,
    FON-01, 09/10/2026.

    Le décompte et la création étaient deux requêtes. Huit demandes
    simultanées d'un candidat à qui il restait une place lisaient toutes
    « deux ouverts », et toutes créaient : exécuté avant correction, cinq
    candidats finissaient avec dix dossiers ouverts chacun. Un double clic
    répété ou deux onglets suffisent.

    Un verrou consultatif de transaction, par candidat, comme celui du
    grand livre : il sérialise les ouvertures d'un même candidat, et rien
    d'autre. Le décompte lit la liste partagée avec l'écran
    (`ETATS_OUVERTS`), pause comprise.
  */
  const dossier = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ouverture-dossier:${userId}`}, 0))`;
    const ouverts = await tx.application.count({
      where: { userId, status: { in: [...ETATS_OUVERTS] } },
    });
    if (ouverts >= DOSSIERS_MAX) throw echec("dossiers_au_maximum");

    return tx.application.create({
      data: {
        userId,
        visaRuleId: regle.id,
        status: "BROUILLON",
        targetDate: dateCible,
        documents: { create: checklistDepuis(p) },
        deadlines: dateCible ? { create: echeancesDepuis(p, dateCible) } : undefined,
      },
    });
  });

  /*
    Un pack déjà payé peut couvrir plusieurs destinations — Pro en annonce
    trois. Le dossier qu'on vient d'ouvrir en est peut-être une, et la
    couverture s'applique ici plutôt qu'à l'achat : au moment du paiement,
    ce dossier n'existait pas.

    Hors de la création : un octroi de quota ne doit pas pouvoir faire
    échouer l'ouverture d'un dossier, qui ne dépend d'aucun achat.
  */
  await appliquerLaCouverture(userId).catch(() => undefined);
  return dossier;
}

/**
 * Checklist dérivée de `pieces_requises`.
 *
 * Le remède **et la durée de validité** viennent du référentiel, où ils sont
 * des propriétés de l'exigence. Les déduire du code par motif, comme deux
 * versions successives le faisaient, se trompait sur les cas qui comptent :
 * « visite_medicale » devenait un téléversement, et la ligne aurait proposé
 * d'ajouter un fichier pour un rendez-vous à prendre ; renommer
 * « preuve_fonds » faisait disparaître son échéance de péremption.
 *
 * Il ne reste ici aucune connaissance réglementaire : cette fonction met en
 * forme ce que le référentiel dit, et rien d'autre.
 */
export function checklistDepuis(p: VisaRulesPayload): Prisma.DocumentCreateWithoutApplicationInput[] {
  return p.pieces_requises.map((piece) => ({
    code: piece.code,
    label: piece.libelle,
    family: piece.obligatoire ? ("OBLIGATOIRE" as const) : ("COMPLEMENTAIRE" as const),
    required: piece.obligatoire,
    remedy: remedeDe(piece.nature),
    status: "ATTENDUE" as const,
    validityMonths: piece.validite_mois ?? null,
  }));
}

const REMEDES = {
  televerser: "TELEVERSER",
  rediger: "REDIGER",
  demarche: "DEMARCHE",
} as const;

export const remedeDe = (nature: keyof typeof REMEDES): (typeof REMEDES)[keyof typeof REMEDES] =>
  REMEDES[nature];

/**
 * Échéancier à rebours — WF-09, RG-09.1.
 *
 * Les délais viennent du référentiel, jamais d'une estimation codée en dur.
 * Une pièce sans `delai_obtention_jours` n'engendre pas d'échéance : une
 * date inventée serait pire que pas de date, puisqu'on la croirait.
 */
export function echeancesDepuis(
  p: VisaRulesPayload,
  dateCible: Date,
): Prisma.DeadlineCreateWithoutApplicationInput[] {
  const echeances: Prisma.DeadlineCreateWithoutApplicationInput[] = [];
  const traitement = p.delai_traitement_jours?.max ?? null;

  if (traitement !== null) {
    echeances.push({
      code: "depot",
      label: "Dépôt de la demande",
      dueAt: enRetirant(dateCible, traitement),
    });
  }

  const depot = traitement === null ? dateCible : enRetirant(dateCible, traitement);
  for (const piece of p.pieces_requises) {
    if (!piece.delai_obtention_jours) continue;
    echeances.push({
      code: piece.code,
      label: `À demander : ${piece.libelle}`,
      dueAt: enRetirant(depot, piece.delai_obtention_jours),
    });
  }
  return echeances.sort((a, b) => (a.dueAt as Date).getTime() - (b.dueAt as Date).getTime());
}

const enRetirant = (date: Date, jours: number): Date =>
  new Date(date.getTime() - jours * 24 * 60 * 60 * 1000);

/**
 * Recalcul de la complétude — WF-07.
 *
 * Le passage en `PRET` est calculé et jamais déclaré (RG-07.2) : c'est cette
 * fonction qui pose `readyAt`, et c'est elle aussi qui le retire quand une
 * pièce régresse — une péremption fait redescendre un dossier de `PRET` à
 * `ACTIF` (RG-07.4). Un dossier déjà déposé ne bouge plus.
 */
export async function recalculerCompletude(applicationId: string): Promise<void> {
  const dossier = await db.application.findUnique({
    where: { id: applicationId },
    include: { documents: true, visaRule: true },
  });
  if (!dossier || FIGES.includes(dossier.status)) return;

  /*
    Les conditions déterministes sont évaluées par l'analyse de pièce et
    reportées sur le document correspondant : ici, une condition est tenue
    dès que **la pièce qui la porte** est conforme.

    Laquelle, c'est le référentiel qui le dit (`condition.piece`). Ce
    fichier la cherchait par comparaison de préfixes de codes, selon une
    règle différente de celle du job d'analyse — deux réponses possibles à
    la même question. Sur la procédure kennismigrant, les deux se
    trompaient : aucune des cinq conditions ne trouvait de pièce, toutes
    se lisaient « non satisfaites », et le dossier ne pouvait jamais
    devenir prêt quoi que le candidat dépose.

    Une condition facultative **sans pièce** ne se juge pas ici : elle ne
    s'établit par aucun dépôt — une carence de travail après l'arrivée,
    une progression de crédits signalée en cours d'année — et ne pèse pas
    sur ce que le candidat peut faire aujourd'hui.

    Une **bloquante** sans pièce, elle, reste comptée non satisfaite.
    C'est la réponse prudente, et elle ne devrait plus se produire : la
    publication d'une règle la refuse désormais. Elle ne subsiste que sur
    une règle figée avant cette garde, et l'écarter reviendrait à
    déclarer un dossier prêt sur une exigence que personne n'a vérifiée.
  */
  const conditions = conditionsEvaluees(
    dossier.visaRule?.rules,
    codesConformes(dossier.documents),
  );

  const resultat = computeCompleteness({
    documents: dossier.documents.map((d) => ({
      code: d.code,
      libelle: d.label,
      required: d.required,
      status: d.status,
    })),
    conditions,
    coherence: 0,
    redaction: 0,
  });

  const passeEnPret = resultat.ready && dossier.status === "ACTIF";
  const redescend = !resultat.ready && dossier.status === "PRET";

  /*
    `readyAt` suit **l'état**, pas le score — correctif du 22/09/2026,
    trouvé en exécutant la chaîne d'extraction.

    Elle se posait dès que le calcul rendait `ready`, y compris quand la
    transition n'avait pas lieu : seul un dossier `ACTIF` passe à `PRET`,
    et un dossier `BROUILLON` ou `SUSPENDU` gardait donc son état en
    recevant une date. La base refuse cette ligne — la garde dit
    `("status" = 'PRET') = ("readyAt" IS NOT NULL)` —, et c'est toute la
    mise à jour qui échouait, donc l'analyse qui l'appelle : un verdict
    écrit, un quota débité, et le job rejoué par la file sur une pièce
    déjà analysée. Une garde de cohérence transformée en panne, sur le
    chemin le plus fréquenté du produit.

    Le cas se produit pour de bon : un dossier suspendu pour divergence
    réglementaire n'est pas figé, et sa dernière pièce s'analyse.

    Le correctif vivait ici, et ici seulement : six autres écritures
    changeaient `status` sans poser la date. La règle est passée dans
    `domain/dossiers/etat.ts`, et elles y passent toutes.
  */
  const statutApres = passeEnPret ? "PRET" : redescend ? "ACTIF" : dossier.status;

  await db.application.update({
    where: { id: applicationId },
    data: {
      internalScore: resultat.interne.score,
      ...miseEnEtat(statutApres, dossier),
    },
  });
}

/**
 * Clôture — WF-10. La date de purge est annoncée à l'avance, parce qu'elle
 * est présentée comme une garantie et non subie comme une perte (RG-10.2).
 *
 * `PURGE_JOURS` vient du domaine, qui est aussi ce que l'écran C-11 écrit au
 * candidat. Une variable d'environnement aurait pu s'écarter de la phrase
 * affichée sans que rien ne le signale : un engagement de rétention n'est
 * pas un réglage.
 */
export const dateDePurge = (cloture: Date): Date =>
  new Date(cloture.getTime() + PURGE_JOURS * 24 * 60 * 60 * 1000);
