import { z } from "zod";
import { route } from "@/server/http/route";
import { comptes } from "@/server/lecture/backoffice";
import { MOTIF_MINIMUM_COMPTE } from "@/domain/backoffice/comptes";
import { suspendreOuRetablir } from "@/server/comptes/gestion";

/**
 * Comptes — B-03, WF-15.
 *
 * RG-15.1 : le motif est obligatoire, et il l'est dans la signature. Une
 * suspension sans motif n'est pas refusée par politesse : c'est elle qu'on
 * relit quand quelqu'un conteste, et « suspendu le 12 » ne répond à rien.
 *
 * La suspension ferme les sessions ouvertes. Sans cela, elle ne prendrait
 * effet qu'à l'expiration du cookie — c'est-à-dire trente jours plus tard,
 * pendant lesquels la personne suspendue continuerait d'utiliser la
 * plateforme.
 *
 * ── Comptes internes — S.210 ────────────────────────────────────────
 *
 * Un candidat se suspend depuis le rôle administrateur, comme avant. Un
 * compte interne (veilleur et au-dessus), depuis le rôle
 * super-administrateur seulement : sinon un administrateur pourrait
 * écarter celui qui gère les rôles.
 *
 * ── Une seule écriture, en transaction — S.214 ───────────────────────
 *
 * Tous les comptes passent par `suspendreOuRetablir` : le rôle est relu
 * dans la transaction sérialisable qui suspend, ferme les sessions et
 * journalise. Le chemin « candidat » lisait le rôle avant, hors
 * transaction : un compte promu entre-temps était suspendu par un
 * administrateur.
 */
export const GET = route({
  nom: "admin.utilisateurs",
  acces: "admin",
  limite: "lecture",
  requete: z.object({ recherche: z.string().min(2).optional() }),
  async traiter({ requete }) {
    return { comptes: await comptes(requete.recherche) };
  },
});

export const PUT = route({
  nom: "admin.utilisateurs.suspension",
  acces: "admin",
  // Régime `critique` (S.214) : la suspension coupe l'accès d'une personne.
  limite: "critique",
  corps: z.object({
    userId: z.guid(),
    suspendre: z.boolean(),
    // Même seuil que l'écran et les autres actions de compte (O-4, S.183).
    motif: z.string().trim().min(MOTIF_MINIMUM_COMPTE).max(500),
  }),
  async traiter({ corps, acteur }) {
    // Candidat ou compte interne : une seule écriture, en transaction (S.214).
    return suspendreOuRetablir(acteur!, corps);
  },
});
