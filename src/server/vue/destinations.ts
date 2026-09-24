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
 * raison inventée. Quand l'autorité ne publie **aucun** des deux montants,
 * il est nul aussi — et pour la raison inverse : un zéro se lirait comme
 * une gratuité, et ferait de cette destination la moins chère de toutes.
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
    montantsPublies: Boolean(p.frais_scolarite || p.preuve_fonds),
    delaiTraitementJours: p.delai_traitement_jours?.max ?? null,
    permisEmployeurRequis: p.travail_autorise.permis_employeur_requis,
    dispositifApresDiplome: p.apres_etudes?.dispositif ?? null,
    dureeApresDiplomeMois: p.apres_etudes?.duree_mois ?? null,
  };
}

function coutPremiereAnnee(p: ReturnType<typeof payload>): number | null {
  /*
    Rien de publié n'est pas un coût de zéro — I.C.

    Les deux montants absents donnaient `0 + 0 = 0`, et le simulateur
    lisait ce zéro comme un fait : la composante budget était pesée, le
    quotient `budget / 0` valait l'infini, la destination obtenait la note
    de budget maximale, et l'écran l'annonçait en raison favorable.
    Constaté en exécution sur la procédure kennismigrant, dont l'autorité
    ne publie ni frais de scolarité ni ressources à prouver :

        1. Pays-Bas — coût lu 0 · budget pesé 20 sur 20
             + Première année estimée à 0 F, 3 000 000 F de marge sur
               ton budget.

    Le comparateur dit « Non publié » de la même destination, et la fiche
    « Montants non publiés par l'autorité ». Le classement en faisait la
    moins chère de toutes. C'est la règle que le classement énonce
    lui-même, appliquée à l'envers : « `null`, et non une valeur moyenne :
    la composante est retirée du calcul, pas remplie au jugé » — et zéro
    n'est pas une moyenne, c'est la valeur la plus flatteuse possible.

    Un seul des deux montants publié reste une somme : l'autre vaut alors
    zéro pour de bon — une scolarité gratuite est un fait, pas une absence.
  */
  if (!p.frais_scolarite && !p.preuve_fonds) return null;

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
