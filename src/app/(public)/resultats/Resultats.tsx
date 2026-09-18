"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LienBouton } from "@/components/ui/LienBouton";
import { SourceNote } from "@/components/ui/SourceNote";
import { rangAffiche } from "@/domain/destinations/fiche";
import { resumeReponses, type Reponses } from "@/domain/simulateur/questions";
import { CLASSEMENT } from "@/lib/contenu/destinations";
import { lireReponses } from "@/lib/simulation-session";

/**
 * P-03 — Résultats.
 *
 * Les réponses vivent dans la session de l'appareil : l'écran les lit au
 * montage. Trois états s'ensuivent, et aucun n'est un écran blanc —
 * chargement pendant la lecture, vide quand il n'y a rien à classer,
 * résultats sinon.
 */
type Etat =
  | { phase: "lecture" }
  | { phase: "vide" }
  | { phase: "prete"; reponses: Reponses };

export function Resultats() {
  const [etat, setEtat] = useState<Etat>({ phase: "lecture" });

  useEffect(() => {
    const reponses = lireReponses();
    setEtat(
      Object.keys(reponses).length === 0
        ? { phase: "vide" }
        : { phase: "prete", reponses },
    );
  }, []);

  if (etat.phase === "lecture") return <Chargement />;
  if (etat.phase === "vide") return <Vide />;

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-7 px-4 py-6 md:px-12 md:py-10">
      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Trois destinations correspondent à ton profil
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          {resumeReponses(etat.reponses)}
        </p>
        <Link
          href="/simulateur"
          className="flex min-h-touch items-center self-start rounded-full border border-ink-300 px-3.5 text-14 text-ink-900 hover:bg-ink-100"
        >
          Modifier mes réponses
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {CLASSEMENT.retenues.map((fiche, i) => (
          <Card key={fiche.slug} className="gap-3">
            <div className="flex items-start gap-3.5">
              <span
                aria-hidden="true"
                className="flex h-12 w-12 flex-none items-center justify-center rounded-md bg-ink-100 font-mono text-13 text-ink-700"
              >
                {fiche.code}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-13 text-ink-500">
                    {rangAffiche(i)}
                  </span>
                  <h2 className="text-19 font-semibold text-ink-900">{fiche.pays}</h2>
                </div>
                <p className="text-14 text-ink-700">{fiche.resume}</p>
              </div>
            </div>

            <dl className="flex flex-1 flex-col gap-2 rounded-md bg-ink-100 p-3">
              {fiche.reperes.map((r) => (
                <div key={r.intitule} className="flex justify-between gap-3 text-14">
                  <dt className="text-ink-500">{r.intitule}</dt>
                  <dd className="whitespace-nowrap text-right font-medium text-ink-900">
                    {r.valeur}
                  </dd>
                </div>
              ))}
            </dl>

            <LienBouton
              href={`/destinations/${fiche.slug}`}
              variante={i === 0 ? "primaire" : "secondaire"}
              pleineLargeur
            >
              Voir la fiche {fiche.pays}
            </LienBouton>
          </Card>
        ))}
      </div>

      <section className="flex flex-col gap-3 rounded-lg bg-ink-100 p-5">
        <h2 className="text-19 font-semibold text-ink-900">Destinations écartées</h2>
        <ul className="flex flex-col gap-3">
          {CLASSEMENT.ecartees.map((d) => (
            <li
              key={d.code}
              className="flex items-start gap-3 rounded-md bg-white p-3.5"
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 flex-none items-center justify-center rounded-sm bg-ink-100 font-mono text-13 text-ink-700"
              >
                {d.code}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-16 font-medium text-ink-900">{d.pays}</span>
                <span className="text-14 text-ink-700">{d.motif}</span>
              </span>
            </li>
          ))}
        </ul>
        <SourceNote
          source={CLASSEMENT.mention.source}
          verifieeLe={CLASSEMENT.mention.verifieeLe}
        >
          Ce classement compare des exigences publiées ; il ne prédit aucune
          décision.
        </SourceNote>
      </section>

      <div className="flex items-center gap-3 border-t border-ink-300 pt-4">
        <p className="flex-1 text-13 text-ink-500">Checklist en aperçu gratuit</p>
        <LienBouton href="/inscription">Ouvrir un dossier</LienBouton>
      </div>
    </div>
  );
}

/** Le squelette reprend la structure des cartes, il ne la remplace pas. */
function Chargement() {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-7 px-4 py-6 md:px-12 md:py-10">
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        Vos destinations
      </h1>
      <p role="status" className="text-16 text-ink-700">
        Classement de vos réponses en cours.
      </p>
      <div aria-hidden="true" className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex animate-pulse flex-col gap-3 rounded-lg bg-white p-4 shadow-e2"
          >
            <div className="h-12 w-12 rounded-md bg-ink-300" />
            <div className="h-3.5 w-3/5 rounded-full bg-ink-300" />
            <div className="h-28 rounded-md bg-ink-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rien à classer : l'écran dit quoi faire, il ne se contente pas d'être vide. */
function Vide() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col items-start gap-5 px-4 py-12 md:px-12">
      <Image
        src="/illustrations/empty-resultats.svg"
        alt=""
        width={160}
        height={120}
        unoptimized
      />
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        Aucune réponse à classer pour le moment
      </h1>
      <p className="text-pretty text-16 text-ink-700">
        Vos réponses ne sont gardées que le temps de la session, sur cet appareil.
        Reprenez les six questions : il n&apos;y a ni compte à créer, ni attente.
      </p>
      <LienBouton href="/simulateur" className="min-h-action">
        Lancer le simulateur
      </LienBouton>
    </div>
  );
}
