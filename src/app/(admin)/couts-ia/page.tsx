import type { Metadata } from "next";
import { CoutsIa } from "./CoutsIa";
import {
  JOURS_MEDIANE,
  candidatsAuDepassement,
  mesureDepuisLesLignes,
  metriquesMesurees,
  serieQuotidienne,
  tarifDepuisEnvironnement,
} from "@/domain/backoffice/couts";
import { consommationParJour, coutsParDossier } from "@/server/lecture/backoffice";
import { exigerAdmin } from "@/server/securite/page";

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

  const tarif = tarifDepuisEnvironnement(process.env);
  const aujourdhui = new Date();
  const depuis = new Date(aujourdhui.getTime() - (FENETRE_JOURS - 1) * 86_400_000);

  const [lignes, relevees] = await Promise.all([
    coutsParDossier(tarif),
    consommationParJour(depuis),
  ]);

  return (
    <CoutsIa
      metriques={metriquesMesurees(mesureDepuisLesLignes(lignes, tarif?.devise ?? null))}
      serie={serieQuotidienne(relevees, aujourdhui.toISOString().slice(0, 10), FENETRE_JOURS)}
      candidats={candidatsAuDepassement(lignes)}
      tarife={tarif !== null}
    />
  );
}
