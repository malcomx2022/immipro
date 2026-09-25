import type { Metadata } from "next";
import { CoutsIa } from "./CoutsIa";
import {
  JOURS_MEDIANE,
  candidatsAuDepassement,
  mesureDepuisLesLignes,
  metriquesMesurees,
  serieQuotidienne,
} from "@/domain/backoffice/couts";
import {
  consommationParFournisseur,
  consommationParJour,
  coutsParDossier,
} from "@/server/lecture/backoffice";
import {
  deviseCommune,
  etatDesFonctions,
  fournisseursATarifer,
  tarifDu,
} from "@/domain/ia/fournisseurs";
import { exigerAdmin } from "@/server/securite/page";
import { jourCivil } from "@/domain/format/fuseau";

/**
 * B-07 — Supervision des coûts IA. WF-16.
 *
 * L'écran lit `AiUsage`, et la décision d'origine ne change pas : il reste
 * vide tant qu'aucun appel n'a été enregistré. Ce qui change, c'est qu'il ne
 * quitte plus cet état pour afficher des zéros.
 *
 * Le coût d'un appel suppose un tarif de jeton, et aucun tarif n'existe
 * tant que les trois variables ne sont pas renseignées. Les jetons, eux,
 * sont comptés depuis toujours. Les deux sont donc passés séparément à
 * l'écran : ce qui se compte s'affiche, ce qui se tarife attend.
 */
export const dynamic = "force-dynamic";

/** Deux semaines d'histogramme : de quoi voir la médiane à sept jours bouger. */
const FENETRE_JOURS = JOURS_MEDIANE * 2;

export const metadata: Metadata = {
  title: "Coûts IA",
  description:
    "Métriques de coût, plafonds et seuils d'alerte. Aucune valeur tant qu'aucune mesure n'existe.",
};

export default async function PageCoutsIa() {
  await exigerAdmin("/couts-ia");

  /*
    Un tarif par fournisseur (S.94). Les totaux ne se calculent que si
    chaque fournisseur qui a servi a le sien, et dans la même devise :
    sinon l'écran dit que les coûts attendent un tarif, comme avant.
  */
  const tarifs = (fournisseur: Parameters<typeof tarifDu>[1]) => tarifDu(process.env, fournisseur);
  const aujourdhui = new Date();
  const depuis = new Date(aujourdhui.getTime() - (FENETRE_JOURS - 1) * 86_400_000);

  const [lignes, relevees, parFournisseur] = await Promise.all([
    coutsParDossier(tarifs),
    consommationParJour(depuis),
    consommationParFournisseur(tarifs),
  ]);
  const devise = deviseCommune(
    process.env,
    fournisseursATarifer(process.env, parFournisseur.map((l) => l.fournisseur)),
  );

  return (
    <CoutsIa
      metriques={metriquesMesurees(mesureDepuisLesLignes(lignes, devise))}
      serie={serieQuotidienne(relevees, jourCivil(aujourdhui), FENETRE_JOURS)}
      candidats={candidatsAuDepassement(lignes)}
      tarife={devise !== null}
      fonctions={etatDesFonctions(process.env)}
      parFournisseur={parFournisseur}
    />
  );
}
