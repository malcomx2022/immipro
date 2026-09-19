import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";

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
    prenom: z.string().trim().max(80).optional(),
    nom: z.string().trim().max(80).optional(),
    telephone: z
      .string()
      .regex(
        TELEPHONE,
        "Indicatif pays compris, sans espaces : +229 pour le Bénin, +225 pour la Côte d'Ivoire.",
      )
      .optional(),
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
    await db.user.update({
      where: { id: acteur!.id },
      data: {
        ...(corps.prenom !== undefined ? { firstName: corps.prenom } : {}),
        ...(corps.nom !== undefined ? { lastName: corps.nom } : {}),
        ...(corps.telephone !== undefined ? { phone: corps.telephone } : {}),
        ...(corps.pays !== undefined ? { countryCode: corps.pays } : {}),
      },
    });

    const donneesProfil = {
      objectif: corps.objectif ?? null,
      highestDegree: corps.diplome ?? null,
      fieldOfStudy: corps.domaine ?? null,
      yearsExperience: corps.anneesExperience ?? null,
      languages: (corps.langues ?? null) as never,
      budgetTotal: corps.budgetTotal ?? null,
      budgetCurrency: corps.budgetDevise ?? null,
    };

    await db.profile.upsert({
      where: { userId: acteur!.id },
      create: { userId: acteur!.id, ...donneesProfil },
      update: donneesProfil,
    });

    return { enregistre: true };
  },
});
