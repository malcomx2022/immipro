import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Ton } from "@/domain/echecs/catalogue";
import type { EchecRecu } from "@/lib/api";

/**
 * Affichage d'un échec — DOC-12 §16.
 *
 * Les sept règles d'écriture vivent dans le contrat du serveur ; celles qui
 * portent sur le rendu vivent ici, une fois, pour que trente écrans ne les
 * réinventent pas :
 *
 * - **Règle 1** — le titre en premier, tel quel. Aucun « Oups » n'est ajouté.
 * - **Règle 2** — ce qui est conservé vient **avant** l'action. C'est la
 *   première question de quelqu'un qui a passé vingt minutes à remplir, et
 *   la lire après le bouton, c'est la lire trop tard.
 * - **Règle 4** — une seule action principale. Le composant n'en rend qu'une,
 *   et la sortie éventuelle est discrète.
 * - **Règle 7** — rouge pour ce qui a échoué, ambre pour ce qui est
 *   seulement différé, cadre neutre pour une limite atteinte : ce n'est pas
 *   une panne, et l'écrire comme telle ferait croire à un défaut du produit.
 *
 * `role="alert"` seulement sur un échec survenu pendant une action : posé
 * sur un bloc présent au chargement, il ferait parler le lecteur d'écran
 * avant même que la personne ait lu le titre de la page.
 */
const CADRE: Record<Ton, string> = {
  echec: "border-danger/30 bg-danger/5",
  attente: "border-warning/30 bg-warning/5",
  limite: "border-ink-300 bg-ink-100",
};

const TITRE: Record<Ton, string> = {
  echec: "text-danger",
  attente: "text-warning",
  limite: "text-ink-900",
};

export interface BlocEchecProps {
  /**
   * `EchecRecu` et non `EchecCandidat` : une route du back-office ajoute le
   * code et le diagnostic, et le client les jetait. Un candidat n'en reçoit
   * jamais, donc rien de plus ne s'affiche sur ses écrans.
   */
  echec: EchecRecu;
  /** Action principale. Sans elle, le bloc se contente d'informer. */
  children?: ReactNode;
  /** Vrai quand l'échec survient en réponse à un geste : il est alors annoncé. */
  annonce?: boolean;
  className?: string;
}

export function BlocEchec({ echec, children, annonce = true, className }: BlocEchecProps) {
  return (
    <div
      {...(annonce ? { role: "alert" as const } : {})}
      className={cn("flex flex-col gap-2 rounded-md border p-4", CADRE[echec.ton], className)}
    >
      <p className={cn("text-16 font-semibold", TITRE[echec.ton])}>{echec.titre}</p>
      <p className="text-pretty text-14 text-ink-700">{echec.corps}</p>
      {/* Règle 2 : ce qui reste se lit avant ce qu'il y a à faire. */}
      {echec.conserve ? (
        <p className="text-pretty text-14 font-medium text-ink-900">{echec.conserve}</p>
      ) : null}
      {echec.champs ? (
        <ul className="flex flex-col gap-1">
          {Object.entries(echec.champs).map(([champ, message]) => (
            <li key={champ} className="text-14 text-ink-700">
              {message}
            </li>
          ))}
        </ul>
      ) : null}
      {children ? <div className="flex flex-wrap items-center gap-3 pt-1">{children}</div> : null}
      {/*
        Le diagnostic, quand il y en a un — donc sur un écran du back-office
        et nulle part ailleurs (règle 3). Le serveur le calculait et
        l'envoyait ; `appeler` le jetait, et l'administrateur lisait
        « Réessayer » devant une fiche dont le serveur savait le nom.

        En dernier, après l'action : c'est ce qu'on lit quand le geste
        proposé n'a pas suffi.
      */}
      {echec.diagnostic ? (
        <p className="text-pretty text-13 text-ink-500">
          {echec.code}
          {echec.diagnostic.service ? ` · ${echec.diagnostic.service}` : ""}
          {echec.diagnostic.statutAmont ? ` · réponse ${echec.diagnostic.statutAmont}` : ""}
          {echec.diagnostic.trace ? ` · ${echec.diagnostic.trace}` : ""}
          {" · "}
          <time dateTime={echec.diagnostic.survenuA}>{echec.diagnostic.survenuA}</time>
        </p>
      ) : null}
    </div>
  );
}
