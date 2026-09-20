"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { LienBouton } from "@/components/ui/LienBouton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { MotifProposition, Partenaire } from "@/domain/consultants/proposition";
import {
  ENGAGEMENTS,
  MENTION_INDEPENDANCE,
  libelleOffre,
  type SuiteProposition,
} from "@/domain/consultants/proposition";
import { FORMULATION, type GenrePartenaire } from "@/domain/partenaires/affiliation";
import {
  CONSULTATION,
  CONSULTATION_DUREE_MINUTES,
  deviseParDefaut,
} from "@/domain/payments/pricing";
import { formatMontant } from "@/lib/utils";
import { appeler } from "@/lib/api";

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
 *
 * Trois énoncés dépendent du genre du partenaire, et il a fallu les voir à
 * l'écran pour s'en apercevoir : sous un courtier en assurance, cet écran
 * annonçait « Premier entretien : 20 000 F, 45 minutes » — le tarif d'une
 * consultation — et renvoyait vers l'annuaire des consultants. Le titre, le
 * tarif et l'action viennent donc du genre. Le reste ne bouge pas : la
 * divulgation de commission, les engagements et la mention d'indépendance
 * valent pour tous.
 */
export interface PropositionPartenaireProps {
  partenaire: Partenaire;
  motif: MotifProposition;
  /** Dossier concerné : l'annuaire est propre à sa destination (T-04). */
  dossierId: string;
  /**
   * Ligne de suivi de la proposition (WF-13). Absente, l'écran fonctionne
   * sans rien enregistrer : c'est ce qui permet de le rendre dans un test
   * sans base, et rien d'autre — en production la page la fournit toujours.
   */
  referenceId?: string;
  /** Ce qui est proposé : le tarif, le titre et l'action en dépendent. */
  genre?: GenrePartenaire;
  /** Adresse du partenaire, pour une redirection hors du site. */
  url?: string;
  /** Code pays du candidat, pour la devise affichée. */
  pays?: string;
}

export function PropositionPartenaire({
  partenaire,
  motif,
  dossierId,
  referenceId,
  genre = "CONSULTANT",
  url,
  pays = "BJ",
}: PropositionPartenaireProps) {
  const [ouverte, setOuverte] = useState(false);
  const [suite, setSuite] = useState<SuiteProposition | null>(null);

  /**
   * L'issue est enregistrée, et l'écran n'attend pas la réponse pour
   * l'afficher. Faire patienter quelqu'un qui vient de dire « ne plus me
   * proposer » devant un bouton en chargement serait le contraire de ce que
   * la phrase promet. Le serveur est la vérité au rechargement suivant ; un
   * refus perdu par une coupure réseau se redemande, il ne s'impose pas.
   */
  function tracer(choix: SuiteProposition) {
    setSuite(choix);
    setOuverte(false);
    if (!referenceId) return;
    void appeler(`/api/dossiers/${dossierId}/partenaires/${referenceId}`, {
      corps: { suite: choix },
    });
  }

  const devise = deviseParDefaut(pays);
  const mots = FORMULATION[genre];
  const offre = mots.tarifDeLaGrille
    ? libelleOffre(formatMontant(CONSULTATION.prix[devise], devise), CONSULTATION_DUREE_MINUTES)
    : null;
  // Un consultant se réserve chez nous ; un partenaire de service se
  // rejoint sur son site. Sans adresse, on reste chez nous plutôt que de
  // rendre un lien mort.
  const destination = genre === "CONSULTANT" || !url ? `/consultants?dossier=${dossierId}` : url;
  const sortDuSite = destination === url;

  if (suite === "NE_PLUS_PROPOSER") {
    return (
      <p aria-live="polite" className="text-pretty text-14 text-ink-700">
        Nous ne te proposerons plus de partenaire. Tu peux revenir sur ce choix
        depuis ton profil.
      </p>
    );
  }

  if (suite === "CONTINUER_SEUL") {
    return (
      <p aria-live="polite" className="text-pretty text-14 text-ink-700">
        Tu continues sans partenaire. Ton dossier et ton pack sont inchangés.
      </p>
    );
  }

  return (
    <section className="flex flex-col items-start gap-2 rounded-lg border border-ink-300 p-4">
      <h2 className="text-16 font-semibold text-ink-900">{mots.titre}</h2>
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
        titre={mots.titre}
      >
        <p className="text-pretty text-14 text-ink-700">
          {motif.constat} {motif.raison}
        </p>

        <div className="flex flex-col gap-1 rounded-md border border-ink-300 p-3.5">
          <span className="text-16 font-semibold text-ink-900">{partenaire.nom}</span>
          <span className="text-14 text-ink-700">
            {partenaire.ville} · {partenaire.qualification}
          </span>
          {offre ? (
            <span className="pt-1 text-14 font-medium text-ink-900">{offre}</span>
          ) : null}
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
            ImmiPro perçoit une commission de 15 % sur cette prestation.
          </li>
          {ENGAGEMENTS.map((engagement) => (
            <li key={engagement} className="text-pretty text-14 text-ink-700">
              {engagement}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 border-t border-ink-300 pt-3">
          <LienBouton
            href={destination}
            pleineLargeur
            className="min-h-action"
            {...(sortDuSite
              ? { target: "_blank", rel: "noopener noreferrer nofollow sponsored" }
              : {})}
            onClick={() => tracer("CRENEAUX")}
          >
            {mots.action}
          </LienBouton>
          <Button
            variante="secondaire"
            pleineLargeur
            onClick={() => tracer("CONTINUER_SEUL")}
          >
            {mots.continuer}
          </Button>
          <Button
            variante="lien"
            className="self-center"
            onClick={() => tracer("NE_PLUS_PROPOSER")}
          >
            {mots.refus}
          </Button>
        </div>

        <p className="text-pretty text-13 text-ink-500">
          {MENTION_INDEPENDANCE} {mots.responsabilite}
        </p>
      </BottomSheet>
    </section>
  );
}
