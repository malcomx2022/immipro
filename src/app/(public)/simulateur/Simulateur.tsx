"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useGroupeRadio } from "@/components/ui/useGroupeRadio";
import {
  avancement,
  estDerniereEtape,
  NOMBRE_ETAPES,
  questionDeLEtape,
  questionsRestantes,
  repereEtape,
  type Reponses,
} from "@/domain/simulateur/questions";
import { ecrireReponses, lireReponses } from "@/lib/simulation-session";

/**
 * P-02 — Simulateur, six questions.
 *
 * Règle clavier 7 : à chaque étape le focus va au titre de la nouvelle
 * question, rendu focalisable par `tabindex="-1"`. Sans ça il reste sur un
 * bouton qui vient de disparaître et repart en haut du document.
 *
 * Le titre porte aussi `id="contenu"` : c'est la cible du lien d'évitement
 * du gabarit, et elle suit donc l'étape affichée.
 */
export function Simulateur() {
  const router = useRouter();
  const [etape, setEtape] = useState(0);
  const [reponses, setReponses] = useState<Reponses>({});
  const titre = useRef<HTMLHeadingElement>(null);
  // Le focus se déplace au changement d'étape, jamais au premier rendu
  // (règle clavier 6 : il ne bouge qu'au changement d'écran).
  const premierRendu = useRef(true);

  useEffect(() => setReponses(lireReponses()), []);

  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }
    titre.current?.focus();
  }, [etape]);

  const question = questionDeLEtape(etape);
  const derniere = estDerniereEtape(etape);
  const choisie = reponses[question.cle];

  const repondre = (valeur: string) => {
    const suivantes = { ...reponses, [question.cle]: valeur };
    setReponses(suivantes);
    ecrireReponses(suivantes);
  };

  // Les flèches choisissent, comme dans tout groupe radio (règle clavier 4,
  // revue M12) : un seul arrêt de tabulation, puis « Continuer ».
  const { auClavier, refDe, tabIndexDe } = useGroupeRadio({
    options: question.options.map((valeur) => ({ valeur })),
    valeur: choisie ?? null,
    onChangement: repondre,
  });

  const continuer = () => {
    if (derniere) {
      router.push("/resultats");
      return;
    }
    setEtape((e) => Math.min(NOMBRE_ETAPES - 1, e + 1));
  };

  return (
    <div className="mx-auto flex w-full max-w-gabarit flex-col gap-6 px-4 py-6 md:flex-row md:gap-12 md:px-12 md:py-10">
      <div className="flex flex-1 flex-col gap-6 md:max-w-decision">
        <div className="flex items-center gap-3">
          {/* À la première question, « Retour » ramène à l'accueil : un
              bouton qui ne fait rien vaut moins qu'un bouton qui sort. */}
          <Button
            variante="tertiaire"
            onClick={() =>
              etape === 0 ? router.push("/") : setEtape((e) => Math.max(0, e - 1))
            }
          >
            Retour
          </Button>
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={NOMBRE_ETAPES}
            aria-valuenow={etape + 1}
            aria-valuetext={`Question ${repereEtape(etape)}`}
          >
            <div
              className="h-2 rounded-full bg-accent-500"
              style={{ width: `${avancement(etape) * 100}%` }}
            />
          </div>
          <span className="flex-none font-mono text-13 text-ink-500">
            {repereEtape(etape)}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <h1
            id="contenu"
            ref={titre}
            tabIndex={-1}
            className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
          >
            {question.intitule}
          </h1>
          <p className="text-pretty text-16 text-ink-700">{question.aide}</p>
        </div>

        <div
          role="radiogroup"
          aria-labelledby="contenu"
          onKeyDown={auClavier}
          className="flex flex-col gap-2"
        >
          {question.options.map((option, i) => (
            <button
              key={option}
              ref={refDe(i)}
              type="button"
              role="radio"
              aria-checked={choisie === option}
              tabIndex={tabIndexDe(option)}
              onClick={() => repondre(option)}
              className={`flex min-h-option items-center justify-between gap-3 rounded-md border px-4 text-left text-16 font-medium text-ink-900 ${
                choisie === option
                  ? "border-accent-500 bg-accent-50"
                  : "border-ink-300 bg-white hover:bg-ink-100"
              }`}
            >
              <span>{option}</span>
              <span className="text-14 font-medium text-accent-700">
                {choisie === option ? "Choisi" : ""}
              </span>
            </button>
          ))}
        </div>

        <p className="text-13 text-ink-500">
          Tes réponses ne sont conservées que le temps de la simulation. Aucun
          compte n&apos;est créé.
        </p>
      </div>

      {/* Barre d'action : dernier arrêt du DOM, et collée au bas de l'écran
          sur mobile pour rester atteignable sans défiler (règle clavier 12). */}
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-ink-300 bg-white px-4 py-3 md:static md:mx-0 md:w-72 md:flex-none md:border-0 md:p-0">
        <Button
          pleineLargeur
          className="min-h-action"
          disabled={!choisie}
          raisonDesactivation={
            choisie ? undefined : "Choisis une réponse pour continuer."
          }
          onClick={continuer}
        >
          {derniere ? "Voir mes destinations" : "Continuer"}
        </Button>
        <p className="text-center text-13 text-ink-500">
          {derniere ? "Résultat immédiat, aucun compte à créer" : questionsRestantes(etape)}
        </p>
      </div>
    </div>
  );
}
