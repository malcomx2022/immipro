"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import {
  DELAIS_D_ALERTE,
  FUSEAUX_PROPOSES,
  HEURE_DES_RAPPELS,
  MENTION_CANAL_INDISPONIBLE,
  delaiEnLettres,
  phraseDesRappels,
  suiteDuDernierRappel,
  type CanalEmail,
  type DelaiDAlerte,
  type EtatDuCourrier,
  type PreferencesDeRappel,
} from "@/domain/dossiers/preferences-rappels";
import { momentEnFrancais } from "@/domain/format/moment";

/**
 * Préférences de rappel d'échéance — S.87, RG-09.4.
 *
 * L'écran qui manquait pour remettre le lien « modifier » sur
 * l'échéancier. Quatre réglages, et au-dessus du bouton **la phrase qui
 * dit ce qui partira**, recalculée à chaque changement : le candidat lit
 * la conséquence de son choix avant de l'enregistrer, et cette phrase est
 * celle que l'échéancier affichera ensuite.
 *
 * Le canal email n'est annoncé que s'il est opérationnel. Indisponible,
 * l'interrupteur reste réglable — c'est un souhait, et il vaudra quand
 * l'envoi reprendra —, mais la phrase dit où les rappels attendent en
 * attendant.
 */
export interface PreferencesDeRappelsProps {
  initial: PreferencesDeRappel;
  canal: CanalEmail;
  /** Le dernier rappel réservé, ISO ; `null` s'il n'y en a jamais eu. */
  dernier: { quand: string; courrier: EtatDuCourrier | null } | null;
  /** Où revenir : l'échéancier d'où l'on vient, sinon le compte. */
  retour: string;
}

const egales = (a: PreferencesDeRappel, b: PreferencesDeRappel): boolean =>
  a.actifs === b.actifs && a.email === b.email && a.fuseau === b.fuseau && a.joursAvant === b.joursAvant;

export function PreferencesDeRappels({ initial, canal, dernier, retour }: PreferencesDeRappelsProps) {
  const [enregistre, setEnregistre] = useState(initial);
  const [prefs, setPrefs] = useState(initial);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [confirme, setConfirme] = useState(false);
  const prefixe = useId();

  const modifie = !egales(prefs, enregistre);
  const changer = (partiel: Partial<PreferencesDeRappel>) => {
    setConfirme(false);
    setPrefs((p) => ({ ...p, ...partiel }));
  };

  async function enregistrer() {
    setEnvoi(true);
    setEchec(null);
    setConfirme(false);
    const resultat = await appeler<{ preferences: PreferencesDeRappel }>("/api/comptes/rappels", {
      methode: "PUT",
      corps: prefs,
    });
    setEnvoi(false);
    if (resultat.ok) {
      setEnregistre(resultat.donnees.preferences);
      setPrefs(resultat.donnees.preferences);
      setConfirme(true);
      return;
    }
    // Rien n'est perdu : les réglages restent affichés, prêts à renvoyer.
    setEchec(resultat.echec);
  }

  const idActifs = `${prefixe}-actifs`;
  const idActifsTexte = `${prefixe}-actifs-texte`;
  const idEmail = `${prefixe}-email`;
  const idEmailTexte = `${prefixe}-email-texte`;

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <Link href={retour} className="text-14 font-semibold text-ink-900">
        {retour === "/consentements" ? "Mon compte" : "Revenir à l'échéancier"}
      </Link>

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Mes rappels d&apos;échéance
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          Un résumé de tes échéances chaque semaine, et une alerte dès qu&apos;une
          date approche. Ces réglages valent pour tous tes dossiers.
        </p>
      </div>

      <ul className="flex flex-col border-b border-ink-300">
        <li className="flex items-start gap-4 border-t border-ink-300 py-5">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span id={idActifs} className="text-16 font-semibold text-ink-900">
              Recevoir mes rappels
            </span>
            <span id={idActifsTexte} className="text-pretty text-14 text-ink-700">
              Coupés, aucun rappel ne part : ni email, ni alerte. Ton échéancier
              reste consultable.
            </span>
          </div>
          <Switch
            idLibelle={idActifs}
            idDescription={idActifsTexte}
            checked={prefs.actifs}
            onChangement={(actifs) => changer({ actifs })}
          />
        </li>
        <li className="flex items-start gap-4 border-t border-ink-300 py-5">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span id={idEmail} className="text-16 font-semibold text-ink-900">
              Aussi par email
            </span>
            <span id={idEmailTexte} className="text-pretty text-14 text-ink-700">
              {canal === "OPERATIONNEL"
                ? "Chaque rappel est toujours gardé dans tes alertes ; l'email s'y ajoute."
                : MENTION_CANAL_INDISPONIBLE}
            </span>
            <span className="text-pretty text-13 text-ink-500">
              Aucun rappel n&apos;est envoyé par SMS.
            </span>
          </div>
          <Switch
            idLibelle={idEmail}
            idDescription={idEmailTexte}
            checked={prefs.email}
            disabled={!prefs.actifs}
            onChangement={(email) => changer({ email })}
          />
        </li>
      </ul>

      <RadioGroup
        libelle="M'alerter avant une échéance"
        options={DELAIS_D_ALERTE.map((jours) => ({
          valeur: String(jours),
          libelle: `${delaiEnLettres(jours).replace(/^./u, (c) => c.toUpperCase())} jours avant`,
          ...(jours === 7 ? { description: "Le réglage d'origine." } : {}),
        }))}
        valeur={String(prefs.joursAvant)}
        onChangement={(v) => changer({ joursAvant: Number(v) as DelaiDAlerte })}
      />

      <Select
        libelle="Mon fuseau horaire"
        aide={`Les rappels partent à partir de ${HEURE_DES_RAPPELS} h, à l'heure de cette ville.`}
        options={FUSEAUX_PROPOSES.map((f) => ({ valeur: f.id, libelle: f.libelle }))}
        value={prefs.fuseau}
        onChange={(e) => changer({ fuseau: e.target.value })}
      />

      <section className="flex flex-col gap-2 rounded-lg bg-ink-100 p-4" aria-live="polite">
        <h2 className="text-16 font-semibold text-ink-900">Ce qui partira</h2>
        <p className="text-pretty text-14 text-ink-700">{phraseDesRappels(prefs, canal)}</p>
      </section>

      <section className="flex flex-col gap-1.5">
        <h2 className="text-16 font-semibold text-ink-900">Dernier rappel</h2>
        {dernier ? (
          <p className="text-pretty text-14 text-ink-700">
            {`Le ${momentEnFrancais(dernier.quand)}. ${suiteDuDernierRappel(dernier.courrier)}`}
          </p>
        ) : (
          <p className="text-pretty text-14 text-ink-700">
            Aucun rappel ne t&apos;a encore été envoyé. Le premier part quand une
            échéance de ton dossier entre dans les trente jours.
          </p>
        )}
      </section>

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4">
        {echec ? <BlocEchec echec={echec} annonce /> : null}
        {confirme ? (
          <p role="status" className="text-14 font-medium text-ink-900">
            Tes réglages sont enregistrés. Ils valent dès le prochain rappel.
          </p>
        ) : null}
        <Button
          pleineLargeur
          className="min-h-action"
          chargement={envoi}
          disabled={!modifie}
          raisonDesactivation="Aucun réglage n'a changé depuis le dernier enregistrement."
          onClick={() => void enregistrer()}
        >
          Enregistrer mes réglages
        </Button>
      </div>
    </div>
  );
}
