"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  TON_DU_VERDICT,
  corpsDuVerdict,
  phraseDeReplanification,
  titreDuVerdict,
  type DateProposee,
  type Verdict,
} from "@/domain/dossiers/faisabilite";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";

/**
 * C-10 — Le calendrier tient-il, et comment le changer. WF-09 étape 4.
 *
 * ── Ce que l'écran comptait, et ce qu'il ne disait pas ─────────────────
 *
 * L'échéancier annonçait « 3 échéances sont en retard. » Trois lignes
 * rouges, et rien qui dise la seule chose qui compte : qu'avec les délais
 * de sa procédure, la date de départ visée n'est plus atteignable. Un
 * décompte n'est pas un diagnostic.
 *
 * ── Et la commande qui ne commandait rien ──────────────────────────────
 *
 * « Changer la date de dépôt » menait à la checklist, où rien ne la
 * change : `targetDate` n'avait qu'un écrivain, l'ouverture du dossier.
 * Une alerte d'incompatibilité sans moyen d'y répondre aurait été une
 * commande inerte de plus. Le champ est ici, et il écrit.
 *
 * Il reste affiché quand le calendrier tient : une date de départ se change
 * pour d'autres raisons qu'un retard, et la cacher obligerait à rouvrir un
 * dossier pour avancer d'un mois.
 */
const BORDURE: Record<"alerte" | "attention" | "neutre", string> = {
  alerte: "border-danger",
  attention: "border-warning",
  neutre: "border-ink-300",
};

export interface FaisabiliteProps {
  dossierId: string;
  verdict: Verdict;
  /**
   * La date de repli proposée. Absente quand le calendrier tient : proposer
   * de repousser un départ qui tient reviendrait à conseiller d'attendre,
   * ce qui n'est pas notre rôle.
   */
  proposition: DateProposee | null;
  /** Date visée actuelle, ISO, pour pré-remplir le champ. */
  dateCible: string | null;
  /** Date du serveur au rendu, ISO — le minimum du champ. */
  aujourdhui: string;
}

export function Faisabilite({
  dossierId,
  verdict,
  proposition,
  dateCible,
  aujourdhui,
}: FaisabiliteProps) {
  const router = useRouter();
  const ton = TON_DU_VERDICT[verdict.etat];
  /*
    Le champ part de la date proposée quand il y en a une : le candidat
    dont le calendrier ne tient plus n'a pas à recopier une date qu'on
    vient de calculer pour lui.
  */
  const [date, setDate] = useState(proposition?.date ?? dateCible ?? "");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);

  async function replanifier() {
    if (date === "" || date === dateCible || envoi) return;
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler(`/api/dossiers/${dossierId}/echeancier`, {
      methode: "PUT",
      corps: { dateCible: date },
    });
    setEnvoi(false);
    if (resultat.ok) {
      router.refresh();
      return;
    }
    setEchec(resultat.echec);
  }

  return (
    <section
      className={`flex flex-col gap-3 rounded-lg border-l-6 bg-white p-4 shadow-e2 ${ton ? BORDURE[ton] : BORDURE.neutre}`}
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="text-pretty text-19 font-semibold text-ink-900">
          {titreDuVerdict(verdict)}
        </h2>
        <p className="max-w-lecture-large text-pretty text-14 text-ink-700">
          {corpsDuVerdict(verdict)}
        </p>
        {proposition ? (
          <p className="max-w-lecture-large text-pretty text-14 font-medium text-ink-900">
            {phraseDeReplanification(proposition)}
          </p>
        ) : null}
      </div>

      {/* Un formulaire (revue du 07/10/2026, M11) : Entrée dans la date
          replanifie. `noValidate` : la borne `min` ne doit pas ouvrir la
          bulle anglaise du navigateur, l'écran et le serveur disent déjà
          pourquoi une date est refusée. */}
      <form
        noValidate
        aria-label="Replanifier le départ"
        onSubmit={(e) => {
          e.preventDefault();
          void replanifier();
        }}
        className="flex flex-col gap-2 border-t border-ink-300 pt-3 md:flex-row md:items-end"
      >
        <Input
          type="date"
          name="dateCible"
          libelle="Nouvelle date de départ visée"
          aide="Tout l'échéancier est recalculé depuis les délais de ta procédure."
          min={aujourdhui}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          classNameChamp="md:flex-1"
        />
        <Button
          type="submit"
          variante="secondaire"
          className="min-h-action md:w-auto"
          chargement={envoi}
          disabled={date === "" || date === dateCible}
        >
          Replanifier
        </Button>
      </form>

      {echec ? <BlocEchec echec={echec} /> : null}
    </section>
  );
}
