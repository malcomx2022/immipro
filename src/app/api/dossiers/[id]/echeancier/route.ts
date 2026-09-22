import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { echeancierDuDossier } from "@/server/lecture/dossiers";
import { dossierAvecSaRegle, exigerModifiable } from "@/server/acces/dossiers";
import { remplacementDeLEcheancier } from "@/server/dossiers/echeancier";
import { payload } from "@/server/acces/regles";
import { joursEntre } from "@/domain/dossiers/echeancier";

/**
 * Échéancier — C-10, WF-09.
 *
 * Les dates limites viennent de la table, où elles ont été calculées à
 * l'ouverture depuis les délais du référentiel (RG-09.1). Les « au plus tôt »
 * des pièces périssables sont recalculés à l'affichage depuis le dépôt visé :
 * demander un relevé de trois mois six mois à l'avance le fait redemander.
 */
export const GET = route({
  nom: "dossier.echeancier",
  acces: "candidat",
  limite: "lecture",
  async traiter({ params, acteur }) {
    return echeancierDuDossier(params.id!, acteur!.id);
  },
});

/**
 * Replanification — WF-09 étape 4, seconde moitié.
 *
 * L'alerte d'incompatibilité sans le moyen d'y répondre serait une commande
 * inerte de plus (règle de Q.A) : l'écran disait « le calendrier ne tient
 * plus » et rien ne permettait de le changer. `targetDate` n'avait qu'un
 * seul écrivain, l'ouverture du dossier.
 *
 * Tout l'échéancier est **recalculé depuis la règle figée** (INV-3), jamais
 * depuis la règle publiée du jour : un dossier ouvert sur un délai
 * d'instruction de 60 jours se replanifie sur 60 jours, même si l'autorité
 * en annonce 90 depuis. Une divergence de version s'arbitre par
 * `RuleMigration`, elle ne se glisse pas dans un changement de date.
 *
 * Le remplacement lui-même vit dans `server/dossiers/echeancier.ts` : la
 * migration d'une divergence le fait aussi, et ne le faisait pas. Une
 * implémentation, pas deux.
 *
 * Régime `sensible` comme la clôture : ce n'est pas un appel qui coûte de
 * l'argent, c'est une écriture qui remplace des lignes, et dix par minute
 * suffisent largement à quelqu'un qui choisit une date.
 */
export const PUT = route({
  nom: "dossier.echeancier.replanifier",
  acces: "candidat",
  limite: "sensible",
  corps: z.object({
    /*
      La date à venir est une contrainte du champ, pas une garde du
      traitement : validée ici, elle revient au candidat sur le champ
      qu'il vient de remplir, avec la raison. Le refus est évalué à
      chaque requête — un `new Date()` figé au chargement du module
      accepterait, des mois plus tard, une date déjà passée.
    */
    dateCible: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, "Format attendu : AAAA-MM-JJ.")
      .refine((v) => joursEntre(new Date().toISOString().slice(0, 10), v) > 0, {
        message:
          "Choisis une date à venir : calculé à rebours d'une date passée, l'échéancier place toutes ses étapes derrière nous.",
      }),
  }),
  async traiter({ corps, params, acteur }) {
    /*
      La règle arrive par la relation du dossier, et non par une requête
      sur `VisaRule` : INV-4 veut le filtrage dans la couche d'accès, et
      une route qui interroge le référentiel elle-même finit par oublier
      un critère. Elle est ici **figée** (INV-3), donc possiblement
      archivée — la lire par la relation est aussi la seule façon de ne pas
      la manquer.
    */
    const dossier = await dossierAvecSaRegle(params.id!, acteur!.id);
    exigerModifiable(dossier);

    const regle = dossier.visaRule;
    if (!regle) throw echec("regle_indisponible");

    const cible = new Date(`${corps.dateCible}T00:00:00Z`);

    await db.$transaction([
      ...(await remplacementDeLEcheancier(dossier.id, payload(regle), cible)),
      db.application.update({ where: { id: dossier.id }, data: { targetDate: cible } }),
    ]);

    return echeancierDuDossier(dossier.id, acteur!.id);
  },
});
