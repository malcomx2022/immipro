"use client";

import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import {
  CHAMPS_PROFIL,
  CHAMP_TELEPHONE,
  champsRestants,
  normaliserTelephone,
  corpsDuProfil,
  libelleAvancementProfil,
  profilComplet,
  type CleChampProfil,
  type Profil as ProfilCandidat,
} from "@/domain/comptes/profil";
import { ADRESSE_FACTURATION, NOM_FACTURATION } from "@/domain/facturation/facture";

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
 *
 * Il n'affiche plus que ce qu'il sait garder. Quatre champs — date de
 * naissance, nationalité, personnes à charge, refus antérieur — étaient
 * rendus, comptés et jetés à l'envoi, faute de colonne où les ranger ;
 * l'arbitrage qui les rétablirait est noté dans `domain/comptes/profil`.
 */
const SECTIONS = ["Identité", "Parcours"] as const;

export function Profil({
  initial,
  telephone: telephoneInitial = "",
  facturation: facturationInitiale = { nom: "", adresse: "" },
}: {
  initial: ProfilCandidat;
  /** Le numéro enregistré sur le compte, vide s'il n'y en a pas. */
  telephone?: string;
  /** Nom et adresse de facturation enregistrés (M.C), vides s'ils ne le sont pas. */
  facturation?: { nom: string; adresse: string };
}) {
  const [profil, setProfil] = useState<ProfilCandidat>(initial);
  const [telephone, setTelephone] = useState(telephoneInitial);
  // Le nom de facturation part du nom du profil quand il n'a jamais été
  // saisi : la plupart des candidats paient pour eux-mêmes. Il reste
  // visible et modifiable, et ne s'enregistre qu'avec le reste.
  const [facturationNom, setFacturationNom] = useState(
    facturationInitiale.nom || (initial.nom ?? ""),
  );
  const [facturationAdresse, setFacturationAdresse] = useState(facturationInitiale.adresse);
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
    /*
      La composition vient du domaine, à côté de la liste des champs
      affichés. Écrite ici à la main, elle nommait trois clés pendant que
      l'écran en affichait sept : les quatre autres — date de naissance,
      nationalité, personnes à charge, refus antérieur — étaient saisies,
      comptées dans « 4 à renseigner », puis jetées avant l'envoi, et
      l'écran répondait « Profil enregistré. »
    */
    // Le numéro ne part que s'il est saisi : l'API refuse une chaîne vide
    // au format, et un champ laissé vide ne doit pas bloquer le reste.
    const numero = normaliserTelephone(telephone);
    const resultat = await appeler("/api/comptes/profil", {
      methode: "PUT",
      corps: {
        ...corpsDuProfil(profil),
        ...(numero ? { telephone: numero } : {}),
        // Toujours présentes, vides comprises : vider un champ est un geste.
        facturationNom: facturationNom.trim(),
        facturationAdresse: facturationAdresse.trim(),
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

      {/* Le numéro auquel renvoie le récapitulatif de paiement. Hors du
          décompte : il n'affine pas la checklist. */}
      <section className="flex flex-col gap-4">
        <h2 className="text-19 font-semibold text-ink-900">Paiement Mobile Money</h2>
        <Input
          id="telephone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          libelle={CHAMP_TELEPHONE.libelle}
          aide={CHAMP_TELEPHONE.aide}
          erreur={echec?.champs?.telephone}
          placeholder="+229 01 00 00 00 00"
          value={telephone}
          onChange={(e) => {
            setTelephone(e.target.value);
            setEnregistre(false);
          }}
        />
      </section>

      {/* L'identité portée sur chaque facture — avis comptable M.C. Hors
          du décompte : elle n'affine pas la checklist. */}
      <section className="flex flex-col gap-4">
        <h2 id="facturation" tabIndex={-1} className="text-19 font-semibold text-ink-900 outline-none">
          Facturation
        </h2>
        <Input
          autoComplete="name"
          libelle={NOM_FACTURATION.libelle}
          aide={NOM_FACTURATION.aide}
          erreur={echec?.champs?.facturationNom}
          maxLength={NOM_FACTURATION.max}
          placeholder="À renseigner"
          value={facturationNom}
          onChange={(e) => {
            setFacturationNom(e.target.value);
            setEnregistre(false);
          }}
        />
        <Input
          autoComplete="street-address"
          libelle={ADRESSE_FACTURATION.libelle}
          aide={ADRESSE_FACTURATION.aide}
          erreur={echec?.champs?.facturationAdresse}
          maxLength={ADRESSE_FACTURATION.max}
          placeholder="À renseigner"
          value={facturationAdresse}
          onChange={(e) => {
            setFacturationAdresse(e.target.value);
            setEnregistre(false);
          }}
        />
      </section>

      <p className="text-pretty text-13 text-ink-500">
        Ton parcours sert à adapter ta checklist, et ImmiPro ne le transmet
        jamais à une administration chargée des visas. Le numéro sert au
        paiement ; le nom et l&apos;adresse de facturation figurent sur tes
        factures, conservées dix ans comme toute pièce comptable.
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
