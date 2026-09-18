"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/Button";
import { echecPourMotif, masquerNumero, type MotifEchec } from "@/domain/paiement/echec";
import { PACKS } from "@/domain/payments/pricing";
import { formatMontant } from "@/lib/utils";

/**
 * $-05 — Échec ou expiration.
 *
 * Le motif vient de l'opérateur, transmis dans l'adresse. Un motif inconnu
 * retombe sur le délai dépassé : c'est le cas le moins accusateur, et
 * annoncer un refus bancaire à tort est la pire des erreurs sur cet écran.
 */
const MOTIFS: readonly MotifEchec[] = ["delai_depasse", "solde_insuffisant"];

const estMotif = (valeur: string | null): valeur is MotifEchec =>
  valeur !== null && (MOTIFS as readonly string[]).includes(valeur);

export function Echec() {
  return (
    <Suspense fallback={<Squelette />}>
      <Contenu />
    </Suspense>
  );
}

function Contenu() {
  const parametres = useSearchParams();
  const brut = parametres.get("motif");
  const motif: MotifEchec = estMotif(brut) ? brut : "delai_depasse";

  const pack = PACKS[0];
  const montant = pack ? formatMontant(pack.prix.XOF, "XOF") : "";
  const echec = echecPourMotif(motif, montant, masquerNumero("97000042"));

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-4 pb-8 md:py-8">
      <div className="flex flex-col items-center gap-5 text-center">
        <Image
          src="/illustrations/paiement-echoue.svg"
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
            {echec.titre}
          </h1>
          <p className="text-pretty text-16 text-ink-700">{echec.corps}</p>
        </div>
      </div>

      <section className="flex flex-col gap-2 rounded-lg bg-ink-100 p-5">
        <h2 className="text-14 font-semibold text-ink-900">Ce que tu peux vérifier</h2>
        {echec.verifications.map((verification) => (
          <p key={verification} className="text-pretty text-14 text-ink-700">
            {verification}
          </p>
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-ink-300 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-16 font-semibold text-ink-900">
            Le pack Découverte reste gratuit
          </h2>
          <p className="text-pretty text-14 text-ink-700">
            Tu gardes le simulateur, les fiches destination et l&apos;aperçu de ta
            checklist, sans analyse de pièces.
          </p>
        </div>
        <Button variante="secondaire" pleineLargeur>
          Continuer en Découverte
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-14 font-semibold text-ink-900">Autre moyen de paiement</h2>
        <ul className="flex flex-wrap gap-2">
          {["Moov Money", "Carte bancaire", "Autre numéro Mobile Money"].map((moyen) => (
            <li key={moyen}>
              <Button variante="secondaire" className="h-11 rounded-full px-3.5 text-14">
                {moyen}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-pretty text-13 text-ink-500">
        Aucun montant n&apos;a été débité. Si tu as reçu un message de débit,
        écris-nous avec la référence IMP-2609-4471.
      </p>

      <div className="flex flex-col gap-2">
        <Button pleineLargeur className="min-h-action">
          Réessayer le paiement
        </Button>
        <p className="text-center text-13 text-ink-500">
          {pack?.libelle} · {montant}
        </p>
        <Link
          href="/paiement/pack"
          className="flex min-h-touch items-center justify-center text-14 text-ink-700"
        >
          Changer de pack
        </Link>
      </div>
    </div>
  );
}

function Squelette() {
  return (
    <div className="mx-auto w-full max-w-[520px] px-4 py-8">
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        Paiement non abouti
      </h1>
      <p role="status" className="mt-2 text-16 text-ink-700">
        Lecture du motif transmis par l&apos;opérateur.
      </p>
    </div>
  );
}
