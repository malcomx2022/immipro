/** REV11-L5 : noter ce que le produit peut publier, conserver la mesure canonique L2. */
import { mesurerLesJetons, type MesureDeJetons } from "@/domain/ia/usage";
import type { Lecture } from "@/server/dossiers/extracteur";
import type { Redaction, Relecture } from "@/server/redaction/adaptateur";
import type { AppelMesure } from "@/server/ia/appel";

export interface MesureDuBanc {
  etat: MesureDeJetons["etat"] | "NON_APPELE" | "SIMULATION";
  jetonsEntree: number | null;
  jetonsSortie: number | null;
  fournisseur: string | null;
  modele: string | null;
}
export function mesureDuBanc(r: { appel?: AppelMesure }): MesureDuBanc {
  // Les zéros de compatibilité d'un échec de transport ne sont pas une mesure.
  return r.appel
    ? {
        ...(r.appel.mesure ?? mesurerLesJetons(undefined, undefined)),
        fournisseur: r.appel.fournisseur,
        modele: r.appel.modele,
      }
    : {
        etat: "NON_APPELE",
        jetonsEntree: null,
        jetonsSortie: null,
        fournisseur: null,
        modele: null,
      };
}
const detailMesure = "mesure_incomplete : aucune publication automatique (L2)";
export function versObtenue(lu: Lecture) {
  const mesure = mesureDuBanc(lu);
  return lu.etat === "LUE" && mesure.etat === "CONNUE"
    ? {
        etat: "LUE" as const,
        pieceIdentifiee: lu.pieceIdentifiee,
        bruts: lu.bruts,
        jetonsEntree: mesure.jetonsEntree,
        jetonsSortie: mesure.jetonsSortie,
        mesure,
      }
    : {
        etat: "NON_LUE" as const,
        cause: lu.etat === "NON_LUE" ? lu.cause : "mesure_incomplete",
        jetonsEntree: mesure.jetonsEntree,
        jetonsSortie: mesure.jetonsSortie,
        mesure,
      };
}
export function versTexte(r: Redaction) {
  const mesure = mesureDuBanc(r);
  return {
    texte: r.etat === "ECRITE" && mesure.etat === "CONNUE" ? r.texte : null,
    detail:
      r.etat === "SANS_TEXTE"
        ? `${r.cause} — ${r.detail}`
        : mesure.etat === "CONNUE"
          ? null
          : detailMesure,
    ...mesure,
    mesure,
  };
}
export function versRemarques(r: Relecture) {
  const mesure = mesureDuBanc(r);
  return {
    remarques: r.etat === "RELUE" && mesure.etat === "CONNUE" ? r.remarques : null,
    detail:
      r.etat === "SANS_AVIS"
        ? `${r.motif ?? r.cause} — ${r.detail}`
        : mesure.etat === "CONNUE"
          ? null
          : detailMesure,
    ...mesure,
    mesure,
  };
}
