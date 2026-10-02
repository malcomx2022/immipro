"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { BlocsEditoriaux } from "@/components/ui/BlocsEditoriaux";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { CHAMP_CONTROLE } from "@/components/ui/champ";
import { appeler } from "@/lib/api";
import { cn } from "@/lib/utils";
import { MENTION_AUDIT } from "@/domain/backoffice/navigation";
import { jourEnFrancais, momentEnFrancais } from "@/domain/format/moment";
import { LIBELLE_ETAT, type EtatDuTexte } from "@/domain/juridique/publication";
import {
  LIBELLE_GROUPE,
  VARIABLES_JURIDIQUES,
  motifDeRefus,
  type GroupeVariable,
  type VariableJuridique,
} from "@/domain/juridique/variables";
import type { EchecCandidat } from "@/server/http/echecs";
import type { EtatDuTexteJuridique } from "@/server/juridique/lecture";

/**
 * Textes juridiques — S.101.
 *
 * Deux parties, dans l'ordre où l'on s'en sert :
 *
 * 1. **Les variables**, groupées par sujet. Elles s'enregistrent même
 *    vides, comme un brouillon. Enregistrer republie aussitôt les textes
 *    déjà validés qui les emploient, et l'écran dit lesquels.
 * 2. **Les quatre textes**, chacun avec son état, ce qui manque pour le
 *    valider, son aperçu tel qu'il serait publié, l'acte de validation et
 *    l'historique de ses versions.
 *
 * L'acte de validation nomme le relecteur : Q.A refusait un drapeau
 * « validé » qu'on cocherait, et c'est ce qui le remplace — la trace
 * d'une affirmation, avec son auteur.
 */

const COULEUR_ETAT: Record<EtatDuTexte, string> = {
  NON_PUBLIE: "bg-ink-100 text-ink-700",
  PUBLIE: "bg-success/10 text-success",
  A_REVALIDER: "bg-warning/10 text-warning",
};

const GROUPES = Object.keys(LIBELLE_GROUPE) as GroupeVariable[];

type Resultat =
  | { changees: readonly string[]; republiees: readonly { page: string; rang: number }[]; inchangees: readonly { page: string; raison: string }[] }
  | null;

function ChampVariable({
  variable,
  valeur,
  erreur,
  onChangement,
}: {
  variable: VariableJuridique;
  valeur: string;
  erreur?: string;
  onChangement: (v: string) => void;
}) {
  const libelle = variable.facultative ? `${variable.libelle} (facultatif)` : variable.libelle;
  if (variable.nature === "texte" || variable.nature === "liste") {
    const id = `variable-${variable.cle}`;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-14 font-medium text-ink-900">
          {libelle}
        </label>
        <textarea
          id={id}
          rows={variable.nature === "liste" ? 5 : 4}
          value={valeur}
          onChange={(e) => onChangement(e.target.value)}
          aria-describedby={`${id}-aide`}
          aria-invalid={erreur ? true : undefined}
          className={cn(CHAMP_CONTROLE, "h-auto py-2.5", erreur && "border-danger")}
        />
        <span id={`${id}-aide`} className="text-13 text-ink-500">
          {variable.aide}
          {variable.nature === "liste" ? " Un élément par ligne." : " Séparer les paragraphes par une ligne vide."}
        </span>
        {erreur ? <span className="text-13 text-danger">{erreur}</span> : null}
      </div>
    );
  }
  return (
    <Input
      libelle={libelle}
      aide={variable.aide}
      value={valeur}
      onChange={(e) => onChangement(e.target.value)}
      type={variable.nature === "email" ? "email" : variable.nature === "telephone" ? "tel" : "text"}
      {...(erreur ? { erreur } : {})}
    />
  );
}

