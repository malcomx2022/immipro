import { cn } from "@/lib/utils";
import type { Mention } from "@/domain/destinations/fiche";
import { FUSEAU_AFFICHAGE } from "@/domain/format/fuseau";

/**
 * Mention de source — INV-8.
 *
 * Toute information réglementaire affichée porte sa source et sa date de
 * vérification. Les deux sont des propriétés obligatoires : une fiche pays
 * sans mention ne compile pas.
 *
 * Présente sur P-03, P-04, C-04 et T-02.
 *
 * Les propriétés prolongent `Mention` : un écran qui tient une mention la
 * répand — `<SourceNote {...mention}>` — et porte donc tout ce qu'elle
 * sait, y compris ce qu'on y ajoutera. Recopier `source` et `verifieeLe`
 * un par un est ce qui a laissé la provenance du montant converti
 * inaffichée sur quatorze écrans à la fois.
 */
export interface SourceNoteProps extends Omit<Partial<Mention>, "verifieeLe"> {
  /** Domaine ou intitulé de la source : « ind.nl », « canada.ca ». */
  source: string;
  /** Date de la dernière vérification, ISO ou Date. */
  verifieeLe: Date | string;
  /** Précision ajoutée après la mention, par exemple le partage des rôles. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Au fuseau d'affichage, Cotonou, et non à celui du navigateur : hors des
 * rappels, qui suivent le fuseau choisi, tout écran date à l'heure de
 * Cotonou (périmètre V1). Une date de vérification ne change pas de jour
 * selon l'endroit d'où on la lit.
 */
const FORMAT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: FUSEAU_AFFICHAGE,
});

export function SourceNote({
  source,
  verifieeLe,
  conversion,
  children,
  className,
}: SourceNoteProps) {
  const date = verifieeLe instanceof Date ? verifieeLe : new Date(verifieeLe);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <p className="text-13 text-ink-500">
        Information vérifiée le{" "}
        <time dateTime={date.toISOString().slice(0, 10)}>{FORMAT.format(date)}</time>{" "}
        — source : {source}.{children ? <> {children}</> : null}
      </p>
      {/*
        La seconde moitié d'INV-8, quand le montant affiché n'est pas celui
        que l'autorité publie. Elle était écrite dans le domaine et rendue
        nulle part : le candidat lisait « 8 900 838 F » sous une source qui
        porte « 1 130,77 € par mois ». Sur une ligne à part, parce qu'elle
        parle du chiffre et non de la page.
      */}
      {conversion ? <p className="text-pretty text-13 text-ink-500">{conversion}</p> : null}
    </div>
  );
}
