"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LienBouton } from "@/components/ui/LienBouton";
import { SourceNote } from "@/components/ui/SourceNote";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import type { Mention } from "@/domain/destinations/fiche";
import type { Motif } from "@/domain/simulateur/classement";
import { resumeReponses, type Reponses } from "@/domain/simulateur/questions";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import { lireReponses } from "@/lib/simulation-session";

/**
 * P-03 — Résultats.
 *
 * Les réponses vivent dans la session de l'appareil : l'écran les lit au
 * montage, puis demande le classement au serveur. RG-01.1 tient des deux
 * côtés — rien n'est écrit, ni ici ni là-bas, tant qu'il n'y a pas de compte.
 *
 * Quatre états, et aucun n'est un écran blanc : chargement pendant l'appel,
 * vide quand il n'y a rien à classer, échec quand le serveur n'a pas répondu,
 * résultats sinon. Le rang et les raisons chiffrées viennent du serveur ;
 * aucun nombre pondéré ne remonte (INV-1, arbitrage C-09).
 */
interface Retenue {
  rang: string;
  slug: string;
  code: string;
  pays: string;
  motifs: Motif[];
  reserve?: string;
  mention?: Mention;
}

interface Ecartee {
  code: string;
  pays: string;
  motif: string;
  ecart: string;
}

interface Classement {
  retenues: Retenue[];
  ecartees: Ecartee[];
  aucuneNePasse: boolean;
}

type Etat =
  | { phase: "lecture" }
  | { phase: "vide" }
  | { phase: "echec"; echec: EchecCandidat; reponses: Reponses }
  | { phase: "prete"; reponses: Reponses; classement: Classement };

export function Resultats() {
  const [etat, setEtat] = useState<Etat>({ phase: "lecture" });

  const classer = useCallback(async (reponses: Reponses) => {
    setEtat({ phase: "lecture" });
    const resultat = await appeler<Classement>("/api/simulations", { corps: reponses });
    setEtat(
      resultat.ok
        ? { phase: "prete", reponses, classement: resultat.donnees }
        : { phase: "echec", echec: resultat.echec, reponses },
    );
  }, []);

  useEffect(() => {
    const reponses = lireReponses();
    if (Object.keys(reponses).length === 0) {
      setEtat({ phase: "vide" });
      return;
    }
    void classer(reponses);
  }, [classer]);

  if (etat.phase === "lecture") return <Chargement />;
  if (etat.phase === "vide") return <Vide />;
  if (etat.phase === "echec") {
    return (
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 py-10 md:px-12">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Vos destinations
        </h1>
        <BlocEchec echec={etat.echec}>
          <Button onClick={() => void classer(etat.reponses)}>{etat.echec.action}</Button>
          <Link href="/simulateur" className="text-14 font-medium text-ink-700 underline">
            Modifier mes réponses
          </Link>
        </BlocEchec>
      </div>
    );
  }

  const { retenues, ecartees, aucuneNePasse } = etat.classement;

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-7 px-4 py-6 md:px-12 md:py-10">
      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          {titre(retenues.length, aucuneNePasse)}
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

      {retenues.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-3">
          {retenues.map((d, i) => (
            <Card key={d.slug} className="gap-3">
              <div className="flex items-start gap-3.5">
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 flex-none items-center justify-center rounded-md bg-ink-100 font-mono text-13 text-ink-700"
                >
                  {d.code}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-13 text-ink-500">{d.rang}</span>
                    <h2 className="text-19 font-semibold text-ink-900">{d.pays}</h2>
                  </div>
                </div>
              </div>

              {/* Les trois raisons principales, chiffrées (WF-01 étape 4).
                  Celles qui jouent contre la destination sont dites ici, au
                  rang où elle apparaît, et non trois écrans plus loin. */}
              <ul className="flex flex-1 flex-col gap-2 rounded-md bg-ink-100 p-3">
                {d.motifs.map((m) => (
                  <li key={m.texte} className="flex items-start gap-2 text-14">
                    <span
                      aria-hidden="true"
                      className={`mt-2 h-1.5 w-1.5 flex-none rounded-full ${
                        m.favorable ? "bg-accent-700" : "bg-warning"
                      }`}
                    />
                    <span className="text-pretty text-ink-700">{m.texte}</span>
                  </li>
                ))}
                {d.reserve ? (
                  <li className="text-pretty text-13 text-ink-500">{d.reserve}</li>
                ) : null}
              </ul>

              <LienBouton
                href={`/destinations/${d.slug}`}
                variante={i === 0 ? "primaire" : "secondaire"}
                pleineLargeur
              >
                Voir la fiche {d.pays}
              </LienBouton>
            </Card>
          ))}
        </div>
      ) : null}

      {ecartees.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-lg bg-ink-100 p-5">
          <h2 className="text-19 font-semibold text-ink-900">
            {aucuneNePasse ? "Ce qu'il manque, destination par destination" : "Destinations écartées"}
          </h2>
          <ul className="flex flex-col gap-3">
            {ecartees.map((d) => (
              <li
                key={`${d.code}-${d.motif}`}
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
                  {/* L'écart est chiffré : c'est ce qui rend le manque
                      franchissable plutôt que définitif (RG-01.3). */}
                  <span className="text-14 font-medium text-ink-900">{d.ecart}</span>
                </span>
              </li>
            ))}
          </ul>
          {mentionDuClassement(retenues) ? (
            <SourceNote
              source={mentionDuClassement(retenues)!.source}
              verifieeLe={mentionDuClassement(retenues)!.verifieeLe}
            >
              Ce classement compare des exigences publiées ; il ne prédit aucune
              décision.
            </SourceNote>
          ) : null}
        </section>
      ) : null}

      <div className="flex items-center gap-3 border-t border-ink-300 pt-4">
        <p className="flex-1 text-13 text-ink-500">Checklist en aperçu gratuit</p>
        <LienBouton href="/inscription">Ouvrir un dossier</LienBouton>
      </div>
    </div>
  );
}

/**
 * Le titre suit le résultat. « Trois destinations correspondent » écrit en
 * dur mentait dès qu'il y en avait deux, et devenait absurde quand il n'y en
 * avait aucune — le cas où le candidat a le plus besoin d'être bien reçu.
 */
function titre(retenues: number, aucuneNePasse: boolean): string {
  if (aucuneNePasse) return "Aucune destination ne réunit encore tes conditions";
  if (retenues === 1) return "Une destination correspond à ton profil";
  return `${retenues} destinations correspondent à ton profil`;
}

/**
 * La mention porte la vérification la plus ancienne des fiches affichées : un
 * classement n'est pas « vérifié aujourd'hui » parce que l'une de ses fiches
 * l'est.
 */
function mentionDuClassement(retenues: readonly Retenue[]): Mention | null {
  const mentions = retenues.flatMap((r) => (r.mention ? [r.mention] : []));
  if (mentions.length === 0) return null;
  return {
    source: [...new Set(mentions.map((m) => m.source))].sort().join(", "),
    verifieeLe: mentions.map((m) => m.verifieeLe).sort()[0]!,
  };
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
