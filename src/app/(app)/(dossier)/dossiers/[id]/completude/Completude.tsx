import type { Dossier } from "@/domain/dossiers/dossier";
import { ChecklistRow } from "@/components/ui/ChecklistRow";
import { CompletenessTier } from "@/components/ui/CompletenessTier";
import { LienBouton } from "@/components/ui/LienBouton";
import { SourceNote } from "@/components/ui/SourceNote";
import {
  grouperPourCompletude,
  libelleAction,
  libelleAlertePeremption,
  libelleBlocage,
  lienDePiece,
  type Piece,
} from "@/domain/dossiers/piece";
import { EnteteDossier } from "../EnteteDossier";

/**
 * C-09 — Complétude du dossier, présentation. WF-07.
 *
 * L'écran-titre de l'arbitrage du 13/09/2026 : dénombrement des manques,
 * palier nommé, aucune note sur cent. « 68 sur 100 » se retient comme une
 * probabilité d'obtenir le visa, et le démenti écrit juste en dessous ne
 * survit pas à la mémoire du chiffre. Le dénombrement, lui, ne produit aucun
 * nombre interprétable de travers : les pièces manquantes sont nommées, et
 * le seul ordre affiché est celui qui bloque le dépôt.
 *
 * Ce que le score avait pour lui — la progression visible d'une session à
 * l'autre — est rendu par le passage d'une pièce de « ce qui bloque » à
 * « déjà conforme », qui se voit tout aussi bien et ne se confond avec rien.
 */
export interface CompletudeProps {
  dossier: Dossier;
  pieces: readonly Piece[];
}

export function Completude({ dossier, pieces }: CompletudeProps) {
  const id = dossier.id;

  const { bloquantes, ensuite, conformes } = grouperPourCompletude(pieces);
  const mention = dossier.destination.mention;

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <EnteteDossier
        dossier={dossier}
        retour={`/dossiers/${id}`}
        libelleRetour="Checklist"
      />

      <h1
        id="contenu"
        tabIndex={-1}
        className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        Complétude de ton dossier
      </h1>

      <CompletenessTier
        completude={dossier.completude}
        mention={`Ce qui manque au dossier, pas tes chances d'obtenir le visa. La décision appartient à l'autorité qui instruit la demande${mention.autorite ? ` : ${mention.autorite}` : ""}.`}
      />

      <Groupe
        titre="Ce qui bloque le dépôt"
        pieces={bloquantes}
        dossierId={id}
        depotVise={dossier.depotVise}
        vide="Aucune pièce obligatoire ne manque."
      />
      <Groupe
        titre="À traiter ensuite"
        pieces={ensuite}
        dossierId={id}
        depotVise={dossier.depotVise}
        vide="Les pièces complémentaires sont toutes traitées."
      />

      {conformes.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-19 font-semibold text-ink-900">Déjà conforme</h2>
          <ul className="flex flex-wrap gap-2">
            {conformes.map((piece) => (
              <li
                key={piece.id}
                className="rounded-full bg-ink-100 px-3 py-1.5 text-14 text-ink-700"
              >
                {piece.libelle}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SourceNote source={mention.source} verifieeLe={mention.verifieeLe}>
        Un dossier complet n&apos;est pas un dossier accepté.
      </SourceNote>

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4 md:flex-row md:items-center md:justify-between">
        <p className="text-14 text-ink-700">{libelleBlocage(pieces)}</p>
        <LienBouton
          href={`/dossiers/${id}`}
          variante="secondaire"
          pleineLargeur
          className="md:w-auto"
        >
          Reprendre la checklist
        </LienBouton>
      </div>
    </div>
  );
}

function Groupe({
  titre,
  pieces,
  dossierId,
  depotVise,
  vide,
}: {
  titre: string;
  pieces: readonly Piece[];
  dossierId: string;
  depotVise?: string;
  vide: string;
}) {
  return (
    <section className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
        <h2 className="text-19 font-semibold text-ink-900">{titre}</h2>
        {pieces.length > 0 ? (
          <p className="text-13 text-ink-500">
            {pieces.length} {pieces.length > 1 ? "pièces" : "pièce"}
          </p>
        ) : null}
      </div>
      {pieces.length === 0 ? (
        <p className="border-t border-ink-300 pt-4 text-14 text-ink-700">{vide}</p>
      ) : (
        <ul className="flex flex-col">
          {pieces.map((piece) => (
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
      )}
    </section>
  );
}
