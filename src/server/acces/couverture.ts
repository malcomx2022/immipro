import { db } from "@/lib/db";
import { analysesParDestination, getPack } from "@/domain/payments/pricing";
import { ouvrirDuQuota } from "@/server/acces/quota";

/**
 * Couverture d'un pack sur plusieurs destinations — RG-03.1, INV-6.
 *
 * ── Ce que le pack annonçait et ne donnait pas ──────────────────────
 *
 * `Pack.destinations` était déclaré sur les trois packs — Essentiel 1,
 * Dossier 1, Pro 3 — et lu par aucun code. Un achat ouvrait ses analyses
 * sur le seul `applicationId` porté par la transaction. Exécuté avant
 * correction, après l'achat d'un Pro à 45 000 XOF dont le badge annonce
 * « Trois destinations comparées en parallèle » :
 *
 *     dossier 1 : 90 analyses
 *     dossier 2 : 0
 *     dossier 3 : 0
 *     destinations réellement couvertes : 1 sur 3
 *
 * Le candidat payait pour trois destinations et n'en recevait qu'une de
 * servie. Ce que la couverture distribue, ce sont les analyses : 90 = 3 × 30,
 * donc une destination de Pro ouvre exactement ce qu'ouvre un pack Dossier.
 * Le prix, lui, n'est pas une simple multiplication — Pro est remisé en
 * euros —, et il ne sert donc pas à fixer la part.
 *
 * ── Elle se déduit, elle ne se stocke pas ───────────────────────────
 *
 * Le grand livre `AnalysisCredit` porte déjà `transactionId`. Les
 * destinations qu'un achat a couvertes, ce sont les dossiers distincts
 * qu'il a crédités — rien à mémoriser, rien à tenir à jour, rien qui
 * puisse diverger. C'est le choix qu'avait fait le solde, et pour la même
 * raison : une valeur stockée se désynchronise, une somme ne peut pas.
 *
 * ── Quand la couverture s'applique ──────────────────────────────────
 *
 * Deux moments, et seulement deux : la confirmation du paiement, qui sert
 * d'abord le dossier visé par l'achat, puis chaque **ouverture** de
 * dossier. Le rattrapage sur les dossiers déjà ouverts se fait dans le
 * même geste, du plus ancien au plus récent : un candidat qui avait deux
 * dossiers ouverts avant d'acheter doit être servi sur les deux, sans
 * quoi le défaut corrigé ici reparaîtrait sous une forme plus étroite.
 *
 * Un dossier qui porte **déjà** un octroi n'en consomme pas un second :
 * la couverture va aux dossiers que rien ne sert. Acheter un second pack
 * pour un dossier déjà servi reste possible — c'est le cas banal du quota
 * épuisé —, mais cela passe par `applicationId` de la transaction, qui
 * est toujours honoré.
 */
export interface Couverture {
  /** Dossiers nouvellement crédités par cette application. */
  servis: string[];
  /** Analyses ouvertes sur chacun. */
  analyses: number;
}

const SANS_EFFET: Couverture = { servis: [], analyses: 0 };

/**
 * Les destinations qu'un achat a déjà servies : les dossiers distincts
 * qu'il a crédités.
 *
 * Extraite pour que l'écran de confirmation la lise **sans la
 * recalculer**. Deux dérivations de la même mesure finissent par
 * diverger, et celle-ci décide à la fois ce qui s'ouvre et ce qu'on
 * annonce au candidat — les voir se contredire serait pire que les deux
 * défauts qu'elles corrigent séparément.
 */
export async function destinationsServies(transactionId: string): Promise<string[]> {
  const lignes = await db.analysisCredit.findMany({
    where: { transactionId, delta: { gt: 0 } },
    select: { applicationId: true },
    distinct: ["applicationId"],
  });
  return lignes.map((l) => l.applicationId);
}

/**
 * Applique la couverture restante des packs confirmés d'un candidat.
 *
 * `prioritaire` est le dossier visé par l'achat qui déclenche l'appel : il
 * passe avant les autres, et il est servi même s'il porte déjà un octroi —
 * c'est le sens d'un second pack acheté pour un dossier dont le quota est
 * épuisé.
 */
export async function appliquerLaCouverture(
  userId: string,
  prioritaire?: { applicationId: string; transactionId: string },
): Promise<Couverture> {
  const achats = await db.transaction.findMany({
    /*
      Un achat dont le remboursement est décidé ne couvre plus rien —
      RG-15.2. Un Pro remboursé au prorata compte ses destinations non
      ouvertes parmi les analyses restantes, donc rendues : les ouvrir
      ensuite rendrait l'argent et le service à la fois.
    */
    where: { userId, status: "CONFIRMEE", applicationId: { not: null }, refundDueAt: null },
    select: { id: true, packCode: true, applicationId: true },
    orderBy: { createdAt: "asc" },
  });
  if (achats.length === 0) return SANS_EFFET;

  const servis: string[] = [];
  let analyses = 0;

  for (const achat of achats) {
    const pack = getPack(achat.packCode);
    if (!pack) continue;

    const dejaCouverts = await destinationsServies(achat.id);
    let restantes = pack.destinations - dejaCouverts.length;
    if (restantes <= 0) continue;

    const part = analysesParDestination(pack);
    if (part <= 0) continue;

    const cibles: string[] = [];
    /*
      Le dossier visé par l'achat d'abord, et sans condition : c'est celui
      que le candidat a désigné en payant.
    */
    if (
      prioritaire?.transactionId === achat.id &&
      !dejaCouverts.includes(prioritaire.applicationId)
    ) {
      cibles.push(prioritaire.applicationId);
    }

    if (restantes - cibles.length > 0) {
      const aServir = await db.application.findMany({
        where: {
          userId,
          status: { in: ["BROUILLON", "ACTIF", "PRET"] },
          id: { notIn: [...cibles, ...dejaCouverts] },
          // Un dossier que rien ne sert. Celui qui porte déjà des analyses
          // a sa couverture ; lui en donner une seconde retirerait une
          // destination à un dossier qui n'en a aucune.
          credits: { none: { delta: { gt: 0 } } },
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: restantes - cibles.length,
      });
      cibles.push(...aServir.map((a) => a.id));
    }

    for (const applicationId of cibles) {
      await ouvrirDuQuota({
        applicationId,
        analyses: part,
        motif: "ACHAT_PACK",
        transactionId: achat.id,
        note: `Pack ${pack.libelle} — destination ${pack.destinations - restantes + 1} sur ${pack.destinations}`,
      });
      restantes -= 1;
      servis.push(applicationId);
      analyses = part;
    }
  }

  return servis.length > 0 ? { servis, analyses } : SANS_EFFET;
}
