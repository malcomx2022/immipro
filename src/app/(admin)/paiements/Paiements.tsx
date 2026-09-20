"use client";

import { Button } from "@/components/ui/Button";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import { MENTION_AUDIT } from "@/domain/backoffice/navigation";
import {
  LIBELLE_RAPPROCHEMENT,
  MENTION_ECARTS,
  MENTION_TOTAL_SUSPENDU,
  agreger,
  lignesDeTotal,
  libelleEcarts,
  messageIncidentOperateur,
  totalPubliable,
  type EtatOperateur,
  type Totaux,
  type Paiement,
} from "@/domain/backoffice/reconciliation";
import { formatMontant } from "@/lib/utils";
import { LIBELLE_CAUSE } from "@/domain/paiement/echec";

/**
 * B-04 — Paiements et réconciliation. WF-15, INV-7.
 *
 * Deux refus d'empressement. Un silence de l'opérateur n'est pas un refus :
 * les paiements restent en attente de rapprochement, aucun n'est marqué en
 * échec et aucun pack n'est fermé. Et pendant l'incident, le total encaissé
 * disparaît — un chiffre partiel présenté comme un total est une erreur
 * comptable, et elle se propage dans l'export puis dans le rapport.
 */
const FORMAT_HEURE = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const heure = (iso: string) => FORMAT_HEURE.format(new Date(iso)).replace(":", " h ");