function CarteDuTexte({ texte, aujourdhui }: { texte: EtatDuTexteJuridique; aujourdhui: string }) {
  const router = useRouter();
  const [apercu, setApercu] = useState(false);
  const [relecteur, setRelecteur] = useState(texte.versions[0]?.relecteur ?? "");
  const [relueLe, setRelueLe] = useState(aujourdhui);
  const [motif, setMotif] = useState(texte.versions.length === 0 ? "Première publication" : "");
  const [atteste, setAtteste] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<readonly string[]>([]);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [publie, setPublie] = useState<number | null>(null);

  const bloque = texte.manque ?? (texte.fautes.length > 0 ? "Une formulation refusée apparaît dans le texte : la reformuler dans la variable qui la porte." : null);
  const derniere = texte.versions[0];

  async function valider() {
    setEnvoi(true);
    setRefus([]);
    setEchec(null);
    const r = await appeler<{ ok: true; rang: number } | { ok: false; refus: readonly string[] }>(
      `/api/admin/textes-juridiques/${texte.page}/validation`,
      { corps: { relecteur, relueLe, motif, atteste } },
    );
    setEnvoi(false);
    if (!r.ok) {
      setEchec(r.echec);
      return;
    }
    if (!r.donnees.ok) {
      setRefus(r.donnees.refus);
      return;
    }
    setPublie(r.donnees.rang);
    setAtteste(false);
    router.refresh();
  }

  return (
    <section aria-labelledby={`texte-${texte.page}`} className="flex flex-col gap-4 rounded-lg border border-ink-300 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={`texte-${texte.page}`} className="text-19 font-semibold text-ink-900">
            {texte.titre}
          </h2>
          <p className="text-14 text-ink-700">
            {texte.etat === "NON_PUBLIE" ? (
              <>Adresse {texte.adresse} : la page répond « introuvable » tant que le texte n&apos;est pas validé.</>
            ) : (
              <>
                <Link href={texte.adresse} className="text-accent-600 underline">
                  {texte.adresse}
                </Link>{" "}
                sert la version {derniere?.rang}, publiée le {derniere ? momentEnFrancais(derniere.publieeLe) : ""}.
              </>
            )}
          </p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-13 font-semibold", COULEUR_ETAT[texte.etat])}>
          {LIBELLE_ETAT[texte.etat]}
        </span>
      </div>

      {texte.etat === "A_REVALIDER" ? (
        <p className="rounded-md bg-warning/10 p-3 text-14 text-ink-900">
          Le texte a changé dans le dépôt depuis sa dernière validation. La page continue de servir la version {derniere?.rang},
          et les variables modifiées ne s&apos;y appliquent plus : faire relire le nouveau texte, puis le valider.
        </p>
      ) : null}

      {bloque ? <p className="rounded-md bg-ink-100 p-3 text-14 text-ink-900">{bloque}</p> : null}
      {texte.fautes.map((f) => (
        <p key={f} className="text-14 text-danger">
          {f}
        </p>
      ))}

      <div>
        <Button variante="secondaire" onClick={() => setApercu((v) => !v)} aria-expanded={apercu}>
          {apercu ? "Masquer l'aperçu" : "Voir l'aperçu avec les valeurs actuelles"}
        </Button>
      </div>
      {apercu ? (
        <div className="flex flex-col gap-4 rounded-md border border-ink-300 bg-ink-100 p-5">
          <p className="text-13 font-semibold uppercase tracking-wider text-ink-500">Aperçu — non publié</p>
          <h3 className="text-24 font-semibold text-ink-900">{texte.apercu.titre}</h3>
          <p className="text-16 text-ink-700">{texte.apercu.chapeau}</p>
          <BlocsEditoriaux blocs={texte.apercu.blocs} />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-ink-300 pt-4">
        <h3 className="text-16 font-semibold text-ink-900">Valider et publier</h3>
        <p className="text-14 text-ink-700">
          La validation publie le texte tel que l&apos;aperçu le montre, et garde qui l&apos;a relu. Elle ne vaut que si la
          personne nommée a réellement relu cette version.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            libelle="Relu par"
            aide="Nom et qualité. Par exemple : Me Dossou, avocat au barreau de Cotonou."
            value={relecteur}
            onChange={(e) => setRelecteur(e.target.value)}
          />
          <Input libelle="Date de la relecture" type="date" max={aujourdhui} value={relueLe} onChange={(e) => setRelueLe(e.target.value)} />
        </div>
        <Input
          libelle="Motif"
          aide="Consigné au journal d'audit. Par exemple : première publication, mise à jour après avis du conseil."
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
        />
        <Checkbox
          libelle="J'atteste que la version affichée dans l'aperçu est celle qui a été relue par la personne nommée."
          checked={atteste}
          onChangement={setAtteste}
        />
        {refus.length > 0 ? (
          <ul role="alert" className="flex list-disc flex-col gap-1 pl-5 text-14 text-danger">
            {refus.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}
        {echec ? <BlocEchec echec={echec} /> : null}
        {publie !== null ? (
          <p role="status" className="text-14 text-success">
            Version {publie} publiée.
          </p>
        ) : null}
        <div>
          <Button
            onClick={valider}
            chargement={envoi}
            disabled={bloque !== null || !atteste}
            {...(bloque !== null
              ? { raisonDesactivation: bloque }
              : !atteste
                ? { raisonDesactivation: "Cocher l'attestation pour valider." }
                : {})}
          >
            Valider et publier
          </Button>
        </div>
      </div>

      {texte.versions.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-ink-300 pt-4">
          <h3 className="text-16 font-semibold text-ink-900">Versions publiées</h3>
          <ol className="flex flex-col gap-2">
            {texte.versions.map((v) => (
              <li key={v.rang} className="text-14 text-ink-700">
                <span className="font-semibold text-ink-900">Version {v.rang}</span> — {momentEnFrancais(v.publieeLe)},{" "}
                {v.genre === "VALIDATION" ? "validée" : "republiée après modification des variables"} par {v.publieePar}. Relue
                par {v.relecteur} le {jourEnFrancais(v.relueLe)}. {v.motif}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

export function TextesJuridiques({
  valeurs: initiales,
  textes,
  aujourdhui,
}: {
  valeurs: Readonly<Record<string, string>>;
  textes: readonly EtatDuTexteJuridique[];
  aujourdhui: string;
}) {
  const router = useRouter();
  const [valeurs, setValeurs] = useState<Record<string, string>>({ ...initiales });
  const [envoi, setEnvoi] = useState(false);
  const [erreursServeur, setErreursServeur] = useState<Record<string, string>>({});
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [resultat, setResultat] = useState<Resultat>(null);

  const modifiees = useMemo(
    () => VARIABLES_JURIDIQUES.filter((v) => (valeurs[v.cle] ?? "").trim() !== (initiales[v.cle] ?? "").trim()).map((v) => v.cle),
    [valeurs, initiales],
  );
  const erreurs = useMemo(() => {
    const locales: Record<string, string> = {};
    for (const v of VARIABLES_JURIDIQUES) {
      const motif = motifDeRefus(v, valeurs[v.cle] ?? "");
      if (motif) locales[v.cle] = motif;
    }
    return { ...erreursServeur, ...locales };
  }, [valeurs, erreursServeur]);

  const publies = textes.filter((t) => t.etat !== "NON_PUBLIE").length;
  const aRevalider = textes.filter((t) => t.etat === "A_REVALIDER").length;
  const titreDe = (page: string) => textes.find((t) => t.page === page)?.titre ?? page;

  async function enregistrer() {
    setEnvoi(true);
    setEchec(null);
    setErreursServeur({});
    setResultat(null);
    const corps = Object.fromEntries(modifiees.map((c) => [c, valeurs[c] ?? ""]));
    const r = await appeler<NonNullable<Resultat>>("/api/admin/textes-juridiques/variables", {
      methode: "PUT",
      corps: { valeurs: corps },
    });
    setEnvoi(false);
    if (!r.ok) {
      setEchec(r.echec);
      if (r.echec.champs) setErreursServeur(r.echec.champs);
      return;
    }
    setResultat(r.donnees);
    router.refresh();
  }

  return (
    <>
      <EnteteAdmin
        titre="Textes juridiques"
        resume={`${publies} texte${publies > 1 ? "s" : ""} publié${publies > 1 ? "s" : ""} sur 4${aRevalider > 0 ? `, ${aRevalider} à revalider` : ""}. ${MENTION_AUDIT}`}
      />
      <div className="flex flex-col gap-8 px-6 py-6">
        <section aria-labelledby="variables" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 id="variables" className="text-19 font-semibold text-ink-900">
              Variables
            </h2>
            <p className="text-14 text-ink-700">
              Ce que les textes ne peuvent pas inventer : l&apos;identité de l&apos;éditeur, les contacts, les choix
              juridiques. Une variable vide s&apos;enregistre, mais empêche de valider les textes qui l&apos;emploient.
              Modifier une variable republie aussitôt, en nouvelle version, les textes déjà validés qui l&apos;emploient.
            </p>
          </div>
          {GROUPES.map((groupe) => (
            <fieldset key={groupe} className="flex flex-col gap-4 rounded-lg border border-ink-300 bg-white p-5">
              <legend className="px-1 text-16 font-semibold text-ink-900">{LIBELLE_GROUPE[groupe]}</legend>
              {VARIABLES_JURIDIQUES.filter((v) => v.groupe === groupe).map((v) => (
                <ChampVariable
                  key={v.cle}
                  variable={v}
                  valeur={valeurs[v.cle] ?? ""}
                  {...(erreurs[v.cle] ? { erreur: erreurs[v.cle] } : {})}
                  onChangement={(nouvelle) => setValeurs((avant) => ({ ...avant, [v.cle]: nouvelle }))}
                />
              ))}
            </fieldset>
          ))}
          {echec ? <BlocEchec echec={echec} /> : null}
          {resultat ? (
            <div role="status" className="flex flex-col gap-1 rounded-md bg-success/10 p-4 text-14 text-ink-900">
              <p>
                {resultat.changees.length} variable{resultat.changees.length > 1 ? "s" : ""} enregistrée
                {resultat.changees.length > 1 ? "s" : ""}.
              </p>
              {resultat.republiees.map((r) => (
                <p key={r.page}>
                  {titreDe(r.page)} : republié en version {r.rang}.
                </p>
              ))}
              {resultat.inchangees.map((r) => (
                <p key={r.page}>
                  {titreDe(r.page)} : {r.raison}
                </p>
              ))}
            </div>
          ) : null}
          <div>
            <Button
              onClick={enregistrer}
              chargement={envoi}
              disabled={modifiees.length === 0 || Object.keys(erreurs).length > 0}
              {...(modifiees.length === 0
                ? { raisonDesactivation: "Aucune variable modifiée." }
                : Object.keys(erreurs).length > 0
                  ? { raisonDesactivation: "Corriger les champs signalés avant d'enregistrer." }
                  : {})}
            >
              {modifiees.length > 0 ? `Enregistrer ${modifiees.length} modification${modifiees.length > 1 ? "s" : ""}` : "Enregistrer"}
            </Button>
          </div>
        </section>

        {textes.map((t) => (
          <CarteDuTexte key={t.page} texte={t} aujourdhui={aujourdhui} />
        ))}
      </div>
    </>
  );
}
