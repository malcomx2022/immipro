"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { masquerNumero } from "@/domain/paiement/echec";
import { PACKS, type Devise } from "@/domain/payments/pricing";
import { formatMontant } from "@/lib/utils";

/**
 * $-02 — Récapitulatif.
 *
 * Deux règles tenues ici plutôt que par la relecture :
 *
 * - La case des conditions part décochée. Le prototype la cochait d'avance,
 *   sur l'écran même qui porte l'acceptation et la mention de non-garantie :
 *   une case pré-cochée n'est pas un consentement, et la règle produit du
 *   prototype l'interdit par ailleurs.
 * - Le montant est répété sur le bouton, en toutes lettres, avant tout
 *   déclenchement de débit.
 *
 * Échap revient au choix du pack sans débiter (règle clavier 5) : c'est le
 * lien « Retour », premier élément de l'écran.
 */
const PACK_PAR_DEFAUT = PACKS[0];

export function Recapitulatif() {
  const [conditions, setConditions] = useState(false);
  // La commande viendra de la session de paiement ; l'écran sait l'afficher.
  const [devise] = useState<Devise>("XOF");
  const pack = PACK_PAR_DEFAUT;
  const numero = masquerNumero("97000042");

  const montant = pack ? formatMontant(pack.prix[devise], devise) : "";
  const autreDevise: Devise = devise === "XOF" ? "EUR" : "XOF";

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-4 pb-8 md:flex-row md:gap-12 md:px-12 md:py-6">
      <div className="flex min-w-0 flex-1 flex-col gap-5 md:max-w-[640px]">
        <Link href="/paiement/pack" className="text-14 font-semibold text-ink-900">
          Retour
        </Link>
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Vérifie avant de payer
        </h1>

        <div className="flex flex-col gap-1.5 rounded-lg bg-ink-100 p-5">
          <p className="text-14 text-ink-500">Montant à payer</p>
          <p className="text-32 font-semibold text-ink-900">{montant}</p>
          <p className="text-pretty text-14 text-ink-500">
            {devise === "XOF"
              ? "Grille en francs CFA, débitée par ton opérateur Mobile Money."
              : "Grille en euros, prélevée par carte."}{" "}
            La grille en {autreDevise === "XOF" ? "francs CFA" : "euros"} est
            distincte, ce n&apos;est pas une conversion.
          </p>
        </div>

        <dl className="flex flex-col">
          {[
            { intitule: "Pack", valeur: pack?.libelle ?? "" },
            { intitule: "Dossier", valeur: "Pays-Bas — séjour études" },
            { intitule: "Valable jusqu'à", valeur: "la clôture du dossier" },
            { intitule: "Numéro Mobile Money", valeur: numero },
          ].map((ligne) => (
            <div
              key={ligne.intitule}
              className="flex justify-between gap-4 border-b border-ink-300 py-3.5 text-14 last:border-b-0"
            >
              <dt className="text-ink-500">{ligne.intitule}</dt>
              <dd className="text-right font-medium text-ink-900">{ligne.valeur}</dd>
            </div>
          ))}
        </dl>

        <Link
          href="/consentements"
          className="flex min-h-touch items-center self-start rounded-full border border-ink-300 px-3.5 text-14 text-ink-900 hover:bg-ink-100"
        >
          Changer de numéro
        </Link>

        <div className="flex flex-col gap-1.5 rounded-md bg-accent-50 p-4">
          <p className="text-14 font-semibold text-accent-700">Ce qui va se passer</p>
          <p className="text-pretty text-14 text-accent-700">
            Une notification Mobile Money arrive sur ton téléphone. Tu saisis ton
            code PIN, et ton dossier s&apos;ouvre aussitôt.
          </p>
        </div>

        <Checkbox
          libelle="J'accepte les conditions d'utilisation et je comprends qu'ImmiPro prépare mon dossier sans garantir la décision de l'administration."
          checked={conditions}
          onChangement={setConditions}
        />

        <p className="text-pretty text-13 text-ink-500">
          Montant débité une seule fois. Les frais de demande de visa se paient
          directement à l&apos;administration, au moment du dépôt.
        </p>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-ink-300 bg-white px-4 py-3 md:static md:mx-0 md:w-72 md:flex-none md:self-start md:border-0 md:p-0">
        <Button
          pleineLargeur
          className="min-h-action"
          disabled={!conditions}
          raisonDesactivation={
            conditions ? undefined : "Acceptez les conditions d'utilisation pour payer."
          }
        >
          Payer {montant}
        </Button>
        <p className="text-center text-13 text-ink-500">
          Aucun montant n&apos;est débité avant ta confirmation
        </p>
      </div>
    </div>
  );
}
