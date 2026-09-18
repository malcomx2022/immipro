"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  concordent,
  libelleConcordance,
  motDePasseRecevable,
} from "@/domain/comptes/mot-de-passe";
import { JaugeMotDePasse } from "../JaugeMotDePasse";

/**
 * A-04 — Mot de passe, en trois étapes.
 *
 * `demande` → `envoye` après l'envoi, `nouveau` quand l'utilisateur revient
 * par le lien reçu (`?etape=nouveau&jeton=…`). Chaque étape a son titre, et
 * le titre porte `id="contenu"` : le lien d'évitement suit l'étape affichée.
 */
type Etape = "demande" | "envoye" | "nouveau";

const ETAPES: readonly Etape[] = ["demande", "envoye", "nouveau"];

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
  const parametres = useSearchParams();
  const depuisLien = parametres.get("etape");
  const [etape, setEtape] = useState<Etape>(
    estEtape(depuisLien) ? depuisLien : "demande",
  );

  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const idJauge = useId();

  const longueurOk = motDePasseRecevable(motDePasse);
  const identiques = concordent(motDePasse, confirmation);
  const nouveauPret = longueurOk && identiques;

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
              texte="Entre l'adresse email de ton compte. Nous t'envoyons un lien valable une heure."
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
          </>
        ) : null}

        {etape === "envoye" ? (
          <>
            <span
              aria-hidden="true"
              className="flex h-24 w-24 items-center justify-center rounded-full bg-ink-100"
            >
              <span className="h-5 w-5 rounded-full bg-success" />
            </span>
            <Entete
              titre="Lien envoyé"
              texte="Ouvre le message envoyé à ton adresse et suis le lien. Il expire dans une heure."
            />
            <div className="flex flex-col items-start gap-2.5 rounded-lg bg-ink-100 p-4">
              <p className="text-pretty text-14 text-ink-700">
                Sur une connexion lente, l&apos;email peut mettre deux à trois
                minutes. Pense aux courriers indésirables.
              </p>
              <Button
                variante="secondaire"
                className="h-11 rounded-full px-3.5 text-14"
              >
                Renvoyer le lien
              </Button>
            </div>
          </>
        ) : null}

        {etape === "nouveau" ? (
          <>
            <Entete
              titre="Choisis un nouveau mot de passe"
              texte="Au moins dix caractères. Évite une date de naissance ou un numéro de téléphone."
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
              Tes autres appareils connectés seront déconnectés.
            </p>
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
            onClick={() => setEtape("envoye")}
          >
            Envoyer le lien
          </Button>
        ) : null}

        {etape === "envoye" ? (
          <Button
            pleineLargeur
            className="min-h-action"
            onClick={() => setEtape("nouveau")}
          >
            J&apos;ai suivi le lien
          </Button>
        ) : null}

        {etape === "nouveau" ? (
          <Button
            pleineLargeur
            className="min-h-action"
            disabled={!nouveauPret}
            raisonDesactivation={
              nouveauPret
                ? undefined
                : !longueurOk
                  ? "Le mot de passe doit faire au moins dix caractères."
                  : "Les deux saisies doivent être identiques."
            }
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
