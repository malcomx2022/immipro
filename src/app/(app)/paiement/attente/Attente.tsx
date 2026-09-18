"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  etatDeLEtape,
  ETAPES_ATTENTE,
  LIBELLES_ETAPES,
  attenteExpiree,
  rebours,
  reessaiPropose,
  secondesDepuisReleve,
} from "@/domain/paiement/attente";
import { masquerNumero } from "@/domain/paiement/echec";
import { cn } from "@/lib/utils";

/**
 * $-03 — Attente de confirmation.
 *
 * Trois règles d'accessibilité que l'écran tient et que rien d'autre ne peut
 * tenir à sa place :
 *
 * - `aria-live="polite"` sur le seul texte de statut. Le rebours et la
 *   relève en sont exclus : sinon le lecteur d'écran énonce une valeur par
 *   seconde et l'écran devient inutilisable (règle clavier 10).
 * - Le focus ne se déplace pas pendant l'attente (règle 6). L'utilisateur
 *   l'a laissé quelque part, il l'y retrouve.
 * - La page ne piège pas le focus : trois arrêts au plus, et « Réessayer »
 *   n'apparaît qu'au bout de quatre-vingt-dix secondes.
 */
const TEINTES: Record<ReturnType<typeof etatDeLEtape>, string> = {
  faite: "bg-success",
  en_cours: "bg-accent-500",
  a_venir: "bg-ink-300",
};

export function Attente() {
  const [ecoulees, setEcoulees] = useState(0);
  const numero = masquerNumero("97000042");

  useEffect(() => {
    const minuteur = setInterval(() => setEcoulees((s) => s + 1), 1000);
    return () => clearInterval(minuteur);
  }, []);

  const expiree = attenteExpiree(ecoulees);

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-4 pb-8 md:py-8">
      <p className="font-mono text-13 uppercase tracking-wider text-ink-500">
        Paiement Mobile Money
      </p>

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Confirme le paiement sur ton téléphone
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          Saisis ton code PIN sur la notification que ton opérateur vient
          d&apos;envoyer.
        </p>
      </div>

      {/* Le statut seul est dans la région vivante. */}
      <p role="status" aria-live="polite" className="text-16 font-semibold text-ink-900">
        {expiree ? "Le délai de confirmation est dépassé" : "En attente de ta confirmation"}
      </p>

      <div aria-hidden="true" className="flex flex-col items-center gap-1">
        <span className="font-mono text-32 text-ink-900">{rebours(ecoulees)}</span>
        <span className="text-13 text-ink-500">temps restant pour confirmer</span>
        <span className="font-mono text-13 text-ink-700">
          vérifié auprès de l&apos;opérateur il y a {secondesDepuisReleve(ecoulees)} s
        </span>
      </div>

      <ol className="flex flex-col gap-3 rounded-lg bg-ink-100 p-5">
        {ETAPES_ATTENTE.map((etape) => {
          const etat = etatDeLEtape(etape);
          return (
            <li key={etape} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={cn("mt-2 h-2 w-2 flex-none rounded-full", TEINTES[etat])}
              />
              <span
                className={cn(
                  "text-14",
                  etat === "en_cours" ? "font-medium text-ink-900" : "text-ink-700",
                  etat === "a_venir" && "text-ink-500",
                )}
              >
                {LIBELLES_ETAPES[etape](numero)}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="text-pretty text-14 text-ink-700">
        Garde cette page ouverte. La confirmation arrive en général en moins
        d&apos;une minute.
      </p>

      <div className="flex flex-col gap-2">
        {reessaiPropose(ecoulees) ? (
          <Button pleineLargeur className="min-h-action">
            Réessayer le paiement
          </Button>
        ) : null}
        <Link
          href="/paiement/echec"
          className="flex min-h-touch items-center justify-center text-14 font-semibold text-accent-600"
        >
          Je n&apos;ai rien reçu
        </Link>
        <Link
          href="/paiement/pack"
          className="flex min-h-touch items-center justify-center text-14 text-ink-700"
        >
          Annuler le paiement
        </Link>
      </div>

      <p className="text-center text-13 text-ink-500">
        Aucun montant n&apos;est débité avant ta confirmation.
      </p>
    </div>
  );
}
