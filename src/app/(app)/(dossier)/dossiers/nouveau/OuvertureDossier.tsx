"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { libellePieces, type FicheDestination } from "@/domain/destinations/fiche";
import { getPack } from "@/domain/payments/pricing";
import { jourEnFrancais } from "@/domain/format/moment";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import { formatMontant } from "@/lib/utils";

/**
 * C-05 — Ouverture de dossier.
 *
 * La date cible commande l'échéancier : c'est la seule question vraiment
 * nécessaire, et « Je ne sais pas encore » est une réponse valable — forcer
 * une date inventée produirait un échéancier faux.
 *
 * ── La question demandait le dépôt, le champ stockait la rentrée ───────
 *
 * L'écran demandait « Quand veux-tu déposer ta demande ? » et proposait le
 * 15 janvier. La réponse partait dans `Application.targetDate`, que DOC-11
 * WF-09 étape 1 définit comme la **date cible** — rentrée ou prise de
 * poste —, et dont `echeancesDepuis` retire le délai d'instruction pour
 * poser l'échéance de dépôt. Un candidat qui répondait « je dépose le 15
 * janvier » se voyait donc fixer un dépôt au 17 octobre : tout son
 * échéancier avançait de quatre-vingt-dix jours.
 *
 * Ce n'était pas une étiquette de travers, c'était la mauvaise donnée à la
 * source. La question porte maintenant sur ce que le champ contient, et
 * l'écran dit que le dépôt s'en déduira.
 *
 * Les dates proposées sont calculées depuis aujourd'hui et non écrites en
 * dur. Figées, elles finissent dans le passé et l'écran propose alors des
 * départs impossibles — le même défaut que les créneaux de consultant du
 * lot WF-12.
 *
 * Un formulaire (revue du 07/10/2026, M11) : Entrée dans un champ envoie,
 * comme le bouton principal.
 */
interface Rentree {
  valeur: string;
  libelle: string;
  description: string;
  /** Date ISO, transmise au serveur. Absente pour « je ne sais pas encore ». */
  iso?: string;
}

/** Prochaine occurrence d'un jour et d'un mois, strictement à venir. */
function prochaine(mois: number, jour: number, aujourdhui: Date): Date {
  const cette = new Date(Date.UTC(aujourdhui.getUTCFullYear(), mois - 1, jour));
  if (cette.getTime() > aujourdhui.getTime()) return cette;
  return new Date(Date.UTC(aujourdhui.getUTCFullYear() + 1, mois - 1, jour));
}

export function datesProposees(aujourdhui = new Date()): Rentree[] {
  /*
    Les deux rentrées, et non plus les deux fenêtres de dépôt. Le champ
    porte la date cible ; proposer des dates de dépôt y écrivait une
    rentrée de janvier, dont l'échéancier déduisait ensuite un dépôt en
    octobre de l'année précédente.
  */
  const septembre = prochaine(9, 1, aujourdhui);
  const fevrier = prochaine(2, 1, aujourdhui);
  return [
    {
      valeur: "septembre",
      libelle: jourEnFrancais(septembre.toISOString()),
      description: "rentrée de septembre",
      iso: septembre.toISOString().slice(0, 10),
    },
    {
      valeur: "fevrier",
      libelle: jourEnFrancais(fevrier.toISOString()),
      description: "rentrée de février",
      iso: fevrier.toISOString().slice(0, 10),
    },
    {
      valeur: "inconnu",
      libelle: "Je ne sais pas encore",
      description: "échéancier calculé plus tard",
    },
  ].sort((a, b) => (a.iso ?? "9999").localeCompare(b.iso ?? "9999"));
}

