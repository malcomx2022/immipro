import { LienBouton } from "@/components/ui/LienBouton";
import { EtatDEcran } from "@/components/ui/EtatDEcran";
import { PAGE_INTROUVABLE } from "@/domain/etats/ecrans";

/**
 * Ce que rend chaque `not-found.tsx` — revue du 07/10/2026, E8.
 *
 * Sans illustration (D-15) : une adresse qui ne mène à rien n'est pas une
 * panne, et l'image d'erreur le laisserait croire. Ne lit aucune donnée :
 * le `not-found` racine est pré-rendu au build.
 */
export function PageIntrouvable({ espace }: { espace: keyof typeof PAGE_INTROUVABLE }) {
  const etat = PAGE_INTROUVABLE[espace];
  return (
    <EtatDEcran
      etat={etat}
      action={
        <LienBouton href={etat.destination} pleineLargeur>
          {etat.action}
        </LienBouton>
      }
    />
  );
}
