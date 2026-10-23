"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import {
  AIDE_CONDITIONS,
  AIDE_LIBELLE_CANDIDAT,
  AIDE_MOTIF,
  MENTION_DIVERGENCE_DIFFEREE,
  CHAMPS_CANDIDAT,
  LIBELLE_NIVEAU,
  MENTION_SANS_MIGRATION,
  aChange,
  comparer,
  compterChangements,
  effetDeLaPublication,
  lireSeuil,
  MENTION_SANS_MONTANT,
  messageDeRefus,
  montantLisible,
  publiable,
  seuilsModifies,
  SYMBOLE_OPERATEUR,
  valeurLisible,
  verifierTextesCandidat,
  visiblePourLeCandidat,
  type ChampCandidat,
  type ConditionAffichee,
  type Regle,
} from "@/domain/backoffice/regle";
import { MENTION_AUDIT } from "@/domain/backoffice/navigation";
import { jourEnFrancais } from "@/domain/format/moment";
import { formatMontant } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { CHAMP_CONTROLE } from "@/components/ui/champ";

/**
 * B-02 — Édition d'une règle versionnée. WF-14, INV-3, INV-8.
 *
 * C'est ici que le vocabulaire interdit trouve son troisième point
 * d'application. Jusqu'à ce lot, la liste protégeait le code : un
 * administrateur qui saisissait « 95 % de réussite » dans le libellé d'une
 * checklist passait à travers tout le dispositif, et son texte s'affichait
 * tel quel chez le candidat. Les deux champs destinés au candidat sont
 * maintenant validés à la saisie, avec la même liste et la même
 * reconnaissance de la négation, et la publication est bloquée tant qu'une
 * formulation est refusée.
 *
 * **Enregistrer, non.** L'écran désactivait aussi « Enregistrer le
 * brouillon » — « corrige-le avant d'enregistrer » — quand `CLAUDE.md` dit
 * le contraire : un texte en cours d'écriture doit pouvoir être sauvé, sans
 * quoi on le rédige ailleurs pour le coller à la fin, hors du garde-fou.
 * Le refus ne concerne que l'enregistrement d'une version **en vigueur**,
 * qui est une publication : le candidat la lit à la seconde. C'est le
 * serveur qui le dit (`server/regles/edition.ts`), et l'écran lit le même
 * fait pour l'annoncer avant le clic plutôt qu'après.
 *
 * Les fautes restent signalées champ par champ dans les deux cas : les
 * montrer sans interdire d'enregistrer est précisément ce que la règle
 * demande.
 *
 * **Les conditions se lisent et leurs seuils se modifient (C-12).** L'écran
 * ne les montrait pas : le panneau des différences annonçait « 0 champ
 * modifié » sur un seuil bloquant changé, et le second opérateur de WF-14
 * §4 relisait sans voir ce qu'il relisait. Seuls les seuils modifiés
 * partent au serveur, qui les recolle sur la ligne en base.
 *
 * INV-3 reste tenu : publier n'migre aucun dossier. L'effet est montré avant,
 * avec le nombre de dossiers alertés, le nombre mis en arbitrage, et zéro
 * migration — le type lui-même le dit.
 *
 * ── Ce que l'écran annonçait sans le faire ──────────────────────────────
 *
 * Les deux commandes de l'en-tête n'étaient reliées à rien. « Enregistrer
 * le brouillon » ne faisait rien du tout ; « Publier » posait un drapeau
 * local et l'écran répondait « Publication demandée. La version N devient
 * la référence des nouveaux dossiers », en région vivante, sans qu'aucune
 * requête soit partie. Un veilleur repartait en croyant la règle publiée.
 *
 * C'est la faute que le produit refuse ailleurs — aucun service absent
 * n'est simulé (I.C) — et elle portait ici sur l'acte que protège INV-3.
 * Les routes existaient et journalisaient ; seule la moitié cliente
 * manquait. Rien ne s'affiche plus qu'après une réponse du serveur.
 *
 * **Publier enregistre d'abord.** La publication relit le payload en base
 * pour le valider : publier sans enregistrer aurait mis en vigueur le
 * texte d'avant, pendant que l'écran montrait celui d'après. Si
 * l'enregistrement est refusé, rien n'est publié et le refus s'affiche ;
 * s'il passe et que la publication échoue, le texte est enregistré et
 * l'écran le dit, parce que c'est ce qui s'est produit.
 */
