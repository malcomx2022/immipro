/** Un manifeste d'essai décrit un candidat ; il n'autorise jamais les pièces réelles. */
import { z } from "zod";
const texte = z.string().trim().min(1);
const adresse = texte.refine((v) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash;
  } catch {
    return false;
  }
}, "URL https sans identifiant ni paramètres requise");
const schema = z
  .object({
    societe: texte,
    regionDeclaree: texte,
    modele: texte,
    dateVerification: z.iso.date(),
    sourceModele: adresse,
    sourceTarif: adresse,
    maxAppels: z.number().int().positive().max(1000),
    budgetCompte: texte,
    autorisationEssaiSynthetique: z.literal(true),
    dpa: z.enum(["NON_VERIFIE", "VALIDE"]),
    residence: z.enum(["NON_VERIFIE", "VALIDEE"]),
    conservation: z.enum(["NON_VERIFIE", "VALIDEE"]),
  })
  .strict();
export function lireManifeste(charge: unknown, modele: string, appelsPrevus: number) {
  const m = schema.parse(charge);
  if (m.modele !== modele) throw new Error("Le modèle du manifeste diffère de la configuration.");
  if (appelsPrevus > m.maxAppels)
    throw new Error("Le passage dépasse le maximum d'appels autorisé dans le manifeste.");
  // Une date sans fuseau peut déjà être celle du lendemain UTC (jusqu’à UTC+14).
  if (m.dateVerification > new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10))
    throw new Error("La date de vérification est future.");
  return m;
}
