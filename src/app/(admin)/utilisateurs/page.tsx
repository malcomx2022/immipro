import type { Metadata } from "next";
import { Utilisateurs } from "./Utilisateurs";
import { COMPTES } from "@/lib/contenu/backoffice";

/** B-03 — Utilisateurs. WF-15. */
export const metadata: Metadata = {
  title: "Utilisateurs",
  description: "Comptes, consentements et demandes de suppression.",
};

export default function PageUtilisateurs() {
  return <Utilisateurs comptes={COMPTES} />;
}
