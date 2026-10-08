"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { LienBouton } from "@/components/ui/LienBouton";
import { useGroupeRadio } from "@/components/ui/useGroupeRadio";
import { CHAMP_CONTROLE } from "@/components/ui/champ";
import type { Dossier } from "@/domain/dossiers/dossier";
import type { PieceRedigeable } from "@/domain/redaction/entretien";
import {
  MENTION_PASSER,
  libelleAvancementEntretien,
  libelleRang,
  libelleReponse,
  libelleSuivant,
  questionPrecedente,
  questionSuivante,
  reponseAConserver,
  type Reponses,
} from "@/domain/redaction/entretien";
import type { Suggestion, Version } from "@/domain/redaction/versions";
import {
  MENTION_AIDE_A_LA_REDACTION,
  MENTION_RETENTION_VERSIONS,
  estCourante,
  etatDeLaPiece,
  libelleAnciennete,
  libelleVersion,
  messageDEtat,
  motsDeLaVersion,
  nombreDeReponsesTexte,
  obstacleALEnregistrement,
  parOrdreDeLecture,
  texteDeLaVersion,
  versionCourante,
} from "@/domain/redaction/versions";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import { cn } from "@/lib/utils";
import { EnteteDossier } from "../../EnteteDossier";

/**
 * R-02 entretien guidé et R-03 éditeur — WF-08.
 *
 * Une pièce sans version s'ouvre sur l'entretien, une pièce déjà mise en
 * forme sur son texte : la route est la même, comme pour C-07 et C-08. Sans
 * cela, la personne qui revient corriger une phrase repasserait par huit
 * questions auxquelles elle a déjà répondu.
 *
 * En 390 px, l'éditeur et les versions se commutent — ils ne tiennent pas
 * ensemble. En 1440 px ils sont côte à côte, ce que la largeur permet : on
 * restaure une version en voyant le texte qu'on remplace.
 *
 * ── Ce que l'écran promettait sans le faire ─────────────────────────────
 *
 * « Tes réponses sont conservées à mesure : tu peux interrompre
 * l'entretien et le reprendre. » La phrase était là depuis le début, sous
 * le champ, et elle était fausse. L'état partait de `{}` à chaque
 * chargement, rien ne quittait le navigateur, et `InterviewAnswer`
 * n'était écrite nulle part — seule la purge la connaissait, pour
 * l'effacer. Un candidat qui répondait à huit questions puis fermait
 * l'onglet perdait tout, après avoir lu qu'il pouvait s'interrompre.
 *
 * **À mesure veut dire à chaque question quittée**, pas à chaque frappe :
 * une écriture par caractère saturerait le réseau d'un téléphone sur
 * réseau lent, qui est le cas ordinaire de ce produit. Suivant,
 * précédent, passer et le passage à l'éditeur enregistrent la réponse
 * courante avant de bouger.
 *
 * **Et une réponse identique ne se réenregistre pas.** Revenir sur une
 * question pour la relire, sans y toucher, n'écrit rien : c'est ce qui
 * distingue une navigation d'une modification.
 *
 * ── Et l'éditeur n'éditait rien ─────────────────────────────────────────
 *
 * L'onglet s'appelait « Éditeur » et rendait des paragraphes en lecture
 * seule : pas de champ de saisie, pas d'enregistrement. Il ne montrait
 * d'ailleurs jamais rien, puisqu'aucune route ne créait de version —
 * `versionCourante` rendait toujours `undefined`, et « Restaurer » n'était
 * relié à rien.
 *
 * Trois situations s'y confondaient dans un même écran vide : l'entretien
 * pas assez avancé, la mise en forme à demander, et le service qui l'écrit
 * non branché. La troisième est celle que le registre des dépendances
 * décrit depuis S.3 — « aucun texte n'est produit, et aucun n'est inventé :
 * l'écran dit ce qui manque plutôt que d'afficher une version vide ». Il ne
 * le disait pas.
 *
 * Le texte, lui, appartient au candidat : il peut tout réécrire, et chaque
 * enregistrement laisse une version restaurable. Sans retour en arrière,
 * une suggestion acceptée puis regrettée est définitive, et la personne
 * cesse d'accepter les suggestions.
 */
