import type { Application, Document, Prisma, VisaRule } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { DOSSIERS_MAX } from "@/domain/dossiers/dossier";
import { PURGE_JOURS } from "@/domain/dossiers/cloture";
import { computeCompleteness } from "@/domain/completeness/score";
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
): Promise<Application & { documents: Document[] }> {
  const dossier = await db.application.findFirst({
    where: { id, userId },
    include: { documents: { orderBy: [{ family: "asc" }, { createdAt: "asc" }] } },
  });
  if (!dossier) throw echec("introuvable");
  return dossier;
}

/** Un dossier déposé ou clôturé garde l'état qu'il avait ce jour-là. */
const FIGES: readonly Application["status"][] = [
  "SOUMIS",
  "ISSUE_DECLAREE",
  "ARCHIVE",
  "ABANDONNE",
];

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
  const ouverts = await db.application.count({
    where: { userId, status: { in: ["BROUILLON", "ACTIF", "PRET"] } },
  });
  if (ouverts >= DOSSIERS_MAX) throw echec("dossiers_au_maximum");

  const regle = await reglePubliee(visaRuleId);
  if (!regle) throw echec("regle_indisponible");
  const p = payload(regle);

  return db.application.create({
    data: {
      userId,
      visaRuleId: regle.id,
      status: "BROUILLON",
      targetDate: dateCible,
      documents: { create: checklistDepuis(p) },
      deadlines: dateCible ? { create: echeancesDepuis(p, dateCible) } : undefined,
    },
  });
}

/**
 * Checklist dérivée de `pieces_requises`.
 *
 * Le remède vient du référentiel, où il est une propriété de l'exigence. Le
 * déduire du code par motif, comme une première version le faisait, se
 * trompait sur les cas qui comptent : « visite_medicale » devenait un
 * téléversement, et la ligne aurait proposé d'ajouter un fichier pour un
 * rendez-vous à prendre.
 */
export function checklistDepuis(p: VisaRulesPayload): Prisma.DocumentCreateWithoutApplicationInput[] {
  return p.pieces_requises.map((piece) => ({
    code: piece.code,
    label: piece.libelle,
    family: piece.obligatoire ? ("OBLIGATOIRE" as const) : ("COMPLEMENTAIRE" as const),
    required: piece.obligatoire,
    remedy: remedeDe(piece.nature),
    status: "ATTENDUE" as const,
    validityMonths: validiteDe(piece.code),
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
 * RG-06.6 : pièces à durée de validité limitée, en mois.
 *
 * Elle reste déduite du code, faute d'être dans le référentiel — et c'est un
 * pis-aller assumé. Une durée de validité est une donnée réglementaire : elle
 * varie d'un pays à l'autre, et un relevé de trois mois ici peut en valoir
 * six ailleurs. Elle a sa place dans `pieces_requises`, avec sa source, le
 * jour où les fiches seront reprises.
 */
const PERISSABLES: readonly [RegExp, number][] = [
  [/releve|bancaire|ressources|fonds/iu, 3],
  [/casier|judiciaire/iu, 3],
  [/medical|sante/iu, 6],
];

export const validiteDe = (code: string): number | null =>
  PERISSABLES.find(([motif]) => motif.test(code))?.[1] ?? null;

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

  const conditions = dossier.visaRule
    ? payload(dossier.visaRule).conditions.map((c) => ({
        code: c.code,
        bloquant: c.bloquant,
        // Les conditions déterministes sont évaluées par l'analyse de pièce
        // et reportées sur le document correspondant : ici, une condition
        // est tenue dès que la pièce qui la porte est conforme.
        satisfaite: conditionTenue(c.code, dossier.documents),
        messageEchec: c.message_echec,
      }))
    : [];

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

  await db.application.update({
    where: { id: applicationId },
    data: {
      internalScore: resultat.interne.score,
      readyAt: resultat.ready ? (dossier.readyAt ?? new Date()) : null,
      ...(passeEnPret ? { status: "PRET" as const } : {}),
      ...(redescend ? { status: "ACTIF" as const } : {}),
    },
  });
}

const conditionTenue = (code: string, documents: readonly Document[]): boolean => {
  const porteuse = documents.find((d) => code.startsWith(d.code) || d.code.startsWith(code));
  return porteuse ? porteuse.status === "CONFORME" : false;
};

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
