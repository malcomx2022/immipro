import type { Dossier } from "@/domain/dossiers/dossier";
import { ALLEMAGNE, PAYS_BAS } from "./destinations";

/**
 * Dossiers de démonstration — provisoires, comme les fiches destination.
 *
 * Ils viendront de la base une fois le schéma dérivé de DOC-11. Les écrans ne
 * connaissent que les types du domaine : seul ce fichier changera.
 *
 * La complétude est déjà exprimée en palier et en compteurs : il n'y a plus
 * de note sur cent à convertir le jour où la lecture passe en base.
 */
export const DOSSIERS: readonly Dossier[] = [
  {
    id: "nl-4471",
    destination: PAYS_BAS,
    statut: "ACTIF",
    depotVise: "2027-01-15",
    completude: {
      palier: "INCOMPLET",
      ready: false,
      missing: [],
      compteurs: { obligatoiresManquantes: 1, facultativesManquantes: 2, conformes: 5 },
    },
    prochaineAction:
      "Remplacer ton passeport, sa validité est trop courte de deux mois.",
  },
  {
    id: "de-8820",
    destination: ALLEMAGNE,
    statut: "BROUILLON",
    completude: {
      palier: "INCOMPLET",
      ready: false,
      missing: [],
      compteurs: { obligatoiresManquantes: 8, facultativesManquantes: 1, conformes: 0 },
    },
    prochaineAction: "Fixer ta date de dépôt pour générer l'échéancier.",
  },
];

/** Alerte de changement de règle affichée sur C-01 (INV-8, WF-14). */
export const ALERTE_REGLE = {
  titre: "Une règle a changé pour l'Allemagne",
  texte:
    "Le montant du compte bloqué passe à 11 904 € au 1er janvier 2027. Ton dossier n'est pas encore concerné.",
  action: "Voir ce qui change",
} as const;
