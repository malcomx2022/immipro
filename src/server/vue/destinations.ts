import type { VisaRule } from "@prisma/client";
import { payload } from "@/server/acces/regles";
import { editorialDe } from "@/lib/contenu/destinations";
import { versXOF, type DeviseSource } from "@/domain/format/change";
import type { DestinationEvaluable } from "@/domain/simulateur/classement";

/**
 * Règle du référentiel vers destination évaluable par le simulateur.
 *
 * Le coût de la première année additionne la scolarité minimale et les
 * ressources à prouver ramenées à douze mois : c'est ce que la question de
 * budget interroge — « frais de scolarité, logement et vie courante ». Les
 * ressources exigées tiennent lieu de coût de la vie, puisque c'est
 * précisément ce que l'autorité estime nécessaire pour vivre sur place.
 *
 * Quand une monnaie n'a pas de parité sûre, le coût est nul et non pas
 * approché : une comparaison fausse écarterait une destination pour une
 * raison inventée.
 */
export function versEvaluable(regle: VisaRule): DestinationEvaluable | null {
  const edito = editorialDe(regle.countryCode, regle.visaType);
  if (!edito) return null;
  const p = payload(regle);

  return {
    code: regle.countryCode,
    slug: edito.slug,
    pays: edito.pays,
    categorie: regle.category,
    niveauLangueMin: p.niveau_langue_min,
    languesAcceptees: p.langues_acceptees,
    coutPremiereAnneeXOF: coutPremiereAnnee(p),
    delaiTraitementJours: p.delai_traitement_jours?.max ?? null,
    permisEmployeurRequis: p.travail_autorise.permis_employeur_requis,
    dispositifApresDiplome: p.apres_etudes?.dispositif ?? null,
    dureeApresDiplomeMois: p.apres_etudes?.duree_mois ?? null,
  };
}

function coutPremiereAnnee(p: ReturnType<typeof payload>): number | null {
  const scolarite = p.frais_scolarite
    ? versXOF(
        p.frais_scolarite.periodicite === "mensuel"
          ? p.frais_scolarite.min * 12
          : p.frais_scolarite.min,
        p.frais_scolarite.devise as DeviseSource,
      )
    : 0;
  if (scolarite === null) return null;

  const fonds = p.preuve_fonds
    ? versXOF(
        p.preuve_fonds.periodicite === "mensuel"
          ? p.preuve_fonds.valeur * 12
          : p.preuve_fonds.valeur,
        p.preuve_fonds.devise as DeviseSource,
      )
    : 0;
  if (fonds === null) return null;

  return scolarite + fonds;
}
