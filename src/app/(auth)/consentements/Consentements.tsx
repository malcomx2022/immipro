"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import {
  CONSENTEMENTS,
  ETAT_INITIAL,
  libelleActifs,
  type CodeConsentement,
  type EtatConsentements,
} from "@/domain/comptes/consentements";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";

/**
 * A-05 — Consentements.
 *
 * L'état de départ vient de `ETAT_INITIAL`, où tout est à faux : l'écran ne
 * peut pas pré-accorder une autorisation, même par erreur de rédaction.
 *
 * Chaque interrupteur est relié à son titre et à sa description : un lecteur
 * d'écran annonce ce qui est autorisé, pas « activé, bouton ».
 *
 * L'état affiché vient du serveur, où chaque changement écrit une ligne
 * datée : un consentement est une preuve, et une preuve qu'on réécrit n'en
 * est plus une. Tant que la lecture n'a pas abouti, les interrupteurs
 * restent à faux — afficher « accordé » par optimisme, puis se rétracter,
 * serait le pire des deux états.
 */
export function Consentements() {
  const [etat, setEtat] = useState<EtatConsentements>({ ...ETAT_INITIAL });
  const [lu, setLu] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [enAttente, setEnAttente] = useState<Partial<EtatConsentements>>({});
  const prefixe = useId();

  useEffect(() => {
    let vivant = true;
    void appeler<{ etat: EtatConsentements }>("/api/comptes/consentements").then((r) => {
      if (!vivant) return;
      if (r.ok) setEtat(r.donnees.etat);
      else setEchec(r.echec);
      setLu(true);
    });
    return () => {
      vivant = false;
    };
  }, []);

  const basculer = (code: CodeConsentement) => (actif: boolean) => {
    setEtat((precedent) => ({ ...precedent, [code]: actif }));
    setEnAttente((precedent) => ({ ...precedent, [code]: actif }));
  };

  /**
   * Chaque bascule est envoyée séparément. Un enregistrement groupé qui
   * échoue à mi-chemin laisserait une partie des autorisations accordées et
   * l'autre non, sans que l'écran sache laquelle — sur un consentement, ce
   * doute n'est pas acceptable.
   */
  async function enregistrer() {
    setEnvoi(true);
    setEchec(null);
    for (const [code, accorde] of Object.entries(enAttente)) {
      const resultat = await appeler("/api/comptes/consentements", {
        methode: "PUT",
        corps: { code, accorde },
      });
      if (!resultat.ok) {
        setEnvoi(false);
        setEchec(resultat.echec);
        return;
      }
      setEnAttente((precedent) => {
        const suite = { ...precedent };
        delete suite[code as CodeConsentement];
        return suite;
      });
    }
    setEnvoi(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-8 px-4 pb-8 md:flex-row md:gap-16 md:px-12 md:py-6">
      <div className="flex min-w-0 flex-col gap-5 md:w-[560px] md:flex-none">
        <Link href="/connexion" className="text-14 font-semibold text-ink-900">
          Mon profil
        </Link>

        <div className="flex flex-col gap-2">
          <h1
            id="contenu"
            tabIndex={-1}
            className="text-24 font-semibold text-ink-900 outline-none md:text-32"
          >
            Mes consentements
          </h1>
          <p className="text-pretty text-16 text-ink-700">
            Chaque autorisation est indépendante et révocable à tout moment. Le
            refus de l&apos;analyse des pièces d&apos;identité ne bloque pas ton
            compte.
          </p>
        </div>

        <ul className="flex flex-col border-b border-ink-300">
          {CONSENTEMENTS.map((consentement) => {
            const idTitre = `${prefixe}-${consentement.code}-titre`;
            const idTexte = `${prefixe}-${consentement.code}-texte`;
            return (
              <li
                key={consentement.code}
                className="flex items-start gap-4 border-t border-ink-300 px-0 py-5"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span id={idTitre} className="text-16 font-semibold text-ink-900">
                    {consentement.titre}
                  </span>
                  <span id={idTexte} className="text-pretty text-14 text-ink-700">
                    {consentement.description}
                  </span>
                  {consentement.siRefuse ? (
                    <span className="text-pretty text-13 text-ink-500">
                      {consentement.siRefuse}
                    </span>
                  ) : null}
                </div>
                <Switch
                  idLibelle={idTitre}
                  idDescription={idTexte}
                  checked={etat[consentement.code]}
                  onChangement={basculer(consentement.code)}
                />
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-2">
          <Link
            href="/consentements"
            className="flex min-h-touch items-center text-14 text-accent-600"
          >
            Télécharger mes données
          </Link>
          <Link
            href="/compte/suppression"
            className="flex min-h-touch items-center text-14 text-accent-600"
          >
            Supprimer mon compte et mes pièces
          </Link>
          <p className="text-pretty text-13 text-ink-500">
            Historique des consentements conservé cinq ans, comme l&apos;exige la
            réglementation.
          </p>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-ink-300 bg-white px-4 py-3 md:static md:mx-0 md:w-72 md:flex-none md:border-0 md:p-0">
        {echec ? <BlocEchec echec={echec} /> : null}
        <Button
          pleineLargeur
          className="min-h-action"
          chargement={envoi}
          disabled={!lu || Object.keys(enAttente).length === 0}
          raisonDesactivation={
            !lu
              ? "Lecture de tes autorisations en cours."
              : Object.keys(enAttente).length === 0
                ? "Aucune autorisation n'a changé depuis le dernier enregistrement."
                : undefined
          }
          onClick={() => void enregistrer()}
        >
          Enregistrer
        </Button>
        <p aria-live="polite" className="text-center text-13 text-ink-500">
          {libelleActifs(etat)}
        </p>
      </div>
    </div>
  );
}
