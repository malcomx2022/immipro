import Link from "next/link";
import type { Dossier } from "@/domain/dossiers/dossier";
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
  estDeposeeNonVerifiee,
  LIBELLE_CONSERVEE_NON_VERIFIEE,
} from "@/domain/dossiers/piece";
import { jourEnFrancais } from "@/domain/format/moment";
import type { AideDeLEtape } from "@/domain/dossiers/aide-de-letape";
import { EnteteDossier } from "./EnteteDossier";

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
 * l'arbitrage C-09 porte sur l'API, donc sur tous les écrans qui la montrent.
 */
export interface ChecklistProps {
  dossier: Dossier;
  pieces: readonly Piece[];
  /** Aide fonctionnelle de l'étape en cours, s'il y en a une (K.A). */
  aide?: AideDeLEtape | null;
}

export function Checklist({ dossier, pieces, aide }: ChecklistProps) {
  const id = dossier.id;
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

      {/* Un brouillon n'a pas de pack : c'est ici que le tunnel de paiement
          s'ouvre, et c'était le seul endroit d'où personne n'y accédait.
          Le bloc dit ce que le paiement ouvre, et rien de plus — ni délai,
          ni issue (INV-1, INV-2). */}
      {dossier.statut === "BROUILLON" ? (
        <section className="flex flex-col gap-3 rounded-lg border border-ink-300 p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-16 font-semibold text-ink-900">
              Ce dossier est encore un brouillon
            </h2>
            <p className="text-pretty text-14 text-ink-700">
              Tu vois la liste des pièces et leurs exigences. L&apos;analyse de
              ce que tu téléverses, l&apos;échéancier et la rédaction guidée
              s&apos;ouvrent avec un pack, payé une fois jusqu&apos;à la clôture.
            </p>
          </div>
          <LienBouton
            href={`/paiement/pack?dossier=${id}`}
            pleineLargeur
            className="md:w-auto md:self-start"
          >
            Voir les packs
          </LienBouton>
        </section>
      ) : null}

      {/* K.A — ce qui se tient ici est une aide, jamais une offre. La
          distinction n'est pas de degré : expliquer quoi faire relève de
          l'espace dossier, vendre une prestation n'en relève pas. Les
          offres vivent sur les surfaces qui leur sont dédiées, où le
          candidat va les chercher. */}
      {aide ? (
        <section className="flex flex-col gap-1.5 rounded-lg border border-ink-300 p-4">
          <p className="text-13 uppercase tracking-wide text-ink-500">{aide.piece}</p>
          <h2 className="text-16 font-semibold text-ink-900">{aide.titre}</h2>
          <p className="text-pretty text-14 text-ink-700">{aide.corps}</p>
        </section>
      ) : null}

      <nav aria-label="Vues du dossier" className="flex flex-wrap gap-2">
        <LienVue href={`/dossiers/${id}/completude`}>Complétude</LienVue>
        <LienVue href={`/dossiers/${id}/redaction`}>Rédiger une pièce</LienVue>
        <LienVue href={`/consultants?dossier=${id}`}>Consultants</LienVue>
        {/* K.A — une entrée de navigation n'est pas une proposition : elle
            ne nomme aucun prestataire, aucun prix, et rien ne la déclenche.
            C'est le candidat qui l'ouvre, comme l'annuaire juste avant. */}
        <LienVue href={`/services?dossier=${id}`}>Services</LienVue>
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
              libelleEtat={
                estDeposeeNonVerifiee(piece) ? LIBELLE_CONSERVEE_NON_VERIFIEE : undefined
              }
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