export interface EditionRegleProps {
  id: string;
  enVigueur: Regle;
  brouillon: Regle;
  dossiersConcernes: number;
  dossiersSousLaNouvelleRegle: number;
  historique: readonly { version: number; le: string; par: string }[];
  /**
   * RG-14.2 : qui rédige n'est pas qui publie. La route de publication est
   * réservée à un administrateur ; l'écran le dit avant le clic plutôt que
   * de laisser un veilleur enregistrer puis buter sur un refus d'accès.
   */
  peutPublier: boolean;
  /**
   * Un brouillon existe-t-il déjà ? Sinon, `brouillon` porte les valeurs de
   * la version en vigueur — le point de départ de la suivante — et l'écran
   * doit le dire au lieu de les appeler « brouillon ».
   */
  brouillonExistant: boolean;
  /** Le numéro que l'enregistrement écrira, annoncé avant le clic. */
  versionAEcrire: number;
}

export function EditionRegle({
  id,
  enVigueur,
  brouillon,
  dossiersConcernes,
  dossiersSousLaNouvelleRegle,
  historique,
  peutPublier: habiliteAPublier,
  brouillonExistant,
  versionAEcrire,
}: EditionRegleProps) {
  const router = useRouter();
  const [textes, setTextes] = useState<Record<ChampCandidat, string>>({
    libelleCandidat: brouillon.libelleCandidat,
    reserveCandidat: brouillon.reserveCandidat,
  });
  /** Les seuils tels que saisis, par code : la lecture se fait à l'envoi. */
  const [saisies, setSaisies] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      brouillon.conditions
        .filter((c) => c.modifiable)
        .map((c) => [c.code, String(c.valeur).replace(".", ",")]),
    ),
  );
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState<"" | "brouillon" | "publication">("");
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  /** Ce qui s'est réellement produit, et rien d'autre. */
  const [fait, setFait] = useState<null | "enregistre" | "publie">(null);
  // La propagation part à la reprise horaire plutôt que tout de suite (M8).
  const [differee, setDifferee] = useState(false);

  const fautes = verifierTextesCandidat(textes);
  const textesRecevables = publiable(textes);
  const erreursDeSeuil = Object.fromEntries(
    Object.entries(saisies).flatMap(([code, saisie]) => {
      const lu = lireSeuil(saisie);
      return lu.ok ? [] : [[code, lu.message] as const];
    }),
  );
  const seuilsLisibles = Object.keys(erreursDeSeuil).length === 0;
  const seuils = seuilsModifies(brouillon.conditions, saisies);
  const peutPublier =
    textesRecevables && seuilsLisibles && motif.trim().length > 0 && habiliteAPublier;

  /** Le corps de la branche `textes` : ce que l'écran édite, et rien de plus. */
  const corpsDesTextes = {
    champ: "textes" as const,
    libelleCandidat: textes.libelleCandidat,
    reserveCandidat: textes.reserveCandidat,
    ...(Object.keys(seuils).length > 0 ? { seuils } : {}),
  };

  /**
   * Rend la ligne écrite, ou `null` si le serveur a refusé.
   *
   * L'identifiant compte : l'enregistrement peut avoir **ouvert** la version
   * suivante, qui n'est pas celle de l'adresse. Publier `id` mettrait alors
   * en vigueur la version qu'on vient de quitter.
   */
  async function enregistrer(): Promise<string | null> {
    setEchec(null);
    setFait(null);
    const resultat = await appeler<{ id: string; version: number }>(
      `/api/admin/regles/${id}`,
      { methode: "PUT", corps: corpsDesTextes },
    );
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return null;
    }
    return resultat.donnees.id;
  }

  async function enregistrerLeBrouillon() {
    setEnvoi("brouillon");
    const ecrite = await enregistrer();
    setEnvoi("");
    if (!ecrite) return;
    setFait("enregistre");
    router.refresh();
  }

  async function publier() {
    setEnvoi("publication");
    const ecrite = await enregistrer();
    if (!ecrite) {
      setEnvoi("");
      return;
    }
    const resultat = await appeler<{
      publiee: string;
      divergenceAPropager: boolean;
      divergenceMiseEnFile: boolean;
    }>(`/api/admin/regles/${ecrite}`, {
      corps: { motif },
    });
    setEnvoi("");
    if (!resultat.ok) {
      // Le texte est enregistré, la publication non. L'écran le dit tel
      // quel : annoncer l'un sans l'autre serait reproduire le défaut.
      setFait("enregistre");
      setEchec(resultat.echec);
      return;
    }
    setDifferee(resultat.donnees.divergenceAPropager && !resultat.donnees.divergenceMiseEnFile);
    setFait("publie");
    router.refresh();
  }

  /** Les conditions telles que l'écran les montre, seuils saisis compris. */
  const conditionsSaisies: ConditionAffichee[] = brouillon.conditions.map((c) =>
    Object.hasOwn(seuils, c.code) ? { ...c, valeur: seuils[c.code]! } : c,
  );
  const differences = comparer(
    enVigueur,
    { ...brouillon, ...textes, conditions: conditionsSaisies },
    formatMontant,
    MENTION_SANS_MONTANT,
    jourEnFrancais,
  );
  const effet = effetDeLaPublication(dossiersConcernes, dossiersSousLaNouvelleRegle);

  const fautePour = (champ: ChampCandidat) => fautes.find((f) => f.champ === champ);
  /** La note d'une valeur : ce qui a changé depuis la version en vigueur, ou rien. */
  const noteDe = (champ: string) => {
    const d = differences.find((x) => x.champ === champ);
    return d && aChange(d) ? `Modifié · version ${enVigueur.version} : ${d.avant}` : "Inchangé";
  };

  return (
    <div className="flex flex-col">
      <EnteteAdmin
        titre={`${brouillon.pays} — ${brouillon.procedure}`}
        resume={
          brouillonExistant
            ? `Brouillon version ${brouillon.version} · version ${enVigueur.version} en vigueur pour ${dossiersConcernes} dossiers`
            : `Version ${enVigueur.version} en vigueur pour ${dossiersConcernes} dossiers · enregistrer ouvrira la version ${versionAEcrire}`
        }
        actions={
          <>
            <Button
              variante="secondaire"
              disabled={envoi !== "" || !seuilsLisibles}
              raisonDesactivation={
                !seuilsLisibles
                  ? "Un seuil n'est pas lisible : corrige-le dans la section Conditions."
                  : "Enregistrement en cours."
              }
              onClick={enregistrerLeBrouillon}
            >
              {envoi === "brouillon"
                ? "Enregistrement…"
                : brouillonExistant
                  ? "Enregistrer le brouillon"
                  : `Ouvrir la version ${versionAEcrire}`}
            </Button>
            <Button
              disabled={!peutPublier || envoi !== ""}
              raisonDesactivation={
                !habiliteAPublier
                  ? "Publier demande un compte administrateur : qui rédige n'est pas qui publie (RG-14.2)."
                  : !seuilsLisibles
                    ? "Un seuil n'est pas lisible : corrige-le dans la section Conditions."
                  : fautes.length > 0
                    ? "Un texte destiné au candidat est refusé : corrige-le avant de publier."
                    : motif.trim().length === 0
                      ? "Renseigne le motif du changement : il part au journal d'audit."
                      : "Publication en cours."
              }
              onClick={publier}
            >
              {envoi === "publication"
                ? "Publication…"
                : `Publier la version ${versionAEcrire}`}
            </Button>
          </>
        }
      />

      <div className="flex gap-6 p-6">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <section className="flex flex-col gap-4 rounded-lg border border-ink-300 bg-white p-5">
            <h2 className="text-16 font-semibold text-ink-900">Valeurs de la règle</h2>

            <Champ
              libelle={brouillon.intituleMontant}
              valeur={montantLisible(brouillon.montant, formatMontant, MENTION_SANS_MONTANT)}
              note={noteDe(brouillon.intituleMontant)}
            />
            <Champ
              libelle="Applicable aux dépôts à partir du"
              valeur={jourEnFrancais(brouillon.applicableDepuis)}
              note={noteDe("Applicable aux dépôts à partir du")}
            />
            <Champ
              libelle="Délai d'instruction"
              valeur={brouillon.delaiInstruction}
              note={noteDe("Délai d'instruction")}
            />
            <Champ
              libelle="Source"
              valeur={`${brouillon.source} · ${LIBELLE_NIVEAU[brouillon.niveauSource]}`}
              note={
                visiblePourLeCandidat(brouillon.niveauSource)
                  ? "Visible par le candidat"
                  : "Source secondaire : cette règle n'est jamais affichée au candidat (INV-4)"
              }
            />
            <Champ
              libelle="Prochaine relecture"
              valeur={jourEnFrancais(brouillon.prochaineRelecture)}
            />
          </section>

          <section className="flex flex-col gap-4 rounded-lg border border-ink-300 bg-white p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-16 font-semibold text-ink-900">Conditions</h2>
              <p className="text-pretty text-13 text-ink-500">{AIDE_CONDITIONS}</p>
            </div>
            {brouillon.conditions.length === 0 ? (
              <p className="text-pretty text-14 text-ink-700">
                Cette version ne porte aucune condition : la complétude ne vérifie que la
                présence des pièces requises.
              </p>
            ) : (
              <ul className="flex flex-col">
                {brouillon.conditions.map((c) => (
                  <LigneCondition
                    key={c.code}
                    condition={c}
                    enVigueur={enVigueur.conditions.find((v) => v.code === c.code)}
                    versionEnVigueur={enVigueur.version}
                    saisie={saisies[c.code]}
                    erreur={erreursDeSeuil[c.code]}
                    onSaisie={(texte) => setSaisies((p) => ({ ...p, [c.code]: texte }))}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-4 rounded-lg border border-ink-300 bg-white p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-16 font-semibold text-ink-900">Textes affichés au candidat</h2>
              <p className="text-pretty text-13 text-ink-500">
                Ces deux champs passent le même vocabulaire interdit que le code de
                l&apos;interface. Une promesse de résultat y est refusée à
                l&apos;enregistrement, pas signalée après coup.
              </p>
            </div>

            {CHAMPS_CANDIDAT.map(({ cle, libelle }) => {
              const faute = fautePour(cle);
              return (
                <div key={cle} className="flex flex-col gap-1.5">
                  <label htmlFor={cle} className="text-14 font-medium text-ink-900">
                    {libelle}
                  </label>
                  <textarea
                    id={cle}
                    rows={3}
                    value={textes[cle]}
                    onChange={(e) =>
                      setTextes((p) => ({ ...p, [cle]: e.target.value }))
                    }
                    aria-invalid={faute ? true : undefined}
                    aria-describedby={`${cle}-aide`}
                    className={cn(
                      CHAMP_CONTROLE,
                      "h-auto py-2.5",
                      faute && "border-danger",
                    )}
                  />
                  <span
                    id={`${cle}-aide`}
                    role={faute ? "alert" : undefined}
                    className={cn("text-pretty text-13", faute ? "text-danger" : "text-ink-500")}
                  >
                    {faute
                      ? messageDeRefus(faute)
                      : cle === "libelleCandidat"
                        ? AIDE_LIBELLE_CANDIDAT
                        : "Affichée sous la règle, dans la checklist."}
                  </span>
                </div>
              );
            })}
          </section>

          <section className="flex flex-col gap-1.5 rounded-lg border border-ink-300 bg-white p-5">
            <label htmlFor="motif" className="text-14 font-medium text-ink-900">
              Motif du changement
            </label>
            <textarea
              id="motif"
              rows={2}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              aria-describedby="motif-aide"
              className={cn(CHAMP_CONTROLE, "h-auto py-2.5")}
            />
            <span id="motif-aide" className="text-13 text-ink-500">
              {AIDE_MOTIF}
            </span>
          </section>
        </div>

        <aside className="flex w-panneau flex-none flex-col gap-4">
          <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
            <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">
              Différences avec la version {enVigueur.version}
            </h2>
            <p className="text-13 text-ink-500">
              {compterChangements(differences)} champ
              {compterChangements(differences) > 1 ? "s" : ""} modifié
              {compterChangements(differences) > 1 ? "s" : ""} sur {differences.length}
            </p>
            <dl className="flex flex-col">
              {differences.map((d) => (
                <div key={d.champ} className="flex flex-col gap-0.5 border-t border-ink-300 py-2">
                  <dt className="text-13 text-ink-500">{d.champ}</dt>
                  <dd className="text-pretty text-14 text-ink-900">
                    {aChange(d) ? (
                      <>
                        <span className="text-ink-500 line-through">{d.avant}</span>{" "}
                        <span aria-hidden="true">→</span> {d.apres}
                      </>
                    ) : (
                      <span className="text-ink-700">Inchangé</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
            <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">
              Effet de la publication
            </h2>
            <dl className="flex flex-col">
              <Ligne intitule={`Dossiers en version ${enVigueur.version}`} valeur={effet.dossiersConcernes} />
              <Ligne intitule="Arbitrage candidat requis" valeur={effet.arbitragesRequis} />
              <Ligne intitule="Alertes envoyées" valeur={effet.alertes} />
              <Ligne intitule="Dossiers migrés" valeur={effet.migrationsAutomatiques} />
            </dl>
            <p className="text-pretty text-13 text-ink-500">{MENTION_SANS_MIGRATION}</p>
          </section>

          <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
            <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">
              Historique
            </h2>
            <ul className="flex flex-col">
              {historique.map((h) => (
                <li
                  key={h.version}
                  className="flex items-baseline justify-between gap-3 border-t border-ink-300 py-2 text-14"
                >
                  <span className="text-ink-900">v{h.version}</span>
                  <span className="text-13 text-ink-500">
                    {jourEnFrancais(h.le)} · {h.par}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {echec ? <BlocEchec echec={echec} annonce /> : null}

          {/*
            Après la réponse du serveur, et elle seule. L'ancienne version
            de ce bloc s'affichait sur un clic, sans qu'aucune requête soit
            partie.
          */}
          {fait === "publie" ? (
            <p aria-live="polite" className="text-pretty text-13 text-ink-700">
              Version {brouillon.version} publiée. Elle devient la référence des
              nouveaux dossiers ; les {effet.dossiersConcernes} dossiers existants
              gardent la leur, et la publication est au journal d&apos;audit.
              {differee ? ` ${MENTION_DIVERGENCE_DIFFEREE}` : null}
            </p>
          ) : null}
          {fait === "enregistre" ? (
            <p aria-live="polite" className="text-pretty text-13 text-ink-700">
              Brouillon enregistré. Rien n&apos;est publié : les candidats lisent
              toujours la version {enVigueur.version}.
            </p>
          ) : null}

          <p className="text-pretty text-13 text-ink-500">{MENTION_AUDIT}</p>
        </aside>
      </div>
    </div>
  );
}

function Champ({
  libelle,
  valeur,
  note,
}: {
  libelle: string;
  valeur: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-14 font-medium text-ink-900">{libelle}</span>
      <span className="text-16 text-ink-900">{valeur}</span>
      {note ? <span className="text-pretty text-13 text-ink-500">{note}</span> : null}
    </div>
  );
}

/**
 * Une condition : sa valeur, ce qui la qualifie, et le texte que le
 * candidat lit quand elle échoue. Le seuil chiffré se saisit ; une
 * référence du référentiel se lit seulement (voir `ConditionAffichee`).
 */
function LigneCondition({
  condition,
  enVigueur,
  versionEnVigueur,
  saisie,
  erreur,
  onSaisie,
}: {
  condition: ConditionAffichee;
  enVigueur: ConditionAffichee | undefined;
  versionEnVigueur: number;
  saisie: string | undefined;
  erreur: string | undefined;
  onSaisie: (texte: string) => void;
}) {
  const id = `seuil-${condition.code}`;
  const qualites = [
    condition.bloquant ? "Bloquante" : "Pondérée",
    condition.piece ? `établie par la pièce « ${condition.piece} »` : "établie sans pièce",
    condition.alternative ? `alternative du groupe « ${condition.alternative} »` : null,
  ].filter(Boolean);
  const avant = enVigueur ? valeurLisible(enVigueur) : null;
  const maintenant = valeurLisible(condition);
  return (
    <li className="flex flex-col gap-1.5 border-t border-ink-300 py-3">
      {condition.modifiable && saisie !== undefined ? (
        <>
          <label htmlFor={id} className="text-14 font-medium text-ink-900">
            Seuil de « {condition.code} »
          </label>
          <div className="flex items-center gap-2">
            <span className="text-14 text-ink-700">{SYMBOLE_OPERATEUR[condition.operateur]}</span>
            <div className="w-filtre">
              <input
                id={id}
                type="text"
                inputMode="decimal"
                value={saisie}
                onChange={(e) => onSaisie(e.target.value)}
                aria-invalid={erreur ? true : undefined}
                aria-describedby={`${id}-aide`}
                className={cn(CHAMP_CONTROLE, erreur && "border-danger")}
              />
            </div>
            {condition.unite ? (
              <span className="text-14 text-ink-700">{condition.unite}</span>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <span className="text-14 font-medium text-ink-900">Condition « {condition.code} »</span>
          <span className="text-16 text-ink-900">{maintenant}</span>
        </>
      )}
      <span
        id={`${id}-aide`}
        role={erreur ? "alert" : undefined}
        className={cn("text-pretty text-13", erreur ? "text-danger" : "text-ink-500")}
      >
        {erreur ??
          `${qualites.join(" · ")}. ${
            avant === null
              ? `Absente de la version ${versionEnVigueur}.`
              : `Version ${versionEnVigueur} : ${avant}.`
          }`}
      </span>
      <span className="text-pretty text-13 text-ink-700">
        Message au candidat : {condition.message}
      </span>
    </li>
  );
}

function Ligne({ intitule, valeur }: { intitule: string; valeur: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-ink-300 py-2">
      <dt className="text-14 text-ink-700">{intitule}</dt>
      <dd className="text-16 font-semibold text-ink-900">{valeur}</dd>
    </div>
  );
}
