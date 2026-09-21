import { db } from "@/lib/db";
import {
  DEPENDANCES,
  LIBELLE_CAPACITE,
  etatDesCapacites,
  fileTenue,
  messageDeSurveillance,
} from "@/domain/exploitation/dependances";
import { constaterLesDependances } from "@/server/exploitation/capacites";
import { DELAI_CIBLE_HEURES } from "@/domain/backoffice/revue";

/**
 * État de service — I.C, tranché le 20/09/2026 ; capacités réelles,
 * arbitrage du 21/09/2026.
 *
 * L'adresse rendait « ok » dès que la base répondait. Elle a d'abord appris
 * à lire les dépendances — puis on s'est aperçu qu'elle lisait des
 * **variables d'environnement**, ce qui n'est pas la même chose. Cinq des
 * six points de branchement rendent `null` quoi qu'on mette dans le `.env` :
 * une installation entièrement renseignée répondait « ok » sans qu'aucun
 * code de vérification ne parte, sans qu'aucune pièce ne soit balayée et
 * sans qu'aucun remboursement ne puisse être envoyé.
 *
 * Six capacités, et une variable n'en produit aucune à elle seule. Il faut
 * un adaptateur — demandé au point de branchement, jamais déclaré ici —,
 * une configuration, et une sonde qui a conclu. Une bloquante qui n'est pas
 * `OPERATIONNELLE` rend l'instance inapte, et le 503 le dit à qui surveille.
 *
 * **Rien de coûteux ne part d'ici.** Aucun courrier, aucun appel de
 * fournisseur, aucun jeton d'IA, aucune écriture. Les sondes sont locales :
 * celle des signatures signe un corps connu et vérifie que la fonction
 * qu'appellent les routes de webhook accepte la bonne signature et refuse
 * une signature altérée. Une adresse interrogée toutes les dix secondes par
 * un répartiteur de charge ne doit rien déclencher.
 *
 * **La base et la file de revue sont deux mesures, pas une.** Elles étaient
 * lues dans le même `try` : une requête de comptage en échec faisait
 * déclarer la base muette, et une base muette ne disait rien de la file. On
 * les interroge séparément, et chacune répond d'elle-même.
 *
 * La file est ici parce que c'est la condition de l'exception : l'extraction
 * IA peut manquer tant que la revue humaine tient son délai. Un écran de
 * back-office ne surveille que ceux qui l'ouvrent ; une adresse d'état se
 * surveille depuis l'extérieur.
 */
export const dynamic = "force-dynamic";

/** `SELECT 1` : la base répond, ou elle ne répond pas. Rien d'autre. */
async function sonderLaBase(): Promise<"up" | "down"> {
  try {
    await db.$queryRaw`SELECT 1`;
    return "up";
  } catch {
    return "down";
  }
}

interface EtatDeLaFile {
  lisible: boolean;
  enAttente: number;
  horsDelai: number;
}

/** Deux comptages, sans écriture. Leur échec ne vaut pas panne de base. */
async function sonderLaFile(): Promise<EtatDeLaFile> {
  const limite = new Date(Date.now() - DELAI_CIBLE_HEURES * 3_600_000);
  try {
    const [enAttente, horsDelai] = await Promise.all([
      db.manualReview.count({ where: { decidedAt: null } }),
      db.manualReview.count({ where: { decidedAt: null, queuedAt: { lt: limite } } }),
    ]);
    return { lisible: true, enAttente, horsDelai };
  } catch {
    return { lisible: false, enAttente: 0, horsDelai: 0 };
  }
}

export async function GET() {
  const [base, file] = await Promise.all([sonderLaBase(), sonderLaFile()]);

  const constats = constaterLesDependances();
  const etat = etatDesCapacites(constats);
  const intitules = new Map(DEPENDANCES.map((d) => [d.cle, d.intitule]));

  // Une base muette est une panne ; une bloquante non opérationnelle est une
  // inaptitude. Les deux se répondent 503, et le corps dit laquelle.
  const enService = base === "up" && etat.aptitude !== "INAPTE";

  return Response.json(
    {
      status: enService ? (etat.aptitude === "PILOTE" ? "pilote" : "ok") : "indisponible",
      aptitude: etat.aptitude,
      db: base,
      bloquantes: etat.bloquantes,
      dependances: Object.fromEntries(
        constats.map((c) => [
          c.cle,
          {
            intitule: intitules.get(c.cle),
            statut: c.statut,
            capacite: c.capacite,
            libelle: LIBELLE_CAPACITE[c.capacite],
            // Le détail de l'observation, parce qu'« absente » et « présente
            // mais non configurée » ne se réparent pas de la même façon.
            adaptateur: c.observation.adaptateur,
            configuree: c.observation.configuree,
            sonde: c.observation.sonde,
          },
        ]),
      ),
      revue: {
        lisible: file.lisible,
        enAttente: file.enAttente,
        horsDelai: file.horsDelai,
        delaiCibleHeures: DELAI_CIBLE_HEURES,
        tenue: file.lisible && fileTenue(file),
        message: file.lisible
          ? messageDeSurveillance(file, DELAI_CIBLE_HEURES)
          : "La file de revue n'a pas pu être lue.",
      },
    },
    { status: enService ? 200 : 503 },
  );
}
