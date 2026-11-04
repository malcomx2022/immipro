import {
  BORNES_PROFIL,
  CODE_LANGUE,
  normaliserTelephone,
  paysCouvert,
  refusDuTelephone,
} from "@/domain/comptes/profil";
import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { enregistrerLeProfil } from "@/server/acces/profil";
import { ADRESSE_FACTURATION, NOM_FACTURATION } from "@/domain/facturation/facture";

/**
 * Profil — A-05 et C-02, WF-02 étapes 3 et 4.
 *
 * Les réponses du simulateur alimentent le profil à la création : « le
 * candidat ne resaisit rien ». Elles arrivent depuis l'appareil, où le
 * simulateur les avait laissées, puisque rien n'a été écrit côté serveur
 * tant que le visiteur n'avait pas de compte (RG-01.1).
 *
 * Le téléphone est validé par format avant tout paiement Mobile Money
 * (RG-02.3) : le format international est exigé ici, à la saisie, plutôt
 * qu'au moment du paiement où l'échec coûte un parcours entier.
 *
 * L'écriture vit dans `server/acces/profil` : elle effaçait les colonnes
 * qu'on ne lui donnait pas — dont les réponses du simulateur que cet
 * en-tête annonce —, et derrière `next/headers` aucune fumée ne pouvait
 * relire la ligne après coup.
 *
 * ── Durci en S.214 ───────────────────────────────────────────────────
 *
 * Le corps est **strict** : une clé inconnue est refusée, pas ignorée — un
 * client qui enverrait `role` ou `email` apprend qu'ils ne s'écrivent pas
 * ici. Le téléphone suit la règle de « Mon compte » (E.164 et indicatif
 * couvert), le pays la liste des pays couverts, les langues un code ISO à
 * deux lettres et un niveau borné, le budget un plafond. La lecture ne
 * rend que les colonnes affichées : ni l'identifiant interne du profil, ni
 * celui du compte.
 */

export const GET = route({
  nom: "comptes.profil",
  acces: "candidat",
  limite: "lecture",
  async traiter({ acteur }) {
    const user = await db.user.findUnique({
      where: { id: acteur!.id },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        billingName: true,
        billingAddress: true,
        countryCode: true,
        emailVerified: true,
        profile: {
          select: {
            objectif: true,
            highestDegree: true,
            fieldOfStudy: true,
            yearsExperience: true,
            languages: true,
            budgetTotal: true,
            budgetCurrency: true,
            updatedAt: true,
          },
        },
      },
    });
    return {
      compte: {
        email: user?.email,
        prenom: user?.firstName,
        nom: user?.lastName,
        telephone: user?.phone,
        facturationNom: user?.billingName,
        facturationAdresse: user?.billingAddress,
        pays: user?.countryCode,
        emailVerifie: user?.emailVerified !== null,
      },
      profil: user?.profile ?? null,
    };
  },
});

export const PUT = route({
  nom: "comptes.profil.maj",
  acces: "candidat",
  limite: "sensible",
  corps: z
    .object({
      // `min` absent, et volontairement : la chaîne vide est le geste
      // « j'efface ce champ », que `enregistrerLeProfil` distingue d'une
      // absence. La refuser rendrait les champs ineffaçables.
      prenom: z.string().trim().max(BORNES_PROFIL.texte).optional(),
      nom: z.string().trim().max(BORNES_PROFIL.texte).optional(),
      telephone: z
        .string()
        .max(40)
        .transform(normaliserTelephone)
        .superRefine((valeur, ctx) => {
          const refus = refusDuTelephone(valeur);
          if (refus) ctx.addIssue({ code: "custom", message: refus });
        })
        .optional(),
      // Identité de facturation (M.C) : la chaîne vide efface, comme ailleurs.
      facturationNom: z.string().trim().max(NOM_FACTURATION.max).optional(),
      facturationAdresse: z.string().trim().max(ADRESSE_FACTURATION.max).optional(),
      pays: z
        .string()
        .trim()
        .toUpperCase()
        .refine((code) => code === "" || paysCouvert(code), "Choisis ton pays de résidence dans la liste.")
        .optional(),
      objectif: z.string().trim().max(BORNES_PROFIL.texte).optional(),
      diplome: z.string().trim().max(BORNES_PROFIL.texte).optional(),
      domaine: z.string().trim().max(BORNES_PROFIL.domaine).optional(),
      anneesExperience: z.number().int().min(0).max(BORNES_PROFIL.anneesExperience).optional(),
      langues: z
        .record(z.string(), z.string().trim().max(BORNES_PROFIL.niveauDeLangue))
        .superRefine((langues, ctx) => {
          const codes = Object.keys(langues);
          if (codes.some((code) => !CODE_LANGUE.test(code))) {
            ctx.addIssue({ code: "custom", message: "Une langue se note par son code à deux lettres : en, fr, nl." });
          }
          if (codes.length > BORNES_PROFIL.langues) {
            ctx.addIssue({ code: "custom", message: `Au plus ${BORNES_PROFIL.langues} langues.` });
          }
        })
        .optional(),
      budgetTotal: z.number().int().min(0).max(BORNES_PROFIL.budgetMax).optional(),
      budgetDevise: z.enum(["XOF", "EUR"]).optional(),
    })
    .strict(),
  async traiter({ corps, acteur }) {
    await enregistrerLeProfil(acteur!.id, corps);
    return { enregistre: true };
  },
});