export function OuvertureDossier({
  fiche,
  apercu,
}: {
  fiche: FicheDestination | null;
  apercu: readonly string[];
}) {
  const router = useRouter();
  const [date, setDate] = useState<string | null>(null);
  const [etablissement, setEtablissement] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const packDossier = getPack("dossier");
  const DATES = datesProposees();

  if (!fiche) return <SansDestination />;

  const autres = Math.max(0, fiche.piecesAReunir - apercu.length);
  const destination = fiche.slug;

  async function ouvrir() {
    if (date === null || envoi) return;
    setEnvoi(true);
    setEchec(null);
    const choisie = DATES.find((d) => d.valeur === date);
    const resultat = await appeler<{ id: string }>("/api/dossiers", {
      // La destination et non l'identifiant de la règle : le serveur
      // retrouve lui-même la règle publiée (02/10/2026).
      corps: { destination, ...(choisie?.iso ? { dateCible: choisie.iso } : {}) },
    });
    if (resultat.ok) {
      router.push(`/dossiers/${resultat.donnees.id}`);
      return;
    }
    setEnvoi(false);
    setEchec(resultat.echec);
  }

  return (
    <form
      noValidate
      aria-labelledby="contenu"
      onSubmit={(e) => {
        e.preventDefault();
        void ouvrir();
      }}
      className="mx-auto flex w-full max-w-decision flex-col gap-6 px-4 py-6 md:px-8 md:py-8"
    >
      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Ouvre ton dossier {fiche.pays}
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          Deux informations suffisent pour générer ta checklist et ton échéancier.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <RadioGroup
          libelle="Quand veux-tu être sur place ?"
          valeur={date}
          onChangement={setDate}
          options={DATES}
        />
        <p className="text-pretty text-13 text-ink-500">
          Rentrée ou prise de poste. La date de dépôt s&apos;en déduit : elle
          recule du délai d&apos;instruction annoncé par la procédure.
        </p>
      </div>

      <Input
        libelle="Établissement visé"
        name="etablissement"
        aide="Optionnel. Tu pourras le renseigner plus tard."
        placeholder="Université de Groningue"
        value={etablissement}
        onChange={(e) => setEtablissement(e.target.value)}
      />

      <section className="flex flex-col gap-3 rounded-lg bg-ink-100 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-16 font-semibold text-ink-900">Aperçu de ta checklist</h2>
          <span className="rounded-full bg-white px-2.5 py-1 text-13 font-medium text-success">
            gratuit
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {apercu.map((piece) => (
            <li key={piece} className="text-14 text-ink-700">
              {piece}
            </li>
          ))}
          {autres > 0 ? (
            <li className="text-14 text-ink-500">
              {autres > 1 ? `${autres} autres pièces` : "1 autre pièce"}
            </li>
          ) : null}
        </ul>
        <p className="text-pretty text-13 text-ink-500">
          {libellePieces(fiche.piecesAReunir)} en tout. L&apos;analyse automatique
          des pièces et l&apos;échéancier font partie du pack {packDossier?.libelle},
          à {packDossier ? formatMontant(packDossier.prix.XOF, "XOF") : ""}.
        </p>
      </section>

      <p className="text-pretty text-13 text-ink-500">
        Ouvrir un dossier ne t&apos;engage à rien et ne constitue aucune démarche
        auprès de l&apos;administration.
      </p>

      <div className="flex flex-col gap-2">
        {echec ? <BlocEchec echec={echec} /> : null}
        <Button
          type="submit"
          pleineLargeur
          className="min-h-action"
          disabled={date === null}
          chargement={envoi}
          raisonDesactivation={
            date === null ? "Choisis une date de départ visée, même approximative." : undefined
          }
        >
          Créer mon dossier
        </Button>
        <p className="text-center text-13 text-ink-500">
          {date === null
            ? "Aucune date retenue"
            : (DATES.find((d) => d.valeur === date)?.libelle ?? "")}
        </p>
      </div>
    </form>
  );
}

/**
 * Aucune fiche publiée : on ne peut pas ouvrir un dossier sur une règle qui
 * n'existe plus. L'écran le dit au lieu de proposer un formulaire qui
 * échouerait à l'envoi.
 */
function SansDestination() {
  return (
    <div className="mx-auto flex w-full max-w-decision flex-col gap-4 px-4 py-10 md:px-8">
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        Aucune destination n&apos;est ouverte en ce moment
      </h1>
      <p className="text-pretty text-16 text-ink-700">
        Les fiches disparaissent de l&apos;affichage dès que leur date de relecture
        est dépassée, et un dossier fige la règle en vigueur à son ouverture :
        il ne peut donc pas s&apos;ouvrir sur une fiche retirée.
      </p>
    </div>
  );
}
