"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MENTION_PIECE_PURGEE } from "@/domain/comptes/portabilite";
import { appeler } from "@/lib/api";

/**
 * L'aperçu du fichier envoyé, sur C-08 — S.221, 06/11/2026.
 *
 * ── Ce que l'écran montrait ─────────────────────────────────────────────
 *
 * Un cadre gris portant « aperçu de la pièce · page 1 sur 1 » : un texte
 * du prototype, posé sur aucun fichier, et un nombre de pages écrit en
 * dur par la lecture (`pages: 1`). Le candidat ne voyait jamais ce qu'il
 * avait envoyé, alors que la route de la pièce signe déjà son URL de
 * lecture (`urlDeLecture`, RG-06.4). B-05 avait perdu le même faux aperçu
 * en S.157 ; l'écran candidat l'avait gardé.
 *
 * ── Ce qu'il fait ───────────────────────────────────────────────────────
 *
 * L'URL est demandée à l'ouverture de l'écran, jamais stockée ni posée
 * dans le rendu serveur : elle vaut cinq minutes (règle d'architecture 4),
 * et une page restée ouverte la garderait morte. Le cadre la charge tout
 * de suite ; s'il est rechargé plus tard, « Recharger l'aperçu » en
 * redemande une.
 *
 * La décision de montrer ou non vit dans `urlDeLecture`, côté serveur :
 * une pièce purgée ou pas encore balayée n'a pas d'URL. L'écran ne la
 * refait pas ; il dit seulement la raison que le serveur donne — un
 * contrôle en cours revient seul, une purge ne revient pas (I.D).
 */

type Etat =
  | { phase: "chargement" }
  | { phase: "pret"; url: string }
  | { phase: "absent"; raison: string }
  | { phase: "echec"; titre: string; corps: string };

export function ApercuDeLaPiece({
  dossierId,
  pieceId,
  libelle,
}: {
  dossierId: string;
  pieceId: string;
  libelle: string;
}) {
  const [etat, setEtat] = useState<Etat>({ phase: "chargement" });

  // L'état « chargement » est l'état initial : l'effet n'écrit qu'à
  // l'arrivée de la réponse, et ignore celle d'un écran déjà quitté.
  const lire = useCallback(async (): Promise<Etat> => {
    const resultat = await appeler<{ apercu: string | null; mentionApercu: string | null }>(
      `/api/dossiers/${dossierId}/pieces/${pieceId}`,
    );
    if (!resultat.ok) {
      return { phase: "echec", titre: resultat.echec.titre, corps: resultat.echec.corps };
    }
    const { apercu, mentionApercu } = resultat.donnees;
    return apercu
      ? { phase: "pret", url: apercu }
      : { phase: "absent", raison: mentionApercu ?? MENTION_PIECE_PURGEE };
  }, [dossierId, pieceId]);

  useEffect(() => {
    let actif = true;
    void lire().then((suivant) => {
      if (actif) setEtat(suivant);
    });
    return () => {
      actif = false;
    };
  }, [lire]);

  const demander = async () => {
    setEtat({ phase: "chargement" });
    setEtat(await lire());
  };

  if (etat.phase === "pret") {
    return (
      <div className="flex flex-col gap-2">
        <iframe
          src={etat.url}
          title={`Fichier envoyé : ${libelle}`}
          className="h-96 w-full rounded-lg border border-ink-300 bg-ink-100"
        />
        <button
          type="button"
          onClick={() => void demander()}
          className="self-start text-13 text-accent-600 underline"
        >
          Recharger l&apos;aperçu
        </button>
      </div>
    );
  }

  if (etat.phase === "chargement") {
    return (
      <p role="status" className="rounded-lg bg-ink-100 p-3.5 text-13 text-ink-700">
        Chargement du fichier envoyé…
      </p>
    );
  }

  if (etat.phase === "absent") {
    return (
      <p role="status" className="text-pretty rounded-lg bg-ink-100 p-3.5 text-13 text-ink-700">
        {etat.raison}
      </p>
    );
  }

  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-lg bg-ink-100 p-3.5">
      <p className="text-14 font-semibold text-ink-900">{etat.titre}</p>
      <p className="text-pretty text-13 text-ink-700">{etat.corps}</p>
      <Button variante="secondaire" onClick={() => void demander()}>
        Réessayer l&apos;aperçu
      </Button>
    </div>
  );
}
