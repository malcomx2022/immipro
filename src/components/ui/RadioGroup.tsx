"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { useGroupeRadio } from "./useGroupeRadio";

/**
 * Choix exclusif — Bibliothèque de composants §3, règle clavier 4.
 *
 * Le groupe entier est un seul arrêt de tabulation : les flèches changent la
 * sélection, Origine et Fin vont aux extrémités. Sans ça, traverser les trois
 * packs de $-01 coûte trois tabulations avant d'atteindre « Continuer ». Le
 * clavier vit dans `useGroupeRadio`, que partagent les groupes d'une autre
 * apparence (M12).
 *
 * `aria-checked` porte l'état ; la ligne entière est cliquable et mesure au
 * moins 44 px. Une option indisponible garde son libellé et sa raison.
 */
/**
 * Comment une mise en avant se dit. Un seul mot, factuel : il annonce une
 * suggestion de la plateforme, pas une popularité ni un superlatif — la
 * grille tarifaire interdit déjà « le plus choisi » et « populaire » dans
 * ses justifications, et ce mot-ci n'en est pas un déguisement.
 */
export const MENTION_MISE_EN_AVANT = "Conseillé";

export interface RadioOption {
  valeur: string;
  libelle: string;
  /** Raison d'indisponibilité, ou précision affichée sous le libellé. */
  description?: string;
  desactivee?: boolean;
  /**
   * Option mise en avant. Elle est cadrée sans être retenue : une mise en
   * avant n'est pas un choix fait à la place de qui lit.
   *
   * ── La règle que ce commentaire énonçait sans la tenir ──────────────
   *
   * Il disait déjà « l'information est aussi portée par la description,
   * jamais par la seule couleur ». Elle ne l'était pas. Sur $-01, la
   * description du pack conseillé disait ce qu'il **couvre** — « couvre
   * l'ensemble des pièces exigées pour cette destination » — et jamais
   * qu'il est conseillé. Ce qui distinguait l'option était le cadre
   * coloré, plus le fait d'être la seule à porter une description ;
   * autrement dit, une absence, et une couleur.
   *
   * La mise en avant se dit donc en toutes lettres, et la description
   * redevient libre de décrire. Elles ne se disputent plus la même place,
   * et les deux autres options peuvent enfin porter la leur.
   */
  misEnAvant?: boolean;
}

export interface RadioGroupProps {
  libelle: string;
  options: readonly RadioOption[];
  valeur: string | null;
  onChangement: (valeur: string) => void;
  className?: string;
}

export function RadioGroup({
  libelle,
  options,
  valeur,
  onChangement,
  className,
}: RadioGroupProps) {
  const idLibelle = useId();
  const { auClavier, refDe, tabIndexDe } = useGroupeRadio({ options, valeur, onChangement });

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <span id={idLibelle} className="text-14 font-medium text-ink-900">
        {libelle}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={idLibelle}
        onKeyDown={auClavier}
        className="flex flex-col gap-2.5"
      >
        {options.map((o, i) => {
          const retenue = o.valeur === valeur;
          return (
            <button
              key={o.valeur}
              ref={refDe(i)}
              type="button"
              role="radio"
              aria-checked={retenue}
              disabled={o.desactivee}
              tabIndex={tabIndexDe(o.valeur)}
              onClick={() => onChangement(o.valeur)}
              className={cn(
                "flex min-h-touch items-center gap-3 rounded-md border px-3.5 py-2.5 text-left",
                retenue
                  ? "border-accent-500 bg-accent-50"
                  : o.misEnAvant
                    ? "border-2 border-accent-500 bg-white hover:bg-ink-100"
                    : "border-ink-300 bg-white hover:bg-ink-100",
                o.desactivee && "cursor-not-allowed bg-ink-100 hover:bg-ink-100",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-5 w-5 flex-none rounded-full border bg-white",
                  retenue ? "border-6 border-accent-500" : "border-ink-300",
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-15",
                      retenue && "font-medium",
                      o.desactivee ? "text-ink-500" : "text-ink-900",
                    )}
                  >
                    {o.libelle}
                  </span>
                  {/* La mise en avant, écrite. Elle passe à la ligne
                      plutôt que d'écraser le libellé sur un écran
                      étroit, et reste dans le nom accessible de
                      l'option : c'est une information, pas un décor. */}
                  {o.misEnAvant ? (
                    <span className="flex-none rounded-full bg-accent-50 px-2 py-0.5 text-13 font-medium text-accent-700">
                      {MENTION_MISE_EN_AVANT}
                    </span>
                  ) : null}
                </span>
                {o.description ? (
                  <span className="text-13 text-ink-500">{o.description}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
