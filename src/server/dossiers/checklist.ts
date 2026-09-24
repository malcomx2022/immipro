import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checklistDepuis } from "@/server/acces/dossiers";
import { dateDePeremption } from "@/server/acces/pieces";
import type { VisaRulesPayload } from "@/domain/rules/schema";
import { conditionsDeLaPiece, evaluerConditions } from "@/domain/dossiers/verification";
import { mesurer } from "@/domain/dossiers/extraction";
import type { ChampsExtraits } from "@/domain/dossiers/verification";

/**
 * Réalignement de la checklist d'un dossier sur sa nouvelle version —
 * WF-11, RG-11.1, INV-3.
 *
 * ── L'écran promettait une ligne que la migration ne posait pas ─────
 *
 * L'arbitrage n'ajoutait que les pièces dont le **code** était inconnu.
 * Une pièce qui survit à la migration gardait donc toutes les propriétés
 * de l'ancienne version : son libellé, son caractère obligatoire, son
 * remède, sa durée de validité.
 *
 * Or l'écran de divergence, lui, annonce comme « ajoutée » toute pièce
 * devenue obligatoire — c'est ce que RG-14.2 lui demande de dire, et
 * c'est ce qui compte pour le candidat. Les deux ne parlaient pas de la
 * même chose. Exécuté avant correction, sur un dossier dont la nouvelle
 * version rend le diplôme obligatoire, périssable et à obtenir par
 * démarche :
 *
 *     l'écran annonce  : ajoutées = [« Diplôme le plus élevé, légalisé »]
 *     le candidat migre
 *     l'arbitrage rend : piècesAjoutées = []
 *     en base          : obligatoire=false  famille=COMPLEMENTAIRE
 *                        remède=TELEVERSER  validité=null
 *                        libellé=« Diplôme »
 *
 * Quatre conséquences, toutes rassurantes : la pièce que la nouvelle
 * règle exige ne bloque pas la complétude, donc le dossier peut être
 * déclaré prêt sans elle ; le bouton dit « Ajouter » pour une démarche à
 * entreprendre ; la pièce ne périme jamais et n'a pas d'échéance « à
 * demander au plus tôt » ; et le libellé décrit une exigence qui n'est
 * plus celle du dossier.
 *
 * C'est le pendant de `remplacementDeLEcheancier`, qui a corrigé le même
 * oubli sur les échéances : migrer accepte la nouvelle version **en
 * entier**, pas seulement les pièces qu'elle invente.
 *
 * ── La pièce que la nouvelle version ne demande plus ────────────────
 *
 * Symétrique du précédent, et aussi silencieux. Une pièce absente de
 * `pieces_requises` n'était ni créée ni réalignée : elle restait
 * `OBLIGATOIRE` et `required`, donc comptée parmi les requises par
 * `computeCompleteness`. Le candidat lisait sur l'écran « ta checklist
 * perd : Diplôme — elle ne se demande plus », migrait, et son dossier
 * restait `ACTIF` pour une pièce que plus personne ne réclame :
 *
 *     l'écran annonce  : retirées = [{ diplome, encoreDemandee: false }]
 *     le candidat migre
 *     en base          : obligatoire=true  famille=OBLIGATOIRE
 *     son dossier      : ACTIF — prêt=false
 *
 * Elle cesse donc de bloquer. La ligne reste, et le fichier déposé avec
 * elle : RG-11.1 protège le travail du candidat, pas l'exigence qui a
 * disparu. Une pièce devenue simplement complémentaire, elle, figure
 * encore dans la nouvelle checklist et se réaligne comme les autres.
 *
 * ── La date de péremption suit la durée, pas l'inverse ──────────────
 *
 * `expiresAt` est calculée **au dépôt**, à partir de la durée de validité
 * d'alors. Migrer vers une version qui raccourcit cette durée la laissait
 * telle quelle, et les deux se contredisaient sur le même écran :
 *
 *     déposé le 2026-04-22, validité 12 mois → péremption 2027-04-22
 *     la v2 ramène la validité à 3 mois
 *     après migration : validité annoncée 3 mois
 *                       péremption        2027-04-22   statut CONFORME
 *                       ce qu'elle vaut   2026-07-22
 *
 * La pièce était périmée depuis deux mois, la plateforme la déclarait
 * conforme, et la passe de péremption ne trouvait rien à déclasser : le
 * dossier pouvait être déclaré prêt sur une pièce que l'autorité
 * refuserait.
 *
 * Elle se recalcule donc depuis la date de dépôt réelle — `uploadedAt` de
 * la dernière version, et non `expiresAt` moins l'ancienne durée : une
 * date se lit, elle ne se déduit pas d'une autre date par soustraction.
 * Si la nouvelle échéance est déjà passée, `declasserLesPiecesEchues` la
 * reprend à sa passe suivante, avec le message actionnable qu'elle sait
 * déjà écrire. Rien à inventer ici.
 *
 * ── Ce qui suit la règle, et ce qui appartient au candidat ──────────
 *
 * Ne se réalignent que les propriétés qui **décrivent l'exigence**, celles
 * que `checklistDepuis` dérive du référentiel : libellé, famille,
 * caractère obligatoire, remède, durée de validité.
 *
 * Rien de ce que le candidat a produit n'est touché — RG-11.1, « on
 * ajoute, on ne retire pas ». `status`, le fichier déposé, l'extraction,
 * le retour d'analyse et `expiresAt` traversent intacts. Une pièce
 * conforme reste conforme : une migration qui renverrait un candidat
 * redéposer ce qu'il a déjà fourni serait une punition pour avoir accepté
 * la nouvelle règle.
 *
 * ── Pourquoi des opérations, et non une écriture ────────────────────
 *
 * Comme pour l'échéancier : la fonction rend ce qu'il faut exécuter.
 * L'arbitrage fige la nouvelle version dans la même transaction, et une
 * coupure entre les deux laisserait un dossier rattaché à une version
 * dont sa checklist ne décrit pas les exigences.
 */
