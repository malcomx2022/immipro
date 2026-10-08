"use client";

import Link from "next/link";
import { MENTION_ENCAISSEMENT_SUSPENDU, type SuspensionDuPaiement } from "@/domain/paiement/ouverture";
import { MENTION_FACTURATION_EN_ATTENTE, MENTION_IDENTITE_MANQUANTE } from "@/domain/facturation/facture";
import { useState } from "react";
import { documentsALire, reserveDeLAcceptation, type Publiees } from "@/domain/comptes/acceptation";
import { obstacleAuPaiement } from "@/domain/paiement/commande";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { LienNouvelOnglet } from "@/components/ui/LienNouvelOnglet";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import type { Tunnel } from "@/server/lecture/paiements";
import type { Devise } from "@/domain/payments/pricing";
import { corpsDAchat, type Achat, type Tarif } from "@/domain/payments/achat";
import { deroulement, mentionDuRail, mentionRailFerme } from "@/domain/payments/rail";
import { formatMontant } from "@/lib/utils";
import {
  CODE_MONTEE_DOSSIER,
  LIBELLE_MONTEE,
  ceQueLaMonteeOuvre,
  type DetailDuPrix,
} from "@/domain/payments/montee";

/**
 * $-02 — Récapitulatif.
 *
 * Deux règles tenues ici plutôt que par la relecture :
 *
 * - La case des conditions part décochée. Le prototype la cochait d'avance,
 *   sur l'écran même qui porte l'acceptation et la mention de non-garantie :
 *   une case pré-cochée n'est pas un consentement, et la règle produit du
 *   prototype l'interdit par ailleurs.
 * - Le montant est répété sur le bouton, en toutes lettres, avant tout
 *   déclenchement de débit.
 *
 * Échap revient au choix du pack sans débiter (règle clavier 5) : c'est le
 * lien « Retour », premier élément de l'écran.
 *
 * C'est l'unique écran qui ouvre une transaction. La route rend la
 * référence, et l'attente est rejointe avec elle : $-03 n'avait rien à
 * relever parce que personne ne lui donnait de quoi. Une seconde
 * soumission ne crée pas un second paiement — le serveur reprend celui qui
 * est en cours (RG-05, double soumission) —, et le bouton se verrouille
 * pendant l'appel plutôt que de compter sur cette reprise.
 *
 * ── Ce que l'écran reçoit, et pourquoi ce n'est plus trois chaînes ──
 *
 * `achat` porte la catégorie, `tarif` ce qui s'affiche. La conversion en
 * corps de requête est celle du domaine (`corpsDAchat`), exhaustive : ce
 * composant ne redevine plus la catégorie sur le code, ce qu'il faisait —
 * et il envoyait une consultation sous l'étiquette d'un pack, tout en
 * affichant le bon libellé et le bon prix.
 *
 * Aucun montant n'est écrit ici : le prix vient du tarif, que la page a
 * pris sur la grille et que le serveur relira sur la même grille.
 */
export interface RecapitulatifProps {
  tunnel: Tunnel;
  achat: Achat;
  /** Le tarif de la grille. Absent pour la montée, qui n'y figure pas. */
  tarif?: Tarif;
  deviseInitiale: Devise;
  /**
   * Le passage à Dossier (S.88) : le prix différentiel, calculé par le
   * serveur depuis l'achat Essentiel. Sa devise est celle de cet achat,
   * et elle ne se choisit pas.
   */
  montee?: DetailDuPrix;
  /**
   * Un pack acheté sur un dossier déjà couvert. C'est un achat
   * supplémentaire au prix plein, et l'écran le dit — il ne doit pas se
   * lire comme une montée en gamme. `passage` est le prix du passage à
   * Dossier quand il est possible, pour que le candidat compare.
   */
  supplementaire?: { passage: string | null };
  /** Les textes juridiques publiés, lus en base par la page (S.101). */
  publiees: Publiees;
  /**
   * Ce qui suspend le paiement réel de cette devise — conditions de vente
   * non publiées (03/10), facturation pas en place ou identité de
   * facturation manquante (M.C, 04/10). Nul en bac à sable.
   */
  suspension?: SuspensionDuPaiement | null;
}


/** Une phrase par suspension, la même que celle du refus serveur. */
const MENTION_SUSPENSION: Record<SuspensionDuPaiement, string> = {
  conditions: MENTION_ENCAISSEMENT_SUSPENDU,
  facturation: MENTION_FACTURATION_EN_ATTENTE,
  identite: MENTION_IDENTITE_MANQUANTE,
};

