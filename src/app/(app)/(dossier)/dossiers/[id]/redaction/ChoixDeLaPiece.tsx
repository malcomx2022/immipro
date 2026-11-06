"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { LienBouton } from "@/components/ui/LienBouton";
import { RadioGroup } from "@/components/ui/RadioGroup";
import type { Dossier } from "@/domain/dossiers/dossier";
import type { PieceRedigeable } from "@/domain/redaction/entretien";
import {
  AVERTISSEMENT_RELECTURE,
  LIMITES_REDACTION,
  dureeEstimee,
} from "@/domain/redaction/entretien";
import { EnteteDossier } from "../EnteteDossier";

/** S.223 — l'écran sans pièce rédigeable. */
export const AUCUNE_PIECE_A_REDIGER =
  "Aucune pièce de ce dossier n'a d'entretien guidé : elles se déposent toutes en PDF ou en photo depuis la checklist.";

/**
 * R-01 — Type de pièce. WF-08.
 *
 * Aucune présélection : le choix du document engage vingt minutes
 * d'entretien, et un radio pré-coché fait commencer le mauvais (même règle
 * qu'en $-01 et C-11).
 *
 * « Ce que nous ne faisons pas » est au-dessus du bouton, pas en bas de
 * page : la limite doit être lue avant de s'engager, pas découverte à la
 * relecture.
 */
export function ChoixDeLaPiece({
  dossier,
  pieces,
}: {
  dossier: Dossier;
  pieces: readonly PieceRedigeable[];
}) {
  const router = useRouter();
  const [type, setType] = useState<string | null>(null);
  const choisie = pieces.find((p) => p.type === type);

  // S.223 — rien à choisir : le dire, et renvoyer là où les pièces se
  // déposent. Un groupe d'options vide sous un bouton grisé qui demande de
  // « choisir d'abord » était une impasse (dossier Suisse études, 06/11).
  if (pieces.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-colonne flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
        <EnteteDossier
          dossier={dossier}
          retour={`/dossiers/${dossier.id}`}
          libelleRetour="Checklist"
        />
        <div className="flex flex-col gap-2">
          <h1
            id="contenu"
            tabIndex={-1}
            className="text-24 font-semibold text-ink-900 outline-none md:text-32"
          >
            Rien à rédiger dans ce dossier
          </h1>
          <p className="text-pretty text-16 text-ink-700">{AUCUNE_PIECE_A_REDIGER}</p>
        </div>
        <LienBouton href={`/dossiers/${dossier.id}`} pleineLargeur className="min-h-action">
          Revenir à la checklist
        </LienBouton>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-colonne flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <EnteteDossier
        dossier={dossier}
        retour={`/dossiers/${dossier.id}`}
        libelleRetour="Checklist"
      />

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Que veux-tu rédiger ?
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          Nous te posons des questions, tu réponds en français simple, et nous
          mettons en forme. Le texte reste le tien : tu peux tout modifier.
        </p>
      </div>

      <RadioGroup
        libelle="Pièce à rédiger"
        options={pieces.map((p) => ({
          valeur: p.type,
          libelle: `${p.code} · ${p.libelle}`,
          description: `${p.objet} ${dureeEstimee(p)}.`,
        }))}
        valeur={type}
        onChangement={setType}
      />

      <section className="flex flex-col gap-2 rounded-lg bg-ink-100 p-4">
        <h2 className="text-16 font-semibold text-ink-900">Ce que nous ne faisons pas</h2>
        {LIMITES_REDACTION.map((limite) => (
          <p key={limite} className="text-pretty text-14 text-ink-700">
            {limite}
          </p>
        ))}
      </section>

      <p className="text-pretty text-13 text-ink-500">{AVERTISSEMENT_RELECTURE}</p>

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4">
        <Button
          pleineLargeur
          className="min-h-action"
          disabled={!choisie}
          raisonDesactivation="Choisis d'abord la pièce à rédiger : les questions ne sont pas les mêmes."
          onClick={() =>
            choisie && router.push(`/dossiers/${dossier.id}/redaction/${choisie.type}`)
          }
        >
          Commencer l&apos;entretien
        </Button>
        {choisie ? (
          <p aria-live="polite" className="text-center text-13 text-ink-500">
            {choisie.exigence} · {dureeEstimee(choisie)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
