"use client";

import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { telechargerFichier } from "@/lib/telechargement";
import type { EchecCandidat } from "@/server/http/echecs";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import {
  CATEGORIES,
  LIBELLE_CATEGORIE,
  MENTION_EXPORT_VIDE,
  MENTION_IMMUABLE,
  MENTION_MOTIF_ACCES,
  diagnostiquerPeriode,
  nomDeLExport,
  filtrerAudit,
  type CategorieAudit,
  type EcritureAudit,
  type Periode,
} from "@/domain/backoffice/audit";
import { jourEnFrancais } from "@/domain/format/moment";
import { cn } from "@/lib/utils";
import { FUSEAU_AFFICHAGE } from "@/domain/format/fuseau";

/**
 * B-06 — Journal d'audit. WF-15.
 *
 * Le journal ne comble jamais une période vide : s'il n'affiche rien, il ne
 * s'est rien passé. L'écran distingue donc deux vides qui se ressemblent —
 * une période sans écriture, et un filtre trop étroit — parce qu'ils
 * n'appellent pas le même geste.
 *
 * L'export d'une période vide reste possible : il produit un fichier qui
 * atteste l'absence d'écriture, ce qui est précisément ce qu'un contrôle
 * demande.
 *
 * ── Et cette promesse n'était tenue par rien ────────────────────────────
 *
 * « Exporter la période » n'était relié à aucune route, et aucune ligne de
 * CSV n'existait dans le dépôt. La phrase la plus précise de l'écran était
 * celle qu'aucun code ne soutenait : elle décrivait le contenu d'un fichier
 * que personne ne pouvait produire.
 *
 * Le bouton emporte désormais le périmètre affiché — la période **et** les
 * catégories cochées. Exporter autre chose que ce qu'on regarde est la
 * façon la plus simple de rapporter d'un contrôle un fichier qui ne répond
 * pas à la question posée.
 */
const FORMAT_HORODATAGE = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: FUSEAU_AFFICHAGE,
});
const horodatage = (iso: string) =>
  FORMAT_HORODATAGE.format(new Date(iso)).replace(" ", " · ").replace(":", " h ");

