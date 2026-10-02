"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  codeComplet,
  libelleAvancementCode,
  LONGUEUR_CODE,
  normaliserCode,
} from "@/domain/comptes/code-verification";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import { cn } from "@/lib/utils";

/**
 * A-03 — Vérification de l'adresse email.
 *
 * La saisie est normalisée à la frappe : un code recopié depuis un email
 * arrive souvent avec des espaces. Les six segments sont décoratifs — c'est
 * la phrase qui porte l'avancement, et elle est en `aria-live="polite"`
 * puisqu'elle change sans action directe sur elle.
 *
 * « Mauvaise adresse ? » menait à `/consentements`, où rien ne change
 * l'adresse. La correction se fait désormais ici, sans quitter l'écran :
 * nouvelle adresse et mot de passe, puis un nouveau code part. L'adresse en
 * cours est écrite dans le chapeau, comme au prototype : c'est en la lisant
 * qu'on voit la faute de frappe.
 */
export function Verification({ email = null }: { email?: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [renvoi, setRenvoi] = useState(false);
  const [renvoye, setRenvoye] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [adresse, setAdresse] = useState(email);
  const [correction, setCorrection] = useState(false);
  const [nouvelle, setNouvelle] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [correctionEnCours, setCorrectionEnCours] = useState(false);
  const [echecCorrection, setEchecCorrection] = useState<EchecCandidat | null>(null);
  const [corrigee, setCorrigee] = useState<string | null>(null);
  const idAvancement = useId();
  const idCorrection = useId();
  const chiffres = normaliserCode(code).length;
  const complet = codeComplet(code);

  async function verifier() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler("/api/comptes/verification", { corps: { code } });
    if (resultat.ok) {
      router.push("/tableau-de-bord");
      return;
    }
    setEnvoi(false);
    setEchec(resultat.echec);
  }

  async function renvoyer() {
    setRenvoi(true);
    setEchec(null);
    setRenvoye(false);
    const resultat = await appeler("/api/comptes/verification", { methode: "PUT" });
    setRenvoi(false);
    // Le code précédent est annulé par l'émission du suivant : le dire évite
    // qu'on saisisse l'ancien, reçu deux minutes plus tôt, et qu'on croie
    // s'être trompé de chiffres.
    if (resultat.ok) setRenvoye(true);
    else setEchec(resultat.echec);
  }

  async function corriger() {
    setCorrectionEnCours(true);
    setEchecCorrection(null);
    const resultat = await appeler<{ email: string }>("/api/comptes/adresse", {
      methode: "PUT",
      corps: { email: nouvelle, motDePasse },
    });
    setCorrectionEnCours(false);
    if (!resultat.ok) {
      setEchecCorrection(resultat.echec);
      return;
    }
    /*
      La réponse est la même que l'adresse soit libre ou déjà prise : c'est
      l'email reçu qui dit laquelle des deux. L'écran ne promet donc qu'un
      email, pas un code.
    */
    setAdresse(resultat.donnees.email);
    setCorrigee(resultat.donnees.email);
    setCorrection(false);
    setNouvelle("");
    setMotDePasse("");
    setCode("");
    setRenvoye(false);
  }

  const correctionComplete = nouvelle.trim() !== "" && motDePasse !== "";

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-4 pb-8 md:py-6">
      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Vérifie ton adresse email
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          Nous avons envoyé un code à six chiffres à{" "}
          {adresse ? (
            <span className="font-semibold text-ink-900">{adresse}</span>
          ) : (
            "ton adresse"
          )}
          .
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <Input
          libelle="Code de vérification"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          aria-describedby={idAvancement}
          classNameControle="h-16 font-mono text-32 tracking-code"
          value={code}
          onChange={(e) => setCode(normaliserCode(e.target.value))}
        />
        <span aria-hidden="true" className="flex gap-1.5">
          {Array.from({ length: LONGUEUR_CODE }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                chiffres > i ? "bg-accent-500" : "bg-ink-100",
              )}
            />
          ))}
        </span>
        <span id={idAvancement} aria-live="polite" className="text-13 text-ink-500">
          {libelleAvancementCode(code)}
        </span>
      </div>

      <div className="flex flex-col items-start gap-2.5 rounded-lg bg-ink-100 p-4">
        <p className="text-14 font-semibold text-ink-900">Rien reçu&nbsp;?</p>
        <p className="text-pretty text-14 text-ink-700">
          Regarde dans les courriers indésirables. Sur une connexion lente,
          l&apos;email peut mettre deux à trois minutes.
        </p>
        <Button
          variante="secondaire"
          className="h-11 rounded-full px-3.5 text-14"
          chargement={renvoi}
          onClick={() => void renvoyer()}
        >
          Renvoyer le code
        </Button>
        {renvoye ? (
          <p role="status" className="text-pretty text-14 text-ink-700">
            Un nouveau code est parti. Le précédent ne fonctionne plus.
          </p>
        ) : null}
      </div>

      {echec ? <BlocEchec echec={echec} /> : null}

      <div className="flex flex-col gap-1.5">
        <p className="text-14 font-medium text-ink-900">Mauvaise adresse&nbsp;?</p>
        <button
          type="button"
          aria-expanded={correction}
          aria-controls={idCorrection}
          onClick={() => {
            setCorrection((ouvert) => !ouvert);
            setEchecCorrection(null);
          }}
          className="flex min-h-touch items-center self-start text-14 text-accent-600"
        >
          Corriger mon adresse email
        </button>
        {corrigee ? (
          <p role="status" className="text-pretty text-14 text-ink-700">
            Un email part à {corrigee}. Saisis le code qu&apos;il contient : le
            précédent ne fonctionne plus.
          </p>
        ) : null}
        {correction ? (
          <form
            id={idCorrection}
            className="flex flex-col gap-3 rounded-lg border border-ink-300 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (correctionComplete) void corriger();
            }}
          >
            <Input
              libelle="Nouvelle adresse email"
              type="email"
              autoComplete="email"
              value={nouvelle}
              erreur={echecCorrection?.champs?.email}
              onChange={(e) => setNouvelle(e.target.value)}
            />
            <Input
              libelle="Mot de passe"
              type="password"
              autoComplete="current-password"
              aide="Celui choisi à l'inscription, pour confirmer que c'est bien toi."
              value={motDePasse}
              erreur={echecCorrection?.champs?.motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
            {echecCorrection && !echecCorrection.champs ? (
              <BlocEchec echec={echecCorrection} />
            ) : null}
            <Button
              type="submit"
              variante="secondaire"
              className="h-11 self-start rounded-full px-3.5 text-14"
              chargement={correctionEnCours}
              disabled={!correctionComplete}
              raisonDesactivation={
                correctionComplete
                  ? undefined
                  : "Saisis la nouvelle adresse et ton mot de passe."
              }
            >
              Corriger et recevoir un code
            </Button>
          </form>
        ) : null}
      </div>

      <p className="text-pretty text-13 text-ink-500">
        Tant que ton adresse n&apos;est pas vérifiée, tu peux consulter ton dossier
        mais pas recevoir les alertes de changement de règles.
      </p>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-ink-300 bg-white px-4 py-3 md:static md:mx-0 md:border-0 md:p-0">
        <Button
          pleineLargeur
          className="min-h-action"
          disabled={!complet}
          chargement={envoi}
          raisonDesactivation={
            complet ? undefined : `Saisis les ${LONGUEUR_CODE} chiffres du code.`
          }
          onClick={() => void verifier()}
        >
          Vérifier mon adresse
        </Button>
        <Button
          variante="tertiaire"
          pleineLargeur
          className="h-11 text-14"
          onClick={() => router.push("/tableau-de-bord")}
        >
          Plus tard
        </Button>
      </div>
    </div>
  );
}
