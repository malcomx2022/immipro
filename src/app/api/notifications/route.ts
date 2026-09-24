import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { alertesDuCandidat } from "@/server/lecture/alertes";
import { sansContenu } from "@/server/http/reponse";

/**
 * Alertes — T-01, WF-11.
 *
 * RG-11.2 : les alertes sont ciblées par dossier, jamais diffusées à toute
 * la base. La requête le tient : elle filtre par compte, et chaque ligne
 * porte le dossier qu'elle concerne.
 *
 * Les dates sortent en brut : le délai se recalcule à l'affichage. Écrit
 * ici, « dans 7 jours » resterait affiché le jour même, puis une semaine
 * après.
 *
 * Le compte des non lues vient de la lecture, qui l'établit en base. Il
 * était tiré de la page servie — `alertes.filter((a) => !a.lue).length` —
 * alors que la page coupait les non lues en premier : le bandeau annonçait
 * « Aucune alerte non lue » à qui en avait.
 */
export const GET = route({
  nom: "notifications",
  acces: "candidat",
  limite: "lecture",
  async traiter({ acteur }) {
    return alertesDuCandidat(acteur!.id);
  },
});

/**
 * « Tout marquer lu » — T-01.
 *
 * ── Le bouton ne marquait rien ──────────────────────────────────────
 *
 * `toutMarquerLu` est une fonction pure du domaine : elle rend une
 * nouvelle liste, et l'écran la posait dans son état local. Aucun appel
 * ne partait, et `PUT /api/notifications/[id]` — qui existe, et qui est
 * la seule écriture de `readAt` du produit — n'était invoqué par aucun
 * écran. Les pastilles disparaissaient jusqu'au rechargement, puis
 * revenaient toutes.
 *
 * Une route de collection plutôt qu'une boucle sur la route unitaire :
 * cinquante appels franchiraient le régime `sensible` (dix par minute)
 * dès la deuxième alerte, et une moitié d'entre eux marquerait une
 * moitié de la liste.
 *
 * Elle porte sur **tout le compte**, ce que le bouton dit, et non sur la
 * page servie — qui en montre au plus cinquante.
 */
export const PUT = route({
  nom: "notifications.toutes.lues",
  acces: "candidat",
  limite: "sensible",
  async traiter({ acteur }) {
    await db.notification.updateMany({
      where: { userId: acteur!.id, readAt: null },
      data: { readAt: new Date() },
    });
    return sansContenu();
  },
});
