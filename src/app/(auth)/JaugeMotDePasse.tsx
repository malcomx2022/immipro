import { forceMotDePasse, libelleForce } from "@/domain/comptes/mot-de-passe";
import { cn } from "@/lib/utils";

/**
 * Jauge de mot de passe — A-01 et A-04.
 *
 * Trois segments et une phrase. La phrase porte l'information : les segments
 * sont `aria-hidden`, un lecteur d'écran n'a rien à faire d'une barre de
 * couleur. Le texte est relié au champ par son identifiant.
 */
const TEINTES = ["bg-danger", "bg-warning", "bg-success"] as const;

export function JaugeMotDePasse({
  motDePasse,
  id,
}: {
  motDePasse: string;
  id: string;
}) {
  const force = forceMotDePasse(motDePasse);
  const teinte = force === 0 ? null : TEINTES[force - 1];

  return (
    <>
      <span aria-hidden="true" className="flex gap-1.5">
        {[1, 2, 3].map((cran) => (
          <span
            key={cran}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              force >= cran && teinte ? teinte : "bg-ink-100",
            )}
          />
        ))}
      </span>
      <span id={id} className="text-13 text-ink-500">
        {libelleForce(motDePasse)}
      </span>
    </>
  );
}
