import type { Metadata } from "next";
import { CoutsIa } from "./CoutsIa";
import { metriquesMesurees } from "@/domain/backoffice/couts";
import { coutsParDossier } from "@/server/lecture/backoffice";
import { exigerAdmin } from "@/server/securite/page";

/**
 * B-07 — Supervision des coûts IA. WF-16.
 *
 * L'écran lit `AiUsage`. La décision d'origine ne change pas — il reste vide
 * tant qu'aucun appel n'a été enregistré — mais il se remplit de lui-même
 * quand les dossiers passeront, sans qu'on ait à revenir remplacer des
 * valeurs à la main. C'est la façon habituelle dont un écran vide le reste.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Coûts IA",
  description:
    "Métriques de coût, plafonds et seuils d'alerte. Aucune valeur tant qu'aucune mesure n'existe.",
};

export default async function PageCoutsIa() {
  await exigerAdmin("/couts-ia");
  const lignes = await coutsParDossier();

  return (
    <CoutsIa
      metriques={metriquesMesurees({
        dossiers: lignes.length,
        coutMicros: lignes.reduce((n, l) => n + l.coutMicros, 0),
        appels: lignes.reduce((n, l) => n + l.appels, 0),
        pireePart: lignes.reduce<number | null>(
          (pire, l) => (l.partDuPrix === null ? pire : Math.max(pire ?? 0, l.partDuPrix)),
          null,
        ),
      })}
    />
  );
}
