"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { CHAMP_CONTROLE } from "@/components/ui/champ";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import {
  ROLES_A_LA_CREATION,
  lireLaCreation,
  type SaisieDeCreation,
} from "@/domain/comptes/gestion-interne";
import { LIBELLE_ROLE } from "@/domain/comptes/hierarchie";
import { cn } from "@/lib/utils";

/**
 * Créer un compte interne — B-03, S.210. Réservé au super-administrateur.
 *
 * Un `<form>` dont les refus sont ceux de la route, dits sous le champ
 * avant l'envoi (`lireLaCreation`). Le compte naît sans mot de passe : la
 * personne le choisit depuis « Mot de passe oublié », et l'écran le dit.
 */
const VIDE: SaisieDeCreation = { email: "", prenom: "", nom: "", role: "VEILLEUR", motif: "" };

type Issue = { issue: "cree"; email: string } | { issue: "existe"; email: string };

export function CreationDeCompteInterne() {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState<SaisieDeCreation>(VIDE);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [fait, setFait] = useState<string | null>(null);

  const changer = (partiel: Partial<SaisieDeCreation>) => setSaisie((s) => ({ ...s, ...partiel }));

  async function creer() {
    setEchec(null);
    setFait(null);
    const lue = lireLaCreation(saisie);
    if (!lue.ok) {
      setChamps(lue.champs);
      return;
    }
    setChamps({});
    setEnvoi(true);
    const resultat = await appeler<Issue>("/api/admin/comptes", { methode: "POST", corps: saisie });
    setEnvoi(false);
    if (!resultat.ok) {
      setChamps(resultat.echec.champs ?? {});
      setEchec(resultat.echec);
      return;
    }
    if (resultat.donnees.issue === "existe") {
      setChamps({
        email:
          "Un compte existe déjà à cette adresse. Sélectionne-le dans la liste pour changer son rôle.",
      });
      return;
    }
    setFait(
      `Compte créé pour ${resultat.donnees.email}. Il n'a pas encore de mot de passe : la personne le choisit depuis « Mot de passe oublié » sur la page de connexion, avec le code reçu à cette adresse.`,
    );
    setSaisie(VIDE);
    router.refresh();
  }

  if (!ouvert) {
    return (
      <div className="flex flex-col gap-2">
        <Button variante="secondaire" onClick={() => setOuvert(true)}>
          Créer un compte interne
        </Button>
        {fait ? (
          <p role="status" className="text-pretty text-14 text-ink-900">
            {fait}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      noValidate
      aria-label="Créer un compte interne"
      onSubmit={(e) => {
        e.preventDefault();
        void creer();
      }}
      className="flex w-full flex-col gap-3 rounded-lg border border-ink-300 bg-white p-4"
    >
      <h2 className="text-16 font-semibold text-ink-900">Créer un compte interne</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <Champ libelle="Adresse" erreur={champs.email}>
          <input
            type="email"
            value={saisie.email}
            onChange={(e) => changer({ email: e.target.value })}
            className={CHAMP_CONTROLE}
          />
        </Champ>
        <Champ libelle="Rôle" erreur={champs.role}>
          <select
            value={saisie.role}
            onChange={(e) => changer({ role: e.target.value })}
            className={CHAMP_CONTROLE}
          >
            {ROLES_A_LA_CREATION.map((r) => (
              <option key={r} value={r}>
                {LIBELLE_ROLE[r]}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Prénom" erreur={champs.prenom}>
          <input value={saisie.prenom} onChange={(e) => changer({ prenom: e.target.value })} className={CHAMP_CONTROLE} />
        </Champ>
        <Champ libelle="Nom" erreur={champs.nom}>
          <input value={saisie.nom} onChange={(e) => changer({ nom: e.target.value })} className={CHAMP_CONTROLE} />
        </Champ>
      </div>
      <Champ libelle="Motif de la création" erreur={champs.motif}>
        <textarea
          rows={2}
          value={saisie.motif}
          onChange={(e) => changer({ motif: e.target.value })}
          className={cn(CHAMP_CONTROLE, "h-auto py-2.5")}
        />
      </Champ>
      <p className="text-pretty text-13 text-ink-500">
        Le rôle de super-administrateur ne se donne pas à la création : il se donne ensuite, par
        changement de rôle, une fois l&apos;adresse vérifiée.
      </p>
      {echec ? <BlocEchec echec={echec} annonce /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={envoi} raisonDesactivation="Envoi en cours.">
          {envoi ? "Envoi…" : "Créer le compte"}
        </Button>
        <Button variante="tertiaire" disabled={envoi} onClick={() => setOuvert(false)}>
          Fermer
        </Button>
      </div>
    </form>
  );
}

function Champ({ libelle, erreur, children }: { libelle: string; erreur?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-14 font-medium text-ink-900">
      {libelle}
      {children}
      {erreur ? <span className="text-pretty text-13 font-normal text-danger">{erreur}</span> : null}
    </label>
  );
}
