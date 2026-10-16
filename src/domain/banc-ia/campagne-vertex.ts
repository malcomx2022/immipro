/**
 * Autorisation L5 du 12/10 : une seule destination, plafond global en XOF.
 * Décision du 16/10/2026 : le modèle demandé n'est servi sur aucune région
 * simple ; le responsable retient le point multi-région `eu` (traitement
 * garanti dans l'Union, tarif « hors global ») et le raisonnement `low`.
 */
import { z } from "zod";
export const CAMPAGNE_VERTEX = "projetanatt-eu-gemini-3.8-flash";
export const PLAFOND_VERTEX_MICROS_XOF = 5_000_000_000;
export const MODELE_VERTEX_DEMANDE = "google/gemini-3.8-flash";
const entier = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const source = z.url().refine((v) => {
  const u = new URL(v);
  return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash;
});
const schema = z
  .object({
    id: z.literal(CAMPAGNE_VERTEX),
    projet: z.literal("projetanatt"),
    region: z.literal("eu"),
    modele: z.literal(MODELE_VERTEX_DEMANDE),
    plafondXof: z.literal(5000),
    borneVerifiee: z.boolean(),
    referenceBorne: z.string().trim().min(1).nullable(),
    sourceLimites: source,
    sourceTarif: source,
    jetonsEntreeMax: entier.positive().nullable(),
    jetonsSortieFacturesMax: entier.min(4096).nullable(),
    tarifEntreeMicrosDeviseParMillion: entier.nullable(),
    tarifSortieMicrosDeviseParMillion: entier.nullable(),
    deviseTarif: z.enum(["USD", "EUR", "XOF"]),
    conversionMajoreeMicrosXofParUnite: entier.positive().nullable(),
    fraisMajoresMilliemes: entier.min(1000).nullable(),
  })
  .strict();
export type CampagneVertex = z.infer<typeof schema>;
export function lireCampagneVertex(charge: unknown): CampagneVertex {
  const c = schema.parse(charge);
  if (
    !c.borneVerifiee ||
    c.referenceBorne === null ||
    c.jetonsEntreeMax === null ||
    c.jetonsSortieFacturesMax === null ||
    c.tarifEntreeMicrosDeviseParMillion === null ||
    c.tarifSortieMicrosDeviseParMillion === null ||
    c.conversionMajoreeMicrosXofParUnite === null ||
    c.fraisMajoresMilliemes === null
  ) {
    throw new Error(
      "Campagne Vertex bloquée : vérifier modèle, limites facturées, tarifs, change et frais avant tout appel.",
    );
  }
  return c;
}
const divisionSuperieure = (n: bigint, d: bigint) => (n + d - 1n) / d;
/** Deux échanges facturables possibles par invocation (reprise OAuth S.99 après 401). */
export function reservationVertexMicrosXof(c: CampagneVertex): number {
  c = lireCampagneVertex(c);
  const tarifs =
    BigInt(c.jetonsEntreeMax!) * BigInt(c.tarifEntreeMicrosDeviseParMillion!) +
    BigInt(c.jetonsSortieFacturesMax!) * BigInt(c.tarifSortieMicrosDeviseParMillion!);
  const micros = divisionSuperieure(
    tarifs * BigInt(c.conversionMajoreeMicrosXofParUnite!) * BigInt(c.fraisMajoresMilliemes!) * 2n,
    1_000_000n * 1_000_000n * 1000n,
  );
  if (micros > BigInt(PLAFOND_VERTEX_MICROS_XOF))
    throw new Error("La borne d'une invocation dépasse le plafond total de 5 000 XOF.");
  return Number(micros);
}
export function verifierDestinationVertex(config: {
  fournisseur: string;
  base: URL;
  modele: string;
  auth: string;
  email: string;
  pdf: string | null;
  raisonnement: string | null;
}) {
  if (
    config.fournisseur !== "openai_compatible" ||
    config.auth !== "compte_de_service_google" ||
    config.modele !== MODELE_VERTEX_DEMANDE ||
    config.pdf !== "image_url" ||
    config.raisonnement !== "low" ||
    config.email !== "immipro-vertex-ai@projetanatt.iam.gserviceaccount.com" ||
    config.base.protocol !== "https:" ||
    config.base.hostname !== "aiplatform.eu.rep.googleapis.com" ||
    config.base.port ||
    config.base.username ||
    config.base.password ||
    config.base.search ||
    config.base.hash ||
    !/^\/v1(?:beta1)?\/projects\/projetanatt\/locations\/eu\/endpoints\/openapi\/?$/u.test(
      config.base.pathname,
    )
  ) {
    throw new Error(
      "Destination refusée : uniquement Vertex projetanatt sur le point multi-région eu (aiplatform.eu.rep.googleapis.com), modèle demandé, compte immipro-vertex-ai et raisonnement low.",
    );
  }
}
