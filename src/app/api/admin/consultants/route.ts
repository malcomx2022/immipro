import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { consultantsAdministres, destinationsOuvertes } from "@/server/lecture/backoffice";
import { motifDeRefusDuTitre, TITRE_MINIMUM } from "@/domain/backoffice/consultants";

/**
 * Consultants — B-09, WF-15 et RG-12.1.
 *
 * `Accreditation` n'avait aucun écrivain : l'annuaire candidat filtre sur
 * les habilitations non révoquées, rien n'en créait, et il était donc vide
 * pour toutes les destinations. Ce sont ces routes-là qui manquaient.
 *
 * ── Qui vérifie, et ce qui en reste ────────────────────────────────────
 *
 * `verifiedBy` est l'administrateur connecté, jamais une saisie : un nom
 * tapé dans un champ peut être celui de n'importe qui, et c'est justement
 * cette ligne qu'on relira si une habilitation est contestée. Même raison
 * qu'au journal d'audit, où l'acteur vient de la session (R.4).
 *
 * Le motif est obligatoire sur chaque geste, comme en B-03 : « habilité le
 * 12 » ne répond à rien, « vérifié au registre du CRCIC, n° R512345 »
 * répond.
 *
 * Un retrait **date** l'habilitation, il ne la supprime pas. La preuve de
 * diligence de RG-12.4 vaut aussi à l'envers : savoir qu'on a habilité
 * quelqu'un, puis retiré, et quand.
 */
export const GET = route({
  nom: "admin.consultants",
  acces: "admin",
  limite: "lecture",
  async traiter() {
    const [consultants, destinations] = await Promise.all([
      consultantsAdministres(),
      destinationsOuvertes(),
    ]);
    return { consultants, destinations };
  },
});

const langues = z.array(z.string().trim().min(2)).min(1);

/**
 * Le nom de l'action est écrit en toutes lettres, pas composé.
 *
 * `` `consultant.${geste}` `` produisait les bonnes chaînes et rendait la
 * table d'actions auditées illisible : un test du dépôt vérifie que toute
 * action déclarée a un appelant, et une action composée n'en a jamais.
 * C'est la garde qui a raison — une action déclarée sans appelant est
 * exactement la façon dont les déclarations mortes s'accumulent.
 */
const ACTION_DU_GESTE = {
  habiliter: "consultant.habiliter",
  retirer: "consultant.retirer",
  suspendre: "consultant.suspendre",
  retablir: "consultant.retablir",
} as const;

export const POST = route({
  nom: "admin.consultants.creation",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    nom: z.string().trim().min(2).max(120),
    cabinet: z.string().trim().min(2).max(160),
    ville: z.string().trim().min(2).max(120),
    qualification: z.string().trim().min(2).max(200),
    langues,
    delaiReponseHeures: z.number().int().positive().max(24 * 14),
    motif: z.string().trim().min(3).max(500),
  }),
  async traiter({ corps, acteur }) {
    const cree = await db.consultant.create({
      data: {
        name: corps.nom,
        firm: corps.cabinet,
        city: corps.ville,
        qualification: corps.qualification,
        languages: corps.langues,
        responseHours: corps.delaiReponseHeures,
      },
      select: { id: true },
    });

    await journaliser({
      acteurId: acteur!.id,
      action: "consultant.creation",
      cible: `consultant:${cree.id}`,
      motif: corps.motif,
    });

    /*
      Créé sans habilitation, et donc invisible : RG-12.1 ne référence un
      consultant qu'après vérification, destination par destination. La
      fiche existe, l'annuaire ne la sert pas encore, et l'écran le dit.
    */
    return { id: cree.id, visible: false };
  },
});

/**
 * Les quatre gestes, sur une seule route.
 *
 * `discriminatedUnion` plutôt que quatre champs optionnels : le type
 * refuse un retrait sans habilitation ciblée, et une habilitation sans
 * titre, avant que le traitement ne commence (idiome de B-02).
 */
