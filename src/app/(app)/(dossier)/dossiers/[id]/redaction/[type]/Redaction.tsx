"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { LienBouton } from "@/components/ui/LienBouton";
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
  type Reponses,
} from "@/domain/redaction/entretien";
import type { Suggestion, Version } from "@/domain/redaction/versions";
import {
  MENTION_RETENTION_VERSIONS,
  estCourante,
  libelleAnciennete,
  libelleVersion,
  motsDeLaVersion,
  parOrdreDeLecture,
  versionCourante,
} from "@/domain/redaction/versions";
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
 */
export interface RedactionProps {
  dossier: Dossier;
  piece: PieceRedigeable;
  versions: readonly Version[];
  suggestion?: Suggestion;
  /** Horodatage de rendu, passé par le serveur pour que « il y a 4 minutes » soit stable. */
  maintenant: string;
}

type Vue = "ENTRETIEN" | "EDITEUR" | "VERSIONS";

export function Redaction({
  dossier,
  piece,
  versions,
  suggestion,
  maintenant,
}: RedactionProps) {
  const [vue, setVue] = useState<Vue>(versions.length > 0 ? "EDITEUR" : "ENTRETIEN");
  const [index, setIndex] = useState(0);
  const [reponses, setReponses] = useState<Reponses>({});
  const [suggestionVisible, setSuggestionVisible] = useState(Boolean(suggestion));

  const total = piece.questions.length;
  const question = piece.questions[index]!;
  const courante = versionCourante(versions);
  const date = new Date(maintenant);

  if (vue === "ENTRETIEN") {
    const reponse = reponses[index] ?? "";
    const dernier = index === total - 1;

    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
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

        <div className="flex flex-col gap-2 border-t border-ink-300 pt-4">
          <p className="text-13 text-ink-500">
            {libelleAvancementEntretien(reponses, total)}
          </p>
          <div className="flex flex-col gap-2 md:flex-row-reverse">
            <Button
              pleineLargeur
              className="min-h-action md:w-auto"
              onClick={() =>
                dernier ? setVue("EDITEUR") : setIndex(questionSuivante(index, total))
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
              onClick={() => setIndex(questionPrecedente(index))}
            >
              Question précédente
            </Button>
          </div>
          <Button
            variante="lien"
            className="self-center"
            onClick={() =>
              dernier ? setVue("EDITEUR") : setIndex(questionSuivante(index, total))
            }
          >
            Passer cette question
          </Button>
          <p className="text-pretty text-center text-13 text-ink-500">{MENTION_PASSER}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
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
      <div className="flex gap-2 md:hidden" role="tablist" aria-label="Vues de la pièce">
        {(["EDITEUR", "VERSIONS"] as const).map((cle) => (
          <button
            key={cle}
            type="button"
            role="tab"
            aria-selected={vue === cle}
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
          className={cn(
            "min-w-0 flex-1 flex-col gap-5 md:flex",
            vue === "VERSIONS" ? "hidden" : "flex",
          )}
        >
          <h2 className="sr-only">Texte de la pièce</h2>
          {courante?.paragraphes.map((paragraphe) => (
            <div key={paragraphe.section} className="flex flex-col gap-1.5">
              <h3 className="text-13 font-semibold uppercase tracking-wide text-ink-500">
                {paragraphe.section}
              </h3>
              {/* Au-delà de 68 caractères par ligne, l'œil perd la ligne. */}
              <p className="max-w-[68ch] text-pretty text-16 leading-relaxed text-ink-900">
                {paragraphe.texte}
              </p>
              {suggestion && suggestionVisible && suggestion.section === paragraphe.section ? (
                <div className="flex flex-col items-start gap-2 rounded-md border-l-6 border-accent-500 bg-accent-50 p-3.5">
                  <p className="text-13 font-semibold text-accent-700">Suggestion</p>
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
            </div>
          ))}
        </section>

        <section
          className={cn(
            "flex-col gap-3 md:flex md:w-[320px] md:flex-none",
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
                    <Button variante="lien">Restaurer</Button>
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
          <LienBouton
            href={`/dossiers/${dossier.id}/redaction/${piece.type}/relecture`}
            pleineLargeur
            className="md:w-auto"
          >
            Lancer l&apos;analyse critique
          </LienBouton>
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
