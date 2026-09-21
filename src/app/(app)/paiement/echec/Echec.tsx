"use client";

import Image from "next/image";
import Link from "next/link";
import { LienBouton } from "@/components/ui/LienBouton";
import { echecPourMotif, motifDeLEchec, type MotifEchec } from "@/domain/paiement/echec";
import type { PaiementEnCours } from "@/server/lecture/paiements";
import { formatMontant } from "@/lib/utils";
import { actionVersLAutreGrille, mentionDeLAutreGrille, railDe } from "@/domain/payments/rail";
import { achatDepuisLeCode, ouvrableDepuisLeRecapitulatif } from "@/domain/payments/achat";
import { corpsDeLEtat } from "@/domain/consultants/tenue";

/**
 * $-05 — Échec ou expiration.
 *
 * Le motif vient de l'opérateur, transmis dans l'adresse. Sans lui, c'est
 * l'état de la transaction qui le nomme : annoncer un refus bancaire à tort
 * est la pire erreur de cet écran, mais annoncer un délai dépassé sur un
 * refus reçu en deux secondes en est une autre — et celle-là envoie
 * vérifier ce qui n'est pas en cause.
 *
 * Les trois « autres moyens de paiement » du prototype — Moov Money, carte
 * bancaire, autre numéro — ne correspondent à rien de modélisé : le rail
 * suit la devise, et il n'y a pas de choix d'opérateur à faire (N.A,
 * tranché pour la V1). Ils cèdent la place à la seule alternative que le
 * produit sait offrir, et qui en est une : changer de grille.
 *
 * Les phrases viennent de `domain/payments/rail`. Écrites ici, elles
 * l'étaient aussi au récapitulatif et à la page des packs, chacune à sa
 * façon — et c'est ainsi que les pastilles ont survécu à la correction de
 * cet écran-ci.
 *
 * ── Une consultation ne se réessaie pas ici ─────────────────────────
 *
 * « Réessayer le paiement » renvoyait au récapitulatif avec le code de
 * l'achat, quel qu'il soit. Pour une consultation, cela rouvrait un
 * paiement sans créneau : le rendez-vous tenu a été supprimé avec
 * l'échec, et la notification signée n'aurait plus rien à confirmer. Le
 * candidat aurait payé une consultation sans horaire ni consultant.
 *
 * C'est le domaine qui dit quels achats le récapitulatif sait ouvrir
 * (`ouvrableDepuisLeRecapitulatif`), et la consultation repart d'où elle
 * vient : l'annuaire, où un créneau se tient de nouveau.
 */
const MOTIFS: readonly MotifEchec[] = [
  "delai_depasse",
  "solde_insuffisant",
  "refus_operateur",
  "notification_absente",
  "annule_par_le_payeur",
  "moyen_invalide",
  "incident_technique",
];

const estMotif = (valeur: string | null): valeur is MotifEchec =>
  valeur !== null && (MOTIFS as readonly string[]).includes(valeur);

