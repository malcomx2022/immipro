import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Recapitulatif } from "./Recapitulatif";
import { tunnelDuPaiement } from "@/server/lecture/paiements";
import { exigerCandidat } from "@/server/securite/page";
import {
  achatDuParametre,
  ouvrableDepuisLeRecapitulatif,
  tarifDe,
} from "@/domain/payments/achat";

/**
 * $-02 — Récapitulatif. WF-05.
 *
 * Le montant est répété juste avant le déclenchement du paiement, et la case
 * des conditions n'est pas cochée d'avance : c'est l'écran qui porte
 * l'acceptation et la mention de non-garantie.
 *
 * `achat` porte soit le code d'un pack, soit `recharge` — la recharge
 * d'analyses n'est pas un pack et ne se choisit donc pas sur $-01, mais
 * elle s'achète, et elle passe par ce même écran. Le montant vient de la
 * grille tarifaire et n'est jamais recopié : c'est le serveur qui le
 * recalculera à la création, et les deux doivent concorder.
 *
 * Le paramètre est relu en catégorie par le domaine, et la catégorie
 * descend telle quelle dans l'écran. Il la redevinait sur le code, et se
 * trompait de branche pour la consultation.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Récapitulatif",
  description: "Vérifie le montant et le moyen de paiement avant de confirmer.",
};

export default async function PageRecapitulatif({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string; achat?: string; devise?: string }>;
}) {
  const { dossier, achat: parametre, devise } = await searchParams;
  const adresse = `/paiement/recapitulatif?dossier=${encodeURIComponent(dossier ?? "")}`;
  const acteur = await exigerCandidat(dossier ? adresse : "/paiement/recapitulatif");
  if (!dossier || !parametre) notFound();

  const tunnel = await tunnelDuPaiement(dossier, acteur.id).catch(() => null);
  if (!tunnel) notFound();

  const achat = achatDuParametre(parametre);
  // Un code d'achat inconnu n'est pas un montant à zéro : c'est une adresse
  // fabriquée, et l'écran ne doit pas proposer de payer quoi que ce soit.
  //
  // Une consultation non plus, et pour une autre raison : elle se paie
  // depuis T-05, où un créneau est tenu. Ouverte ici, elle ne citerait
  // aucun rendez-vous, et la notification signée n'aurait rien à
  // confirmer (`ouvrableDepuisLeRecapitulatif`).
  if (!achat || !ouvrableDepuisLeRecapitulatif(achat)) notFound();

  const tarif = tarifDe(achat);
  if (!tarif) notFound();

  return (
    <Recapitulatif
      tunnel={tunnel}
      achat={achat}
      tarif={tarif}
      deviseInitiale={devise === "EUR" || devise === "XOF" ? devise : tunnel.devise}
    />
  );
}
