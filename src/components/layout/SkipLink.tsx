import { cn } from "@/lib/utils";

/**
 * Lien d'évitement — règle clavier 2.
 *
 * Premier arrêt de tabulation de chaque écran, masqué jusqu'au focus puis
 * visible en plein, sur 44 px avec son anneau. La cible porte `tabindex="-1"`
 * pour recevoir réellement le focus.
 *
 * Sur C-06 et C-09 un second saut « Aller à l'action » mène droit au bouton
 * principal (règle 12) : c'est le même composant, avec une autre cible.
 */
export interface SkipLinkProps {
  /** Identifiant de la cible, sans le dièse. */
  cible: string;
  children?: React.ReactNode;
  className?: string;
}

export function SkipLink({ cible, children = "Aller au contenu", className }: SkipLinkProps) {
  return (
    <a
      href={`#${cible}`}
      className={cn(
        "sr-only rounded-md bg-accent-50 text-14 font-semibold text-accent-700",
        "focus:not-sr-only focus:mx-4 focus:mb-3 focus:flex focus:min-h-touch focus:items-center focus:px-3.5",
        className,
      )}
    >
      {children}
    </a>
  );
}
