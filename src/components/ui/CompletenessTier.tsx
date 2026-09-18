import type { CompletenessPublic, Palier } from "@/domain/completeness/score";
import { LIBELLE_PALIER } from "@/domain/completeness/score";
import { cn } from "@/lib/utils";

/**
 * Complétude du dossier — C-09, arbitrage du 13/09/2026.
 *
 * Remplace la barre de progression : palier nommé et dénombrement des manques,
 * aucune note sur cent, aucune part affichée. « 68 » se retient comme une
 * prédiction de la décision administrative, et le démenti écrit dessous ne
 * survit pas à la mémoire du chiffre (INV-1).
 *
 * Le composant ne reçoit que la vue candidat du domaine : `CompletenessPublic`
 * n'expose pas le barème interne, il ne peut donc pas fuir vers l'écran.
 */
const TONS: Record<Palier, { texte: string; point: string }> = {
  INCOMPLET: { texte: "text-danger", point: "bg-danger" },
  PRESQUE_COMPLET: { texte: "text-warning", point: "bg-warning" },
  COMPLET: { texte: "text-success", point: "bg-success" },
};

const MENTION_PAR_DEFAUT =
  "Ce décompte porte sur les pièces de votre dossier. La décision appartient à l'administration du pays de destination.";

const pieces = (n: number, singulier: string, pluriel: string) =>
  `${n} ${n > 1 ? pluriel : singulier}`;

/**
 * Phrase de dénombrement affichée en tête d'écran. Pure et testable :
 * c'est elle qui remplace le chiffre, elle mérite d'être vérifiée.
 */
export function libelleDenombrement(
  compteurs: CompletenessPublic["compteurs"],
): string {
  const { obligatoiresManquantes: obligatoires, facultativesManquantes: complementaires } =
    compteurs;

  if (obligatoires === 0 && complementaires === 0) {
    return "Toutes les pièces demandées sont conformes";
  }
  if (obligatoires === 0) {
    return `${pieces(complementaires, "pièce complémentaire reste", "pièces complémentaires restent")} à traiter`;
  }
  if (complementaires === 0) {
    return `${pieces(obligatoires, "pièce obligatoire manque", "pièces obligatoires manquent")}`;
  }
  return `${pieces(obligatoires, "pièce obligatoire manque", "pièces obligatoires manquent")}, ${complementaires} ${
    complementaires > 1 ? "complémentaires restent" : "complémentaire reste"
  } à traiter`;
}

export interface CompletenessTierProps {
  completude: CompletenessPublic;
  /** Mention de partage des rôles, à préciser par destination sur C-09. */
  mention?: string;
  /**
   * `bloc` sur C-09, où la complétude est le sujet de l'écran.
   * `carte` sur C-01, où elle tient en deux lignes dans une carte de dossier
   * — c'est ce qui remplace la note sur cent et sa barre de progression.
   */
  variante?: "bloc" | "carte";
  className?: string;
}

export function CompletenessTier({
  completude,
  mention = MENTION_PAR_DEFAUT,
  variante = "bloc",
  className,
}: CompletenessTierProps) {
  const ton = TONS[completude.palier];

  if (variante === "carte") {
    return (
      <div className={cn("flex flex-col items-start gap-1.5", className)}>
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full bg-ink-100 px-2.5 py-1 text-13 font-medium",
            ton.texte,
          )}
        >
          <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", ton.point)} />
          {LIBELLE_PALIER[completude.palier]}
        </span>
        <span className="text-pretty text-14 text-ink-700">
          {libelleDenombrement(completude.compteurs)}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 rounded-lg bg-ink-100 p-5", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-2 self-start rounded-full bg-white px-3 py-1.5 text-14 font-semibold",
          ton.texte,
        )}
      >
        <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", ton.point)} />
        {LIBELLE_PALIER[completude.palier]}
      </span>
      <span className="text-pretty text-19 font-semibold text-ink-900">
        {libelleDenombrement(completude.compteurs)}
      </span>
      <span className="text-14 text-ink-700">
        {pieces(completude.compteurs.conformes, "pièce déjà conforme", "pièces déjà conformes")}
      </span>
      <span className="text-pretty text-14 text-ink-700">{mention}</span>
    </div>
  );
}
