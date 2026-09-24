/**
 * Ajouter ou retirer des mois à une date, sans déborder — RG-06.6, RG-10.1.
 *
 * ── Ce que `setUTCMonth` fait d'un 31 ────────────────────────────────
 *
 * `new Date("2026-11-30").setUTCMonth(+3)` vise le 30 février, qui
 * n'existe pas, et JavaScript reporte sur le 2 mars. Trois sites
 * faisaient ce calcul chacun de son côté, et le débordement tombait du
 * mauvais côté pour celui qui compte. Constaté en exécution, sur une
 * pièce valable trois mois :
 *
 *     déposé 2026-11-30 → périme le 2027-03-02
 *     déposé 2026-08-31 → périme le 2026-12-01
 *     déposé 2026-01-31 → périme le 2026-05-01
 *
 * Deux à trois jours de validité que la règle n'accorde pas, et toujours
 * dans le sens qui rassure : la plateforme déclare conforme, le 1er mars,
 * un relevé que l'autorité refuse. Un dépôt sur trois tombe un 29, 30 ou
 * 31 ; il suffit que le mois d'arrivée soit plus court.
 *
 * ── La convention retenue ───────────────────────────────────────────
 *
 * Le dernier jour du mois d'arrivée quand le quantième n'y existe pas :
 * « trois mois à compter du 30 novembre » vaut jusqu'au 28 février, et
 * non jusqu'au 2 mars. C'est la lecture ordinaire d'une durée en mois, et
 * c'est la seule des deux qui n'accorde rien de plus que la règle.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** Le dernier quantième d'un mois donné, en UTC. */
const dernierJourDuMois = (annee: number, mois: number): number =>
  new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();

/**
 * `depart` décalé de `mois` mois — négatif pour reculer. L'heure est
 * conservée : c'est une durée en mois, pas un changement de moment dans
 * la journée.
 */
export function decalerDeMois(depart: Date, mois: number): Date {
  const annee = depart.getUTCFullYear();
  const moisVise = depart.getUTCMonth() + mois;
  const cible = new Date(Date.UTC(annee, moisVise, 1));
  const quantieme = Math.min(
    depart.getUTCDate(),
    dernierJourDuMois(cible.getUTCFullYear(), cible.getUTCMonth()),
  );
  return new Date(
    Date.UTC(
      cible.getUTCFullYear(),
      cible.getUTCMonth(),
      quantieme,
      depart.getUTCHours(),
      depart.getUTCMinutes(),
      depart.getUTCSeconds(),
      depart.getUTCMilliseconds(),
    ),
  );
}
