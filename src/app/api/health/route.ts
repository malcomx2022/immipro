import { db } from "@/lib/db";
import {
  DEPENDANCES,
  LIBELLE_CAPACITE,
  etatDesCapacites,
  fileTenue,
  messageDeSurveillance,
} from "@/domain/exploitation/dependances";
import { constaterLesDependances } from "@/server/exploitation/capacites";
import { lireLesConstats } from "@/server/exploitation/constats";
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

interface EtatDeLaQuarantaine {
  lisible: boolean;
  /** Pièces dont le balayage n'a pas conclu et dont l'incident est ouvert. */
  incidents: number;
  /** L'ancienneté du plus vieux, en heures. Zéro quand il n'y en a aucun. */
  depuisHeures: number;
}

/**
 * Les pièces bloquées au contrôle — I.D, ajouté le 22/09/2026.
 *
 * Le balayeur parle maintenant à un moteur réel, et un moteur réel tombe.
 * Sans cette mesure, une pièce dont le balayage n'aboutit pas reste en
 * quarantaine **en silence** : le candidat lit « contrôle en cours », ce
 * qui est vrai, et personne d'autre n'apprend rien. La file de revue est
 * ici pour la même raison — un écran de back-office ne surveille que ceux
 * qui l'ouvrent, une adresse d'état se surveille depuis l'extérieur.
 *
 * Ce compte ne change rien au sort des fichiers : aucune pièce n'est
 * promue parce qu'elle attend depuis longtemps. C'est une visibilité, pas
 * une porte de sortie.
 */
async function sonderLaQuarantaine(): Promise<EtatDeLaQuarantaine> {
  try {
    const [incidents, plusAncienne] = await Promise.all([
      db.documentVersion.count({ where: { scanIncidentAt: { not: null } } }),
      db.documentVersion.findFirst({
        where: { scanIncidentAt: { not: null } },
        orderBy: { scanIncidentAt: "asc" },
        select: { scanIncidentAt: true },
      }),
    ]);
    const depuis = plusAncienne?.scanIncidentAt;
    return {
      lisible: true,
      incidents,
      depuisHeures: depuis ? Math.floor((Date.now() - depuis.getTime()) / 3_600_000) : 0,
    };
  } catch {
    return { lisible: false, incidents: 0, depuisHeures: 0 };
  }
}

interface EtatDeLaPurge {
  lisible: boolean;
  /** Dossiers dont l'échéance de rétention est passée et qui restent entiers. */
  enRetard: number;
  /** L'ancienneté du plus ancien retard, en heures. */
  depuisHeures: number;
}

/**
 * Les purges qui n'aboutissent pas — INV-5, ajouté le 22/09/2026.
 *
 * Un objet que le stockage refuse de supprimer ne fait plus effacer sa
 * version : la clé reste, le dossier reste échu, et la passe du
 * lendemain réessaie. C'est la bonne conduite, et elle a un revers —
 * un stockage durablement fâché laisserait des pièces d'identité en
 * place **sans que rien ne le dise**, puisque la purge repart en
 * silence chaque nuit.
 *
 * Ce compte est ce qui manque pour que la reprise ne devienne pas une
 * attente indéfinie. Il ne supprime rien et n'accélère rien : il rend
 * une échéance dépassée visible depuis l'extérieur du back-office.
 */
async function sonderLaPurge(): Promise<EtatDeLaPurge> {
  const maintenant = new Date();
  try {
    const [enRetard, plusAncien] = await Promise.all([
      db.application.count({ where: { purgedAt: null, purgeDueAt: { lte: maintenant } } }),
      db.application.findFirst({
        where: { purgedAt: null, purgeDueAt: { lte: maintenant } },
        orderBy: { purgeDueAt: "asc" },
        select: { purgeDueAt: true },
      }),
    ]);
    const depuis = plusAncien?.purgeDueAt;
    return {
      lisible: true,
      enRetard,
      depuisHeures: depuis
        ? Math.floor((maintenant.getTime() - depuis.getTime()) / 3_600_000)
        : 0,
    };
  } catch {
    return { lisible: false, enRetard: 0, depuisHeures: 0 };
  }
}

export async function GET() {
  const [base, file, quarantaine, purge, faits] = await Promise.all([
    sonderLaBase(),
    sonderLaFile(),
    sonderLaQuarantaine(),
    sonderLaPurge(),
    /*
      Les constats de service, lus en base — 22/09/2026.

      Deux sondes concluent sur un fait établi par le **worker**, qui
      est un service séparé en production. Tant que ce fait vivait dans
      une variable de module, cette adresse-ci lisait toujours « aucune
      sonde n'a tourné » : la messagerie et le balayage, tous deux
      bloquants, ne pouvaient jamais être opérationnels, et l'instance
      restait inapte indéfiniment.

      Les lire ici ne déclenche rien : c'est une requête, pas une sonde.
      Les sondes restent pures et reçoivent ce qu'on a trouvé.
    */
    lireLesConstats(),
  ]);

  const constats = constaterLesDependances(process.env, faits);
  const etat = etatDesCapacites(constats);
  const intitules = new Map(DEPENDANCES.map((d) => [d.cle, d.intitule]));

  /*
    Une base muette est une panne ; une bloquante réparable non
    opérationnelle est une inaptitude. Les deux se répondent 503, et le
    corps dit laquelle.

    Une **réserve** n'en est pas une : elle ne se répare pas, elle
    s'arbitre, et la compter ici revenait à ne jamais répondre 200.
  */
  const enService = base === "up" && etat.aptitude !== "INAPTE";

  return Response.json(
    {
      status: enService ? (etat.aptitude === "PILOTE" ? "pilote" : "ok") : "indisponible",
      aptitude: etat.aptitude,
      db: base,
      bloquantes: etat.bloquantes,
      /*
        Les réserves, à part des bloquantes — 22/09/2026.

        Ce sont les dépendances bloquantes qu'aucun déploiement ne rendra
        opérationnelles : configurées, et sans sonde sûre possible. Les
        compter comme des bloquantes rendait cette adresse **inapte pour
        toujours**, et un 503 qui ne peut pas s'éteindre n'est pas une
        mesure — ou bien l'instance n'entre jamais en service, ou bien on
        cesse de la lire, et c'est la panne suivante qu'on ne verra pas.

        Elles sont dites, et elles n'empêchent pas de servir. Elles
        empêchent en revanche de se déclarer prête : l'aptitude reste
        `PILOTE` tant qu'il en reste une.
      */
      reserves: etat.reserves,
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
      quarantaine: {
        lisible: quarantaine.lisible,
        incidents: quarantaine.incidents,
        depuisHeures: quarantaine.depuisHeures,
        message: !quarantaine.lisible
          ? "Les pièces en quarantaine n'ont pas pu être lues."
          : quarantaine.incidents === 0
            ? "Aucune pièce bloquée au contrôle."
            : `${quarantaine.incidents} pièce(s) bloquée(s) au contrôle, la plus ancienne depuis ${quarantaine.depuisHeures} h. Elles restent en quarantaine.`,
      },
      purge: {
        lisible: purge.lisible,
        enRetard: purge.enRetard,
        depuisHeures: purge.depuisHeures,
        message: !purge.lisible
          ? "Les échéances de rétention n'ont pas pu être lues."
          : purge.enRetard === 0
            ? "Aucune purge en retard."
            : `${purge.enRetard} dossier(s) au-delà de leur échéance de rétention, le plus ancien depuis ${purge.depuisHeures} h.`,
      },
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
