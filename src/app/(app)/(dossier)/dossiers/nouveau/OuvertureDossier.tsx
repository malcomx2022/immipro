"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { ficheParSlug, libellePieces } from "@/domain/destinations/fiche";
import { getPack } from "@/domain/payments/pricing";
import { FICHES, PAYS_BAS } from "@/lib/contenu/destinations";
import { formatMontant } from "@/lib/utils";

/**
 * C-05 — Ouverture de dossier.
 *
 * La date de dépôt commande l'échéancier : c'est la seule question vraiment
 * nécessaire, et « Je ne sais pas encore » est une réponse valable — forcer
 * une date inventée produirait un échéancier faux.
 */
const DATES = [
  { valeur: "janvier", libelle: "15 janvier 2027", description: "rentrée de septembre 2027" },
  { valeur: "mai", libelle: "2 mai 2027", description: "rentrée de février 2028" },
  {
    valeur: "inconnu",
    libelle: "Je ne sais pas encore",
    description: "échéancier calculé plus tard",
  },
];

export function OuvertureDossier() {
  return (
    <Suspense fallback={<Squelette />}>
      <Formulaire />
    </Suspense>
  );
}

function Formulaire() {
  const parametres = useSearchParams();
  const fiche = ficheParSlug(FICHES, parametres.get("destination") ?? "") ?? PAYS_BAS;

  const [date, setDate] = useState<string | null>(null);
  const [etablissement, setEtablissement] = useState("");
  const packDossier = getPack("dossier");

  const apercu = [
    "Passeport",
    "Diplôme du baccalauréat",
    "Relevés de notes, trois dernières années",
  ];
  const autres = Math.max(0, fiche.piecesAReunir - apercu.length);

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
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

      <RadioGroup
        libelle="Quand veux-tu déposer ta demande ?"
        valeur={date}
        onChangement={setDate}
        options={DATES}
      />

      <Input
        libelle="Établissement visé"
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
        <Button
          pleineLargeur
          className="min-h-action"
          disabled={date === null}
          raisonDesactivation={
            date === null ? "Choisissez une date de dépôt visée, même approximative." : undefined
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
    </div>
  );
}

function Squelette() {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-8">
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        Ouvrir un dossier
      </h1>
      <p role="status" className="mt-2 text-16 text-ink-700">
        Lecture de la destination choisie.
      </p>
    </div>
  );
}
