"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import {
  CATEGORIES,
  LIBELLE_CATEGORIE,
  MENTION_EXPORT_VIDE,
  MENTION_IMMUABLE,
  MENTION_MOTIF_ACCES,
  diagnostiquerPeriode,
  filtrerAudit,
  type CategorieAudit,
  type EcritureAudit,
  type Periode,
} from "@/domain/backoffice/audit";
import { jourEnFrancais } from "@/domain/format/moment";
import { cn } from "@/lib/utils";

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
 */
const FORMAT_HORODATAGE = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
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
        actions={<Button variante="secondaire">Exporter la période</Button>}
      />

      <div className="flex flex-col gap-4 p-6">
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
                  <td className="px-3 py-2 text-ink-900">{e.acteur}</td>
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
                <p className="max-w-[70ch] text-pretty text-14 text-ink-700">
                  {vide.suivante.message}
                </p>
              ) : (
                <p className="max-w-[70ch] text-pretty text-14 text-ink-700">
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