export async function realignementDeLaChecklist(
  applicationId: string,
  p: VisaRulesPayload,
): Promise<{
  operations: Prisma.PrismaPromise<unknown>[];
  ajoutees: string[];
  realignees: string[];
  liberees: string[];
}> {
  const attendues = checklistDepuis(p);
  const existantes = await db.document.findMany({
    where: { applicationId },
    select: {
      code: true, label: true, family: true, required: true, remedy: true,
      validityMonths: true,
      // La date de dépôt réelle, d'où la péremption se recalcule.
      versions: { orderBy: { uploadedAt: "desc" }, take: 1, select: { uploadedAt: true } },
    },
  });
  const connues = new Map(existantes.map((d) => [d.code, d]));

  const aCreer = attendues.filter((piece) => !connues.has(piece.code as string));
  const aRealigner = attendues.filter((piece) => {
    const connue = connues.get(piece.code as string);
    return connue !== undefined && exigenceChangee(connue, piece);
  });

  /*
    Les pièces que la nouvelle version ne nomme plus du tout. Elles
    gardent leur ligne, leur libellé et ce que le candidat y a déposé ;
    elles cessent seulement d'être exigées.
  */
  const attenduesParCode = new Set(attendues.map((p) => p.code as string));
  const aLiberer = existantes.filter(
    (d) => !attenduesParCode.has(d.code) && (d.required || d.family === "OBLIGATOIRE"),
  );

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  if (aCreer.length > 0) {
    operations.push(db.document.createMany({ data: aCreer.map((p) => ({ ...p, applicationId })) }));
  }
  for (const piece of aRealigner) {
    const connue = connues.get(piece.code as string)!;
    const validite = (piece.validityMonths as number | null) ?? null;
    const depose = connue.versions[0]?.uploadedAt ?? null;
    operations.push(
      db.document.update({
        where: { applicationId_code: { applicationId, code: piece.code as string } },
        data: {
          label: piece.label,
          family: piece.family,
          required: piece.required,
          remedy: piece.remedy,
          validityMonths: validite,
          /*
            Seulement si la durée a bougé, et seulement sur une pièce
            réellement déposée : sans version, il n'y a pas de date de
            départ, et une péremption sans dépôt ne veut rien dire.
          */
          ...(validite !== (connue.validityMonths ?? null) && depose !== null
            ? { expiresAt: dateDePeremption(validite, depose) }
            : {}),
        },
      }),
    );
  }

  if (aLiberer.length > 0) {
    operations.push(
      db.document.updateMany({
        where: { applicationId, code: { in: aLiberer.map((d) => d.code) } },
        data: { required: false, family: "COMPLEMENTAIRE" },
      }),
    );
  }

  return {
    operations,
    ajoutees: aCreer.map((p) => p.label as string),
    realignees: aRealigner.map((p) => p.label as string),
    liberees: aLiberer.map((d) => d.label),
  };
}

/** Les cinq propriétés que le référentiel décide, et elles seules. */
type Exigence = Pick<
  Prisma.DocumentCreateWithoutApplicationInput,
  "label" | "family" | "required" | "remedy" | "validityMonths"
>;

const exigenceChangee = (connue: Exigence, attendue: Exigence): boolean =>
  connue.label !== attendue.label ||
  connue.family !== attendue.family ||
  connue.required !== attendue.required ||
  connue.remedy !== attendue.remedy ||
  (connue.validityMonths ?? null) !== (attendue.validityMonths ?? null);

