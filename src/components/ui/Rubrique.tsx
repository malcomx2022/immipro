import Link from "next/link";
import {
  CHAPEAU_RUBRIQUE,
  DATE_AFFICHEE,
  RUBRIQUE_VIDE,
  TITRE_RUBRIQUE,
  dateDeLaRubrique,
  type EnTete,
  type GenreDocument,
} from "@/domain/editorial/document";
import { jourEnFrancais } from "@/domain/format/moment";

/**
 * Index d'une rubrique — P-08 (guides) et P-09 (articles), P.A.
 *
 * Un seul composant pour les deux, parce que la liste est la même : un
 * surtitre, un titre, un chapeau, une date. Ce qui diffère est décidé
 * ailleurs, dans le domaine — l'ordre, et **quelle** date.
 *
 * Un guide porte sa date de vérification, un article sa date de parution.
 * Ce n'est pas une coquetterie : un guide écrit il y a deux ans mais
 * revérifié le mois dernier vaut mieux qu'un guide publié le mois dernier
 * et jamais relu. La date de vérification est déjà celle qu'INV-8 impose
 * en pied de page du document ; la rubrique la remonte, pour qu'on choisisse
 * quoi lire sur le bon critère.
 */
export function Rubrique({
  genre,
  entetes,
}: {
  genre: GenreDocument;
  entetes: readonly EnTete[];
}) {
  const base = genre === "GUIDE" ? "/guides" : "/articles";

  return (
    <div className="mx-auto flex w-full max-w-colonne flex-col gap-6 px-4 py-6 md:py-10">
      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-32 font-semibold text-ink-900 outline-none md:text-44"
        >
          {TITRE_RUBRIQUE[genre]}
        </h1>
        <p className="text-pretty text-16 text-ink-700">{CHAPEAU_RUBRIQUE[genre]}</p>
      </div>

      {entetes.length === 0 ? (
        /* Une rubrique vide n'est pas une panne : un site jeune n'a pas
           encore de guide, et le dire vaut mieux qu'une page blanche. */
        <p className="text-pretty rounded-lg bg-ink-100 p-5 text-16 text-ink-700">
          {RUBRIQUE_VIDE[genre]}
        </p>
      ) : (
        <ul className="flex flex-col">
          {entetes.map((entete) => (
            <li key={entete.slug} className="border-b border-ink-300 last:border-0">
              <Link
                href={`${base}/${entete.slug}`}
                className="flex flex-col gap-1.5 py-5 hover:bg-ink-100"
              >
                <span className="font-mono text-13 uppercase tracking-wider text-ink-500">
                  {entete.surtitre} · {entete.dureeLecture}
                </span>
                <span className="text-pretty text-19 font-semibold text-accent-600">
                  {entete.titre}
                </span>
                <span className="text-pretty text-14 text-ink-700">{entete.chapeau}</span>
                {dateDeLaRubrique(entete) ? (
                  <span className="text-13 text-ink-500">
                    {DATE_AFFICHEE[genre].libelle}{" "}
                    <time dateTime={dateDeLaRubrique(entete)}>
                      {jourEnFrancais(dateDeLaRubrique(entete))}
                    </time>
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
