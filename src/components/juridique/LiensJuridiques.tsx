import Link from "next/link";
import { liensJuridiquesPublies } from "@/server/juridique/cache";

/**
 * Les liens vers les pages juridiques publiées — S.101 ; servis dans le
 * HTML depuis la revue du 07/10/2026, M14 (D-19).
 *
 * Composant serveur : la liste vient d'un cache de cinq minutes que la
 * validation d'un texte invalide (`server/juridique/cache.ts`). Le pied de
 * page, lui, reste synchrone et sans données (Q.B) : il rend ce composant
 * sans rien lire.
 *
 * Une page jamais validée n'est promise nulle part, et une page validée
 * apparaît sans redéploiement. Les adresses viennent du registre, jamais
 * d'une chaîne écrite ici (Q.A).
 *
 * Si la lecture échoue — une base indisponible, ou le build sans base —,
 * rien n'est rendu et la cause va au journal : un pied de page sans ses
 * liens vaut mieux qu'une page publique en erreur.
 */
export async function LiensJuridiques() {
  let pages: Awaited<ReturnType<typeof liensJuridiquesPublies>>;
  try {
    pages = await liensJuridiquesPublies();
  } catch (erreur) {
    console.error("[juridique] liens du pied de page non lus", erreur instanceof Error ? erreur.message : erreur);
    return null;
  }
  if (pages.length === 0) return null;
  return (
    <nav aria-label="Informations légales" className="flex flex-col gap-2.5">
      <span className="text-13 font-semibold uppercase tracking-wider text-ink-900">Informations légales</span>
      {pages.map((p) => (
        <Link key={p.adresse} href={p.adresse} className="text-14 text-accent-600">
          {p.titre}
        </Link>
      ))}
    </nav>
  );
}
