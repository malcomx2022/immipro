"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import type { LigneDocument } from "@/server/lecture/editorial";
import {
  LIBELLE_ETAT,
  LIBELLE_GENRE,
  slugDe,
  type GenreDocument,
} from "@/domain/editorial/document";
import { MENTION_AUDIT } from "@/domain/backoffice/navigation";
import { jourEnFrancais } from "@/domain/format/moment";

/**
 * B-08 — Guides et articles. J.C.
 *
 * Deux colonnes portent l'essentiel : l'état, et ce qui bloque. Un
 * brouillon qui contient une promesse le dit dans la liste, avant qu'on
 * l'ouvre — c'est la même discipline que la file de veille, où l'écran
 * annonce ce qu'il refusera plutôt que de le découvrir à la validation.
 */
export function Contenus({ documents }: { documents: readonly LigneDocument[] }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [genre, setGenre] = useState<GenreDocument>("GUIDE");
  const [titre, setTitre] = useState("");
  const [pays, setPays] = useState("");
  const [rubrique, setRubrique] = useState("");
  const [auteur, setAuteur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);

  const publies = documents.filter((d) => d.etat === "PUBLIE").length;
  /*
    Un corps illisible bloque plus sûrement qu'une formulation refusée :
    la page publique répond « introuvable » et la rubrique l'a retiré.
    Il ne comptait pas — `fautes` vaut zéro faute de corps à vérifier, et
    zéro se lit « rien à signaler ».
  */
  const bloques = documents.filter((d) => d.fautes > 0 || !d.corpsLisible).length;

  async function creer() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ id: string }>("/api/admin/contenus", {
      corps: {
        genre,
        titre,
        ...(genre === "GUIDE" ? { pays } : { rubrique, auteur }),
      },
    });
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    router.push(`/contenus/${resultat.donnees.id}`);
  }

  return (
    <>
      <EnteteAdmin
        titre="Guides et articles"
        resume={resume(documents.length, publies, bloques)}
        actions={
          <Button onClick={() => setOuvert((o) => !o)}>
            {ouvert ? "Fermer" : "Nouveau document"}
          </Button>
        }
      />

      <div className="flex flex-col gap-4 p-6">
        {ouvert ? (
          <section className="flex flex-col gap-4 rounded-lg border border-ink-300 bg-white p-5">
            <h2 className="text-16 font-semibold text-ink-900">Nouveau document</h2>
            <RadioGroup
              libelle="Genre"
              valeur={genre}
              onChangement={(v) => setGenre(v as GenreDocument)}
              options={[
                { valeur: "GUIDE", libelle: LIBELLE_GENRE.GUIDE },
                { valeur: "ARTICLE", libelle: LIBELLE_GENRE.ARTICLE },
              ]}
            />
            <Input
              libelle="Titre"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              aide={
                titre.trim()
                  ? `Adresse publique : /${genre === "GUIDE" ? "guides" : "articles"}/${slugDe(titre)}`
                  : "L'adresse publique en sera tirée, et ne changera plus ensuite."
              }
            />
            {genre === "GUIDE" ? (
              <Input libelle="Pays" value={pays} onChange={(e) => setPays(e.target.value)} />
            ) : (
              <>
                <Input
                  libelle="Rubrique"
                  value={rubrique}
                  onChange={(e) => setRubrique(e.target.value)}
                />
                <Input libelle="Auteur" value={auteur} onChange={(e) => setAuteur(e.target.value)} />
              </>
            )}
            {echec ? <BlocEchec echec={echec} annonce /> : null}
            <Button
              chargement={envoi}
              disabled={titre.trim().length < 3}
              raisonDesactivation="Un titre d'au moins trois caractères, pour en tirer une adresse."
              onClick={() => void creer()}
              className="self-start"
            >
              Créer le brouillon
            </Button>
          </section>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-ink-300 bg-white">
          <table className="w-full min-w-[840px] border-collapse text-14">
            <thead>
              <tr className="border-b border-ink-300 text-left text-13 text-ink-500">
                <th scope="col" className="px-3 py-2 font-medium">Titre</th>
                <th scope="col" className="px-3 py-2 font-medium">Genre</th>
                <th scope="col" className="px-3 py-2 font-medium">Adresse</th>
                <th scope="col" className="px-3 py-2 font-medium">Source</th>
                <th scope="col" className="px-3 py-2 font-medium">État</th>
                <th scope="col" className="px-3 py-2 font-medium">Modifié</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-ink-500">
                    Aucun document. Le premier guide ouvre la rubrique.
                  </td>
                </tr>
              ) : null}
              {documents.map((d) => (
                <tr key={d.id} className="border-b border-ink-300 last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/contenus/${d.id}`}
                      className="font-medium text-accent-600 underline"
                    >
                      {d.titre}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-ink-700">{LIBELLE_GENRE[d.genre]}</td>
                  <td className="px-3 py-2 font-mono text-13 text-ink-700">
                    /{d.genre === "GUIDE" ? "guides" : "articles"}/{d.slug}
                  </td>
                  <td className="px-3 py-2 text-ink-700">
                    {d.source ? (
                      <span className="flex flex-col">
                        {d.source}
                        {d.verifieeLe ? (
                          <span className="text-13 text-ink-500">
                            vérifiée le {jourEnFrancais(d.verifieeLe)}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-ink-500">à renseigner</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex flex-col">
                      {LIBELLE_ETAT[d.etat]}
                      {/* Ce qui bloque se lit dans la liste, avant qu'on
                          ouvre : découvrir un refus à la validation fait
                          réécrire au hasard. */}
                      {d.corpsLisible ? null : (
                        <span className="text-13 text-echec">
                          Corps illisible : la page ne s&apos;affiche plus
                        </span>
                      )}
                      {d.fautes > 0 ? (
                        <span className="text-13 text-echec">
                          {d.fautes === 1
                            ? "1 formulation refusée"
                            : `${d.fautes} formulations refusées`}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-700">{jourEnFrancais(d.modifieLe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-13 text-ink-500">{MENTION_AUDIT}</p>
      </div>
    </>
  );
}

/** Le résumé compte ce qui appelle une action, pas ce qui va bien. */
function resume(total: number, publies: number, bloques: number): string {
  if (total === 0) return "Aucun document pour l'instant.";
  const base = `${total} document${total > 1 ? "s" : ""} · ${publies} publié${publies > 1 ? "s" : ""}`;
  return bloques === 0
    ? `${base} · aucune formulation refusée`
    : `${base} · ${bloques} avec une formulation refusée`;
}
