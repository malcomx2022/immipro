"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { LienBouton } from "@/components/ui/LienBouton";
import { SourceNote } from "@/components/ui/SourceNote";
import { LISTE_VIDE, libellePieces, type FicheDestination } from "@/domain/destinations/fiche";
import { cn } from "@/lib/utils";

/**
 * C-04 — Fiche détaillée, en onglets.
 *
 * Les onglets suivent le motif ARIA : un seul arrêt de tabulation pour la
 * liste, flèches pour changer, panneau relié à son onglet. Sans ça, quatre
 * onglets coûtent quatre tabulations avant d'atteindre le contenu — c'est la
 * même raison qui fait de la liste de packs un seul arrêt (règle clavier 4).
 *
 * Les réserves ont leur onglet plutôt qu'un pied de page : ce qui peut
 * changer dans l'année mérite d'être cherché, pas subi.
 */
const ONGLETS = [
  { cle: "conditions", libelle: "Conditions" },
  { cle: "couts", libelle: "Coûts" },
  { cle: "pieces", libelle: "Pièces" },
  { cle: "reserves", libelle: "Réserves" },
] as const;

type CleOnglet = (typeof ONGLETS)[number]["cle"];

export function FicheDetaillee({ fiche }: { fiche: FicheDestination }) {
  const [actif, setActif] = useState<CleOnglet>("conditions");
  const prefixe = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const idOnglet = (cle: CleOnglet) => `${prefixe}-onglet-${cle}`;
  const idPanneau = (cle: CleOnglet) => `${prefixe}-panneau-${cle}`;

  const auClavier = (e: KeyboardEvent<HTMLDivElement>) => {
    const courant = ONGLETS.findIndex((o) => o.cle === actif);
    const aller = (index: number) => {
      const cible = ONGLETS[(index + ONGLETS.length) % ONGLETS.length];
      if (!cible) return;
      e.preventDefault();
      setActif(cible.cle);
      refs.current[(index + ONGLETS.length) % ONGLETS.length]?.focus();
    };
    if (e.key === "ArrowRight" || e.key === "ArrowDown") aller(courant + 1);
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") aller(courant - 1);
    if (e.key === "Home") aller(0);
    if (e.key === "End") aller(ONGLETS.length - 1);
  };

  return (
    <div className="mx-auto flex w-full max-w-gabarit flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <div className="flex items-center gap-3.5">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 flex-none items-center justify-center rounded-md bg-ink-100 font-mono text-13 text-ink-700"
        >
          {fiche.code}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1
            id="contenu"
            tabIndex={-1}
            className="text-24 font-semibold text-ink-900 outline-none md:text-32"
          >
            {fiche.pays}
          </h1>
          <p className="text-14 text-ink-500">{fiche.intitule}</p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Sections de la fiche"
        onKeyDown={auClavier}
        className="flex gap-2 overflow-x-auto border-b border-ink-300"
      >
        {ONGLETS.map((onglet, i) => (
          <button
            key={onglet.cle}
            ref={(n) => {
              refs.current[i] = n;
            }}
            type="button"
            role="tab"
            id={idOnglet(onglet.cle)}
            aria-selected={actif === onglet.cle}
            aria-controls={idPanneau(onglet.cle)}
            tabIndex={actif === onglet.cle ? 0 : -1}
            onClick={() => setActif(onglet.cle)}
            className={cn(
              "min-h-touch flex-none px-3.5 text-14 font-medium",
              actif === onglet.cle
                ? "border-b-2 border-accent-500 text-ink-900"
                : "text-ink-500 hover:text-ink-900",
            )}
          >
            {onglet.libelle}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={idPanneau(actif)}
        aria-labelledby={idOnglet(actif)}
        tabIndex={0}
        className="flex flex-col gap-4"
      >
        {/* Chaque onglet dit ce qu'il en est quand sa liste est vide. Un
            panneau blanc sous l'onglet qu'on vient de choisir se lit comme
            un écran qui a échoué à charger, et n'apprend rien. */}
        {actif === "conditions" && fiche.conditions.length === 0 ? (
          <p className="text-pretty text-14 text-ink-700">{LISTE_VIDE.conditions}</p>
        ) : null}

        {actif === "conditions" && fiche.conditions.length > 0 ? (
          <dl className="flex flex-col">
            {fiche.conditions.map((c) => (
              <div
                key={c.intitule}
                className="flex justify-between gap-4 border-b border-ink-300 py-3 text-14 last:border-b-0"
              >
                <dt className="text-ink-500">{c.intitule}</dt>
                <dd className="text-right font-medium text-ink-900">{c.valeur}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {actif === "couts" && fiche.reperes.length === 0 ? (
          <p className="text-pretty text-14 text-ink-700">{LISTE_VIDE.couts}</p>
        ) : null}

        {actif === "couts" && fiche.reperes.length > 0 ? (
          <dl className="flex flex-col">
            {fiche.reperes.map((r) => (
              <div
                key={r.intitule}
                className="flex justify-between gap-4 border-b border-ink-300 py-3 text-14 last:border-b-0"
              >
                <dt className="text-ink-500">{r.intitule}</dt>
                <dd className="whitespace-nowrap text-right font-medium text-ink-900">
                  {r.valeur}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {actif === "pieces" ? (
          <div className="flex flex-col gap-3">
            {/* « 0 pièce à réunir … le détail, pièce par pièce » promettait
                un détail sur une liste vide. */}
            <p className="text-16 text-ink-700">
              {fiche.piecesAReunir > 0
                ? `${libellePieces(fiche.piecesAReunir)} pour cette destination. Le détail, pièce par pièce, s'ouvre avec le dossier.`
                : `${libellePieces(fiche.piecesAReunir)} pour cette destination. La checklist se construit à l'ouverture du dossier, depuis la version de la règle qui y est figée.`}
            </p>
            <p className="text-pretty text-14 text-ink-700">{fiche.travailEtudiant}</p>
            <p className="text-pretty text-14 text-ink-700">{fiche.apresDiplome}</p>
          </div>
        ) : null}

        {actif === "reserves" && fiche.reserves.length === 0 ? (
          <p className="text-pretty text-14 text-ink-700">{LISTE_VIDE.reserves}</p>
        ) : null}

        {actif === "reserves" && fiche.reserves.length > 0 ? (
          <div className="flex flex-col gap-3">
            {fiche.reserves.map((r) => (
              <div
                key={r.texte}
                className="flex items-start gap-3 rounded-md bg-ink-100 p-3.5"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-2 h-2 w-2 flex-none rounded-full",
                    r.ton === "attention" ? "bg-warning" : "bg-ink-500",
                  )}
                />
                <p className="text-pretty text-14 text-ink-700">{r.texte}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <SourceNote {...fiche.mention}>
        ImmiPro reproduit les exigences publiées par l&apos;administration et
        n&apos;intervient pas dans la décision.
      </SourceNote>

      <div className="flex items-center gap-3 border-t border-ink-300 pt-4">
        <p className="flex-1 text-13 text-ink-500">
          {libellePieces(fiche.piecesAReunir)}
        </p>
        <LienBouton href={`/dossiers/nouveau?destination=${fiche.slug}`}>
          Ouvrir un dossier
        </LienBouton>
      </div>
    </div>
  );
}