export function Recapitulatif({
  tunnel,
  achat,
  tarif,
  deviseInitiale,
  montee,
  supplementaire,
  publiees,
  suspension = null,
}: RecapitulatifProps) {
  const reserve = reserveDeLAcceptation(["conditions"], publiees);
  const conditionsALire = documentsALire(["conditions"], publiees)[0];
  const [conditions, setConditions] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  // La devise est figée dès la première transaction ouverte (RG-05, cas
  // limites) : elle se choisit sur $-01 et se lit ici, elle ne bascule plus.
  const devise = montee ? montee.devise : deviseInitiale;

  // La raison vient du domaine, comme sur $-01 : une phrase de refus écrite
  // deux fois est une phrase dont une copie se périme en silence.
  // Un rail fermé (`PAIEMENT_FOURNISSEURS`) ne se paie pas : l'adresse
  // peut porter `devise=EUR` pendant le pilote FedaPay (03/10/2026).
  const railFerme = !tunnel.devisesOuvertes.includes(devise);
  const obstacle = railFerme
    ? mentionRailFerme(devise)
    : suspension
      ? MENTION_SUSPENSION[suspension]
      : obstacleAuPaiement(conditions);
  const montant = formatMontant(montee ? montee.montant : (tarif?.prix[devise] ?? 0), devise);
  const libelle = montee ? LIBELLE_MONTEE : (tarif?.libelle ?? "");
  const autreDevise: Devise = devise === "XOF" ? "EUR" : "XOF";

  async function payer() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ reference: string; url: string }>("/api/paiements", {
      corps: {
        dossierId: tunnel.dossier.id,
        achat: corpsDAchat(achat),
        devise,
      },
    });
    if (resultat.ok) {
      /*
        Le navigateur quitte l'application pour la page hébergée du
        prestataire. `router.push` ne conviendrait pas : ce n'est pas une
        route d'ici. Le serveur a déjà vérifié cette adresse — https, et
        sur le domaine du fournisseur — avant de la rendre.

        Le bouton reste désactivé : la page va disparaître, et la rendre
        de nouveau cliquable pendant la navigation invite au second clic.
      */
      window.location.assign(resultat.donnees.url);
      return;
    }
    setEnvoi(false);
    setEchec(resultat.echec);
  }

  return (
    <div className="mx-auto flex w-full max-w-gabarit flex-col gap-6 px-4 pb-8 md:flex-row md:gap-12 md:px-12 md:py-6">
      <div className="flex min-w-0 flex-1 flex-col gap-5 md:max-w-decision">
        <Link
          href={`/paiement/pack?dossier=${tunnel.dossier.id}`}
          className="text-14 font-semibold text-ink-900"
        >
          Retour
        </Link>
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Vérifie avant de payer
        </h1>

        <div className="flex flex-col gap-1.5 rounded-lg bg-ink-100 p-5">
          <p className="text-14 text-ink-500">Montant à payer</p>
          <p className="text-32 font-semibold text-ink-900">{montant}</p>
          <p className="text-pretty text-14 text-ink-500">
            {mentionDuRail(devise)}{" "}
            {montee
              ? "La différence se paie dans la devise de ton achat Essentiel : aucune conversion n'est faite."
              : `La grille en ${autreDevise === "XOF" ? "francs CFA" : "euros"} est distincte, ce n'est pas une conversion.`}
          </p>
        </div>

        {montee ? (
          <section className="flex flex-col gap-2 rounded-lg border border-ink-300 p-5">
            <h2 className="text-16 font-semibold text-ink-900">Tu paies la différence</h2>
            <dl className="flex flex-col text-14">
              {[
                { intitule: "Dossier aujourd'hui", valeur: formatMontant(montee.prixDossier, devise) },
                {
                  intitule: "Déjà payé pour Essentiel",
                  valeur: `− ${formatMontant(montee.dejaPaye, devise)}`,
                },
                { intitule: "À payer", valeur: montant },
              ].map((ligne) => (
                <div key={ligne.intitule} className="flex justify-between gap-4 py-1.5">
                  <dt className="text-ink-700">{ligne.intitule}</dt>
                  <dd className="text-right font-medium text-ink-900">{ligne.valeur}</dd>
                </div>
              ))}
            </dl>
            <ul className="flex flex-col gap-1.5 pt-1">
              {ceQueLaMonteeOuvre().map((ligne) => (
                <li key={ligne} className="text-pretty text-14 text-ink-700">
                  {ligne}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {supplementaire ? (
          <section className="flex flex-col gap-1.5 rounded-lg border border-ink-300 p-4">
            <h2 className="text-16 font-semibold text-ink-900">
              Ce dossier est déjà couvert par un pack
            </h2>
            <p className="text-pretty text-14 text-ink-700">
              Cet achat est un pack supplémentaire, au prix plein. Ce n&apos;est pas
              un passage à Dossier : ton pack actuel et ses analyses restent, et
              celui-ci s&apos;y ajoute.
            </p>
            {supplementaire.passage ? (
              <Link
                href={`/paiement/recapitulatif?dossier=${tunnel.dossier.id}&achat=${CODE_MONTEE_DOSSIER}`}
                className="flex min-h-touch items-center text-14 font-medium text-accent-600"
              >
                Passer plutôt à Dossier pour {supplementaire.passage}
              </Link>
            ) : null}
          </section>
        ) : null}

        <dl className="flex flex-col">
          {[
            { intitule: "Achat", valeur: libelle },
            {
              intitule: "Dossier",
              valeur: `${tunnel.dossier.pays} — ${tunnel.dossier.intitule}`,
            },
            { intitule: "Valable jusqu'à", valeur: "la clôture du dossier" },
            // La ligne du numéro disparaît quand le compte n'en porte pas :
            // ImmiPro ne conserve pas le portefeuille qui paie, et un tiret
            // à cet endroit se lirait comme une donnée perdue.
            ...(tunnel.telephone
              ? [{ intitule: "Numéro Mobile Money", valeur: tunnel.telephone }]
              : []),
          ].map((ligne) => (
            <div
              key={ligne.intitule}
              className="flex justify-between gap-4 border-b border-ink-300 py-3.5 text-14 last:border-b-0"
            >
              <dt className="text-ink-500">{ligne.intitule}</dt>
              <dd className="text-right font-medium text-ink-900">{ligne.valeur}</dd>
            </div>
          ))}
        </dl>

        {/* Vers le champ lui-même : le profil en a d'autres (03/10/2026). */}
        <Link
          href="/profil#telephone"
          className="flex min-h-touch items-center self-start rounded-full border border-ink-300 px-3.5 text-14 text-ink-900 hover:bg-ink-100"
        >
          {tunnel.telephone ? "Changer de numéro" : "Renseigner mon numéro"}
        </Link>

        <div className="flex flex-col gap-1.5 rounded-md bg-accent-50 p-4">
          <p className="text-14 font-semibold text-accent-700">Ce qui va se passer</p>
          <p className="text-pretty text-14 text-accent-700">
            {deroulement(devise)}
          </p>
        </div>

        <p className="text-pretty text-13 text-ink-500">
          Montant débité une seule fois. Les frais de demande de visa se paient
          directement à l&apos;administration, au moment du dépôt.
        </p>
      </div>

      {/* N.C, tranché le 20/09/2026 — la zone d'action contient son propre
          prérequis.

          La case vivait en fin de contenu, et la barre collante la
          recouvrait : mesurée à 390 px, la barre occupait 715→844 et la
          case 757→865. L'élément qui déverrouille le bouton était donc
          exactement sous le bouton.

          Elle est maintenant dans la zone d'action, immédiatement
          au-dessus. Aucune marge compensatoire : une valeur calée sur une
          hauteur de barre se démentirait au premier message d'échec, qui
          la fait grandir — et c'est justement le moment où le candidat
          cherche la case. La structure le garantit, pas une constante.

          Et la barre n'est plus collante ici, parce que mesurée elle ne
          tenait pas : case comprise, elle occupait 245 px, soit 29 % d'un
          écran de 390 × 844 et **38 % d'un 360 × 640** — avant le bloc
          d'échec, qui la fait grandir au pire moment. Garder la barre
          collante était secondaire ; rendre son prérequis lisible ne
          l'était pas. Sur écran large, la colonne d'action reste en place
          comme avant. */}
      <div className="-mx-4 flex flex-col gap-2 border-t border-ink-300 bg-white px-4 py-3 md:mx-0 md:w-72 md:flex-none md:self-start md:border-0 md:p-0">
        {echec ? <BlocEchec echec={echec} annonce /> : null}
        {suspension && !railFerme ? (
          <p role="status" className="text-pretty text-14 text-ink-700">
            {MENTION_SUSPENSION[suspension]}
            {suspension === "identite" ? (
              <>
                {" "}
                <Link href="/profil#facturation" className="text-accent-600 underline">
                  Renseigner ma facturation
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {railFerme ? (
          <p role="status" className="text-pretty text-14 text-ink-700">
            {mentionRailFerme(devise)}{" "}
            {montee ? null : (
              <Link
                href={`/paiement/pack?dossier=${tunnel.dossier.id}`}
                className="text-accent-600 underline"
              >
                Revenir au choix du pack
              </Link>
            )}
          </p>
        ) : null}
        {/* La case nomme une page que le registre déclare absente, et vers
            laquelle rien ne mène. C'est l'écran où l'on paie : y taire
            l'absence est le pire endroit pour le faire.

            La phrase vient **avant** la case, et non après : N.C exige que
            rien ne s'intercale entre le consentement et le bouton qu'il
            déverrouille, et on apprend de toute façon mieux l'absence avant
            de cocher qu'après. */}
        {reserve ? <p className="text-pretty text-13 text-ink-500">{reserve}</p> : null}
        {conditionsALire ? (
          <p className="text-pretty text-13 text-ink-500">
            À lire avant de cocher :{" "}
            <LienNouvelOnglet href={conditionsALire.adresse} className="text-accent-600 underline">
              {conditionsALire.nom}
            </LienNouvelOnglet>
            .
          </p>
        ) : null}
        <Checkbox
          libelle="J'accepte les conditions d'utilisation et je comprends qu'ImmiPro prépare mon dossier sans garantir la décision de l'administration."
          checked={conditions}
          onChangement={setConditions}
        />
        <Button
          pleineLargeur
          className="min-h-action"
          chargement={envoi}
          disabled={obstacle !== null}
          raisonDesactivation={obstacle ?? undefined}
          onClick={() => void payer()}
        >
          Payer {montant}
        </Button>
        <p className="text-center text-13 text-ink-500">
          Aucun montant n&apos;est débité avant ta confirmation
        </p>
      </div>
    </div>
  );
}
