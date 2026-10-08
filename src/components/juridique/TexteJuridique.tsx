import { BlocsEditoriaux } from "@/components/ui/BlocsEditoriaux";
import { jourEnFrancais } from "@/domain/format/moment";
import { jourCivil } from "@/domain/format/fuseau";
import type { TexteServi } from "@/server/juridique/lecture";

/**
 * Une page juridique publique — S.101.
 *
 * Elle affiche la version publiée, et rien d'autre : ni le modèle du
 * dépôt, ni les variables du moment. Le numéro de version et sa date sont
 * en tête, parce que c'est ce qu'un candidat cite en réclamation, et ce
 * que l'acceptation des conditions enregistre.
 */
export function TexteJuridique({ texte }: { texte: TexteServi }) {
  return (
    <article className="mx-auto flex w-full max-w-texte flex-col gap-6 px-4 py-8 md:px-12 md:py-12">
      <header className="flex flex-col gap-3">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-28 font-semibold text-ink-900 outline-none md:text-32"
        >
          {texte.titre}
        </h1>
        <p className="text-pretty text-16 text-ink-700">{texte.chapeau}</p>
        <p className="text-13 text-ink-500">
          Version {texte.rang}, en vigueur depuis le {jourEnFrancais(jourCivil(texte.publieLe))}.
        </p>
      </header>
      <div className="flex flex-col gap-4">
        <BlocsEditoriaux blocs={texte.blocs} />
      </div>
    </article>
  );
}
