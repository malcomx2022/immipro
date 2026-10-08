"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { BasculeDeDevise } from "@/components/ui/BasculeDeDevise";
import { LienBouton } from "@/components/ui/LienBouton";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { PACKS, RECHARGE_ANALYSES, type Devise } from "@/domain/payments/pricing";
import { obstacleAuRecapitulatif } from "@/domain/paiement/commande";
import {
  PRECISION_MOBILE_MONEY,
  moyenDeLaGrille,
  railDe,
  mentionRailFerme,
} from "@/domain/payments/rail";
import type { Tunnel } from "@/server/lecture/paiements";
import { formatMontant } from "@/lib/utils";

/**
 * $-01 — Choix du pack.
 *
 * Aucun pack n'est retenu au départ : le prototype démarrait sur Essentiel
 * présélectionné, ce qui fait un choix à la place du candidat sur l'écran
 * qui débite. La mise en avant est portée par `misEnAvant`, et `RadioGroup`
 * l'écrit en toutes lettres — elle était « visuelle », c'est-à-dire un
 * cadre coloré.
 *
 * ── Deux packs sur trois n'expliquaient rien ────────────────────────
 *
 * La description n'était donnée qu'au pack conseillé. Rendu avant
 * correction, l'écran disait :
 *
 *     Essentiel · 5 000 F
 *     Dossier · 15 000 F     Couvre l'ensemble des pièces exigées…
 *     Dossier Pro · 45 000 F
 *
 * Pro coûte trois fois Dossier et ne disait rien de ce qu'il apporte —
 * alors que la grille écrit sa phrase, et qu'un test vérifie que les trois
 * en portent une. Le candidat devait deviner, ou quitter le tunnel pour la
 * page publique des tarifs, qui les détaille toutes les trois.
 *
 * La description servait en fait à deux choses : décrire le pack, et
 * signaler par sa seule présence lequel est conseillé. Séparer les deux
 * libère la place.
 *
 * Les trois packs forment un seul arrêt de tabulation — flèches, Origine et
 * Fin — tenu par `RadioGroup` (règle clavier 4).
 *
 * L'écran ne débite pas : il retient un pack et passe au récapitulatif, qui
 * est le seul à répéter le montant avant le débit. « Continuer » est donc un
 * lien, pas un bouton qui appelle — ce qui le rend aussi ouvrable dans un
 * nouvel onglet, et survivable à un retour arrière.
 */
export function ChoixDuPack({ tunnel }: { tunnel: Tunnel }) {
  const [devise, setDevise] = useState<Devise>(tunnel.devise);
  const [choisi, setChoisi] = useState<string | null>(null);

  const pack = PACKS.find((p) => p.code === choisi) ?? null;
  // La raison vient du domaine : elle y était déjà, et l'écran la réécrivait
  // à l'identique. Deux copies d'une même phrase finissent par diverger, et
  // c'est la copie tenue par un test qui était la morte.
  const obstacle = obstacleAuRecapitulatif(pack);
  const prix = (montants: Record<Devise, number>) =>
    formatMontant(montants[devise], devise);

  return (
    <div className="mx-auto flex w-full max-w-gabarit flex-col gap-6 px-4 pb-8 md:flex-row md:gap-12 md:px-12 md:py-6">
      <div className="flex min-w-0 flex-1 flex-col gap-5 md:max-w-decision">
        <Link
          href={`/dossiers/${tunnel.dossier.id}`}
          className="text-14 font-semibold text-ink-900"
        >
          Mon dossier
        </Link>

        <div className="flex flex-col gap-2">
          <h1
            id="contenu"
            tabIndex={-1}
            className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
          >
            Ouvre ton dossier
          </h1>
          <p className="text-pretty text-16 text-ink-700">
            {tunnel.dossier.pays} — {tunnel.dossier.intitule}. Un paiement
            unique, valable jusqu&apos;à la clôture du dossier. Pas
            d&apos;abonnement, pas de reconduction.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {/* Seules les devises dont le rail est ouvert se proposent :
              pendant le pilote FedaPay, l'euro menait à un paiement par
              carte que rien ne pouvait ouvrir (03/10/2026). */}
          <BasculeDeDevise
            devises={tunnel.devisesOuvertes}
            devise={devise}
            onChangement={setDevise}
          />
          {/* Le pays du compte, et non « le Bénin » écrit en dur : un compte
              sans pays renseigné n'a pas de déduction à annoncer. */}
          <p className="text-13 text-ink-500">
            {tunnel.devisesOuvertes.length < 2
              ? mentionRailFerme(devise === "XOF" ? "EUR" : "XOF")
              : tunnel.paysConnu
                ? "Devise déduite du pays de ton compte. Tu peux la changer."
                : "Devise par défaut : ton compte ne porte pas de pays. Tu peux la changer."}
          </p>
        </div>

        <RadioGroup
          libelle="Choix du pack"
          valeur={choisi}
          onChangement={setChoisi}
          options={PACKS.map((p) => ({
            valeur: p.code,
            libelle: `${p.libelle} · ${prix(p.prix)}`,
            description: p.justification,
            misEnAvant: p.misEnAvant,
          }))}
        />

        {/* La recharge n'est pas un pack : elle ne s'achète pas ici. */}
        <div className="flex flex-col gap-1 rounded-lg border border-dashed border-ink-300 p-4">
          <p className="text-15 font-semibold text-ink-900">
            La recharge d&apos;analyses n&apos;est pas un pack
          </p>
          <p className="text-pretty text-14 text-ink-700">
            {prix(RECHARGE_ANALYSES.prix)}, achetés depuis un dossier déjà ouvert
            quand son quota est épuisé. Elle n&apos;ouvre pas de destination et ne
            s&apos;achète pas ici.
          </p>
        </div>

        {/* N.A — la section offrait trois pastilles, « MTN MoMo · Moov Money
            · Carte bancaire », comme s'il y avait à choisir. Le rail suit la
            devise, et le candidat vient de la choisir juste au-dessus : la
            section répond donc à sa question — par quoi vais-je payer ? —
            au lieu de proposer une commande qui n'existe pas. */}
        <section className="flex flex-col gap-2 rounded-lg bg-ink-100 p-5">
          <h2 className="text-16 font-semibold text-ink-900">Moyen de paiement</h2>
          <p className="text-pretty text-14 text-ink-700">{moyenDeLaGrille(devise)}</p>
          {railDe(devise) === "MOBILE_MONEY" ? (
            <p className="text-pretty text-14 text-ink-700">{PRECISION_MOBILE_MONEY}</p>
          ) : null}
          <p className="text-pretty text-13 text-ink-500">
            Les frais de demande versés à l&apos;administration ne sont pas inclus
            et ne passent jamais par ImmiPro.
          </p>
        </section>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-ink-300 bg-white px-4 py-3 md:static md:mx-0 md:w-72 md:flex-none md:self-start md:border-0 md:p-0">
        {pack ? (
          <LienBouton
            href={`/paiement/recapitulatif?dossier=${tunnel.dossier.id}&achat=${pack.code}&devise=${devise}`}
            pleineLargeur
            className="min-h-action"
          >
            Continuer avec {pack.libelle}
          </LienBouton>
        ) : (
          <Button
            pleineLargeur
            className="min-h-action"
            disabled
            raisonDesactivation={obstacle ?? undefined}
          >
            Continuer
          </Button>
        )}
        <p className="text-center text-13 text-ink-500">
          {pack ? `${prix(pack.prix)} · paiement unique` : "Aucun pack retenu"}
        </p>
      </div>
    </div>
  );
}
