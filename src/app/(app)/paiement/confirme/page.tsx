import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { LienBouton } from "@/components/ui/LienBouton";
import { PACKS } from "@/domain/payments/pricing";
import { formatMontant } from "@/lib/utils";

/**
 * $-04 — Paiement confirmé. WF-05.
 *
 * Le titre porte le résultat et reçoit le focus à l'arrivée (règle clavier 6
 * — le focus se déplace au changement d'écran, et seulement là). Les trois
 * prochaines étapes sont ordonnées par ce qui est le plus long à corriger,
 * pas par ce qui est le plus facile à faire.
 */
export const metadata: Metadata = {
  title: "Paiement confirmé",
  description: "Votre dossier est ouvert.",
};

const ETAPES_SUIVANTES = [
  "Téléverse ton passeport et ton diplôme, les deux pièces les plus longues à corriger.",
  "Fixe ta date de dépôt visée pour recevoir l'échéancier des pièces qui périment.",
  "Rédige ta lettre de motivation avec l'entretien guidé, quand le reste est en place.",
];

export default function PageConfirme() {
  const pack = PACKS[0];
  const reference = "IMP-2609-4471";

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-4 pb-8 md:py-8">
      <div className="flex flex-col items-center gap-5 text-center">
        <Image
          src="/illustrations/paiement-confirme.svg"
          alt=""
          width={260}
          height={163}
          unoptimized
        />
        <div className="flex flex-col gap-2">
          <h1
            id="contenu"
            tabIndex={-1}
            className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
          >
            Paiement confirmé
          </h1>
          <p className="text-pretty text-16 text-ink-700">
            Ton dossier est ouvert.{" "}
            {pack ? formatMontant(pack.prix.XOF, "XOF") : ""} débités sur ton compte
            Mobile Money.
          </p>
        </div>
      </div>

      <dl className="flex flex-col gap-2.5 rounded-lg bg-ink-100 p-5">
        {[
          { intitule: "Référence", valeur: reference, mono: true },
          { intitule: "Pack", valeur: pack?.libelle ?? "", mono: false },
          { intitule: "Date", valeur: "11/09/2026 à 9 h 43", mono: false },
        ].map((ligne) => (
          <div key={ligne.intitule} className="flex justify-between gap-4 text-14">
            <dt className="text-ink-500">{ligne.intitule}</dt>
            <dd
              className={ligne.mono ? "font-mono font-medium text-ink-900" : "font-medium text-ink-900"}
            >
              {ligne.valeur}
            </dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="text-19 font-semibold text-ink-900">Tes trois prochaines étapes</h2>
        <ol className="flex flex-col gap-3">
          {ETAPES_SUIVANTES.map((etape, i) => (
            <li key={etape} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent-50 font-mono text-13 font-medium text-accent-700"
              >
                {i + 1}
              </span>
              <span className="text-pretty text-16 text-ink-700">{etape}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-pretty text-13 text-ink-500">
        Un reçu a été envoyé à ton adresse email. Il reste disponible dans ton
        espace à tout moment.
      </p>

      <div className="flex flex-col gap-2">
        <LienBouton href="/dossiers" pleineLargeur className="min-h-action">
          Ouvrir ma checklist
        </LienBouton>
        <Link
          href={`/paiement/recu/${reference}`}
          className="flex min-h-touch items-center justify-center text-14 font-semibold text-ink-900"
        >
          Voir le reçu
        </Link>
      </div>
    </div>
  );
}
