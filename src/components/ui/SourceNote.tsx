import { cn } from "@/lib/utils";

/**
 * Mention de source — INV-8.
 *
 * Toute information réglementaire affichée porte sa source et sa date de
 * vérification. Les deux sont des propriétés obligatoires : une fiche pays
 * sans mention ne compile pas.
 *
 * Présente sur P-03, P-04, C-04 et T-02.
 */
export interface SourceNoteProps {
  /** Domaine ou intitulé de la source : « ind.nl », « canada.ca ». */
  source: string;
  /** Date de la dernière vérification, ISO ou Date. */
  verifieeLe: Date | string;
  /** Précision ajoutée après la mention, par exemple le partage des rôles. */
  children?: React.ReactNode;
  className?: string;
}

const FORMAT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function SourceNote({
  source,
  verifieeLe,
  children,
  className,
}: SourceNoteProps) {
  const date = verifieeLe instanceof Date ? verifieeLe : new Date(verifieeLe);

  return (
    <p className={cn("text-13 text-ink-500", className)}>
      Information vérifiée le{" "}
      <time dateTime={date.toISOString().slice(0, 10)}>{FORMAT.format(date)}</time>{" "}
      — source : {source}.{children ? <> {children}</> : null}
    </p>
  );
}
