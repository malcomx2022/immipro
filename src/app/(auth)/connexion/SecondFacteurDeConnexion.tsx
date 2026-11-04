"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { appeler } from "@/lib/api";
import {
  CHIFFRES_TOTP,
  TITRE_CONNEXION_A_RECOMMENCER,
  lireLaSaisie,
} from "@/domain/comptes/deux-facteurs";

/**
 * A-02, second temps — S.214.
 *
 * Le mot de passe est accepté ; il reste le code de l'application
 * d'authentification, ou un code de secours. Un seul champ pour les deux :
 * six chiffres sont lus comme un code TOTP, huit caractères comme un code
 * de secours — la personne n'a pas à choisir avant de saisir.
 *
 * Le refus vient du serveur et porte ce qui reste avant le blocage. Un
 * défi échu (cinq minutes, cinq essais) ramène au mot de passe.
 */
export interface SecondFacteurDeConnexionProps {
  onConnecte: (compte: { emailVerifie: boolean; role?: string }) => void;
  /** `null` : retour voulu par la personne, rien à annoncer. */
  onRecommencer: (message: string | null) => void;
}

export function SecondFacteurDeConnexion({ onConnecte, onRecommencer }: SecondFacteurDeConnexionProps) {
  const [code, setCode] = useState("");
  const [secours, setSecours] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<{ titre: string; corps: string } | null>(null);
  const [restants, setRestants] = useState<number | null>(null);

  const lue = lireLaSaisie(code);
  const complet = secours ? lue.genre === "secours" : lue.genre === "totp";

  async function verifier() {
    if (!complet || envoi) return;
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{
      compte: { emailVerifie: boolean; role?: string };
      codesDeSecoursRestants?: number;
    }>("/api/comptes/session/second-facteur", { corps: { code } });
    if (resultat.ok) {
      if (typeof resultat.donnees.codesDeSecoursRestants === "number") {
        setRestants(resultat.donnees.codesDeSecoursRestants);
      }
      onConnecte(resultat.donnees.compte);
      return;
    }
    setEnvoi(false);
    if (resultat.echec.titre === TITRE_CONNEXION_A_RECOMMENCER) {
      onRecommencer(resultat.echec.corps);
      return;
    }
    setCode("");
    setEchec({ titre: resultat.echec.titre, corps: resultat.echec.corps });
  }

  return (
    <form
      noValidate
      aria-labelledby="contenu"
      onSubmit={(e) => {
        e.preventDefault();
        void verifier();
      }}
      className="mx-auto flex w-full max-w-connexion flex-col gap-5 px-4 pb-8 md:py-6"
    >
      <div className="flex flex-col gap-2">
        <h1 id="contenu" tabIndex={-1} className="text-24 font-semibold text-ink-900 outline-none md:text-32">
          Double authentification
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          {secours
            ? "Saisis l'un de tes codes de secours. Chacun ne sert qu'une fois."
            : `Ouvre ton application d'authentification et saisis le code à ${CHIFFRES_TOTP} chiffres affiché pour ImmiPro.`}
        </p>
      </div>

      {echec ? (
        <div role="alert" className="flex flex-col gap-1 rounded-md bg-ink-100 p-3.5">
          <span className="text-14 font-semibold text-ink-900">{echec.titre}</span>
          <span className="text-pretty text-14 text-ink-700">{echec.corps}</span>
        </div>
      ) : null}
      {restants !== null ? (
        <p role="status" className="text-pretty text-14 text-ink-700">
          {`Connexion avec un code de secours : il t'en reste ${restants}.`}
        </p>
      ) : null}

      <Input
        libelle={secours ? "Code de secours" : "Code à six chiffres"}
        name={secours ? "code-de-secours" : "code"}
        autoComplete="one-time-code"
        inputMode={secours ? "text" : "numeric"}
        autoCapitalize={secours ? "characters" : "off"}
        spellCheck={false}
        placeholder={secours ? "ABCD-EFGH" : "123456"}
        invalide={Boolean(echec)}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus
      />

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          pleineLargeur
          className="min-h-action"
          disabled={!complet}
          chargement={envoi}
          raisonDesactivation={
            complet
              ? undefined
              : secours
                ? "Saisis un code de secours de huit caractères, par exemple ABCD-EFGH."
                : `Saisis les ${CHIFFRES_TOTP} chiffres affichés par ton application.`
          }
        >
          Vérifier et me connecter
        </Button>
        <Button
          variante="tertiaire"
          pleineLargeur
          disabled={envoi}
          onClick={() => {
            setSecours(!secours);
            setCode("");
            setEchec(null);
          }}
        >
          {secours ? "Utiliser le code de mon application" : "Utiliser un code de secours"}
        </Button>
        <Button
          variante="tertiaire"
          pleineLargeur
          disabled={envoi}
          onClick={() => onRecommencer(null)}
        >
          Revenir au mot de passe
        </Button>
      </div>
    </form>
  );
}
