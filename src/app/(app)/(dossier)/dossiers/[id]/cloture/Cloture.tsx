"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import { LienBouton } from "@/components/ui/LienBouton";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { CHAMP_CONTROLE } from "@/components/ui/champ";
import type { Dossier } from "@/domain/dossiers/dossier";
import type { IssueDemarche } from "@/domain/dossiers/cloture";
import {
  AIDE_DETAIL,
  AVERTISSEMENT_IRREVERSIBLE,
  EFFETS_CLOTURE,
  ISSUES,
  demandeUnDetail,
  libelleDetail,
  mentionCloture,
} from "@/domain/dossiers/cloture";
import { cn } from "@/lib/utils";
import { EnteteDossier } from "../EnteteDossier";

/**
 * C-11 — Clôture du dossier. WF-10, INV-5.
 *
 * L'issue n'est pas présélectionnée : proposer « J'ai obtenu mon visa » coché
 * d'avance fausserait la seule donnée que cet écran collecte, et c'est celle
 * qui corrige les checklists.
 *
 * La purge est annoncée comme une garantie, pas comme une perte, et le
 * bouton de téléchargement vient avant le bouton de clôture : c'est l'ordre
 * dans lequel on veut que les gestes soient faits.
 */
export function Cloture({ dossier }: { dossier: Dossier }) {
  const router = useRouter();
  const [issue, setIssue] = useState<IssueDemarche | null>(null);
  const [detail, setDetail] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const idDetail = useId();

  /**
   * La clôture est irréversible côté candidat : elle enclenche la purge.
   * Le serveur rend la date, et c'est elle qui s'affiche ensuite — pas un
   * délai recalculé par l'écran, qui pourrait diverger de l'engagement.
   */
  async function cloturer() {
    if (!issue) return;
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler(`/api/dossiers/${dossier.id}/cloture`, {
      corps: { issue, ...(detail.trim() ? { detail: detail.trim() } : {}) },
    });
    if (resultat.ok) {
      router.push("/tableau-de-bord");
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
          Comment s&apos;est terminée ta démarche ?
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          Ta réponse nous sert à corriger nos checklists. Elle reste anonyme dans
          nos statistiques.
        </p>
      </div>

      <RadioGroup
        libelle="Issue de la démarche"
        options={ISSUES.map((i) => ({ valeur: i.cle, libelle: i.libelle }))}
        valeur={issue}
        onChangement={(valeur) => setIssue(valeur as IssueDemarche)}
      />

      {issue && demandeUnDetail(issue) ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idDetail} className="text-14 font-medium text-ink-900">
            {libelleDetail(issue)}
          </label>
          <textarea
            id={idDetail}
            rows={4}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            aria-describedby={`${idDetail}-aide`}
            className={cn(CHAMP_CONTROLE, "h-auto py-2.5")}
          />
          <span id={`${idDetail}-aide`} className="text-13 text-ink-500">
            {AIDE_DETAIL}
          </span>
        </div>
      ) : null}

      <section className="flex flex-col gap-2 rounded-lg bg-ink-100 p-4">
        <h2 className="text-16 font-semibold text-ink-900">
          Ce qui se passe à la clôture
        </h2>
        <ul className="flex flex-col gap-2">
          {EFFETS_CLOTURE.map((effet) => (
            <li key={effet} className="flex items-start gap-2.5">
              <span aria-hidden="true" className="pt-2 text-ink-500">
                •
              </span>
              <span className="text-pretty text-14 text-ink-700">{effet}</span>
            </li>
          ))}
        </ul>
        <LienBouton
          href={`/dossiers/${dossier.id}/archive`}
          variante="secondaire"
          pleineLargeur
          className="mt-1 md:w-auto md:self-start"
        >
          Télécharger mon dossier
        </LienBouton>
      </section>

      <p className="text-pretty text-14 text-ink-700">{AVERTISSEMENT_IRREVERSIBLE}</p>

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4">
        {echec ? <BlocEchec echec={echec} /> : null}
        <Button
          variante="destructif"
          pleineLargeur
          disabled={issue === null}
          chargement={envoi}
          raisonDesactivation="Choisis d'abord l'issue de ta démarche : c'est elle qui nous sert à corriger la checklist."
          className="min-h-action"
          onClick={() => void cloturer()}
        >
          Clôturer mon dossier
        </Button>
        {issue ? (
          <p aria-live="polite" className="text-center text-13 text-ink-500">
            {mentionCloture(issue)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
