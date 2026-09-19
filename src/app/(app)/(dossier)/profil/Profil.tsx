"use client";

import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
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
 *
 * Le profil arrive de la page ; l'écran l'édite et l'enregistre. Ce qu'il
 * ne fait pas : deviner des valeurs par défaut. Un champ vide se voit et se
 * remplit, un champ pré-rempli au hasard se relit une fois et ne se corrige
 * jamais.
 */
const SECTIONS = ["Identité", "Parcours", "Situation"] as const;

export function Profil({ initial }: { initial: ProfilCandidat }) {
  const [profil, setProfil] = useState<ProfilCandidat>(initial);
  const [envoi, setEnvoi] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);

  const modifier = (cle: CleChampProfil) => (valeur: string) => {
    setProfil((precedent) => ({ ...precedent, [cle]: valeur }));
    setEnregistre(false);
  };

  async function enregistrer() {
    setEnvoi(true);
    setEchec(null);
    const [prenom, ...reste] = (profil.nom ?? "").trim().split(/\s+/u);
    const resultat = await appeler("/api/comptes/profil", {
      methode: "PUT",
      corps: {
        ...(prenom ? { prenom } : {}),
        ...(reste.length > 0 ? { nom: reste.join(" ") } : {}),
        ...(profil.diplome ? { diplome: profil.diplome } : {}),
        ...(profil.anglais ? { langues: { en: profil.anglais } } : {}),
      },
    });
    setEnvoi(false);
    if (resultat.ok) setEnregistre(true);
    else setEchec(resultat.echec);
  }

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
        {echec ? <BlocEchec echec={echec} /> : null}
        <Button
          pleineLargeur
          className="min-h-action"
          chargement={envoi}
          onClick={() => void enregistrer()}
        >
          Enregistrer
        </Button>
        {enregistre ? (
          <p role="status" className="text-center text-13 text-ink-500">
            Profil enregistré.
          </p>
        ) : null}
        <p className="text-center text-13 text-ink-500">
          Tu peux compléter ton profil plus tard
        </p>
      </div>
    </div>
  );
}
