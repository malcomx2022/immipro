import { route } from "@/server/http/route";
import { echec } from "@/server/http/echecs";
import { recuDuPaiement } from "@/server/lecture/paiements";
import { envoyerRecu } from "@/server/courrier";
import { estAttestable, mentionRembourse } from "@/domain/paiement/recu";
import { momentEnFrancais } from "@/domain/format/moment";
import { formatMontant } from "@/lib/utils";

/**
 * Renvoi du reçu par email — $-06, WF-05.
 *
 * `candidat_verifie` et non `candidat` : le courrier part vers l'adresse du
 * compte, et expédier vers une adresse que personne n'a confirmée revient à
 * envoyer un montant et une référence à qui n'a pas prouvé la lire.
 *
 * `sensible` et non `lecture` : chaque appel déclenche un envoi. Sans ce
 * régime, un clic répété devient un expéditeur de courrier indésirable dont
 * la cible est l'utilisateur lui-même.
 *
 * Rien n'est journalisé. Le journal d'audit garde les décisions qui
 * changent l'état d'un compte ou d'un paiement (RG-15.1) ; un reçu renvoyé
 * n'en change aucun, et part vers la seule adresse que son destinataire
 * possède déjà. L'y inscrire noierait les accès qui comptent.
 *
 * Le transport n'est pas branché (I.C) : `expedier` journalise et rend la
 * main. La réponse dit donc que le reçu est parti vers l'adresse, ce que le
 * serveur a effectivement fait — et un envoi refusé, lui, remonte en échec
 * plutôt que d'être avalé.
 */
export const POST = route({
  nom: "paiements.recu.renvoi",
  acces: "candidat_verifie",
  limite: "sensible",
  async traiter({ params, acteur }) {
    const recu = await recuDuPaiement(params.reference!, acteur!.id);

    if (!estAttestable(recu.etat)) {
      throw echec("recu_indisponible", {
        corps:
          "Ce paiement n'est pas confirmé : il n'y a pas encore de reçu à envoyer.",
      });
    }
    if (recu.etat === "rembourse") {
      // Le courrier annonce une somme encaissée. Elle ne l'est plus, et le
      // refus dit depuis quand — c'est ce qui permet de s'y retrouver quand
      // on a plusieurs paiements sur le même dossier.
      throw echec("recu_indisponible", {
        corps: mentionRembourse(momentEnFrancais(recu.rembourseLe ?? recu.le)),
      });
    }

    await envoyerRecu(recu.adresse, recu.reference, formatMontant(recu.montant, recu.devise));

    return { adresse: recu.adresse };
  },
});
