import type { Dossier } from "@/domain/dossiers/dossier";
import { LienBouton } from "@/components/ui/LienBouton";
import { SourceNote } from "@/components/ui/SourceNote";
import {
  ACTION_RELECTURE,
  CE_QUE_NOUS_NE_JUGEONS_PAS,
  LIBELLE_GENRE,
  MENTION_RELECTURE,
  etatDeLaRelecture,
  resumeSelonLEtat,
  trierRemarques,
  type Remarque,
} from "@/domain/redaction/relecture";
import {
  TITRE_ECARTES,
  TITRE_RECOUPEMENTS,
  type Recoupements,
} from "@/domain/redaction/coherence";
import { EnteteDossier } from "../../../EnteteDossier";
import { LancerLAnalyse } from "./LancerLAnalyse";

/**
 * R-04 — Analyse critique, présentation. WF-08.
 *
 * La relecture relève des incohérences et des imprécisions ; elle ne note
 * pas le texte et ne prédit pas la décision (INV-1). Une note portée sur une
 * lettre se retiendrait comme un pronostic sur la décision — précisément ce
 * que l'arbitrage C-09 a retiré du dossier.
 *
 * L'apport tient au croisement : une date qui diffère entre la lettre et le
 * relevé de notes ne se voit sur aucune des deux pièces prise seule. C'est
 * pourquoi l'incohérence passe en tête, et affiche les deux valeurs côte à
 * côte plutôt que de décrire l'écart.
 *
 * ── L'avis favorable rendu sans avoir lu ────────────────────────────────
 *
 * L'écran répondait « Rien à reprendre sur cette version. » sur une liste
 * vide. Or aucune analyse n'avait jamais tourné : rien ne créait de
 * `CritiqueFinding`, et le service qui les produit n'est pas branché. La
 * page rendait donc un avis favorable sans avoir lu, et le bandeau de
 * source le datait — « relecture automatique ImmiPro, vérifiée le 21
 * septembre » — sur une relecture qui n'avait pas eu lieu.
 *
 * C'est le défaut de B-07 sur une autre surface : un vide qui se lit comme
 * un constat. Un tiret ne dit rien ; « rien à reprendre » affirme. Les deux
 * vides sont désormais distincts, et le bandeau ne date que ce qui a été
 * relu.
 *
 * ── Les recoupements déterministes, RG-08.3 ─────────────────────────────
 *
 * Ils tournent toujours, sans service et sans jeton, et l'écran doit donc
 * distinguer un troisième cas : le fond n'a pas été lu, mais la lettre a
 * bien été comparée à ce que le dossier sait de lui-même. D'où le pavé qui
 * nomme ce qui a été recoupé **et** ce qui ne l'a pas été : sans lui, une
 * liste vide resterait ambiguë, et un candidat croirait sa lettre
 * confrontée à ses pièces jointes alors qu'aucune n'a été lue.
 */
export interface RelectureProps {
  dossier: Dossier;
  type: string;
  /**
   * `null` quand aucune analyse n'a tourné — jamais `[]`. La distinction
   * porte tout l'écran : `[]` veut dire « relu, rien à reprendre ».
   */
  remarques: readonly Remarque[] | null;
  /**
   * Recoupements déterministes (RG-08.3). Toujours calculés : ils ne
   * dépendent d'aucun service, et leur absence de résultat est un résultat.
   */
  recoupements: Recoupements;
  /** Une version existe : sans texte, il n'y a rien à analyser. */
  texteExistant: boolean;
  /**
   * Le service d'analyse est configuré sur cette instance.
   *
   * Il ne dit rien de ce qui a été fait — `remarques` s'en charge, et les
   * confondre est le défaut que ce lot corrige. Il dit s'il y a un geste
   * à proposer plutôt qu'une absence à expliquer.
   */
  analysePossible: boolean;
  /** La couverture du dossier ouvre l'analyse critique (arbitrage S.80). */
  redactionAssistee: boolean;
  /** Date de la version relue, ISO `AAAA-MM-JJ`. */
  relectureLe: string;
}

