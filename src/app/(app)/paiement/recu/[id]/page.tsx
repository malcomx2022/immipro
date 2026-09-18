import Image from "next/image";
import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { masquerNumero } from "@/domain/paiement/echec";
import { PACKS } from "@/domain/payments/pricing";
import { formatMontant } from "@/lib/utils";

/**
 * $-06 — Reçu. WF-05.
 *
 * Le reçu atteste d'un service de préparation. Il le dit lui-même, parce
 * qu'un candidat pourrait sinon le joindre à sa demande de visa — et les
 * frais versés à l'administration en sont exclus (INV-1).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Reçu ${id.toUpperCase()}`,
    description: "Reçu de paiement ImmiPro.",
  };
}

export default async function PageRecu({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const reference = id.toUpperCase();
  const pack = PACKS[0];
  const montant = pack ? formatMontant(pack.prix.XOF, "XOF") : "";

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-4 pb-8 md:py-8">
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        Reçu {reference}
      </h1>

      <article className="flex flex-col overflow-hidden rounded-lg border border-ink-300">
        <div className="flex items-start justify-between gap-4 border-b border-ink-300 p-5">
          <Image
            src="/brand/immipro-logo-primary.svg"
            alt="ImmiPro"
            width={98}
            height={24}
            unoptimized
          />
          {/* Pastille propre au reçu : `StatusBadge` porte l'état d'une
              pièce de dossier, et le détourner pour son apparence ferait
              dire « Conforme » à un paiement. */}
          <span className="inline-flex items-center gap-2 rounded-full bg-ink-100 px-3 py-1.5 text-13 font-medium text-ink-700">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
            Payé
          </span>
        </div>

        <dl className="flex flex-col gap-3 border-b border-ink-300 p-5">
          {[
            { intitule: "Référence", valeur: reference, mono: true },
            { intitule: "Date", valeur: "11 septembre 2026, 9 h 43", mono: false },
            { intitule: "Moyen", valeur: `MTN MoMo · ${masquerNumero("97000042")}`, mono: false },
            { intitule: "Transaction opérateur", valeur: "MP260911.0943", mono: true },
          ].map((ligne) => (
            <div key={ligne.intitule} className="flex justify-between gap-4 text-14">
              <dt className="text-ink-500">{ligne.intitule}</dt>
              <dd className={ligne.mono ? "font-mono font-medium text-ink-900" : "font-medium text-ink-900"}>
                {ligne.valeur}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-3 border-b border-ink-300 p-5">
          <div className="flex items-start justify-between gap-4">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-16 font-medium text-ink-900">{pack?.libelle}</span>
              <span className="text-14 text-ink-500">Dossier Pays-Bas — séjour études</span>
            </span>
            <span className="flex-none text-16 font-medium text-ink-900">{montant}</span>
          </div>
          <div className="flex justify-between gap-4 text-14">
            <span className="text-ink-500">Frais de service</span>
            <span className="text-ink-900">{formatMontant(0, "XOF")}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 bg-ink-100 p-5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-16 font-semibold text-ink-900">Total payé</span>
            <span className="text-24 font-semibold text-ink-900">{montant}</span>
          </div>
        </div>
      </article>

      <p className="text-14 text-ink-700">ImmiPro SAS · RCCM Cotonou · service@immipro.bj</p>
      <p className="text-pretty text-13 text-ink-500">
        Ce reçu atteste du paiement d&apos;un service de préparation de dossier. Il
        ne constitue pas une pièce à joindre à ta demande de visa, et les frais
        de demande versés à l&apos;administration en sont exclus.
      </p>

      <div className="flex gap-3">
        <Button variante="secondaire" pleineLargeur>
          Renvoyer par email
        </Button>
        <Button pleineLargeur>Télécharger</Button>
      </div>
    </div>
  );
}
