import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Recapitulatif } from "./Recapitulatif";
import { MonteeRefusee } from "./MonteeRefusee";
import { offreDeMontee } from "@/server/acces/montee";
import { formatMontant } from "@/lib/utils";
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

  /*
    Le passage à Dossier (S.88) n'a pas de prix sur la grille : c'est la
    différence avec ce que l'achat Essentiel a coûté, et seul le serveur
    connaît cet achat. Un dossier qui ne s'y prête pas reçoit la raison,
    pas un récapitulatif à zéro.
  */
  if (achat.type === "montee") {
    const offre = await offreDeMontee(tunnel.dossier.id, acteur.id);
    if (!offre.ouverte) {
      return <MonteeRefusee dossierId={tunnel.dossier.id} message={offre.message} />;
    }
    return (
      <Recapitulatif
        tunnel={tunnel}
        achat={achat}
        montee={offre.detail}
        deviseInitiale={offre.detail.devise}
      />
    );
  }

  const tarif = tarifDe(achat);
  if (!tarif) notFound();

  /*
    Un pack sur un dossier déjà couvert est un achat supplémentaire, au
    prix plein. Il reste possible, et l'écran le dit en ces termes : il
    ne doit pas passer pour une montée en gamme. Quand le passage à
    Dossier est ouvert, son prix est donné à côté.
  */
  let supplementaire: { passage: string | null } | undefined;
  if (achat.type === "pack" && tunnel.dejaOuvert) {
    const offre = await offreDeMontee(tunnel.dossier.id, acteur.id);
    supplementaire = {
      passage: offre.ouverte ? formatMontant(offre.detail.montant, offre.detail.devise) : null,
    };
  }

  return (
    <Recapitulatif
      tunnel={tunnel}
      achat={achat}
      tarif={tarif}
      deviseInitiale={devise === "EUR" || devise === "XOF" ? devise : tunnel.devise}
      supplementaire={supplementaire}
    />
  );
}
