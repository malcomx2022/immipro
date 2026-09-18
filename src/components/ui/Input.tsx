"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Champ, CHAMP_CONTROLE } from "./champ";

/**
 * Champ de saisie — Bibliothèque de composants §2.
 *
 * Un champ désactivé garde sa valeur : il reste lisible, il n'est pas vidé.
 * `aria-invalid` et `aria-describedby` sont posés ici pour que l'erreur soit
 * annoncée, pas seulement colorée.
 *
 * `invalide` marque le champ fautif quand le message vit ailleurs — sur A-02,
 * l'échec porte sur le couple email / mot de passe, et dire lequel des deux
 * est en cause renseignerait un attaquant sur l'existence du compte.
 */
export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> {
  libelle: string;
  aide?: string;
  erreur?: string;
  /** Marque le champ invalide sans message propre. */
  invalide?: boolean;
  id?: string;
  /** Classes de l'enveloppe (libellé, champ, description). */
  classNameChamp?: string;
  /** Classes du contrôle lui-même — saisie de code, champ monospace. */
  classNameControle?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    libelle,
    aide,
    erreur,
    invalide = false,
    id,
    classNameChamp,
    classNameControle,
    disabled = false,
    ...reste
  },
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
      <input
        ref={ref}
        id={idChamp}
        type={reste.type ?? "text"}
        disabled={disabled}
        aria-invalid={erreur || invalide ? true : undefined}
        aria-describedby={decrit ? idDescription : undefined}
        className={cn(
          CHAMP_CONTROLE,
          (erreur || invalide) && "border-danger",
          classNameControle,
        )}
        {...reste}
      />
    </Champ>
  );
});
