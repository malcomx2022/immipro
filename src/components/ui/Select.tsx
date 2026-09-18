"use client";

import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Champ, CHAMP_CONTROLE } from "./champ";

/**
 * Liste déroulante — Bibliothèque de composants §2.
 *
 * Élément natif : la liste système d'Android reste plus utilisable au doigt
 * et au lecteur d'écran que toute reconstruction en div.
 */
export interface SelectOption {
  valeur: string;
  libelle: string;
  desactivee?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "className" | "children"> {
  libelle: string;
  options: readonly SelectOption[];
  aide?: string;
  erreur?: string;
  id?: string;
  classNameChamp?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { libelle, options, aide, erreur, id, classNameChamp, disabled = false, ...reste },
  ref,
) {
  const genere = useId();
  const idChamp = id ?? genere;
  const idDescription = `${idChamp}-description`;
  const decrit = Boolean(erreur ?? aide);

  return (
    <Champ
      id={idChamp}
      libelle={libelle}
      aide={aide}
      erreur={erreur}
      desactive={disabled}
      idDescription={idDescription}
      className={classNameChamp}
    >
      <select
        ref={ref}
        id={idChamp}
        disabled={disabled}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={decrit ? idDescription : undefined}
        className={cn(CHAMP_CONTROLE, erreur && "border-danger")}
        {...reste}
      >
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur} disabled={o.desactivee}>
            {o.libelle}
          </option>
        ))}
      </select>
    </Champ>
  );
});
