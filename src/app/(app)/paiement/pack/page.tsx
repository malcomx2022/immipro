import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ChoixDuPack } from "./ChoixDuPack";
import { PasserADossier } from "./PasserADossier";
import { offreDeMontee } from "@/server/acces/montee";
import { tunnelDuPaiement } from "@/server/lecture/paiements";
import { exigerCandidat } from "@/server/securite/page";

/**
 * $-01 — Choix du pack. WF-05.
 *
 * La mise en avant vient de `pricing.ts` et ne présélectionne rien : un cadre
 * n'est pas un choix fait à la place du candidat. Les frais versés à
 * l'administration sont annoncés comme non inclus, sur l'écran qui parle
 * d'argent.
 *
 * L'écran ouvre **un** dossier, et le nomme. Sans lui, il n'y a rien à
 * ouvrir : il affichait « Pays-Bas — séjour études » pour tout le monde, et
 * « le Bénin » comme pays du compte. Un dossier dont le pack est déjà payé
 * ne repasse pas par ici — un second achat serait un second débit —, sauf
 * pour passer d'Essentiel à Dossier au prix de la différence (S.88).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Choix du pack",
  description: "Un paiement unique, valable jusqu'à la clôture du dossier.",
};

export default async function PagePack({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string }>;
}) {
  const { dossier } = await searchParams;
  const acteur = await exigerCandidat(
    dossier ? `/paiement/pack?dossier=${encodeURIComponent(dossier)}` : "/paiement/pack",
  );
  if (!dossier) notFound();

  const tunnel = await tunnelDuPaiement(dossier, acteur.id).catch(() => null);
  if (!tunnel) notFound();
  if (tunnel.dejaOuvert) {
    /*
      Un dossier déjà couvert ne rachète pas de pack ici. S'il est couvert
      par Essentiel, l'écran propose le passage à Dossier au prix de la
      différence, à côté de la recharge — deux gestes distincts (S.88).
      Sinon, le candidat retourne à son dossier, comme avant.
    */
    const offre = await offreDeMontee(tunnel.dossier.id, acteur.id);
    if (offre.ouverte) return <PasserADossier tunnel={tunnel} detail={offre.detail} />;
    redirect(`/dossiers/${tunnel.dossier.id}`);
  }

  return <ChoixDuPack tunnel={tunnel} />;
}
