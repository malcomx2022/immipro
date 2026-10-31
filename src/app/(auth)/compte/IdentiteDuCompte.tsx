"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import type { IdentiteDuCompte } from "@/server/acces/profil";
import { FUSEAUX_PROPOSES } from "@/domain/dossiers/preferences-rappels";
import { jourCivil } from "@/domain/format/fuseau";
import { SUPPRESSION_INTERNE_REFUSEE } from "@/domain/comptes/gestion-interne";
import {
  BORNES_NOM_AFFICHE,
  LANGUES_DU_COMPTE,
  PAYS_DE_RESIDENCE,
  nomAfficheParDefaut,
  validerIdentite,
  type SaisieDIdentite,
} from "@/domain/comptes/profil";

/**
 * « Mon compte » — S.208.
 *
 * Un formulaire (Entrée envoie), validé à l'écran par la même fonction que
 * le serveur rejoue : un refus est dit sous le champ avant l'envoi, avec
 * ce qu'il faut corriger. Rien n'est perdu sur un échec du serveur : la
 * saisie reste affichée, prête à renvoyer.
 *
 * L'adresse électronique est affichée sans champ : elle reçoit la
 * réinitialisation du mot de passe, et ne se change pas depuis une session.
 */
export interface IdentiteDuCompteProps {
  initial: IdentiteDuCompte;
  /** Compte du back-office : pas de suppression autonome (RG-10.4). */
  interne: boolean;
}

const saisieDe = (i: IdentiteDuCompte): SaisieDIdentite => ({
  prenom: i.prenom,
  nom: i.nom,
  nomAffiche: i.nomAffiche,
  telephone: i.telephone,
  dateNaissance: i.dateNaissance,
  pays: i.pays,
  langue: i.langue,
  fuseau: i.fuseau,
});

const FUSEAUX = FUSEAUX_PROPOSES.map((f) => f.id);

