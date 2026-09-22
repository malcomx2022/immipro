import { db } from "@/lib/db";

/**
 * Échéance de relecture — RG-14.1, WF-14.
 *
 * « Une fiche dont `nextReviewAt` est dépassée repasse automatiquement en
 * `DRAFT` et disparaît de l'affichage utilisateur. Une donnée non relue ne
 * peut pas continuer à se présenter comme fiable. »
 *
 * Le filtre de lecture candidat écarte déjà ces fiches, requête par requête.
 * Ce job ne fait donc pas disparaître la fiche — c'est déjà fait — il rend
 * l'état de la base conforme à ce que l'utilisateur voit, et remet la fiche
 * dans la file du veilleur. Les deux sont nécessaires : sans le filtre, un
 * job en retard laisse passer une donnée périmée ; sans le job, le
 * back-office croit publié ce qui ne s'affiche plus.
 *
 * ── Ce qu'il ne fait pas, et qu'on lui a fait dire ──────────────────
 *
 * Il retire la fiche de l'affichage. Il ne met pas fin à la version : les
 * dossiers qui l'ont figée (INV-3) continuent de s'y référer, et elle
 * reste donc en vigueur pour eux. `effectiveTo` n'est pas touchée, et
 * `publishedAt` non plus — c'est elle qui ordonne la succession.
 *
 * La publication cherchait son prédécesseur par `status = 'PUBLISHED'` et
 * n'en trouvait plus après une passe d'ici : elle se croyait première,
 * n'archivait rien et ne prévenait aucun dossier. Le défaut naissait de
 * la rencontre de deux passes justes, chacune prise séparément.
 */
export async function depublierLesFichesEchues(maintenant = new Date()): Promise<number> {
  const jour = new Date(
    Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()),
  );
  const { count } = await db.visaRule.updateMany({
    where: { status: "PUBLISHED", nextReviewAt: { lt: jour } },
    data: { status: "DRAFT" },
  });
  return count;
}