export function Journal({
  ecritures,
  periode,
}: {
  ecritures: readonly EcritureAudit[];
  periode: Periode;
}) {
  const [categories, setCategories] = useState<CategorieAudit[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);

  /**
   * L'export porte le périmètre affiché, pas le journal entier : la
   * période et les catégories cochées partent dans la requête.
   */
  async function exporter() {
    setEnvoi(true);
    setEchec(null);
    const parametres = new URLSearchParams({ du: periode.du, au: periode.au });
    for (const categorie of categories) parametres.append("categorie", categorie);
    const resultat = await telechargerFichier(
      `/api/admin/journal/export?${parametres}`,
      nomDeLExport(periode),
    );
    setEnvoi(false);
    if (!resultat.ok) setEchec(resultat.echec);
  }

  const visibles = filtrerAudit(ecritures, periode, categories);
  const vide = diagnostiquerPeriode(ecritures, periode, categories, (iso) =>
    horodatage(iso),
  );

  const basculer = (categorie: CategorieAudit) =>
    setCategories((p) =>
      p.includes(categorie) ? p.filter((c) => c !== categorie) : [...p, categorie],
    );

  return (
    <div className="flex flex-col">
      <EnteteAdmin
        titre="Journal d'audit"
        resume={`${MENTION_IMMUABLE} ${visibles.length} ${visibles.length > 1 ? "entrées" : "entrée"} sur la période.`}
        actions={
          <Button
            variante="secondaire"
            disabled={envoi}
            raisonDesactivation="Préparation du fichier en cours."
            onClick={exporter}
          >
            {envoi ? "Préparation…" : "Exporter la période"}
          </Button>
        }
      />

      <div className="flex flex-col gap-4 p-6">
        {echec ? <BlocEchec echec={echec} annonce /> : null}

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-14 text-ink-700">
            Du {jourEnFrancais(periode.du)} au {jourEnFrancais(periode.au)}
          </span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par catégorie">
            {CATEGORIES.map((categorie) => (
              <button
                key={categorie}
                type="button"
                aria-pressed={categories.includes(categorie)}
                onClick={() => basculer(categorie)}
                className={cn(
                  "flex min-h-touch items-center rounded-sm border px-3 text-14",
                  categories.includes(categorie)
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-ink-300 bg-white text-ink-900 hover:bg-ink-100",
                )}
              >
                {LIBELLE_CATEGORIE[categorie]}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-ink-300 bg-white">
          <table className="w-full text-14">
            <caption className="sr-only">Écritures du journal d&apos;audit</caption>
            <thead>
              <tr className="bg-ink-100 text-13 font-medium text-ink-700">
                <th scope="col" className="px-3 py-2 text-left">Horodatage</th>
                <th scope="col" className="px-3 py-2 text-left">Acteur</th>
                <th scope="col" className="px-3 py-2 text-left">Action</th>
                <th scope="col" className="px-3 py-2 text-left">Objet</th>
                <th scope="col" className="px-3 py-2 text-left">Détail</th>
                <th scope="col" className="px-3 py-2 text-left">Origine</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((e) => (
                <tr key={e.id} className="border-t border-ink-300 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-13 text-ink-700">
                    {horodatage(e.horodatage)}
                  </td>
                  {/*
                    Le libellé d'abord, l'identifiant durable dessous.
                    L'enquête a besoin des deux : le nom pour savoir de qui
                    on parle, l'identifiant pour ne pas confondre deux
                    personnes qui portent le même. Il n'est pas replié
                    derrière un geste — on le lit en balayant la colonne,
                    et un détail qu'il faut ouvrir ligne par ligne sur
                    deux cents lignes n'est pas consultable.
                  */}
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "block text-ink-900",
                        e.acteur.genre === "NON_RESOLU" && "italic text-ink-700",
                      )}
                    >
                      {e.acteur.libelle}
                    </span>
                    {/*
                      Sauf quand il est déjà le libellé. Une tâche
                      planifiée s'affichait « systeme:purge » deux fois,
                      l'une sous l'autre — et dans un vrai journal ces
                      lignes-là sont les plus nombreuses.
                    */}
                    {e.acteur.identifiant === e.acteur.libelle ? null : (
                      <span className="block font-mono text-13 text-ink-500">
                        {e.acteur.identifiant}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-900">{e.action}</td>
                  <td className="px-3 py-2 text-ink-700">{e.objet}</td>
                  <td className="px-3 py-2 text-pretty text-ink-700">{e.detail}</td>
                  <td className="px-3 py-2 text-13 text-ink-500">{e.origine}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {vide ? (
            <div className="flex flex-col items-start gap-2 p-6">
              <h2 className="text-pretty text-19 font-semibold text-ink-900">
                {vide.message}
              </h2>
              {vide.suivante ? (
                <p className="max-w-lecture text-pretty text-14 text-ink-700">
                  {vide.suivante.message}
                </p>
              ) : (
                <p className="max-w-lecture text-pretty text-14 text-ink-700">
                  Le journal ne comble jamais une période vide : s&apos;il n&apos;affiche
                  rien, il ne s&apos;est rien passé.
                </p>
              )}
              {vide.categorieExcluante ? (
                <Button
                  variante="secondaire"
                  onClick={() =>
                    setCategories((p) => p.filter((c) => c !== vide.categorieExcluante))
                  }
                >
                  Retirer le filtre {LIBELLE_CATEGORIE[vide.categorieExcluante]}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <p className="text-pretty text-13 text-ink-500">{MENTION_MOTIF_ACCES}</p>
        <p className="text-pretty text-13 text-ink-500">{MENTION_EXPORT_VIDE}</p>
      </div>
    </div>
  );
}