export interface RedactionProps {
  dossier: Dossier;
  piece: PieceRedigeable;
  /** Réponses déjà en base : l'entretien reprend où il s'est arrêté. */
  reponsesEnregistrees: Reponses;
  versions: readonly Version[];
  suggestion?: Suggestion;
  /**
   * Le service de mise en forme est branché. Faux aujourd'hui : l'écran le
   * dit au lieu de proposer un bouton qui ne rendrait rien (règle de Q.A).
   */
  redactionDisponible: boolean;
  /**
   * La couverture du dossier ouvre la rédaction assistée (arbitrage S.80).
   * Sans elle, l'écran propose l'écriture manuelle et le chemin vers les
   * packs — jamais un bouton qui serait refusé.
   */
  redactionAssistee: boolean;
  /**
   * Où mène le chemin vers ce qui ouvre la rédaction assistée : la page des
   * packs, qui propose le passage à Dossier sur un dossier Essentiel
   * (S.88), ou la page Tarifs quand ce passage n'est pas ouvert.
   */
  lienDesPacks?: string;
  /** Horodatage de rendu, passé par le serveur pour que « il y a 4 minutes » soit stable. */
  maintenant: string;
}

type Vue = "ENTRETIEN" | "EDITEUR" | "VERSIONS";

export function Redaction({
  dossier,
  piece,
  reponsesEnregistrees,
  versions,
  suggestion,
  redactionDisponible,
  redactionAssistee,
  lienDesPacks = "/tarifs",
  maintenant,
}: RedactionProps) {
  const router = useRouter();
  const [vue, setVue] = useState<Vue>(versions.length > 0 ? "EDITEUR" : "ENTRETIEN");
  // Les deux onglets de 390 px : un arrêt de tabulation et les flèches,
  // comme tout `tablist` (règle clavier 4, revue M12). Le clavier est celui
  // des groupes radio : un choix exclusif, qui s'active au déplacement.
  const onglets = useGroupeRadio({
    options: [{ valeur: "EDITEUR" }, { valeur: "VERSIONS" }],
    valeur: vue,
    onChangement: (v) => setVue(v as Vue),
  });
  const idPanneau = useId();
  const panneau = (cle: "EDITEUR" | "VERSIONS") => `${idPanneau}-${cle.toLowerCase()}`;
  const [index, setIndex] = useState(0);
  const [reponses, setReponses] = useState<Reponses>(reponsesEnregistrees);
  const [suggestionVisible, setSuggestionVisible] = useState(Boolean(suggestion));
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  /**
   * Ce que le serveur a déjà. Une référence et non un état : elle sert à
   * décider s'il faut écrire, et une décision d'écriture ne doit pas
   * provoquer le rendu qui la rappellerait.
   */
  const conservees = useRef<Reponses>(reponsesEnregistrees);

  const total = piece.questions.length;
  const question = piece.questions[index]!;
  const courante = versionCourante(versions);
  const date = new Date(maintenant);

  const etat = etatDeLaPiece({
    versions,
    reponses: nombreDeReponsesTexte(reponses),
    redactionDisponible,
    redactionAssistee,
  });
  const message = messageDEtat(etat, nombreDeReponsesTexte(reponses));

  /** Le texte en cours de réécriture. Il part de la version courante. */
  const [brouillon, setBrouillon] = useState(courante ? texteDeLaVersion(courante) : "");
  const [envoi, setEnvoi] = useState("");
  const manque = obstacleALEnregistrement(brouillon, courante);

  /**
   * Les trois gestes qui créent une version. Ils passent par la même route,
   * discriminés sur le geste : aucun ne modifie une version existante, un
   * état passé n'ayant pas à être réécrit.
   */
  async function ecrire(
    cle: string,
    corps: Record<string, unknown>,
  ): Promise<void> {
    setEnvoi(cle);
    setEchec(null);
    const resultat = await appeler<{ produite: boolean; disponible: boolean }>(
      `/api/dossiers/${dossier.id}/redaction/${piece.type}/version`,
      { methode: "POST", corps },
    );
    setEnvoi("");
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    /**
     * `produite: false` n'est pas un échec du serveur : la demande a
     * abouti, et aucun texte n'a été écrit parce que le service qui
     * l'écrit n'est pas là. Le rechargement remet l'écran dans l'état que
     * le serveur connaît, lequel dira lui-même ce qui manque.
     */
    router.refresh();
  }

  /**
   * Enregistre la réponse courante, puis exécute la suite.
   *
   * La navigation n'attend pas le réseau : sur un téléphone lent, bloquer
   * « Question suivante » le temps d'un aller-retour ferait cliquer deux
   * fois. L'écriture part, l'écran avance, et un échec s'affiche sans
   * défaire ce que la personne a saisi — le texte reste dans l'état.
   */
  function conserverPuis(suite: () => void) {
    const texte = reponses[index] ?? "";
    const rangConserve = index;
    suite();
    if (reponseAConserver(texte) === reponseAConserver(conservees.current[rangConserve] ?? "")) {
      return;
    }
    conservees.current = { ...conservees.current, [rangConserve]: texte };
    void appeler(`/api/dossiers/${dossier.id}/redaction/${piece.type}`, {
      methode: "PUT",
      corps: { rang: rangConserve, reponse: texte },
    }).then((resultat) => {
      if (resultat.ok) return;
      // Ce que le serveur a refusé, il ne l'a pas. La référence revient
      // en arrière pour que la prochaine sortie de question réessaie.
      const reste = Object.fromEntries(
        Object.entries(conservees.current).filter(([rang]) => Number(rang) !== rangConserve),
      );
      conservees.current = reste;
      setEchec(resultat.echec);
    });
  }

  if (vue === "ENTRETIEN") {
    const reponse = reponses[index] ?? "";
    const dernier = index === total - 1;

    return (
      <div className="mx-auto flex w-full max-w-colonne flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
        <EnteteDossier
          dossier={dossier}
          retour={`/dossiers/${dossier.id}/redaction`}
          libelleRetour="Rédaction assistée"
        />

        <div className="flex flex-col gap-2">
          <p className="text-13 font-medium uppercase tracking-wide text-ink-500">
            {piece.libelle} · {question.section}
          </p>
          <h1
            id="contenu"
            tabIndex={-1}
            className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
          >
            {question.intitule}
          </h1>
          <p
            aria-live="polite"
            className="text-14 text-ink-700"
          >
            {libelleRang(index, total)}
          </p>
          {/* Le rang est aussi porté par une barre : `aria-valuenow` compte des
              questions, pas des points — aucune part n'est affichée. */}
          <div
            role="progressbar"
            aria-label="Avancement de l'entretien"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={index + 1}
            className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100"
          >
            <span
              className="block h-full bg-accent-500"
              style={{ width: `${((index + 1) / total) * 100}%` }}
            />
          </div>
        </div>

        <section className="flex flex-col gap-1.5 rounded-lg bg-ink-100 p-4">
          <h2 className="text-14 font-semibold text-ink-900">Pourquoi cette question</h2>
          <p className="text-pretty text-14 text-ink-700">{question.motif}</p>
        </section>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="reponse" className="text-14 font-medium text-ink-900">
            Ta réponse
          </label>
          <textarea
            id="reponse"
            rows={5}
            value={reponse}
            placeholder={question.exemple}
            onChange={(e) =>
              setReponses((p) => ({ ...p, [index]: e.target.value }))
            }
            aria-describedby="compteur-reponse"
            className={cn(CHAMP_CONTROLE, "h-auto py-2.5")}
          />
          <span id="compteur-reponse" aria-live="polite" className="text-13 text-ink-500">
            {libelleReponse(reponse)}
          </span>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-14 font-semibold text-ink-900">
            Deux repères pour cette question
          </h2>
          <ul className="flex flex-col gap-1.5">
            {question.reperes.map((repere) => (
              <li key={repere} className="text-pretty text-14 text-ink-700">
                {repere}
              </li>
            ))}
          </ul>
        </section>

        <p className="text-pretty text-13 text-ink-500">
          Réponds en français ou en anglais, comme tu préfères. Tes réponses sont
          conservées à mesure : tu peux interrompre l&apos;entretien et le reprendre.
        </p>

        {echec ? <BlocEchec echec={echec} annonce /> : null}

        <div className="flex flex-col gap-2 border-t border-ink-300 pt-4">
          <p className="text-13 text-ink-500">
            {libelleAvancementEntretien(reponses, total)}
          </p>
          <div className="flex flex-col gap-2 md:flex-row-reverse">
            <Button
              pleineLargeur
              className="min-h-action md:w-auto"
              onClick={() =>
                conserverPuis(() =>
                  dernier ? setVue("EDITEUR") : setIndex(questionSuivante(index, total)),
                )
              }
            >
              {libelleSuivant(index, total)}
            </Button>
            <Button
              variante="secondaire"
              pleineLargeur
              className="md:w-auto"
              disabled={index === 0}
              raisonDesactivation="C'est la première question de l'entretien."
              onClick={() => conserverPuis(() => setIndex(questionPrecedente(index)))}
            >
              Question précédente
            </Button>
          </div>
          <Button
            variante="lien"
            className="self-center"
            onClick={() =>
              conserverPuis(() =>
                dernier ? setVue("EDITEUR") : setIndex(questionSuivante(index, total)),
              )
            }
          >
            Passer cette question
          </Button>
          <p className="text-pretty text-center text-13 text-ink-500">{MENTION_PASSER}</p>
          {/*
            Arbitrage S.80 : écrire sa pièce soi-même est un droit de tous,
            et l'entretien est une aide, pas un passage obligé. Il fallait
            passer chaque question pour atteindre l'éditeur ; la réponse en
            cours est conservée comme par les autres boutons.
          */}
          <Button
            variante="lien"
            className="self-center"
            onClick={() => conserverPuis(() => setVue("EDITEUR"))}
          >
            Écrire directement dans l&apos;éditeur
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-gabarit flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <EnteteDossier
        dossier={dossier}
        retour={`/dossiers/${dossier.id}/redaction`}
        libelleRetour="Rédaction assistée"
      />

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          {piece.libelle}
        </h1>
        {courante ? (
          <p className="text-14 text-ink-700">{libelleVersion(courante, date)}</p>
        ) : null}
      </div>

      {/* Deux onglets en 390 px, deux colonnes au-delà : la commutation
          disparaît dès que les deux tiennent ensemble. */}
      <div
        className="flex gap-2 md:hidden"
        role="tablist"
        aria-label="Vues de la pièce"
        onKeyDown={onglets.auClavier}
      >
        {(["EDITEUR", "VERSIONS"] as const).map((cle, i) => (
          <button
            key={cle}
            ref={onglets.refDe(i)}
            type="button"
            role="tab"
            aria-selected={vue === cle}
            aria-controls={panneau(cle)}
            tabIndex={onglets.tabIndexDe(cle)}
            onClick={() => setVue(cle)}
            className={cn(
              "flex min-h-touch flex-1 items-center justify-center rounded-sm border text-14",
              vue === cle
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-ink-300 bg-white text-ink-900",
            )}
          >
            {cle === "EDITEUR" ? "Éditeur" : "Versions"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <section
          id={panneau("EDITEUR")}
          className={cn(
            "min-w-0 flex-1 flex-col gap-5 md:flex",
            vue === "VERSIONS" ? "hidden" : "flex",
          )}
        >
          <h2 className="sr-only">Texte de la pièce</h2>

          {message ? (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-ink-300 bg-white p-5">
              <h3 className="text-pretty text-19 font-semibold text-ink-900">
                {message.titre}
              </h3>
              <p className="max-w-redaction text-pretty text-14 text-ink-700">
                {message.corps}
              </p>
              {etat === "MISE_EN_FORME_RESERVEE" && message.action ? (
                <LienBouton
                  href={lienDesPacks}
                  variante="secondaire"
                  className="mt-1"
                >
                  {message.action}
                </LienBouton>
              ) : message.action ? (
                <Button
                  className="mt-1"
                  disabled={envoi !== ""}
                  raisonDesactivation="Préparation du texte en cours."
                  onClick={() =>
                    etat === "A_METTRE_EN_FORME"
                      ? ecrire("mise-en-forme", { geste: "mise-en-forme" })
                      : setVue("ENTRETIEN")
                  }
                >
                  {envoi === "mise-en-forme" ? "Préparation…" : message.action}
                </Button>
              ) : null}
            </div>
          ) : null}

          {/*
            Le champ est toujours là — arbitrage S.80. Il n'apparaissait
            qu'une fois une première version produite, c'est-à-dire après
            une mise en forme par le service : sans elle, le candidat ne
            pouvait pas écrire sa propre pièce dans l'application. Écrire
            est un droit de tous ; seule l'assistance dépend du pack.
          */}
          <div className="flex flex-col gap-2">
            <label htmlFor="texte" className="text-14 font-medium text-ink-900">
              Ton texte
            </label>
            {/*
              Un champ, et non des paragraphes en lecture seule. L'onglet
              s'appelait « Éditeur » et n'éditait rien : le texte du
              candidat lui appartient, et chaque enregistrement laisse une
              version restaurable.

              Le texte entier plutôt qu'un champ par paragraphe : on
              réécrit une lettre, pas un tableau de morceaux, et déplacer
              une phrase d'un paragraphe à l'autre est le geste le plus
              courant d'une relecture.
            */}
            <textarea
              id="texte"
              rows={18}
              value={brouillon}
              onChange={(e) => setBrouillon(e.target.value)}
              aria-describedby="texte-aide"
              className={cn(CHAMP_CONTROLE, "h-auto max-w-redaction py-3 leading-relaxed")}
            />
            <p id="texte-aide" className="max-w-redaction text-pretty text-13 text-ink-500">
              {MENTION_AIDE_A_LA_REDACTION}
            </p>
            <div className="flex flex-col items-start gap-2 pt-1 sm:flex-row sm:items-center">
              <Button
                variante="secondaire"
                disabled={manque !== null || envoi !== ""}
                raisonDesactivation={manque ?? "Enregistrement en cours."}
                onClick={() => ecrire("reecriture", { geste: "reecriture", texte: brouillon })}
              >
                {envoi === "reecriture" ? "Enregistrement…" : "Enregistrer une version"}
              </Button>
              <span className="text-13 text-ink-500">
                {courante
                  ? `Version ${courante.rang} en cours · une nouvelle version est créée, l'ancienne reste`
                  : "Ton premier enregistrement crée la version 1 : tu pourras toujours y revenir"}
              </span>
            </div>
          </div>

          {/*
            La suggestion se pose au-dessus du champ, et non sous le
            paragraphe qu'elle visait.

            Les paragraphes étaient rendus en lecture seule sous le champ de
            saisie : la lettre s'affichait deux fois, et l'ancre de la
            suggestion était le seul motif de cette répétition. La section
            visée est nommée dans la suggestion — c'est ce qui la rattache au
            bon passage, dans un texte que le candidat vient peut-être de
            réorganiser.
          */}
          {suggestion && suggestionVisible && courante ? (
            <div className="flex max-w-redaction flex-col items-start gap-2 rounded-md border-l-6 border-accent-500 bg-accent-50 p-3.5">
              <p className="text-13 font-semibold text-accent-700">
                {suggestion.section
                  ? `Suggestion — paragraphe « ${suggestion.section} »`
                  : "Suggestion"}
              </p>
              <p className="text-pretty text-14 text-accent-700">{suggestion.texte}</p>
              <div className="flex gap-2">
                <Button variante="secondaire" onClick={() => setVue("ENTRETIEN")}>
                  Répondre
                </Button>
                <Button variante="lien" onClick={() => setSuggestionVisible(false)}>
                  Ignorer
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <section
          id={panneau("VERSIONS")}
          className={cn(
            "flex-col gap-3 md:flex md:w-versions md:flex-none",
            vue === "EDITEUR" ? "hidden" : "flex",
          )}
        >
          <h2 className="text-16 font-semibold text-ink-900">Versions</h2>
          <ul className="flex flex-col">
            {parOrdreDeLecture(versions).map((version) => (
              <li
                key={version.rang}
                className="flex flex-col gap-1 border-t border-ink-300 py-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-14 font-medium text-ink-900">
                    Version {version.rang}
                  </span>
                  {estCourante(version, versions) ? (
                    <span className="rounded-full bg-ink-100 px-2.5 py-1 text-13 text-ink-700">
                      Actuelle
                    </span>
                  ) : (
                    <Button
                      variante="lien"
                      disabled={envoi !== ""}
                      raisonDesactivation="Enregistrement en cours."
                      onClick={() =>
                        ecrire(`restauration-${version.rang}`, {
                          geste: "restauration",
                          rang: version.rang,
                        })
                      }
                    >
                      {envoi === `restauration-${version.rang}`
                        ? "Restauration…"
                        : "Restaurer"}
                    </Button>
                  )}
                </div>
                <span className="text-13 text-ink-500">
                  {motsDeLaVersion(version)} mots ·{" "}
                  {libelleAnciennete(version.enregistreeLe, date)}
                </span>
                <span className="text-pretty text-14 text-ink-700">{version.motif}</span>
              </li>
            ))}
          </ul>
          <p className="text-pretty text-13 text-ink-500">{MENTION_RETENTION_VERSIONS}</p>
        </section>
      </div>

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4 md:flex-row md:items-center md:justify-between">
        <p className="text-13 text-ink-500">
          {suggestion && suggestionVisible ? "1 suggestion en attente" : "Aucune suggestion en attente"}
        </p>
        <div className="flex flex-col gap-2 md:flex-row">
          {/*
            « Lancer l'analyse critique » promettait un geste : le lien
            ouvrait une page qui lit des remarques, sans qu'aucune analyse
            soit déclenchée ni possible. Le libellé dit maintenant ce que le
            lien fait — et il ne s'affiche que s'il y a un texte à ouvrir.
          */}
          {courante ? (
            <LienBouton
              href={`/dossiers/${dossier.id}/redaction/${piece.type}/relecture`}
              pleineLargeur
              className="md:w-auto"
            >
              Voir l&apos;analyse critique
            </LienBouton>
          ) : null}
          {/*
            WF-08 étape 6, les deux sorties. Elles n'apparaissent qu'avec
            un texte : offrir d'exporter une pièce vide est la promesse que
            cette revue a passé dix lots à retirer.

            Le DOCX descend dans les téléchargements ; le PDF est celui du
            navigateur, depuis une page qui s'imprime (L.3). Deux liens et
            non deux boutons : ni l'un ni l'autre n'écrit quoi que ce soit.
          */}
          {courante ? (
            <>
              <LienBouton
                href={`/api/dossiers/${dossier.id}/redaction/${piece.type}/export?format=docx`}
                variante="secondaire"
                pleineLargeur
                className="md:w-auto"
              >
                Télécharger en Word
              </LienBouton>
              <Link
                href={`/dossiers/${dossier.id}/redaction/${piece.type}/impression`}
                className="flex min-h-touch items-center justify-center text-14 text-accent-700 underline"
              >
                Version à imprimer
              </Link>
            </>
          ) : null}
          <Link
            href={`/dossiers/${dossier.id}`}
            className="flex min-h-touch items-center justify-center text-14 text-accent-700 underline"
          >
            Joindre la pièce au dossier
          </Link>
        </div>
      </div>
    </div>
  );
}
