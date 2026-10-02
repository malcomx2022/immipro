"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { appeler } from "@/lib/api";
import { suiteInterne } from "@/domain/comptes/suite";

/**
 * A-02 — Connexion.
 *
 * « Rester connecté » n'est pas coché par défaut, et l'écran dit pourquoi
 * on peut vouloir le laisser ainsi : beaucoup de candidats se connectent
 * depuis un cybercafé.
 *
 * L'échec est annoncé en `role="alert"` et porte le décompte d'essais
 * restants — un blocage sans préavis paraît arbitraire. Le message ne dit
 * jamais lequel des deux champs est en cause : marquer le seul champ email
 * dirait qu'il existe un compte à cette adresse.
 *
 * Après connexion, l'écran renvoie là où la personne allait. Quelqu'un qui
 * ouvre un lien vers son dossier après expiration de sa session doit y
 * revenir, pas atterrir sur un tableau de bord et chercher.
 */
export function Connexion() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [rester, setRester] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  // Le refus vient du serveur ; l'écran sait seulement l'afficher.
  const [echec, setEchec] = useState<string | null>(null);

  async function connecter() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ compte: { emailVerifie: boolean } }>(
      "/api/comptes/session",
      { corps: { email: email.trim(), motDePasse } },
    );
    if (resultat.ok) {
      // La suite est lue au moment de l'envoi, pas au rendu : `useSearchParams`
      // rendrait tout l'écran dynamique, alors que c'est le premier que voit
      // quelqu'un qui revient — celui qu'il faut servir le plus vite.
      const suite = new URLSearchParams(window.location.search).get("suite");
      router.push(destination(suite, resultat.donnees.compte.emailVerifie));
      return;
    }
    setEnvoi(false);
    // Le décompte d'essais est déjà dans la phrase du serveur : « il te reste
    // 3 essais… ». Le réextraire pour le recomposer ici ferait deux endroits
    // où le même nombre peut diverger.
    setEchec(resultat.echec.corps);
  }

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-5 px-4 pb-8 md:py-6">
      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Bon retour
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          Ton dossier t&apos;attend là où tu l&apos;as laissé.
        </p>
      </div>

      {echec ? (
        <div role="alert" className="flex items-start gap-3 rounded-md bg-ink-100 p-3.5">
          <span
            aria-hidden="true"
            className="mt-2 h-2 w-2 flex-none rounded-full bg-danger"
          />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-14 font-semibold text-ink-900">
              Email ou mot de passe incorrect
            </span>
            {/* Le décompte d'essais est écrit par le serveur : il connaît le
                compteur, l'écran non. Un blocage sans préavis paraît
                arbitraire, et un préavis inventé serait faux. */}
            <span className="text-pretty text-14 text-ink-700">{echec}</span>
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {/* L'erreur porte sur le couple, jamais sur un champ : marquer le seul
            champ email dirait qu'il existe un compte à cette adresse. */}
        <Input
          libelle="Adresse email"
          type="email"
          autoComplete="email"
          placeholder="aline.dossou@email.com"
          invalide={Boolean(echec)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          libelle="Mot de passe"
          type="password"
          autoComplete="current-password"
          placeholder="Ton mot de passe"
          invalide={Boolean(echec)}
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
        />

        <div className="flex items-center justify-between gap-3">
          <Checkbox
            libelle="Rester connecté"
            checked={rester}
            onChangement={setRester}
          />
          <Link
            href="/mot-de-passe"
            className="flex min-h-touch items-center text-14 text-accent-600"
          >
            Mot de passe oublié
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 rounded-md bg-ink-100 p-4">
        <p className="text-14 font-semibold text-ink-900">
          Connexion sur un appareil partagé
        </p>
        <p className="text-pretty text-14 text-ink-700">
          Laisse «&nbsp;Rester connecté&nbsp;» décoché si tu utilises un téléphone
          ou un cybercafé qui n&apos;est pas le tien.
        </p>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-ink-300 bg-white px-4 py-3 md:static md:mx-0 md:border-0 md:p-0">
        <Button
          pleineLargeur
          className="min-h-action"
          disabled={!email || !motDePasse}
          chargement={envoi}
          raisonDesactivation={
            email && motDePasse
              ? undefined
              : "Renseigne ton adresse email et ton mot de passe."
          }
          onClick={() => void connecter()}
        >
          Se connecter
        </Button>
        <p className="text-center text-14 text-ink-700">
          Pas encore de compte&nbsp;?{" "}
          <Link href="/inscription" className="text-accent-600 underline">
            S&apos;inscrire
          </Link>
        </p>
      </div>
    </div>
  );
}

/**
 * Où aller après la connexion.
 *
 * Une adresse non vérifiée passe d'abord par la vérification : c'est elle
 * qui conditionne l'ouverture d'un dossier, et y buter trois écrans plus
 * loin est plus désagréable que d'y passer tout de suite.
 *
 * La suite n'est suivie que si elle est interne. Une adresse absolue venue
 * du paramètre de requête ferait de cet écran une redirection ouverte, dont
 * on se sert pour faire atterrir quelqu'un sur une fausse page de connexion.
 *
 * La vérification garde la suite : un candidat qui se connecte pour ouvrir
 * un dossier sur la Suisse doit y arriver une fois son adresse vérifiée,
 * pas sur le tableau de bord.
 */
function destination(suite: string | null, emailVerifie: boolean): string {
  const retour = suiteInterne(suite);
  if (!emailVerifie) {
    return retour ? `/verification?suite=${encodeURIComponent(retour)}` : "/verification";
  }
  return retour ?? "/tableau-de-bord";
}
