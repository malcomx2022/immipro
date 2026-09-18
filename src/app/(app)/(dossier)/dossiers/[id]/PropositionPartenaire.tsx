"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { LienBouton } from "@/components/ui/LienBouton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { MotifProposition, Partenaire } from "@/domain/consultants/proposition";
import {
  ENGAGEMENTS,
  LIBELLE_SUITE,
  MENTION_INDEPENDANCE,
  TITRE_PROPOSITION,
  libelleOffre,
  type SuiteProposition,
} from "@/domain/consultants/proposition";
import {
  CONSULTATION,
  CONSULTATION_DUREE_MINUTES,
  deviseParDefaut,
} from "@/domain/payments/pricing";
import { formatMontant } from "@/lib/utils";

/**
 * T-03 — Proposition d'un consultant partenaire. WF-13.
 *
 * La carte annonce la limite, la boîte de dialogue porte la divulgation
 * complète. Trois règles la tiennent : le motif est nommé, la commission est
 * annoncée ici et non dans les conditions générales, et refuser ne coûte
 * rien — ce que l'écran écrit, faute de quoi le refus n'est pas libre.
 *
 * Le tarif et la durée viennent de la grille (`domain/payments/pricing`), et
 * non du prototype, qui annonçait 25 000 F pour une heure là où l'arbitrage
 * du 13/09 a retenu une consultation de 45 minutes. Deux prix pour la même
 * prestation, c'est celui qui est facturé qui fera foi, et l'écran aurait
 * menti.
 */
export interface PropositionPartenaireProps {
  partenaire: Partenaire;
  motif: MotifProposition;
  /** Dossier concerné : l'annuaire est propre à sa destination (T-04). */
  dossierId: string;
  /** Code pays du candidat, pour la devise affichée. */
  pays?: string;
}

export function PropositionPartenaire({
  partenaire,
  motif,
  dossierId,
  pays = "BJ",
}: PropositionPartenaireProps) {
  const [ouverte, setOuverte] = useState(false);
  const [suite, setSuite] = useState<SuiteProposition | null>(null);

  const devise = deviseParDefaut(pays);
  const offre = libelleOffre(
    formatMontant(CONSULTATION.prix[devise], devise),
    CONSULTATION_DUREE_MINUTES,
  );

  if (suite === "NE_PLUS_PROPOSER") {
    return (
      <p aria-live="polite" className="text-pretty text-14 text-ink-700">
        Nous ne te proposerons plus de consultant. Tu peux revenir sur ce choix
        depuis ton profil.
      </p>
    );
  }

  if (suite === "CONTINUER_SEUL") {
    return (
      <p aria-live="polite" className="text-pretty text-14 text-ink-700">
        Tu continues sans consultant. Ton dossier et ton pack sont inchangés.
      </p>
    );
  }

  return (
    <section className="flex flex-col items-start gap-2 rounded-lg border border-ink-300 p-4">
      <h2 className="text-16 font-semibold text-ink-900">{TITRE_PROPOSITION}</h2>
      <p className="text-pretty text-14 text-ink-700">
        {motif.constat} {motif.raison}
      </p>
      <Button variante="secondaire" onClick={() => setOuverte(true)}>
        Voir la proposition
      </Button>

      <BottomSheet
        ouverte={ouverte}
        onFermer={() => setOuverte(false)}
        ancrage="adaptatif"
        titre={TITRE_PROPOSITION}
      >
        <p className="text-pretty text-14 text-ink-700">
          {motif.constat} {motif.raison}
        </p>

        <div className="flex flex-col gap-1 rounded-md border border-ink-300 p-3.5">
          <span className="text-16 font-semibold text-ink-900">{partenaire.nom}</span>
          <span className="text-14 text-ink-700">
            {partenaire.ville} · {partenaire.qualification}
          </span>
          <span className="pt-1 text-14 font-medium text-ink-900">{offre}</span>
        </div>

        <ul className="flex flex-col gap-1.5">
          {/* La mention de commission est écrite ici, en toutes lettres et au
              taux exact : c'est une obligation de transparence, et l'écrire
              autrement pour contourner le garde-fou du vocabulaire
              l'affaiblirait. Elle est donc déclarée dans
              copy-exceptions.json, où la dérogation se voit et se justifie.
              Le taux lui-même vit dans la grille tarifaire
              (COMMISSION_PARTENAIRE), et un test vérifie que cette phrase le
              reprend. */}
          <li className="text-pretty text-14 text-ink-700">
            ImmiPro perçoit une commission de 15 % sur cet entretien.
          </li>
          {ENGAGEMENTS.map((engagement) => (
            <li key={engagement} className="text-pretty text-14 text-ink-700">
              {engagement}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 border-t border-ink-300 pt-3">
          <LienBouton
            href={`/consultants?dossier=${dossierId}`}
            pleineLargeur
            className="min-h-action"
          >
            {LIBELLE_SUITE.CRENEAUX}
          </LienBouton>
          <Button
            variante="secondaire"
            pleineLargeur
            onClick={() => {
              setSuite("CONTINUER_SEUL");
              setOuverte(false);
            }}
          >
            {LIBELLE_SUITE.CONTINUER_SEUL}
          </Button>
          <Button
            variante="lien"
            className="self-center"
            onClick={() => {
              setSuite("NE_PLUS_PROPOSER");
              setOuverte(false);
            }}
          >
            {LIBELLE_SUITE.NE_PLUS_PROPOSER}
          </Button>
        </div>

        <p className="text-pretty text-13 text-ink-500">{MENTION_INDEPENDANCE}</p>
      </BottomSheet>
    </section>
  );
}
