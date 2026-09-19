import Link from "next/link";
import type { Dossier } from "@/domain/dossiers/dossier";
import { LienBouton } from "@/components/ui/LienBouton";
import { SourceNote } from "@/components/ui/SourceNote";
import {
  grouperParMois,
  libelleCompteARebours,
  libelleDelai,
  resumeEcheancier,
  urgence,
  type Echeance,
} from "@/domain/dossiers/echeancier";
import { jourEnFrancais } from "@/domain/format/moment";
import { EnteteDossier } from "../EnteteDossier";

/**
 * C-10 — Échéancier, présentation. WF-09.
 *
 * Un calendrier à rebours du dépôt visé, pas une liste de rappels. Les pièces
 * périssables y portent une date « au plus tôt » : demandées avant, elles sont
 * périmées le jour du dépôt, et le candidat les refait pour rien.
 *
 * `aujourdhui` est passé par la page plutôt que lu ici : un composant qui
 * appelle `new Date()` au rendu ne se teste pas, et un échéancier dont le
 * compte à rebours dépend de l'heure du test est un échéancier qu'on ne
 * vérifie jamais.
 */
const FORMAT_COURT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

export interface EcheancierProps {
  dossier: Dossier;
  echeances: readonly Echeance[];
  /** Date du serveur au rendu, ISO `AAAA-MM-JJ`. */
  aujourdhui: string;
}

export function Echeancier({ dossier, echeances, aujourdhui }: EcheancierProps) {
  const id = dossier.id;
  const mention = dossier.destination.mention;

  if (!dossier.depotVise || echeances.length === 0) {
    return <SansEcheancier dossierId={id} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <EnteteDossier dossier={dossier} retour={`/dossiers/${id}`} libelleRetour="Checklist" />

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Échéancier
        </h1>
        <p className="text-16 text-ink-700">
          Dépôt visé le {jourEnFrancais(dossier.depotVise)}
        </p>
        <p className="text-14 font-medium text-ink-900">
          {libelleCompteARebours(aujourdhui, dossier.depotVise)}
        </p>
        <p className="text-14 text-ink-700">{resumeEcheancier(echeances, aujourdhui)}</p>
      </div>

      {grouperParMois(echeances).map((mois) => (
        <section key={mois.cle} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-19 font-semibold text-ink-900">{mois.libelle}</h2>
            {mois.cle === aujourdhui.slice(0, 7) ? (
              <span className="rounded-full bg-ink-100 px-2.5 py-1 text-13 text-ink-700">
                ce mois-ci
              </span>
            ) : null}
          </div>
          <ul className="flex flex-col">
            {mois.echeances.map((echeance) => (
              <LigneEcheance
                key={echeance.id}
                echeance={echeance}
                aujourdhui={aujourdhui}
              />
            ))}
          </ul>
        </section>
      ))}

      <SourceNote source={mention.source} verifieeLe={mention.verifieeLe}>
        Les délais administratifs béninois sont des moyennes observées, non
        garanties.
      </SourceNote>

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4 md:flex-row md:items-center md:justify-between">
        {/* Annoncer « rappels activés » sans donner le moyen de les couper
            serait un réglage subi : la mention renvoie là où il se change. */}
        <Link
          href="/profil"
          className="flex min-h-touch items-center text-14 text-ink-700 underline"
        >
          Rappels par email activés — les modifier
        </Link>
        <LienBouton
          href={`/dossiers/${id}`}
          variante="secondaire"
          pleineLargeur
          className="md:w-auto"
        >
          Changer la date de dépôt
        </LienBouton>
      </div>
    </div>
  );
}

function LigneEcheance({
  echeance,
  aujourdhui,
}: {
  echeance: Echeance;
  aujourdhui: string;
}) {
  const etat = urgence(echeance, aujourdhui);
  const date = new Date(`${echeance.date}T00:00:00Z`);

  return (
    <li className="flex items-start gap-3 border-t border-ink-300 py-4">
      <span
        aria-hidden="true"
        className="flex w-14 flex-none flex-col items-center rounded-sm bg-ink-100 py-1.5 text-13 text-ink-700"
      >
        <span className="text-16 font-semibold text-ink-900">
          {FORMAT_COURT.format(date).split(" ")[0]}
        </span>
        {FORMAT_COURT.format(date).split(" ").slice(1).join(" ")}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-16 font-medium text-ink-900">{echeance.titre}</span>
        <span className="text-pretty text-14 text-ink-700">{echeance.detail}</span>
        <span className="flex flex-wrap items-center gap-2 pt-0.5">
          <span
            className={
              etat === "EN_RETARD"
                ? "rounded-full bg-ink-100 px-2.5 py-1 text-13 font-medium text-danger"
                : "rounded-full bg-ink-100 px-2.5 py-1 text-13 text-ink-700"
            }
          >
            <time dateTime={echeance.date}>{libelleDelai(echeance, aujourdhui)}</time>
          </span>
          {echeance.perissable ? (
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-13 text-ink-700">
              Pièce périssable — date au plus tôt
            </span>
          ) : null}
          {echeance.imposee ? (
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-13 text-ink-700">
              Date imposée
            </span>
          ) : null}
        </span>
      </span>
    </li>
  );
}

/** Un brouillon n'a pas d'échéancier : il lui manque la date de dépôt. */
function SansEcheancier({ dossierId }: { dossierId: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-4 py-8">
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        L&apos;échéancier attend ta date de dépôt
      </h1>
      <p className="text-pretty text-16 text-ink-700">
        Toutes les dates se calculent à rebours du dépôt visé : sans elle, aucune
        échéance ne peut être posée. Fixe-la, les délais des pièces périssables
        suivront.
      </p>
      <LienBouton href={`/dossiers/${dossierId}`} pleineLargeur className="md:w-auto md:self-start">
        Fixer la date de dépôt
      </LienBouton>
    </div>
  );
}
