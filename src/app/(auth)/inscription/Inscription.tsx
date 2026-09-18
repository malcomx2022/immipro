"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { motDePasseRecevable } from "@/domain/comptes/mot-de-passe";
import { JaugeMotDePasse } from "../JaugeMotDePasse";

/**
 * A-01 — Inscription.
 *
 * Le bouton reste désactivé tant que les conditions ne sont pas acceptées ou
 * que le mot de passe est trop court, et dit laquelle des deux raisons
 * s'applique : un bouton gris sans explication est un défaut.
 */
export function Inscription() {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [conditions, setConditions] = useState(false);
  const idJauge = useId();

  const longueurOk = motDePasseRecevable(motDePasse);
  const complet = Boolean(nom && email && longueurOk && conditions);

  const raison = !conditions
    ? "Acceptez les conditions d'utilisation pour créer le compte."
    : !longueurOk
      ? "Le mot de passe doit faire au moins dix caractères."
      : "Renseignez votre nom et votre adresse email.";

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-4 pb-8 md:flex-row md:gap-16 md:px-12 md:py-6">
      <div className="flex flex-col gap-5 md:w-[520px] md:flex-none">
        <div className="flex flex-col gap-2">
          <h1
            id="contenu"
            tabIndex={-1}
            className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
          >
            Crée ton compte
          </h1>
          <p className="text-pretty text-16 text-ink-700">
            Tes réponses du simulateur sont conservées et rattachées à ce compte.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Input
            libelle="Prénom et nom"
            autoComplete="name"
            placeholder="Aline Dossou"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
          <Input
            libelle="Adresse email"
            type="email"
            autoComplete="email"
            placeholder="aline.dossou@email.com"
            aide="C'est là qu'arrivent les alertes de changement de règles."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            libelle="Numéro Mobile Money"
            type="tel"
            autoComplete="tel"
            placeholder="97 00 00 42"
            aide="Bénin, +229. Sert au paiement, jamais à la publicité."
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <Input
              libelle="Mot de passe"
              type="password"
              autoComplete="new-password"
              placeholder="Au moins 10 caractères"
              aria-describedby={idJauge}
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
            <JaugeMotDePasse motDePasse={motDePasse} id={idJauge} />
          </div>
        </div>

        <Checkbox
          libelle="J'accepte les conditions d'utilisation et la politique de confidentialité."
          checked={conditions}
          onChangement={setConditions}
        />

        {/* RG-02.1 : le consentement aux pièces d'identité est séparé, et
            l'écran dit où il sera demandé plutôt que de le glisser ici. */}
        <p className="text-pretty rounded-md bg-ink-100 p-3.5 text-13 text-ink-500">
          Le consentement au traitement de tes pièces d&apos;identité est demandé
          séparément, au moment du premier téléversement.
        </p>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-ink-300 bg-white px-4 py-3 md:static md:mx-0 md:w-72 md:flex-none md:border-0 md:p-0">
        <Button
          pleineLargeur
          className="min-h-action"
          disabled={!complet}
          raisonDesactivation={complet ? undefined : raison}
        >
          Créer mon compte
        </Button>
        <p className="text-center text-14 text-ink-700">
          Déjà inscrit&nbsp;?{" "}
          <Link href="/connexion" className="text-accent-600 underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
