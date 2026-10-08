"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { LienBouton } from "@/components/ui/LienBouton";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import type { Dossier } from "@/domain/dossiers/dossier";
import {
  AIDE_DATE_DEPOT,
  AVERTISSEMENT_DEPOT,
  QUESTION_DATE_DEPOT,
  refusDeLaDateDeDepot,
  EFFETS_DEPOT,
  LIBELLE_CONFIRMATION_DEPOT,
  MENTION_DECLARATION,
  RAISON_BOUTON_DEPOT,
  etatDuDepot,
} from "@/domain/dossiers/depot";
import { EnteteDossier } from "../EnteteDossier";

/**
 * C-11a — Déclaration de dépôt. WF-10 étape 1, INV-1.
 *
 * La case n'est pas pré-cochée : la déclaration fige le dossier, et seul
 * le candidat sait que sa demande est partie. Un dossier qui n'est pas prêt
 * ne tombe pas sur un bouton désactivé : il lit pourquoi, et le lien vers
 * ce qui lui reste à faire.
 *
 * Après la déclaration, retour à la checklist : c'est là que s'affiche la
 * conservation des pièces et, le moment venu, « L'instruction continue ».
 *
 * ── La date réelle du dépôt (S.89) ──────────────────────────────────
 *
 * Le champ est obligatoire, prérempli avec la date du jour **du
 * candidat** et modifiable avant confirmation. C'est elle, et non le jour
 * de la déclaration, qui commande les relances et la conservation : un
 * dépôt fait il y a trois semaines et déclaré aujourd'hui garde ses trois
 * semaines. Le refus s'affiche sous le champ, avant l'envoi, avec ce qu'il
 * faut saisir à la place ; le serveur applique la même règle.
 */
export interface DepotProps {
  dossier: Dossier;
  /** Aujourd'hui dans le fuseau du candidat, `AAAA-MM-JJ`. */
  aujourdhui: string;
  /** Jour d'ouverture du dossier dans ce même fuseau. */
  ouvertLe: string;
}

export function Depot({ dossier, aujourdhui, ouvertLe }: DepotProps) {
  const router = useRouter();
  const [deposeLe, setDeposeLe] = useState(aujourdhui);
  const [confirme, setConfirme] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const etat = etatDuDepot(dossier.statut);
  const refusDate = refusDeLaDateDeDepot(deposeLe, aujourdhui, ouvertLe);

  async function declarer() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler(`/api/dossiers/${dossier.id}/depot`, {
      corps: { deposeLe },
    });
    if (resultat.ok) {
      router.push(`/dossiers/${dossier.id}`);
      return;
    }
    setEnvoi(false);
    setEchec(resultat.echec);
  }

  return (
    <div className="mx-auto flex w-full max-w-colonne flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <EnteteDossier
        dossier={dossier}
        retour={`/dossiers/${dossier.id}`}
        libelleRetour="Checklist"
      />

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          {etat.titre}
        </h1>
        <p className="text-pretty text-16 text-ink-700">{etat.corps}</p>
      </div>

      {etat.declarable ? (
        <>
          <section className="flex flex-col gap-2 rounded-lg bg-ink-100 p-4">
            <h2 className="text-16 font-semibold text-ink-900">
              Ce qui se passe à la déclaration
            </h2>
            <ul className="flex flex-col gap-2">
              {EFFETS_DEPOT.map((effet) => (
                <li key={effet} className="flex items-start gap-2.5">
                  <span aria-hidden="true" className="pt-2 text-ink-500">
                    •
                  </span>
                  <span className="text-pretty text-14 text-ink-700">{effet}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-pretty text-14 text-ink-700">{AVERTISSEMENT_DEPOT}</p>

          <div className="flex flex-col gap-3 border-t border-ink-300 pt-4">
            <Input
              type="date"
              libelle={QUESTION_DATE_DEPOT}
              aide={AIDE_DATE_DEPOT}
              required
              min={ouvertLe}
              max={aujourdhui}
              value={deposeLe}
              onChange={(e) => setDeposeLe(e.target.value)}
              erreur={refusDate ?? echec?.champs?.deposeLe}
            />
            <Checkbox
              libelle={LIBELLE_CONFIRMATION_DEPOT}
              checked={confirme}
              onChangement={setConfirme}
            />
            {echec ? <BlocEchec echec={echec} /> : null}
            <Button
              pleineLargeur
              disabled={!confirme || refusDate !== null}
              chargement={envoi}
              raisonDesactivation={refusDate ? "Corrige d'abord la date du dépôt." : RAISON_BOUTON_DEPOT}
              className="min-h-action"
              onClick={() => void declarer()}
            >
              Déclarer mon dépôt
            </Button>
            <p className="text-center text-13 text-ink-500">{MENTION_DECLARATION}</p>
          </div>
        </>
      ) : (
        <LienBouton
          href={`/dossiers/${dossier.id}`}
          variante="secondaire"
          pleineLargeur
          className="md:w-auto md:self-start"
        >
          Revenir à la checklist
        </LienBouton>
      )}
    </div>
  );
}
