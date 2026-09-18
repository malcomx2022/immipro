"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  CHAMPS_PROFIL,
  champsRestants,
  libelleAvancementProfil,
  profilComplet,
  type CleChampProfil,
  type Profil as ProfilCandidat,
} from "@/domain/comptes/profil";

/**
 * C-02 — Profil.
 *
 * Complétion progressive : rien n'est obligatoire tout de suite, et l'écran
 * le dit. Ce qui manque est compté, pas mesuré en part — un décompte se
 * traduit en action, une jauge ne se traduit en rien.
 */
const SECTIONS = ["Identité", "Parcours", "Situation"] as const;

const INITIAL: ProfilCandidat = {
  nom: "Aline Dossou",
  naissance: "12/04/2004",
  nationalite: "Béninoise",
  diplome: "Licence en gestion",
};

export function Profil() {
  const [profil, setProfil] = useState<ProfilCandidat>(INITIAL);

  const modifier = (cle: CleChampProfil) => (valeur: string) =>
    setProfil((precedent) => ({ ...precedent, [cle]: valeur }));

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        Mon profil
      </h1>

      {/* Ce qui remplace « 80 % » : un décompte et ce qu'il apporte. */}
      <div
        aria-live="polite"
        className="flex flex-col gap-1 rounded-lg bg-ink-100 p-4"
      >
        <p className="text-14 font-semibold text-ink-900">
          {profilComplet(profil)
            ? "Profil complet"
            : `${champsRestants(profil)} à renseigner`}
        </p>
        <p className="text-pretty text-14 text-ink-700">
          {libelleAvancementProfil(profil)}
        </p>
      </div>

      {SECTIONS.map((section) => (
        <section key={section} className="flex flex-col gap-4">
          <h2 className="text-19 font-semibold text-ink-900">{section}</h2>
          {CHAMPS_PROFIL.filter((c) => c.section === section).map((champ) => (
            <Input
              key={champ.cle}
              libelle={champ.libelle}
              aide={champ.aide}
              placeholder="À renseigner"
              value={profil[champ.cle] ?? ""}
              onChange={(e) => modifier(champ.cle)(e.target.value)}
            />
          ))}
        </section>
      ))}

      <p className="text-pretty text-13 text-ink-500">
        Ces informations servent à adapter ta checklist. Elles ne sont jamais
        transmises à une administration par ImmiPro.
      </p>

      <div className="flex flex-col gap-2">
        <Button pleineLargeur className="min-h-action">
          Enregistrer
        </Button>
        <p className="text-center text-13 text-ink-500">
          Tu peux compléter ton profil plus tard
        </p>
      </div>
    </div>
  );
}