export function IdentiteDuCompteForm({ initial, interne }: IdentiteDuCompteProps) {
  const router = useRouter();
  const [saisie, setSaisie] = useState<SaisieDIdentite>(saisieDe(initial));
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const changer = (partiel: Partial<SaisieDIdentite>) => {
    setConfirmation(null);
    setSaisie((s) => ({ ...s, ...partiel }));
  };

  const aujourdhui = jourCivil(new Date());
  const defaut = nomAfficheParDefaut(saisie.prenom, saisie.nom);

  async function enregistrer() {
    if (envoi) return;
    setEchec(null);
    setConfirmation(null);
    const lue = validerIdentite(saisie, aujourdhui, FUSEAUX);
    if (!lue.ok) {
      setChamps(lue.champs);
      return;
    }
    setChamps({});
    setEnvoi(true);
    const resultat = await appeler<{ enregistre: true; autorisationsRetirees: number }>(
      "/api/comptes/identite",
      { methode: "PUT", corps: saisie },
    );
    setEnvoi(false);
    if (!resultat.ok) {
      setChamps(resultat.echec.champs ?? {});
      setEchec(resultat.echec);
      return;
    }
    setConfirmation(
      resultat.donnees.autorisationsRetirees > 0
        ? "Compte enregistré. Comme tu as moins de dix-huit ans, les propositions de partenaires sont désactivées."
        : "Compte enregistré.",
    );
    router.refresh();
  }

  return (
    <form
      noValidate
      aria-labelledby="contenu"
      onSubmit={(e) => {
        e.preventDefault();
        void enregistrer();
      }}
      className="mx-auto flex w-full max-w-reglages flex-col gap-6 px-4 py-6 md:px-8 md:py-10"
    >
      <Link href={interne ? "/mon-compte" : "/tableau-de-bord"} className="text-14 font-semibold text-ink-900">
        {interne ? "Revenir au back-office" : "Revenir au tableau de bord"}
      </Link>

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Mon compte
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          Ton identité, telle qu&apos;ImmiPro l&apos;affiche et l&apos;utilise pour tes rappels.
          Une facture déjà émise garde le nom du jour de la vente.
        </p>
      </div>

      <section className="flex flex-col gap-1.5 rounded-lg bg-ink-100 p-4">
        <h2 className="text-16 font-semibold text-ink-900">Adresse électronique</h2>
        <p className="break-all text-14 text-ink-900">{initial.email}</p>
        <p className="text-pretty text-13 text-ink-700">
          {initial.emailVerifie
            ? "Vérifiée. Elle reçoit tes codes et ne se change pas depuis cet écran : écris au support depuis la page Contact."
            : "Pas encore vérifiée. Saisis le code reçu à l'inscription depuis la page de vérification."}
        </p>
        {initial.emailVerifie ? null : (
          <Link href="/verification" className="text-14 font-semibold text-ink-900">
            Vérifier mon adresse
          </Link>
        )}
      </section>

      <fieldset className="flex flex-col gap-4">
        <legend className="pb-2 text-16 font-semibold text-ink-900">Identité</legend>
        <Input
          libelle="Prénom"
          name="prenom"
          autoComplete="given-name"
          value={saisie.prenom}
          erreur={champs.prenom}
          onChange={(e) => changer({ prenom: e.target.value })}
        />
        <Input
          libelle="Nom"
          name="nom"
          autoComplete="family-name"
          value={saisie.nom}
          erreur={champs.nom}
          onChange={(e) => changer({ nom: e.target.value })}
        />
        <Input
          libelle="Nom affiché"
          name="nomAffiche"
          autoComplete="nickname"
          value={saisie.nomAffiche}
          placeholder={defaut || undefined}
          aide={
            defaut
              ? `Laisse vide pour afficher « ${defaut} ». Entre ${BORNES_NOM_AFFICHE.min} et ${BORNES_NOM_AFFICHE.max} caractères.`
              : `Entre ${BORNES_NOM_AFFICHE.min} et ${BORNES_NOM_AFFICHE.max} caractères. Vide, ton prénom et ton nom sont affichés.`
          }
          erreur={champs.nomAffiche}
          onChange={(e) => changer({ nomAffiche: e.target.value })}
        />
        <Input
          libelle="Date de naissance"
          name="dateNaissance"
          type="date"
          autoComplete="bday"
          max={aujourdhui}
          value={saisie.dateNaissance}
          aide="Facultative. Elle sert à vérifier l'âge : 13 ans au moins, et aucune proposition de partenaire avant 18 ans."
          erreur={champs.dateNaissance}
          onChange={(e) => changer({ dateNaissance: e.target.value })}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="pb-2 text-16 font-semibold text-ink-900">Coordonnées</legend>
        <Input
          libelle="Téléphone"
          name="telephone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={saisie.telephone}
          aide="Facultatif. Indicatif pays compris : +229 pour le Bénin, +225 pour la Côte d'Ivoire."
          erreur={champs.telephone}
          onChange={(e) => changer({ telephone: e.target.value })}
        />
        <Select
          libelle="Pays de résidence"
          name="pays"
          options={[
            { valeur: "", libelle: "Non renseigné" },
            ...PAYS_DE_RESIDENCE.map((p) => ({ valeur: p.code, libelle: p.libelle })),
          ]}
          value={saisie.pays}
          erreur={champs.pays}
          onChange={(e) => changer({ pays: e.target.value })}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="pb-2 text-16 font-semibold text-ink-900">Préférences</legend>
        <Select
          libelle="Langue préférée"
          name="langue"
          aide="L'interface est en français ; ta préférence est gardée pour les courriels."
          options={LANGUES_DU_COMPTE.map((l) => ({ valeur: l.code, libelle: l.libelle }))}
          value={saisie.langue}
          erreur={champs.langue}
          onChange={(e) => changer({ langue: e.target.value })}
        />
        <Select
          libelle="Fuseau horaire"
          name="fuseau"
          aide="C'est aussi celui de tes rappels d'échéance."
          options={FUSEAUX_PROPOSES.map((f) => ({ valeur: f.id, libelle: f.libelle }))}
          value={saisie.fuseau}
          erreur={champs.fuseau}
          onChange={(e) => changer({ fuseau: e.target.value })}
        />
      </fieldset>

      {echec ? <BlocEchec echec={echec} annonce /> : null}
      {confirmation ? (
        <p role="status" className="text-pretty rounded-md border border-ink-300 bg-ink-100 p-3 text-14 text-ink-900">
          {confirmation}
        </p>
      ) : null}

      <Button type="submit" disabled={envoi} raisonDesactivation="Enregistrement en cours.">
        {envoi ? "Enregistrement…" : "Enregistrer"}
      </Button>

      <nav aria-label="Autres réglages du compte" className="flex flex-col border-t border-ink-300 pt-4">
        <Link href="/compte/securite" className="flex min-h-touch items-center text-14 font-semibold text-ink-900">
          Sécurité et sessions
        </Link>
        <Link href="/consentements" className="flex min-h-touch items-center text-14 font-semibold text-ink-900">
          Mes autorisations
        </Link>
        <Link href="/compte/rappels" className="flex min-h-touch items-center text-14 font-semibold text-ink-900">
          Mes rappels d&apos;échéance
        </Link>
        <Link href="/compte/mes-donnees" className="flex min-h-touch items-center text-14 font-semibold text-ink-900">
          Mes données
        </Link>
        {interne ? (
          <p className="text-pretty py-2 text-13 text-ink-500">{SUPPRESSION_INTERNE_REFUSEE}</p>
        ) : (
          <Link href="/compte/suppression" className="flex min-h-touch items-center text-14 font-semibold text-ink-900">
            Supprimer mon compte
          </Link>
        )}
      </nav>
    </form>
  );
}