export function Paiements({
  paiements,
  operateur,
  journee,
}: {
  paiements: readonly Paiement[];
  /**
   * État de l'opérateur. Nul tant qu'aucun rapprochement n'a abouti :
   * l'interrogation du fournisseur n'est pas branchée, et annoncer
   * « disponible » sans avoir interrogé personne serait une affirmation
   * sans mesure.
   */
  operateur: EtatOperateur | null;
  /** Libellé de la journée traitée. */
  journee: string;
}) {
  const agregats = agreger(paiements);
  /**
   * Une somme par monnaie. Les deux rails n'encaissent pas dans la même,
   * et les additionner produisait un total en francs qui contenait des
   * euros — l'erreur comptable que ce tableau est censé prévenir.
   */
  const sommes = (totaux: Totaux) =>
    lignesDeTotal(totaux)
      .map((l) => formatMontant(l.montant, l.devise))
      .join(" · ");
  const incident = operateur ? messageIncidentOperateur(operateur, heure) : null;
  const publiable = operateur ? totalPubliable(operateur) : false;

  return (
    <div className="flex flex-col">
      <EnteteAdmin
        titre="Paiements et réconciliation"
        resume={
          !operateur
            ? `${journee} · aucun rapprochement automatique enregistré`
            : publiable
              ? `${journee} · dernier rapprochement ${heure(operateur.dernierRapprochement)}`
              : `${journee} · dernier rapprochement automatique ${heure(operateur.dernierRapprochement)}`
        }
        actions={
          <>
            <Button variante="secondaire">Exporter le grand livre</Button>
            <Button disabled={!publiable} raisonDesactivation="L'opérateur ne répond pas : le rapprochement automatique reprendra seul.">
              {publiable ? "Lancer le rapprochement" : "Rapprocher à la main"}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4 p-6">
        {incident ? (
          <section className="flex flex-col gap-2 rounded-lg border-l-6 border-warning bg-white p-4 shadow-e2">
            <h2 className="text-16 font-semibold text-ink-900">
              L&apos;API {operateur?.operateur} ne répond plus
            </h2>
            <p className="max-w-[80ch] text-pretty text-14 text-ink-700">{incident}</p>
          </section>
        ) : null}

        <div className="grid grid-cols-5 gap-3">
          <Carte
            intitule="Encaissé aujourd'hui"
            valeur={publiable ? sommes(agregats.encaisse) : "—"}
            detail={
              publiable
                ? `${agregats.confirmes} paiements confirmés`
                : "non affiché pendant l'incident"
            }
          />
          <Carte
            intitule="En attente de confirmation"
            valeur={sommes(agregats.enAttente)}
            detail={`${agregats.transactionsEnAttente} transactions`}
          />
          <Carte
            intitule="Échecs du jour"
            valeur={String(agregats.echecs)}
            // Le détail nommait une cause — « solde insuffisant » — pour
            // tous les échecs, ce que N.B a retiré de la colonne d'état
            // juste à côté. Il la nommait encore ici.
            detail="délai dépassé ou paiement refusé"
          />
          {/*
            Un remboursement sort de l'encaissé, ce qui est juste, et
            n'entrait dans aucun compteur — une somme rendue disparaissait
            de la journée (M.B).
          */}
          <Carte
            intitule="Remboursé aujourd'hui"
            valeur={sommes(agregats.rembourse)}
            detail={`${agregats.rembourses} ${agregats.rembourses > 1 ? "paiements rendus" : "paiement rendu"}`}
          />
          <Carte
            intitule="Écarts à traiter"
            valeur={String(agregats.ecarts)}
            detail="débit opérateur sans dossier ouvert"
          />
        </div>

        {publiable ? null : (
          <p className="text-pretty text-13 text-ink-500">{MENTION_TOTAL_SUSPENDU}</p>
        )}

        <div className="overflow-hidden rounded-lg border border-ink-300 bg-white">
          <table className="w-full text-14">
            <caption className="sr-only">Paiements de la journée</caption>
            <thead>
              <tr className="bg-ink-100 text-13 font-medium text-ink-700">
                <th scope="col" className="px-3 py-2 text-left">Référence</th>
                <th scope="col" className="px-3 py-2 text-left">Compte</th>
                <th scope="col" className="px-3 py-2 text-right">Montant</th>
                <th scope="col" className="px-3 py-2 text-left">Moyen</th>
                <th scope="col" className="px-3 py-2 text-left">Transaction</th>
                <th scope="col" className="px-3 py-2 text-left">Heure</th>
                <th scope="col" className="px-3 py-2 text-left">Rapprochement</th>
              </tr>
            </thead>
            <tbody>
              {paiements.map((p) => (
                <tr key={p.reference} className="border-t border-ink-300">
                  <td className="px-3 py-2 font-mono text-13 text-ink-900">{p.reference}</td>
                  <td className="px-3 py-2 text-ink-700">{p.compte}</td>
                  <td className="px-3 py-2 text-right text-ink-900">
                    {formatMontant(p.montant, p.devise)}
                  </td>
                  <td className="px-3 py-2 text-ink-700">{p.moyen}</td>
                  <td className="px-3 py-2 font-mono text-13 text-ink-700">
                    {p.transaction ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-ink-700">{heure(p.recuLe)}</td>
                  <td className="px-3 py-2 text-ink-700">
                    <span className="flex flex-col">
                      {LIBELLE_RAPPROCHEMENT[p.etat]}
                      {/* La cause sous l'état, et seulement quand l'émetteur
                          l'a donnée. L'état disait « Solde insuffisant » pour
                          tout refus, panne comprise (N.B). */}
                      {p.cause ? (
                        <span className="text-13 text-ink-500">{LIBELLE_CAUSE[p.cause]}</span>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-pretty text-13 text-ink-500">{MENTION_ECARTS}</p>
          <Button disabled={agregats.ecarts === 0} raisonDesactivation="Aucun écart en attente.">
            {libelleEcarts(agregats)}
          </Button>
        </div>

        <p className="text-13 text-ink-500">{MENTION_AUDIT}</p>
      </div>
    </div>
  );
}

function Carte({
  intitule,
  valeur,
  detail,
}: {
  intitule: string;
  valeur: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-ink-300 bg-white p-4">
      <span className="text-13 text-ink-500">{intitule}</span>
      <span className="text-24 font-semibold text-ink-900">{valeur}</span>
      <span className="text-pretty text-13 text-ink-500">{detail}</span>
    </div>
  );
}