export const PUT = route({
  nom: "admin.consultants.habilitation",
  acces: "admin",
  limite: "sensible",
  corps: z.discriminatedUnion("geste", [
    z.object({
      geste: z.literal("habiliter"),
      consultantId: z.guid(),
      countryCode: z.string().length(2).toUpperCase(),
      titre: z.string().trim().min(TITRE_MINIMUM).max(200),
      motif: z.string().trim().min(3).max(500),
    }),
    z.object({
      geste: z.literal("retirer"),
      consultantId: z.guid(),
      countryCode: z.string().length(2).toUpperCase(),
      motif: z.string().trim().min(3).max(500),
    }),
    z.object({
      geste: z.enum(["suspendre", "retablir"]),
      consultantId: z.guid(),
      motif: z.string().trim().min(3).max(500),
    }),
  ]),
  async traiter({ corps, acteur }) {
    const consultant = await db.consultant.findUnique({
      where: { id: corps.consultantId },
      select: { id: true, name: true },
    });
    if (!consultant) throw echec("introuvable");

    /*
      Les refus se prononcent **avant** l'écriture au journal.

      Le journal disait le contraire : un retrait refusé — l'habilitation
      avait déjà été retirée, l'écran était périmé — y laissait quand même
      une ligne `consultant.retirer`, et deux retraits s'y lisaient là où
      un seul avait eu lieu. Or c'est cette ligne-là qu'on relit quand une
      habilitation est contestée, et elle doit dire ce qui s'est produit.

      L'ordre reste « journal d'abord, écriture ensuite » pour l'acte qui
      va avoir lieu : c'est ce qui protège la trace si l'écriture échoue.
    */
    const enCours =
      corps.geste === "retirer"
        ? await db.accreditation.count({
            where: {
              consultantId: consultant.id,
              countryCode: corps.countryCode,
              revokedAt: null,
            },
          })
        : 1;
    if (enCours === 0) {
      throw echec("etat_incompatible", {
        corps: "Ce consultant n'a pas d'habilitation en cours sur cette destination.",
      });
    }

    if (corps.geste === "habiliter") {
      const refus = motifDeRefusDuTitre(corps.titre);
      if (refus) throw echec("champs_invalides", { corps: refus });
    }

    await journaliser({
      acteurId: acteur!.id,
      action: ACTION_DU_GESTE[corps.geste],
      cible: `consultant:${consultant.id}`,
      motif: corps.motif,
      ...("countryCode" in corps ? { details: { destination: corps.countryCode } } : {}),
    });

    if (corps.geste === "habiliter") {

      /*
        Réhabiliter quelqu'un dont l'habilitation avait été retirée relève
        la même ligne — la contrainte d'unicité porte sur le couple
        consultant / destination — et efface la date de retrait en
        réécrivant la vérification. La trace du retrait vit au journal,
        qui lui n'écrase rien.
      */
      await db.accreditation.upsert({
        where: {
          consultantId_countryCode: {
            consultantId: consultant.id,
            countryCode: corps.countryCode,
          },
        },
        create: {
          consultantId: consultant.id,
          countryCode: corps.countryCode,
          title: corps.titre,
          verifiedAt: new Date(),
          verifiedBy: acteur!.id,
        },
        update: {
          title: corps.titre,
          verifiedAt: new Date(),
          verifiedBy: acteur!.id,
          revokedAt: null,
        },
      });
      return { geste: corps.geste, destination: corps.countryCode };
    }

    if (corps.geste === "retirer") {
      await db.accreditation.updateMany({
        where: {
          consultantId: consultant.id,
          countryCode: corps.countryCode,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      return { geste: corps.geste, destination: corps.countryCode };
    }

    await db.consultant.update({
      where: { id: consultant.id },
      data: { active: corps.geste === "retablir" },
    });
    return { geste: corps.geste };
  },
});
