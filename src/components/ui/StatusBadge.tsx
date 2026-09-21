import type { DocumentState } from "@/domain/completeness/score";
import { cn } from "@/lib/utils";

/**
 * Pastille d'état de pièce — Bibliothèque de composants §4.
 *
 * La couleur ne porte jamais l'information seule : le mot est toujours écrit
 * à côté du point. Les états viennent du domaine (`DocumentState`) et non
 * d'une liste recopiée : une pièce ne peut pas afficher un état qui n'existe
 * pas dans la machine.
 */
const LIBELLES: Record<DocumentState, string> = {
  ATTENDUE: "Attendue",
  EN_ANALYSE: "En analyse",
  CONFORME: "Conforme",
  A_CORRIGER: "À corriger",
  ILLISIBLE: "Illisible",
  HORS_SUJET: "Hors sujet",
  EXPIREE: "Expirée",
  PURGEE: "Purgée",
};

const COULEURS: Record<DocumentState, { texte: string; point: string }> = {
  ATTENDUE: { texte: "text-ink-500", point: "bg-ink-500" },
  EN_ANALYSE: { texte: "text-ink-500", point: "bg-ink-500" },
  CONFORME: { texte: "text-success", point: "bg-success" },
  A_CORRIGER: { texte: "text-warning", point: "bg-warning" },
  ILLISIBLE: { texte: "text-danger", point: "bg-danger" },
  HORS_SUJET: { texte: "text-danger", point: "bg-danger" },
  EXPIREE: { texte: "text-danger", point: "bg-danger" },
  PURGEE: { texte: "text-ink-500", point: "bg-ink-500" },
};

export interface StatusBadgeProps {
  etat: DocumentState;
  /**
   * Libellé qui remplace celui de l'état, quand l'état seul ne suffit pas.
   *
   * Un seul cas aujourd'hui : une pièce déposée que le quota a empêché
   * d'analyser revient à `ATTENDUE`, et « Attendue » sur une pièce dont le
   * fichier est arrivé fait la renvoyer. La couleur reste celle de l'état —
   * c'est lui qui décide de la place de la pièce dans la checklist.
   */
  libelle?: string;
  /** `ink` sur fond blanc, `blanc` sur un aplat ink-100. */
  fond?: "ink" | "blanc";
  className?: string;
}

export function StatusBadge({
  etat,
  libelle,
  fond = "ink",
  className,
}: StatusBadgeProps) {
  const couleur = COULEURS[etat];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-13 font-medium",
        fond === "ink" ? "bg-ink-100" : "bg-white",
        couleur.texte,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", couleur.point)} />
      {libelle ?? LIBELLES[etat]}
    </span>
  );
}

export { LIBELLES as LIBELLES_ETAT_PIECE };