export function Echec({
  paiement,
  motif,
}: {
  paiement: PaiementEnCours;
  motif: string | null;
}) {
  /**
   * La cause conservée d'abord, l'adresse ensuite, l'état en dernier.
   *
   * Ce que l'émetteur a répondu est désormais en base (N.B) et prime sur
   * tout : c'est le seul élément qui distingue un solde insuffisant d'une
   * panne du prestataire. L'adresse reste acceptée pour un motif qu'un
   * retour de fournisseur transmettrait sans passer par le webhook, et
   * l'état ferme la marche.
   */
  const retenu: MotifEchec = paiement.cause
    ? motifDeLEchec(paiement.cause, paiement.statut)
    : estMotif(motif)
      ? motif
      : motifDeLEchec(null, paiement.statut);
  const montant = formatMontant(paiement.montant, paiement.devise);
  // Le rail décide du vocabulaire : on ne dit pas « compose le *880# » à qui
  // paie par carte, et le refus sans raison nomme la banque plutôt que
  // l'opérateur (O.A).
  const echec = echecPourMotif(retenu, montant, paiement.telephone, railDe(paiement.devise));

  const dossier = paiement.dossierId;
  const achat = achatDepuisLeCode(paiement.achatCode);
  const reessai =
    dossier && achat && ouvrableDepuisLeRecapitulatif(achat)
      ? `/paiement/recapitulatif?dossier=${dossier}&achat=${paiement.achatCode}&devise=${paiement.devise}`
      : null;
  const autreDevise = paiement.devise === "XOF" ? "EUR" : "XOF";
  const estUnPack = achat?.type === "pack";
  /*
    Le créneau a été libéré avec l'échec — c'est ce que fait
    `libererLaTenue`. La phrase vient du domaine de la tenue, celui-là
    même qui décrit l'état : elle dit ce qui a été libéré, et distingue
    le refus du délai dépassé.
  */
  const creneauLibere =
    achat?.type === "consultation" && dossier
      ? {
          phrase: corpsDeLEtat(paiement.statut === "EXPIREE" ? "LIBERE" : "ECHOUE"),
          adresse: `/consultants?dossier=${dossier}`,
        }
      : null;

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-4 pb-8 md:py-8">
      <div className="flex flex-col items-center gap-5 text-center">
        <Image
          src="/illustrations/paiement-echoue.svg"
          alt=""
          width={260}
          height={163}
          unoptimized
        />
        <div className="flex flex-col gap-2">
          <h1
            id="contenu"
            tabIndex={-1}
            className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
          >
            {echec.titre}
          </h1>
          <p className="text-pretty text-16 text-ink-700">{echec.corps}</p>
        </div>
      </div>

      <section className="flex flex-col gap-2 rounded-lg bg-ink-100 p-5">
        <h2 className="text-14 font-semibold text-ink-900">Ce que tu peux vérifier</h2>
        {echec.verifications.map((verification) => (
          <p key={verification} className="text-pretty text-14 text-ink-700">
            {verification}
          </p>
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-ink-300 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-16 font-semibold text-ink-900">
            Le pack Découverte reste gratuit
          </h2>
          <p className="text-pretty text-14 text-ink-700">
            Tu gardes le simulateur, les fiches destination et l&apos;aperçu de ta
            checklist, sans analyse de pièces.
          </p>
        </div>
        <LienBouton
          href={dossier ? `/dossiers/${dossier}` : "/tableau-de-bord"}
          variante="secondaire"
          pleineLargeur
        >
          Continuer en Découverte
        </LienBouton>
      </section>

      {creneauLibere ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-14 font-semibold text-ink-900">Ton créneau</h2>
          <p className="text-pretty text-14 text-ink-700">{creneauLibere.phrase}</p>
          <LienBouton
            href={creneauLibere.adresse}
            pleineLargeur
            className="min-h-action"
          >
            Choisir un créneau
          </LienBouton>
        </section>
      ) : null}

      {reessai ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-14 font-semibold text-ink-900">Autre moyen de paiement</h2>
          <p className="text-pretty text-14 text-ink-700">
            {mentionDeLAutreGrille(paiement.devise)}
          </p>
          <LienBouton
            href={`${reessai.replace(`devise=${paiement.devise}`, `devise=${autreDevise}`)}`}
            variante="secondaire"
            className="self-start"
          >
            {actionVersLAutreGrille(paiement.devise)}
          </LienBouton>
        </section>
      ) : null}

      <p className="text-pretty text-13 text-ink-500">
        Aucun montant n&apos;a été débité. Si tu as reçu un message de débit,
        écris-nous avec la référence{" "}
        <span className="font-mono text-ink-700">{paiement.reference}</span>.
      </p>

      <div className="flex flex-col gap-2">
        {reessai ? (
          <LienBouton href={reessai} pleineLargeur className="min-h-action">
            Réessayer le paiement
          </LienBouton>
        ) : null}
        <p className="text-center text-13 text-ink-500">
          {paiement.achat} · {montant}
        </p>
        {/* Seul un pack se change. Une recharge n'est pas un pack, et
            l'écran des packs refuserait un dossier déjà ouvert. */}
        {dossier && estUnPack ? (
          <Link
            href={`/paiement/pack?dossier=${dossier}`}
            className="flex min-h-touch items-center justify-center text-14 text-ink-700"
          >
            Changer de pack
          </Link>
        ) : null}
      </div>
    </div>
  );
}
