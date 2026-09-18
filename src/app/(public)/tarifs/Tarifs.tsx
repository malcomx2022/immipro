"use client";

import { useState } from "react";
import { LienBouton } from "@/components/ui/LienBouton";
import {
  PACKS,
  RECHARGE_ANALYSES,
  type Devise,
  type Pack,
} from "@/domain/payments/pricing";
import { formatMontant } from "@/lib/utils";

/**
 * P-06 — Tarifs.
 *
 * Les montants viennent de `domain/payments/pricing.ts`, source unique : un
 * prix affiché ici et un prix débité là ne peuvent pas diverger.
 *
 * La mise en avant et le texte de son badge viennent du même endroit
 * (arbitrage du 18/09/2026). Essentiel reste premier dans l'ordre de lecture
 * — il répond à « combien ça coûte » — sans porter le badge, qui répond à
 * « lequel me faut-il ». Le badge dit ce que le pack couvre, jamais qu'il est
 * populaire : une popularité n'est pas une raison, et le produit la
 * contredirait en support.
 */
const AVANTAGES: Record<string, readonly string[]> = {
  decouverte: [
    "Simulateur complet et trois fiches destination",
    "Aperçu de la checklist, sans analyse de pièces",
    "Alertes de changement de règles",
  ],
  essentiel: [
    "Checklist complète et échéancier jusqu'au dépôt",
    "Analyse de 10 pièces, avec message de correction",
    "Complétude du dossier et prochaine action",
  ],
  dossier: [
    "Tout l'Essentiel, sur une destination",
    "Analyse de 30 pièces",
    "Rédaction assistée de la lettre de motivation",
  ],
  pro: [
    "Tout le pack Dossier, sur trois destinations",
    "Analyse de 90 pièces",
    "Comparateur des trois dossiers en parallèle",
  ],
};

const SOUS_TITRES: Record<string, string> = {
  decouverte: "Pour savoir où tu en es.",
  essentiel: "Un dossier, une destination.",
  dossier: "Une destination, analyse étendue.",
  pro: "Trois destinations comparées.",
};

/** Le pack gratuit n'est pas un achat : il n'a pas sa place dans `PACKS`. */
const DECOUVERTE = {
  code: "decouverte",
  libelle: "Découverte",
  prix: { XOF: 0, EUR: 0 },
} as const;

export function Tarifs() {
  const [devise, setDevise] = useState<Devise>("XOF");

  const prix = (montants: Record<Devise, number>) =>
    montants[devise] === 0 ? "Gratuit" : formatMontant(montants[devise], devise);

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-7 px-4 py-6 md:px-12 md:py-10">
      <div className="flex flex-col gap-4 md:max-w-[640px]">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-32 font-semibold text-ink-900 outline-none md:text-44"
        >
          Un paiement, un dossier
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          Pas d&apos;abonnement. Tu paies pour le dossier que tu prépares, et la
          checklist reste accessible jusqu&apos;à sa clôture.
        </p>

        <div className="flex flex-col gap-2">
          <div
            role="radiogroup"
            aria-label="Devise d'affichage"
            className="flex gap-2 rounded-full bg-ink-100 p-1"
          >
            {(["XOF", "EUR"] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={devise === d}
                onClick={() => setDevise(d)}
                className={`min-h-touch flex-1 rounded-full text-14 font-semibold text-ink-900 ${
                  devise === d ? "bg-white shadow-e1" : "hover:bg-white"
                }`}
              >
                {d === "XOF" ? "Francs CFA" : "Euros"}
              </button>
            ))}
          </div>
          <p className="text-13 text-ink-500">
            Devise déduite de ton pays, le Bénin. Tu peux la changer.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <CartePack
          code={DECOUVERTE.code}
          libelle={DECOUVERTE.libelle}
          prix={prix(DECOUVERTE.prix)}
          action="Commencer gratuitement"
          href="/simulateur"
          principal={false}
          misEnAvant={false}
        />
        {PACKS.map((pack: Pack) => (
          <CartePack
            key={pack.code}
            code={pack.code}
            libelle={pack.libelle}
            prix={prix(pack.prix)}
            action={`Choisir ${pack.libelle}`}
            href="/inscription"
            principal={pack.misEnAvant}
            misEnAvant={pack.misEnAvant}
            justification={pack.justification}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-ink-100 p-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-16 font-semibold text-ink-900">
            Recharge de 10 analyses
          </p>
          <p className="text-13 text-ink-500">
            Ce n&apos;est pas un pack : elle s&apos;achète depuis un dossier ouvert,
            quand son quota est épuisé.
          </p>
        </div>
        <p className="flex-none text-19 font-semibold text-ink-900">
          {prix(RECHARGE_ANALYSES.prix)}
        </p>
      </div>

      <p className="text-pretty text-13 text-ink-500">
        L&apos;accompagnement par un consultant n&apos;est pas encore proposé. Il ne
        le sera qu&apos;avec des consultants dont l&apos;habilitation est vérifiée
        dans le pays de destination.
      </p>

      <section className="flex flex-col gap-4 rounded-lg bg-ink-100 p-5">
        <h2 className="text-19 font-semibold text-ink-900">Paiement</h2>
        <ul className="flex flex-col gap-2">
          <li className="text-14 text-ink-700">MTN MoMo et Moov Money, en francs CFA.</li>
          <li className="text-14 text-ink-700">
            Carte bancaire pour les paiements en euros.
          </li>
          <li className="text-14 text-ink-700">
            Reçu disponible immédiatement après la confirmation.
          </li>
        </ul>
        <p className="text-pretty text-13 text-ink-500">
          {devise === "EUR"
            ? "Grille en euros, prélevée par carte."
            : "Grille en francs CFA, débitée par ton opérateur Mobile Money."}{" "}
          Les deux grilles sont natives : aucun montant n&apos;est la conversion de
          l&apos;autre. Les frais de demande de visa versés à l&apos;administration
          ne sont pas inclus et ne passent jamais par ImmiPro.
        </p>
      </section>
    </div>
  );
}

function CartePack({
  code,
  libelle,
  prix,
  action,
  href,
  principal,
  misEnAvant,
  justification,
}: {
  code: string;
  libelle: string;
  prix: string;
  action: string;
  href: string;
  principal: boolean;
  misEnAvant: boolean;
  justification?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg p-5 ${
        misEnAvant ? "border-2 border-accent-500" : "border border-ink-300"
      }`}
    >
      {/* Le badge passe à la ligne plutôt que d'écraser le sous-titre :
          la colonne ne fait que 260 px sur la grille de quatre. */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-19 font-semibold text-ink-900">{libelle}</h2>
          <p className="text-14 text-ink-500">{SOUS_TITRES[code]}</p>
        </div>
        {misEnAvant && justification ? (
          <span className="flex-none rounded-full bg-accent-50 px-2.5 py-1 text-13 font-medium text-accent-700">
            {justification}
          </span>
        ) : null}
      </div>
      <p className="text-32 font-semibold text-ink-900">{prix}</p>
      <ul className="flex flex-1 flex-col gap-2">
        {(AVANTAGES[code] ?? []).map((a) => (
          <li key={a} className="text-14 text-ink-700">
            {a}
          </li>
        ))}
      </ul>
      <LienBouton
        href={href}
        variante={principal ? "primaire" : "secondaire"}
        pleineLargeur
      >
        {action}
      </LienBouton>
    </div>
  );
}
