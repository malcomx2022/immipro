/** Lettres factices stables, indépendantes de la rédaction du fournisseur testé. */
import { CAS_DE_REDACTION, Q } from "./jeu-d-essai";
import type { RemarqueProduite } from "@/domain/redaction/commande";
export const LETTRES_DE_REFERENCE = CAS_DE_REDACTION.map((cas) => ({
  id: cas.id,
  texte: `Madame, Monsieur,\n\n${Object.values(cas.reponses).join("\n\n")}\n\nSalutations respectueuses.`,
  incoherenceAttendue: cas.incoherenceAttendue,
}));
/** Témoins simulés avec les deux sources exactes ; le contrat L3 reste appliqué. */
export function avisDeReference(id: string): readonly RemarqueProduite[] {
  const cas = CAS_DE_REDACTION.find((c) => c.id === id)!;
  if (!cas.incoherenceAttendue) return [];
  const questions = id === "R03" ? [Q.diplome, Q.derniereAnnee] : [Q.financement, Q.attaches];
  return [
    {
      genre: "INCOHERENCE",
      titre: "Réponses contradictoires",
      corps: "Les deux réponses citées sont à vérifier.",
      ecarts: questions.map((source) => ({ source, valeur: cas.reponses[source]! })) as [
        { source: string; valeur: string },
        { source: string; valeur: string },
      ],
    },
  ];
}
