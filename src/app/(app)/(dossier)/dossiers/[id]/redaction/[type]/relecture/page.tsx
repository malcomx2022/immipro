import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { LienBouton } from "@/components/ui/LienBouton";
import { SourceNote } from "@/components/ui/SourceNote";
import {
  CE_QUE_NOUS_NE_JUGEONS_PAS,
  LIBELLE_GENRE,
  MENTION_RELECTURE,
  resumeRelecture,
  trierRemarques,
  type Remarque,
} from "@/domain/redaction/relecture";
import { dossierParId } from "@/lib/contenu/dossiers";
import { RELECTURE_LE, pieceRedigeable, remarquesDeLaLettre } from "@/lib/contenu/redaction";
import { EnteteDossier } from "../../../EnteteDossier";

/**
 * R-04 — Analyse critique. WF-08.
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
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  const piece = pieceRedigeable(type);
  if (!piece) return { title: "Pièce introuvable" };
  return {
    title: `Relecture — ${piece.libelle}`,
    description: "Les incohérences et les imprécisions relevées sur cette version.",
  };
}

export default async function PageRelecture({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}) {
  const { id, type } = await params;
  const dossier = dossierParId(id);
  const piece = pieceRedigeable(type);
  if (!dossier || !piece) notFound();

  const remarques = trierRemarques(remarquesDeLaLettre());
  const premiere = remarques[0];

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
        <p className="text-pretty text-16 text-ink-700">{resumeRelecture(remarques)}</p>
      </div>

      <ul className="flex flex-col gap-4">
        {remarques.map((remarque) => (
          <li key={remarque.id} className="flex">
            <BlocRemarque remarque={remarque} dossierId={id} />
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-1.5 rounded-lg bg-ink-100 p-4">
        <h2 className="text-16 font-semibold text-ink-900">Ce que nous ne jugeons pas</h2>
        <p className="text-pretty text-14 text-ink-700">{CE_QUE_NOUS_NE_JUGEONS_PAS}</p>
      </section>

      <SourceNote source="relecture automatique ImmiPro" verifieeLe={RELECTURE_LE}>
        {MENTION_RELECTURE}
      </SourceNote>

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4 md:flex-row-reverse md:items-center md:justify-between">
        <LienBouton
          href={`/dossiers/${id}/redaction/${type}`}
          pleineLargeur
          className="min-h-action md:w-auto"
        >
          {premiere ? premiere.action : "Revenir à l'éditeur"}
        </LienBouton>
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
  A_RENFORCER: "border-warning",
  FORME: "border-ink-300",
};

function BlocRemarque({
  remarque,
  dossierId,
}: {
  remarque: Remarque;
  dossierId: string;
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
        <Button variante="secondaire" pleineLargeur className="md:w-auto">
          {remarque.action}
        </Button>
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
