import { route } from "@/server/http/route";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { reconcilierSansRecouvrement } from "@/server/jobs/reconciliation";
import {
  phraseDuRapprochement,
  resumerLeRapprochement,
} from "@/domain/backoffice/reconciliation";

/**
 * Lancer le rapprochement — B-04, WF-15, RG-05.4, INV-7. S.122.
 *
 * Une passe, à la demande, de **la même fonction que le worker** : la
 * route n'a ni sa propre consultation, ni son propre chemin d'écriture.
 * Un état retrouvé chez le fournisseur s'applique par le service des
 * notifications signées, avec les mêmes garanties — idempotence par
 * `providerEventId`, refus si l'état lu a bougé. **Elle ne force aucun
 * paiement** : INV-7 veut qu'un paiement ne change d'état que sur
 * confirmation du fournisseur, et cette action ne fait que la lui demander.
 *
 * ── Pas de recouvrement ─────────────────────────────────────────────
 *
 * `reconcilierSansRecouvrement` prend un verrou consultatif partagé avec
 * le job du quart d'heure. Une passe en cours rend un 409 explicite plutôt
 * qu'une seconde passe : deux administrateurs qui cliquent ensemble, ou un
 * clic pendant le passage du worker, ne consultent pas deux fois la même
 * ligne. `limite: "sensible"` borne en plus la cadence des clics.
 *
 * ── Journalisée, dans les deux issues ───────────────────────────────
 *
 * Contrairement aux exports, la trace vient **après** : elle porte le
 * résultat. Une passe interrompue laisse néanmoins sa ligne — c'est celle
 * qu'on voudrait voir — avant que l'erreur ne remonte.
 */
export const POST = route({
  nom: "admin.paiements.rapprochement",
  acces: "admin",
  limite: "sensible",
  async traiter({ acteur }) {
    let bilan;
    try {
      bilan = await reconcilierSansRecouvrement();
    } catch (erreur) {
      await journaliser({
        acteurId: acteur!.id,
        action: "paiement.rapprochement.manuel",
        cible: "reconciliation:manuelle",
        motif: "Passe de rapprochement lancée depuis B-04, interrompue avant la fin (RG-05.4)",
        details: { interrompue: true },
      }).catch(() => undefined);
      throw erreur;
    }

    if (bilan === null) throw echec("rapprochement_en_cours");

    const resume = resumerLeRapprochement(bilan);
    await journaliser({
      acteurId: acteur!.id,
      action: "paiement.rapprochement.manuel",
      cible: "reconciliation:manuelle",
      motif: `Passe de rapprochement lancée depuis B-04 : ${phraseDuRapprochement(resume)} (RG-05.4)`,
      details: { ...resume, ecartsOuverts: bilan.ecartsOuverts, expirees: bilan.expirees },
    });

    return { ...resume, phrase: phraseDuRapprochement(resume), ecartsOuverts: bilan.ecartsOuverts };
  },
});