/**
 * Re-jugement des pièces déjà lues, sur les conditions de la nouvelle
 * version — WF-11, RG-11.1.
 *
 * ── Un seuil relevé laissait une pièce conforme ─────────────────────
 *
 * Le réalignement ci-dessus rend à la checklist les **propriétés** de la
 * nouvelle version. Il ne touche pas au verdict des pièces, et l'en-tête
 * de ce module l'assumait : « une pièce conforme reste conforme ». La
 * phrase visait le cas où migrer renverrait redéposer un fichier qui n'a
 * rien — une punition pour avoir accepté la nouvelle règle.
 *
 * Elle laissait passer le cas inverse, qui est celui même de WF-11 : une
 * version qui **relève** un seuil. Exécuté avant correction, sur un
 * dossier dont le passeport court sept mois après la rentrée visée, quand
 * l'IND porte l'exigence de six à douze mois :
 *
 *     avant            : PRET
 *     publication      : SUSPENDU, le candidat est prévenu
 *     il migre
 *     passeport        : CONFORME · lu 2028-04-01
 *     dossier          : PRET · ce qui manque []
 *
 * La plateforme déclare prêt à déposer un dossier que l'autorité
 * refuserait. C'est mot pour mot ce que le bloc « la date de péremption
 * suit la durée » plus haut a corrigé pour la durée de validité : les
 * conditions en sont l'autre moitié.
 *
 * ── Ce que le re-jugement demande au candidat : rien ─────────────────
 *
 * Les faits bruts lus sur la pièce sont en base (`Document.extracted`),
 * la date cible aussi, et le jugement est une fonction pure. Le
 * re-jugement rejoue donc `mesurer` puis `evaluerConditions` — les deux
 * mêmes que le job d'analyse, pour qu'il n'y ait qu'une définition du
 * verdict — sans appel au service de lecture, sans quota débité (INV-6)
 * et sans redemander un fichier. Ce qui change est ce que la plateforme
 * **dit** de la pièce, pas ce que le candidat a fourni.
 *
 * Le mouvement inverse compte autant : une version qui assouplit un seuil
 * relève une pièce déclassée. Migrer accepte la nouvelle version en
 * entier, dans les deux sens.
 *
 * ── Une exigence nouvelle n'est pas un défaut ────────────────────────
 *
 * Une condition que la nouvelle version ajoute porte sur un champ que la
 * lecture n'a jamais cherché : sa clé est absente de `extracted`, et non
 * présente à `null`. La juger rendrait « aucune valeur lisible, 12 mois
 * exigés » sur une pièce qui n'a rien — le défaut que la mise en réserve
 * a été construite pour éviter. Elle passe donc en réserve, avec le geste
 * qui la lèvera.
 */
export async function rejugementDesPieces(
  applicationId: string,
  p: VisaRulesPayload,
  dateCible: Date | null,
): Promise<{
  operations: Prisma.PrismaPromise<unknown>[];
  declassees: string[];
  relevees: string[];
}> {
  const analysees = await db.document.findMany({
    where: { applicationId, analyzedAt: { not: null } },
    select: { code: true, label: true, status: true, extracted: true },
  });
  const repere = dateCible ? dateCible.toISOString().slice(0, 10) : null;
  const remedeAttendu = new Map(
    checklistDepuis(p).map((piece) => [piece.code as string, piece.remedy]),
  );

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  const declassees: string[] = [];
  const relevees: string[] = [];

  for (const piece of analysees) {
    const lues = piece.extracted;
    if (typeof lues !== "object" || lues === null || Array.isArray(lues)) continue;
    const champs = lues as ChampsExtraits;

    const conditions = conditionsDeLaPiece(p.conditions, piece.code);
    if (conditions.length === 0) continue;

    /*
      Les conditions que la lecture n'a jamais cherchées : leur clé est
      absente, et non présente à `null`. C'est la distinction qui sépare
      « pas trouvé sur la pièce » de « jamais demandé », et l'extraction
      la rend fidèlement — elle écrit une clé par champ demandé.
    */
    const jamaisCherchees = conditions
      .filter((condition) => !(condition.code in champs))
      .map((condition) => ({
        code: condition.code,
        manque: "une lecture de ta pièce sur ce point",
        action: GESTE_EXIGENCE_NOUVELLE,
      }));

    const mesures = mesurer(conditions, champs, repere);
    const verdict = evaluerConditions(conditions, mesures.champs, [
      ...mesures.reserves,
      ...jamaisCherchees,
    ]);
    if (verdict.verdict === piece.status) continue;

    if (verdict.verdict === "CONFORME") relevees.push(piece.label);
    else declassees.push(piece.label);

    operations.push(
      db.document.update({
        where: { applicationId_code: { applicationId, code: piece.code } },
        data: {
          status: verdict.verdict,
          feedback: verdict.corps,
          finding: verdict.constat ?? null,
          /*
            Le remède suit l'état réel, comme après une analyse : une pièce
            déjà déposée se **remplace**. Il se lit sur la nouvelle version
            et non sur la ligne d'avant — le réalignement vient de la
            réécrire, et ces opérations passent après lui.
          */
          ...(verdict.verdict === "A_CORRIGER" &&
          verdict.echecs.length > 0 &&
          remedeAttendu.get(piece.code) === "TELEVERSER"
            ? { remedy: "REMPLACER" as const }
            : {}),
        },
      }),
    );
  }

  return { operations, declassees, relevees };
}

/** Le geste qui lève une exigence que la lecture n'a jamais cherchée. */
export const GESTE_EXIGENCE_NOUVELLE =
  "Cette exigence est nouvelle : elle n'a pas été cherchée dans ta pièce. Téléverse-la de nouveau pour qu'elle soit relue sur ce point.";
