import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { CompletenessTier } from "@/components/ui/CompletenessTier";
import { LienBouton } from "@/components/ui/LienBouton";
import {
  DOSSIERS_MAX,
  LIBELLE_STATUT,
  peutOuvrirUnDossier,
  resumeDuJour,
  trierDossiers,
} from "@/domain/dossiers/dossier";
import { ALERTE_REGLE, DOSSIERS } from "@/lib/contenu/dossiers";

/**
 * C-01 — Tableau de bord. WF-09.
 *
 * Chaque dossier porte son palier et son dénombrement, jamais une note sur
 * cent ni une barre de progression : l'arbitrage C-09 porte sur l'API, donc
 * sur tous les écrans qui affichent une complétude, pas sur le seul C-09.
 *
 * Une seule prochaine action par dossier — celle qui débloque le plus. Un
 * tableau de bord qui liste tout ce qu'il reste ne dit pas par où commencer.
 */
export const metadata: Metadata = {
  title: "Mes dossiers",
  description: "Vos dossiers en cours et la prochaine action de chacun.",
};

export default function PageTableauDeBord() {
  const dossiers = trierDossiers(DOSSIERS);

  if (dossiers.length === 0) return <SansDossier />;

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-col gap-1">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Bonjour Aline
        </h1>
        <p className="text-16 text-ink-700">{resumeDuJour(dossiers)}</p>
      </div>

      <ul className="flex flex-col gap-3 md:grid md:grid-cols-2">
        {dossiers.map((dossier) => (
          <li key={dossier.id} className="flex">
            <Card className="w-full gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 flex-none items-center justify-center rounded-sm bg-ink-100 font-mono text-13 text-ink-700"
                  >
                    {dossier.destination.code}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-16 font-semibold text-ink-900">
                      {dossier.destination.pays}
                    </span>
                    <span className="text-13 text-ink-500">
                      {dossier.destination.intitule.split("—")[0]?.trim()}
                      {dossier.depotVise
                        ? ` · dépôt le ${new Intl.DateTimeFormat("fr-FR").format(new Date(dossier.depotVise))}`
                        : " · date non fixée"}
                    </span>
                  </span>
                </div>
                <span className="flex-none rounded-full bg-ink-100 px-2.5 py-1 text-13 font-medium text-ink-700">
                  {LIBELLE_STATUT[dossier.statut]}
                </span>
              </div>

              <CompletenessTier completude={dossier.completude} variante="carte" />

              <p className="text-pretty rounded-md bg-ink-100 p-3.5 text-14 text-ink-700">
                Prochaine action : {dossier.prochaineAction}
              </p>

              <LienBouton
                href={`/dossiers/${dossier.id}`}
                variante={dossier.statut === "ACTIF" ? "primaire" : "secondaire"}
                pleineLargeur
              >
                {dossier.statut === "BROUILLON" ? "Reprendre le brouillon" : "Continuer ce dossier"}
              </LienBouton>
            </Card>
          </li>
        ))}
      </ul>

      <section className="flex flex-col items-start gap-2 rounded-lg bg-accent-50 p-4">
        <h2 className="text-14 font-semibold text-accent-700">{ALERTE_REGLE.titre}</h2>
        <p className="text-pretty text-14 text-accent-700">{ALERTE_REGLE.texte}</p>
        <Link
          href="/notifications"
          className="flex min-h-touch items-center text-14 text-accent-700 underline"
        >
          {ALERTE_REGLE.action}
        </Link>
      </section>

      {peutOuvrirUnDossier(dossiers) ? (
        <LienBouton
          href="/comparateur"
          variante="secondaire"
          pleineLargeur
          className="md:w-auto md:self-start"
        >
          Ouvrir un nouveau dossier
        </LienBouton>
      ) : (
        <p className="text-13 text-ink-500">
          Tu as atteint les {DOSSIERS_MAX} dossiers ouverts en parallèle. Clôture
          un dossier pour en ouvrir un autre.
        </p>
      )}
    </div>
  );
}

/** État vide : il dit par où commencer, pas seulement qu'il n'y a rien. */
function SansDossier() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-4 py-8">
      <div className="flex justify-center">
        <Image
          src="/illustrations/empty-dossier.svg"
          alt=""
          width={300}
          height={188}
          unoptimized
        />
      </div>
      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Tu n&apos;as pas encore de dossier
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          Commence par la destination qui te correspond. Le simulateur prend deux
          minutes et l&apos;aperçu de la checklist est gratuit.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <LienBouton href="/simulateur" pleineLargeur className="min-h-action">
          Lancer le simulateur
        </LienBouton>
        <LienBouton href="/comparateur" variante="secondaire" pleineLargeur>
          Parcourir les destinations
        </LienBouton>
      </div>
      <p className="text-13 text-ink-500">
        Tu peux ouvrir jusqu&apos;à {DOSSIERS_MAX} dossiers en parallèle.
      </p>
    </div>
  );
}