export function Relecture({
  dossier,
  type,
  remarques: brutes,
  recoupements,
  texteExistant,
  analysePossible,
  redactionAssistee,
  relectureLe,
}: RelectureProps) {
  const id = dossier.id;
  /*
    Les écarts déterministes rejoignent les remarques de l'analyse dans une
    seule liste : pour le candidat, une incohérence est une incohérence, et
    deux listes séparées l'obligeraient à comprendre d'où vient chacune
    avant de savoir laquelle traiter.
  */
  const toutes = texteExistant ? [...(brutes ?? []), ...recoupements.remarques] : [];
  const etat = etatDeLaRelecture({
    remarques: brutes === null ? null : toutes,
    texteExistant,
    recoupementsEffectues: recoupements.effectues.length > 0,
    analysePossible,
    redactionAssistee,
  });
  const remarques = trierRemarques(toutes);
  const premiere = remarques[0];
  const relue = etat === "RELUE" || etat === "RELUE_SANS_REMARQUE";

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <EnteteDossier
        dossier={dossier}
        retour={`/dossiers/${id}/redaction/${type}`}
        libelleRetour="Éditeur"
      />

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Relecture de ta lettre
        </h1>
        <p className="max-w-[80ch] text-pretty text-16 text-ink-700">
          {resumeSelonLEtat(etat, toutes, recoupements.effectues.length > 0)}
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {remarques.map((remarque) => (
          <li key={remarque.id} className="flex">
            <BlocRemarque remarque={remarque} dossierId={id} type={type} />
          </li>
        ))}
      </ul>

      {/*
        Ce que le recoupement a couvert, et ce qu'il n'a pas couvert. La
        seconde liste n'est pas un aveu décoratif : elle est la seule chose
        qui empêche « rien ne diverge » de se lire comme « tout a été
        vérifié ». Elle s'affiche donc même quand rien n'a pu être comparé.
      */}
      {texteExistant ? (
        <section className="flex flex-col gap-3 rounded-lg bg-ink-100 p-4">
          {recoupements.effectues.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <h2 className="text-16 font-semibold text-ink-900">{TITRE_RECOUPEMENTS}</h2>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {recoupements.effectues.map((ligne) => (
                  <li key={ligne} className="text-pretty text-14 text-ink-700">
                    {ligne}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <h2 className="text-16 font-semibold text-ink-900">{TITRE_ECARTES}</h2>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {recoupements.ecartes.map((ligne) => (
                <li key={ligne} className="text-pretty text-14 text-ink-700">
                  {ligne}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-1.5 rounded-lg bg-ink-100 p-4">
        <h2 className="text-16 font-semibold text-ink-900">Ce que nous ne jugeons pas</h2>
        <p className="text-pretty text-14 text-ink-700">{CE_QUE_NOUS_NE_JUGEONS_PAS}</p>
      </section>

      {/*
        Le bandeau datait une relecture qui n'avait pas eu lieu. Une source
        et une date d'analyse ne s'affichent que sur une analyse réelle —
        c'est INV-8 pris au sérieux sur une donnée produite ici plutôt que
        relevée ailleurs.
      */}
      {relue ? (
        <SourceNote source="relecture automatique ImmiPro" verifieeLe={relectureLe}>
          {MENTION_RELECTURE}
        </SourceNote>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4 md:flex-row-reverse md:items-center md:justify-between">
        {/*
          Un seul état porte un geste qui déclenche quelque chose, et c'est
          celui-là. Partout ailleurs le bouton ramène à l'éditeur : un
          « Relancer » qui ne relance rien vaut moins qu'une absence.
        */}
        {etat === "A_ANALYSER" ? (
          <LancerLAnalyse dossierId={id} type={type} />
        ) : etat === "RESERVEE_AU_PACK" && !premiere ? (
          // Arbitrage S.80 : ni un bouton qui lancerait une analyse refusée,
          // ni un silence — le chemin vers ce qui l'ouvre.
          <LienBouton
            href="/tarifs"
            pleineLargeur
            className="min-h-action md:w-auto"
          >
            {ACTION_RELECTURE[etat]}
          </LienBouton>
        ) : (
          <LienBouton
            href={`/dossiers/${id}/redaction/${type}`}
            pleineLargeur
            className="min-h-action md:w-auto"
          >
            {premiere ? premiere.action : (ACTION_RELECTURE[etat] ?? "Revenir à l'éditeur")}
          </LienBouton>
        )}
        <LienBouton
          href={`/dossiers/${id}`}
          variante="secondaire"
          pleineLargeur
          className="md:w-auto"
        >
          Joindre la pièce au dossier
        </LienBouton>
      </div>
    </div>
  );
}

const TONS: Record<Remarque["genre"], string> = {
  INCOHERENCE: "border-danger",
  INCOHERENCE_DOSSIER: "border-danger",
  A_RENFORCER: "border-warning",
  FORME: "border-ink-300",
};

function BlocRemarque({
  remarque,
  dossierId,
  type,
}: {
  remarque: Remarque;
  dossierId: string;
  type: string;
}) {
  return (
    <article
      className={`flex w-full flex-col gap-3 rounded-lg border-l-6 bg-white p-4 shadow-e2 ${TONS[remarque.genre]}`}
    >
      <span className="w-fit rounded-full bg-ink-100 px-2.5 py-1 text-13 font-medium text-ink-700">
        {LIBELLE_GENRE[remarque.genre]}
      </span>
      <h2 className="text-pretty text-19 font-semibold text-ink-900">{remarque.titre}</h2>
      <p className="text-pretty text-14 text-ink-700">{remarque.corps}</p>

      {remarque.ecarts ? (
        <dl className="flex flex-col gap-2 rounded-md bg-ink-100 p-3.5 md:flex-row md:gap-6">
          {remarque.ecarts.map((ecart) => (
            <div key={ecart.source} className="flex flex-col gap-0.5">
              <dt className="text-13 text-ink-500">{ecart.source}</dt>
              <dd className="text-14 font-medium text-ink-900">{ecart.valeur}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="flex flex-col gap-2 md:flex-row">
        {/*
          Un lien vers l'éditeur, et non un bouton inerte : « Corriger le
          passage » n'était relié à rien, et la correction se fait dans
          l'éditeur — c'est là que le texte s'écrit.
        */}
        <LienBouton
          href={`/dossiers/${dossierId}/redaction/${type}`}
          variante="secondaire"
          pleineLargeur
          className="md:w-auto"
        >
          {remarque.action}
        </LienBouton>
        {remarque.actionSecondaire ? (
          <LienBouton
            href={`/dossiers/${dossierId}/pieces/releves-de-notes`}
            variante="tertiaire"
            pleineLargeur
            className="md:w-auto"
          >
            {remarque.actionSecondaire}
          </LienBouton>
        ) : null}
      </div>
    </article>
  );
}
