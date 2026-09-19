import { route } from "@/server/http/route";
import {
  PACKS,
  RECHARGE_ANALYSES,
  CONSULTATION,
  MONTANT_MINIMUM_XOF,
  deviseParDefaut,
  versClient,
} from "@/domain/payments/pricing";

/**
 * Grille tarifaire — $-01.
 *
 * `versClient` retire `tokensIA` : le quota en jetons est une donnée
 * d'exploitation, lue par le back-office pour l'alerte de marge (B-07), et
 * le candidat compte des analyses. C'est le type qui le garantit, pas une
 * relecture — `PackPublic` n'a pas de champ où le jeton pourrait atterrir.
 *
 * La devise par défaut suit le pays du compte quand il y en a un, et reste
 * basculable à la main : un candidat béninois qui paie depuis l'Europe
 * choisit lui-même.
 */
export const GET = route({
  nom: "packs",
  acces: "public",
  limite: "lecture",
  cachePublicSecondes: 300,
  async traiter({ acteur }) {
    const pays = acteur
      ? (await import("@/lib/db")).db.user
          .findUnique({ where: { id: acteur.id }, select: { countryCode: true } })
          .then((u) => u?.countryCode ?? null)
      : Promise.resolve(null);

    return {
      packs: PACKS.map(versClient),
      complements: [RECHARGE_ANALYSES, CONSULTATION],
      deviseSuggeree: deviseParDefaut(await pays),
      montantMinimumXOF: MONTANT_MINIMUM_XOF,
    };
  },
});
