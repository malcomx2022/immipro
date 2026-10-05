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
 */
const TELEPHONE = /^\+[1-9]\d{7,14}$/u;

export const GET = route({
  nom: "comptes.profil",
  acces: "candidat",
  limite: "lecture",
  async traiter({ acteur }) {
    const user = await db.user.findUnique({
      where: { id: acteur!.id },
      include: { profile: true },
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
  corps: z.object({
    // `min` absent, et volontairement : la chaîne vide est le geste
    // « j'efface ce champ », que `enregistrerLeProfil` distingue d'une
    // absence. La refuser rendrait les champs ineffaçables.
    prenom: z.string().trim().max(80).optional(),
    nom: z.string().trim().max(80).optional(),
    telephone: z
      .string()
      .regex(
        TELEPHONE,
        "Indicatif pays compris, sans espaces : +229 pour le Bénin, +225 pour la Côte d'Ivoire.",
      )
      .optional(),
    // Identité de facturation (M.C) : la chaîne vide efface, comme ailleurs.
    facturationNom: z.string().trim().max(NOM_FACTURATION.max).optional(),
    facturationAdresse: z.string().trim().max(ADRESSE_FACTURATION.max).optional(),
    pays: z.string().length(2).optional(),
    objectif: z.string().max(80).optional(),
    diplome: z.string().max(80).optional(),
    domaine: z.string().max(120).optional(),
    anneesExperience: z.number().int().min(0).max(60).optional(),
    langues: z.record(z.string(), z.string()).optional(),
    budgetTotal: z.number().int().min(0).optional(),
    budgetDevise: z.enum(["XOF", "EUR"]).optional(),
  }),
  async traiter({ corps, acteur }) {
    await enregistrerLeProfil(acteur!.id, corps);
    return { enregistre: true };
  },
});
