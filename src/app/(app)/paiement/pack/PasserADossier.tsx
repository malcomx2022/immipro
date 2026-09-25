import Link from "next/link";
import { LienBouton } from "@/components/ui/LienBouton";
import type { Tunnel } from "@/server/lecture/paiements";
import { RECHARGE_ANALYSES } from "@/domain/payments/pricing";
import {
  ANALYSES_AJOUTEES,
  CODE_MONTEE_DOSSIER,
  PHRASE_MONTEE,
  PHRASE_RECHARGE,
  ceQueLaMonteeOuvre,
  type DetailDuPrix,
} from "@/domain/payments/montee";
import { formatMontant } from "@/lib/utils";

/**
 * $-01 pour un dossier couvert par Essentiel — S.88.
 *
 * La page des packs renvoyait au dossier tout candidat qui en avait déjà
 * payé un. Un dossier Essentiel n'avait donc aucun moyen de passer à
 * Dossier, sinon d'en racheter un au prix plein par une adresse forgée.
 *
 * Deux gestes, et ils ne se confondent pas :
 *
 * - **Passer à Dossier** change la couverture du dossier : la différence
 *   de prix, vingt analyses, la rédaction assistée ;
 * - **Ajouter des analyses** est une recharge, indépendante : elle ne
 *   change pas le pack, et ne réduit pas le prix du passage.
 *
 * Aucun des deux n'est présélectionné, et le prix du passage est écrit
 * avec son calcul : le candidat voit ce qu'il a déjà payé.
 */
export function PasserADossier({ tunnel, detail }: { tunnel: Tunnel; detail: DetailDuPrix }) {
  const id = tunnel.dossier.id;
  const devise = detail.devise;
  const prix = formatMontant(detail.montant, devise);
  const prixRecharge = formatMontant(RECHARGE_ANALYSES.prix[devise], devise);

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <Link href={`/dossiers/${id}`} className="text-14 font-semibold text-ink-900">
        Retour au dossier
      </Link>
      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Ton dossier est couvert par Essentiel
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          {tunnel.dossier.pays} — {tunnel.dossier.intitule}
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-ink-300 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-19 font-semibold text-ink-900">Passer à Dossier — {prix}</h2>
          <p className="text-pretty text-14 text-ink-700">{PHRASE_MONTEE}</p>
          <p className="text-pretty text-14 text-ink-500">
            {`${formatMontant(detail.prixDossier, devise)} − ${formatMontant(detail.dejaPaye, devise)} déjà payés pour Essentiel = ${prix}.`}
          </p>
        </div>
        <ul className="flex flex-col gap-1.5">
          {ceQueLaMonteeOuvre().map((ligne) => (
            <li key={ligne} className="text-pretty text-14 text-ink-700">
              {ligne}
            </li>
          ))}
        </ul>
        <LienBouton
          href={`/paiement/recapitulatif?dossier=${id}&achat=${CODE_MONTEE_DOSSIER}`}
          pleineLargeur
          className="md:w-auto md:self-start"
        >
          Passer à Dossier
        </LienBouton>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-ink-300 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-19 font-semibold text-ink-900">
            Ajouter des analyses — {RECHARGE_ANALYSES.volume} pour {prixRecharge}
          </h2>
          <p className="text-pretty text-14 text-ink-700">{PHRASE_RECHARGE}</p>
          <p className="text-pretty text-14 text-ink-500">
            {`Elle ne compte pas dans le passage à Dossier : ses analyses s'ajoutent aux ${ANALYSES_AJOUTEES} du passage, elles ne les remplacent pas.`}
          </p>
        </div>
        <LienBouton
          href={`/paiement/recapitulatif?dossier=${id}&achat=recharge&devise=${devise}`}
          variante="secondaire"
          pleineLargeur
          className="md:w-auto md:self-start"
        >
          Ajouter des analyses
        </LienBouton>
      </section>
    </div>
  );
}
