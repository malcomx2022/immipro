"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  concordent,
  libelleConcordance,
  motDePasseRecevable,
} from "@/domain/comptes/mot-de-passe";
import {
  codeComplet,
  LONGUEUR_CODE,
  normaliserCode,
} from "@/domain/comptes/code-verification";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import { JaugeMotDePasse } from "../JaugeMotDePasse";

/**
 * A-04 — Mot de passe, en deux étapes.
 *
 * `demande` → `nouveau` après l'envoi. Chaque étape a son titre, et le titre
 * porte `id="contenu"` : le lien d'évitement suit l'étape affichée.
 *
 * **Un code, pas un lien.** Le prototype prévoyait un lien à suivre et une
 * étape « J'ai suivi le lien » qui ne vérifiait rien : elle avançait sur un
 * clic, sans que personne ait ouvert quoi que ce soit. Le serveur émet un
 * code à six chiffres, comme pour la vérification d'adresse (A-03), et pour
 * la même raison — l'email arrive sur le téléphone qui affiche le
 * formulaire, et un code se recopie sans le quitter. Un seul mécanisme pour
 * deux parcours voisins, plutôt que deux.
 *
 * L'espace de recherche d'un code à six chiffres est borné par ailleurs :
 * cinq essais, dix minutes, et tout code précédent annulé à l'émission du
 * suivant.
 */
type Etape = "demande" | "nouveau";

const ETAPES: readonly Etape[] = ["demande", "nouveau"];

const estEtape = (valeur: string | null): valeur is Etape =>
  valeur !== null && (ETAPES as readonly string[]).includes(valeur);

export function MotDePasse() {
  return (
    <Suspense fallback={<Squelette />}>
      <Etapes />
    </Suspense>
  );
}

function Etapes() {
  const router = useRouter();
  const parametres = useSearchParams();
  const depuisLien = parametres.get("etape");
  const [etape, setEtape] = useState<Etape>(
    estEtape(depuisLien) ? depuisLien : "demande",
  );

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const idJauge = useId();

  const longueurOk = motDePasseRecevable(motDePasse);
  const identiques = concordent(motDePasse, confirmation);
  const codeOk = codeComplet(code);
  const nouveauPret = longueurOk && identiques && codeOk;

  async function demander() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler("/api/comptes/mot-de-passe", {
      corps: { email: email.trim() },
    });
    setEnvoi(false);
    // La réponse est la même que l'adresse ait un compte ou non : ce
    // formulaire ne doit pas servir à savoir qui est client.
    if (resultat.ok) setEtape("nouveau");
    else setEchec(resultat.echec);
  }

  async function enregistrer() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler("/api/comptes/mot-de-passe", {
      methode: "PUT",
      corps: { email: email.trim(), code: normaliserCode(code), motDePasse },
    });
    setEnvoi(false);
    if (resultat.ok) router.push("/connexion");
    else setEchec(resultat.echec);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-8 px-4 pb-8 md:flex-row md:gap-16 md:px-12 md:py-6">
      <div className="flex flex-col gap-5 md:w-[520px] md:flex-none">
        <Link href="/connexion" className="text-14 font-semibold text-ink-900">
          Connexion
        </Link>

        {etape === "demande" ? (
          <>
            <Entete
              titre="Réinitialise ton mot de passe"
              texte="Entre l'adresse email de ton compte. Nous t'envoyons un code à six chiffres, valable dix minutes."
            />
            <Input
              libelle="Adresse email"
              type="email"
              autoComplete="email"
              placeholder="aline.dossou@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-pretty text-13 text-ink-500">
              Ton dossier et tes pièces ne sont pas affectés par cette opération.
            </p>
            {echec ? <BlocEchec echec={echec} /> : null}
          </>
        ) : null}

        {etape === "nouveau" ? (
          <>
            <Entete
              titre="Choisis un nouveau mot de passe"
              texte="Un code à six chiffres vient de partir à ton adresse. Il est valable dix minutes."
            />
            <Input
              libelle="Code reçu par email"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              classNameControle="font-mono tracking-code"
              aide="Sur une connexion lente, l'email peut mettre deux à trois minutes. Pense aux courriers indésirables."
              value={code}
              onChange={(e) => setCode(normaliserCode(e.target.value))}
            />
            <div className="flex flex-col gap-1.5">
              <Input
                libelle="Nouveau mot de passe"
                type="password"
                autoComplete="new-password"
                placeholder="Au moins 10 caractères"
                aria-describedby={idJauge}
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
              />
              <JaugeMotDePasse motDePasse={motDePasse} id={idJauge} />
            </div>
            <Input
              libelle="Confirme le mot de passe"
              type="password"
              autoComplete="new-password"
              placeholder="Répète le mot de passe"
              aide={libelleConcordance(motDePasse, confirmation)}
              invalide={confirmation.length > 0 && !identiques}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
            <p className="text-pretty text-13 text-ink-500">
              Tous tes appareils connectés seront déconnectés, celui-ci compris.
              C&apos;est le geste qu&apos;on fait après avoir perdu un téléphone :
              il serait sans effet si l&apos;appareil perdu restait connecté.
            </p>
            {echec ? <BlocEchec echec={echec} /> : null}
          </>
        ) : null}
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-ink-300 bg-white px-4 py-3 md:static md:mx-0 md:w-72 md:flex-none md:border-0 md:p-0">
        {etape === "demande" ? (
          <Button
            pleineLargeur
            className="min-h-action"
            disabled={!email}
            raisonDesactivation={
              email ? undefined : "Renseignez l'adresse email de votre compte."
            }
            chargement={envoi}
            onClick={() => void demander()}
          >
            Envoyer le code
          </Button>
        ) : null}

        {etape === "nouveau" ? (
          <Button
            pleineLargeur
            className="min-h-action"
            disabled={!nouveauPret}
            chargement={envoi}
            raisonDesactivation={
              nouveauPret
                ? undefined
                : !codeOk
                  ? `Saisissez les ${LONGUEUR_CODE} chiffres reçus par email.`
                  : !longueurOk
                    ? "Le mot de passe doit faire au moins dix caractères."
                    : "Les deux saisies doivent être identiques."
            }
            onClick={() => void enregistrer()}
          >
            Enregistrer le mot de passe
          </Button>
        ) : null}

        <p className="text-center text-14">
          <Link href="/connexion" className="text-accent-600 underline">
            Revenir à la connexion
          </Link>
        </p>
      </div>
    </div>
  );
}

function Entete({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        {titre}
      </h1>
      <p className="text-pretty text-16 text-ink-700">{texte}</p>
    </div>
  );
}

function Squelette() {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6 md:px-12">
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        Mot de passe
      </h1>
      <p role="status" className="mt-2 text-16 text-ink-700">
        Chargement de l&apos;étape en cours.
      </p>
    </div>
  );
}
