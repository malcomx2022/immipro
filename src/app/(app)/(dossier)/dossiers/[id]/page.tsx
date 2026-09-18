import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChecklistRow } from "@/components/ui/ChecklistRow";
import { CompletenessTier } from "@/components/ui/CompletenessTier";
import { LienBouton } from "@/components/ui/LienBouton";
import { SourceNote } from "@/components/ui/SourceNote";
import {
  LIBELLE_FAMILLE,
  libelleAction,
  libelleAlertePeremption,
  libelleAvancementFamille,
  libelleBlocage,
  lienDePiece,
  premiereATraiter,
  type FamillePiece,
  type Piece,
} from "@/domain/dossiers/piece";
import { jourEnFrancais } from "@/domain/format/moment";
import { DOSSIERS, dossierParId, piecesDuDossier } from "@/lib/contenu/dossiers";
import { PARTENAIRE } from "@/lib/contenu/alertes";
import { EnteteDossier } from "./EnteteDossier";
import { PropositionPartenaire } from "./PropositionPartenaire";

/**
 * C-06 — Dossier, checklist. WF-06.
 *
 * Écran pivot du lot : c'est ici que se décide le ton. Le constat précède
 * l'action — mesure constatée, exigence, geste attendu — et garde le même
 * registre pour une pièce conforme et pour un passeport hors délai. Expliquer
 * à quelqu'un qui n'a rien fait de travers une règle qu'il subit, puis le
 * presser, serait le registre du reproche.
 *
 * La complétude s'affiche en palier et en dénombrement, jamais en note :
 * le prototype écrivait encore « 68 / 100 » en tête de cet écran, et
 * l'arbitrage C-09 porte sur l'API, donc sur tous les écrans qui la montrent.
 */
export function generateStaticParams() {
  return DOSSIERS.map((d) => ({ id: d.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dossier = dossierParId(id);
  if (!dossier) return { title: "Dossier introuvable" };
  return {
    title: `Checklist — ${dossier.destination.pays}`,
    description: "Les pièces à réunir pour ce dossier, et ce qui reste à faire sur chacune.",
  };
}

export default async function PageChecklist({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dossier = dossierParId(id);
  if (!dossier) notFound();

  const pieces = piecesDuDossier(id);
  const premiere = premiereATraiter(pieces);
  const mention = dossier.destination.mention;

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <EnteteDossier dossier={dossier} />

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Checklist
        </h1>
        <p className="text-14 text-ink-700">
          {dossier.depotVise
            ? `Dépôt visé : ${jourEnFrancais(dossier.depotVise)}`
            : "Date de dépôt non fixée"}
        </p>
      </div>

      <CompletenessTier
        completude={dossier.completude}
        mention="Ce qui manque au dossier, pas tes chances d'obtenir le visa. Cette décision appartient à l'administration du pays de destination."
      />

      <p className="text-pretty rounded-md bg-ink-100 p-3.5 text-14 text-ink-700">
        Prochaine action : {dossier.prochaineAction}
      </p>

      {/* T-03 : la proposition n'apparaît que sur une situation déclarée, et
          elle est posée après la prochaine action, pas devant elle. */}
      {dossier.limiteDeclaree ? (
        <PropositionPartenaire
          partenaire={PARTENAIRE}
          motif={dossier.limiteDeclaree}
        />
      ) : null}

      <nav aria-label="Vues du dossier" className="flex flex-wrap gap-2">
        <LienVue href={`/dossiers/${id}/completude`}>Complétude</LienVue>
        <LienVue href={`/dossiers/${id}/redaction`}>Rédiger une pièce</LienVue>
        <LienVue href={`/dossiers/${id}/echeancier`}>Échéancier</LienVue>
        <LienVue href={`/dossiers/${id}/cloture`}>Clôturer</LienVue>
      </nav>

      <SectionPieces
        famille="OBLIGATOIRE"
        pieces={pieces}
        dossierId={id}
        depotVise={dossier.depotVise}
        sousTitre={libelleAvancementFamille(pieces, "OBLIGATOIRE")}
      />
      <SectionPieces
        famille="COMPLEMENTAIRE"
        pieces={pieces}
        dossierId={id}
        depotVise={dossier.depotVise}
        sousTitre="Renforcent le dossier"
      />

      <SourceNote source={mention.source} verifieeLe={mention.verifieeLe}>
        ImmiPro contrôle la complétude de ton dossier, pas la décision de
        l&apos;administration.
      </SourceNote>

      {/* Barre d'action : dernier élément du DOM, règle clavier 12. */}
      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4 md:flex-row md:items-center md:justify-between">
        <p className="text-14 text-ink-700">{libelleBlocage(pieces)}</p>
        {premiere ? (
          <LienBouton
            href={lienDePiece(id, premiere)}
            pleineLargeur
            className="md:w-auto"
          >
            Continuer
          </LienBouton>
        ) : (
          <LienBouton href={`/dossiers/${id}/completude`} pleineLargeur className="md:w-auto">
            Vérifier la complétude
          </LienBouton>
        )}
      </div>
    </div>
  );
}

function LienVue({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-touch items-center rounded-sm border border-ink-300 px-3.5 text-14 text-ink-700 hover:bg-ink-100"
    >
      {children}
    </Link>
  );
}

function SectionPieces({
  famille,
  pieces,
  dossierId,
  depotVise,
  sousTitre,
}: {
  famille: FamillePiece;
  pieces: readonly Piece[];
  dossierId: string;
  depotVise?: string;
  sousTitre: string;
}) {
  const lot = pieces.filter((p) => p.famille === famille);
  if (lot.length === 0) return null;

  return (
    <section className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
        <h2 className="text-19 font-semibold text-ink-900">{LIBELLE_FAMILLE[famille]}</h2>
        <p className="text-13 text-ink-500">{sousTitre}</p>
      </div>
      <ul className="flex flex-col">
        {lot.map((piece) => (
          <li key={piece.id} className="flex">
            <ChecklistRow
              code={piece.code}
              libelle={piece.libelle}
              etat={piece.etat}
              message={piece.message}
              mention={libelleAlertePeremption(piece, depotVise) ?? undefined}
              action={libelleAction(piece)}
              href={lienDePiece(dossierId, piece)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
