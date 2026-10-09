import { db } from "@/lib/db";
import { route } from "@/server/http/route";
import { lecteurExploitant } from "@/server/exploitation/lecteur";
import { corpsPublic } from "@/domain/exploitation/etat-public";
import { messageDesTachesEnEchec, sonderLesTachesEnEchec } from "@/server/exploitation/taches";
import { analysesEnAttenteDepuis } from "@/server/jobs/quarantaine";
import {
  DEPENDANCES,
  LIBELLE_CAPACITE,
  etatDesCapacites,
  fileTenue,
  messageDeSurveillance,
  surveillanceRemboursementManuel,
} from "@/domain/exploitation/dependances";
import { constaterLesDependances } from "@/server/exploitation/capacites";
import { etatDesFonctions } from "@/domain/ia/fournisseurs";
import { fournisseursDeclares } from "@/domain/payments/rail";
import { CLE_FOURNISSEURS, espaceReel, fournisseursActifs } from "@/server/paiement/secrets";
import { etatDeLaFacturation, regimeDeLExploitant } from "@/server/facturation/emission";
import {
  surveillanceDeLaFacturation,
  type SurveillanceDeLaFacturation,
} from "@/domain/facturation/facture";
import { lireLesConstats } from "@/server/exploitation/constats";
import { DELAI_CIBLE_HEURES } from "@/domain/backoffice/revue";
import { ABANDON_JOURS } from "@/domain/dossiers/inactivite";

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
 *
 * ── Qui lit quoi (revue du 07/10/2026, M10 ; D-4) ───────────────────
 *
 * La route passe par le composeur, comme toutes les autres : limitée en
 * lecture, et sa session lue. Un lecteur anonyme reçoit `{ status, db }` ;
 * le détail ci-dessous est réservé à un administrateur connecté ou à
 * `Authorization: Bearer <ETAT_DE_SERVICE_JETON>`. Le code HTTP est le même
 * pour tous : 200 en service, 503 sinon.
 */
export const dynamic = "force-dynamic";

/**
 * Une divergence encore à propager deux heures après sa publication a
 * manqué deux reprises horaires (revue M8) : ce n'est plus un délai, c'est
 * un incident.
 */
const RETARD_DIVERGENCE_HEURES = 2;

interface EtatDesDivergences {
  lisible: boolean;
  enRetard: number;
  depuisHeures: number;
}

async function sonderLesDivergences(): Promise<EtatDesDivergences> {
  const limite = new Date(Date.now() - RETARD_DIVERGENCE_HEURES * 3_600_000);
  try {
    const [enRetard, plusAncienne] = await Promise.all([
      db.visaRule.count({ where: { divergenceDueAt: { lt: limite } } }),
      db.visaRule.findFirst({
        where: { divergenceDueAt: { lt: limite } },
        orderBy: { divergenceDueAt: "asc" },
        select: { divergenceDueAt: true },
      }),
    ]);
    const depuisHeures = plusAncienne?.divergenceDueAt
      ? Math.floor((Date.now() - plusAncienne.divergenceDueAt.getTime()) / 3_600_000)
      : 0;
    return { lisible: true, enRetard, depuisHeures };
  } catch {
    return { lisible: false, enRetard: 0, depuisHeures: 0 };
  }
}

/**
 * Une analyse en attente depuis une heure a manqué au moins une reprise
 * horaire (revue E6, étape 5 ; RF-4, S.150) : la reprise les remet en file
 * après trente minutes, à la vingtième minute de chaque heure.
 */
const RETARD_ANALYSE_HEURES = 1;

interface EtatDesAnalyses {
  lisible: boolean;
  enAttente: number;
  depuisHeures: number;
}

/**
 * Les pièces saines qui attendent leur analyse depuis plus d'une heure.
 *
 * La définition est celle de la reprise (`analysesEnAttenteDepuis`) : la
 * dernière version, sur un dossier encore modifiable. Ce compte ne relance
 * rien — c'est la reprise qui le fait ; il dit qu'elle n'y arrive pas.
 */
async function sonderLesAnalysesEnAttente(): Promise<EtatDesAnalyses> {
  try {
    const enAttente = await analysesEnAttenteDepuis(
      new Date(Date.now() - RETARD_ANALYSE_HEURES * 3_600_000),
    );
    const plusAncienne = enAttente[0]?.scannedAt;
    return {
      lisible: true,
      enAttente: enAttente.length,
      depuisHeures: plusAncienne
        ? Math.floor((Date.now() - plusAncienne.getTime()) / 3_600_000)
        : 0,
    };
  } catch {
    return { lisible: false, enAttente: 0, depuisHeures: 0 };
  }
}

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
  /**
   * Dossiers longtemps inactifs qui portent encore des pièces et **n'ont
   * aucune échéance de rétention**.
   *
   * Distinct de `enRetard`, et c'est tout l'objet : une échéance dépassée
   * est une purge qui n'aboutit pas, une échéance absente est une purge
   * qui n'a jamais été programmée. La première se voyait, la seconde non.
   */
  sansEcheance: number;
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
  const seuilDInactivite = new Date(
    maintenant.getTime() - ABANDON_JOURS * 24 * 60 * 60 * 1000,
  );
  try {
    const [enRetard, plusAncien, sansEcheance] = await Promise.all([
      db.application.count({ where: { purgedAt: null, purgeDueAt: { lte: maintenant } } }),
      db.application.findFirst({
        where: { purgedAt: null, purgeDueAt: { lte: maintenant } },
        orderBy: { purgeDueAt: "asc" },
        select: { purgeDueAt: true },
      }),
      /*
        Le filet. Jusqu'à l'arbitrage S.78, seuls les brouillons et les
        clôtures recevaient une échéance, et ce compte mesurait le trou.
        Chaque état a désormais sa règle — inactivité pour les dossiers en
        cours, dépôt pour les soumis, durée de pause pour les suspendus :
        un compte non nul dit qu'une passe n'a pas tourné, ou qu'un état
        nouveau est arrivé sans la sienne.

        `updatedAt` est une approximation : le job mesure l'inactivité sur
        la date du dernier dépôt, plus fine. Elle suffit ici — cette sonde
        lève la main, elle ne décide de rien.
      */
      db.application.count({
        where: {
          purgedAt: null,
          purgeDueAt: null,
          updatedAt: { lte: seuilDInactivite },
          documents: { some: { versions: { some: { purgedAt: null } } } },
        },
      }),
    ]);
    const depuis = plusAncien?.purgeDueAt;
    return {
      lisible: true,
      enRetard,
      depuisHeures: depuis
        ? Math.floor((maintenant.getTime() - depuis.getTime()) / 3_600_000)
        : 0,
      sansEcheance,
    };
  } catch {
    return { lisible: false, enRetard: 0, depuisHeures: 0, sansEcheance: 0 };
  }
}

/** Les dossiers en pause — la dette opérationnelle de l'arbitrage S.78. */
interface EtatDesSuspensions {
  lisible: boolean;
  enCours: number;
  /** L'ancienneté de la plus ancienne pause, en jours. */
  plusAncienneJours: number;
  /** Pauses assez anciennes pour que la purge de leurs pièces soit annoncée. */
  averties: number;
}

/**
 * La dette opérationnelle — arbitrage S.78.
 *
 * Aucune inactivité ne clôt un dossier suspendu par la plateforme, et
 * c'est voulu. Le revers est qu'une pause peut durer sans que personne ne
 * la regarde : le candidat attend, ses pièces finissent par partir, et
 * rien dans l'exploitation ne l'aurait dit. Ce compte le dit, avec l'âge
 * de la plus ancienne, sans rien décider.
 */
async function sonderLesSuspensions(): Promise<EtatDesSuspensions> {
  try {
    const [enCours, plusAncienne, averties] = await Promise.all([
      db.application.count({ where: { status: "SUSPENDU" } }),
      db.application.findFirst({
        where: { status: "SUSPENDU" },
        orderBy: { suspendedAt: "asc" },
        select: { suspendedAt: true },
      }),
      db.application.count({ where: { status: "SUSPENDU", purgeDueAt: { not: null } } }),
    ]);
    const depuis = plusAncienne?.suspendedAt;
    return {
      lisible: true,
      enCours,
      plusAncienneJours: depuis
        ? Math.floor((Date.now() - depuis.getTime()) / (24 * 3_600_000))
        : 0,
      averties,
    };
  } catch {
    return { lisible: false, enCours: 0, plusAncienneJours: 0, averties: 0 };
  }
}

function messageDesSuspensions(s: EtatDesSuspensions): string {
  if (!s.lisible) return "Les dossiers en pause n'ont pas pu être lus.";
  if (s.enCours === 0) return "Aucun dossier en pause.";
  const averties =
    s.averties === 0 ? "" : ` ${s.averties} ont reçu l'annonce de la purge de leurs pièces.`;
  return `${s.enCours} dossier(s) en pause, le plus ancien depuis ${s.plusAncienneJours} jours.${averties}`;
}

/**
 * Ce que la sonde de rétention annonce — INV-5.
 *
 * Deux manques distincts, et les confondre en effacerait un : une
 * échéance **dépassée** est une purge qui n'aboutit pas, une échéance
 * **absente** est une purge qui n'a jamais été programmée. La seconde ne
 * se voyait nulle part, et c'est la plus durable des deux — rien ne la
 * rattrape à la passe du lendemain.
 */
function messageDeLaPurge(purge: EtatDeLaPurge): string {
  const retard =
    purge.enRetard === 0
      ? "Aucune purge en retard."
      : `${purge.enRetard} dossier(s) au-delà de leur échéance de rétention, le plus ancien depuis ${purge.depuisHeures} h.`;
  if (purge.sansEcheance === 0) return retard;
  return `${retard} ${purge.sansEcheance} dossier(s) inactifs depuis plus de ${ABANDON_JOURS} jours portent encore des pièces sans aucune échéance de rétention.`;
}

/**
 * Les dossiers payés pour de vrai sur le rail sans API de remboursement —
 * ce que la décision du 03/10/2026 plafonne. Un dossier, pas une
 * transaction : une recharge sur le même dossier ne fait pas un dossier
 * de plus à rembourser.
 */
async function lireLaFacturation(): Promise<SurveillanceDeLaFacturation> {
  const reel = fournisseursActifs(process.env).some((f) => espaceReel(f));
  try {
    const etat = await etatDeLaFacturation();
    return surveillanceDeLaFacturation(etat.obstacles, reel, etat.regime);
  } catch {
    // Les variables illisibles : rien n'est supposé en place.
    return surveillanceDeLaFacturation(
      ["certification_absente", "emetteur_incomplet", "regime_tva_non_declare"],
      reel,
      regimeDeLExploitant(),
    );
  }
}

async function compterLesDossiersPayes(): Promise<number> {
  try {
    const lignes = await db.transaction.findMany({
      where: { provider: "FEDAPAY", status: { in: ["CONFIRMEE", "REMBOURSEE"] } },
      distinct: ["applicationId"],
      select: { applicationId: true },
    });
    return lignes.length;
  } catch {
    return 0;
  }
}

export const GET = route({
  nom: "exploitation.etat",
  acces: "public",
  limite: "lecture",
  traiter: async ({ acteur, requeteBrute }) => {
    const { corps, enService } = await etatDeService();
    const lecteur = lecteurExploitant(acteur, requeteBrute.headers.get("authorization"));
    return Response.json(lecteur ? corps : corpsPublic(corps), {
      status: enService ? 200 : 503,
      // Un état de service mis en cache n'en est plus un.
      headers: { "Cache-Control": "no-store" },
    });
  },
});

async function etatDeService() {
  const [base, file, quarantaine, purge, suspensions, faits, dossiersPayes, divergences, taches, analyses] = await Promise.all([
    sonderLaBase(),
    sonderLaFile(),
    sonderLaQuarantaine(),
    sonderLaPurge(),
    sonderLesSuspensions(),
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
    compterLesDossiersPayes(),
    sonderLesDivergences(),
    sonderLesTachesEnEchec(),
    sonderLesAnalysesEnAttente(),
  ]);

  /*
    Le remboursement manuel FedaPay, accepté pour le pilote — 03/10/2026.
    L'acceptation tient au volume : au-delà du seuil, la procédure n'est
    plus celle qui a été décidée, et le point redevient bloquant — c'est
    l'alerte, et un 503 se voit de la surveillance.
  */
  const remboursementManuel = surveillanceRemboursementManuel(
    dossiersPayes,
    espaceReel("FEDAPAY"),
  );
  const constats = constaterLesDependances(process.env, faits).map((c) =>
    c.cle === "remboursement" && c.capacite === "PROCEDURE_MANUELLE" && remboursementManuel.depasse
      ? { ...c, capacite: "IMPLEMENTATION_ABSENTE" as const }
      : c,
  );
  const capacites = etatDesCapacites(constats);
  // Seulement pour une fonction non branchée : une raison n'a rien à dire
  // d'une fonction qui tourne.
  const raisonsIA = new Map<string, string>(
    etatDesFonctions(process.env).flatMap((f) => (f.raison ? [[f.fonction, f.raison] as const] : [])),
  );

  /*
    La facturation — avis comptable M.C du 04/10/2026. En bac à sable,
    les ventes reçoivent une facture d'essai et rien ne bloque ; dès que
    l'espace est réel, une série réelle encore fermée (certification,
    émetteur, régime de TVA) est une inaptitude, et la ligne dit quoi
    faire.
  */
  const facturation = await lireLaFacturation();
  const etat = facturation.bloquante
    ? {
        ...capacites,
        aptitude: "INAPTE" as const,
        bloquantes: [...capacites.bloquantes, "facturation"],
      }
    : capacites;
  const intitules = new Map(DEPENDANCES.map((d) => [d.cle, d.intitule]));

  /*
    Une base muette est une panne ; une bloquante réparable non
    opérationnelle est une inaptitude. Les deux se répondent 503, et le
    corps dit laquelle.

    Une **réserve** n'en est pas une : elle ne se répare pas, elle
    s'arbitre, et la compter ici revenait à ne jamais répondre 200.
  */
  const enService = base === "up" && etat.aptitude !== "INAPTE";

  return {
    enService,
    corps: {
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
      /*
        Les fournisseurs de paiement ouverts, tels que ce processus les lit
        — 03/10/2026. Des noms, jamais une clé. Sans cette ligne, une
        déclaration absente du conteneur ou mal lue ne se distinguait pas,
        de l'extérieur, d'un code qui l'ignore : les deux rendaient
        « configuration absente ».
      */
      remboursementManuel,
      facturation,
      fournisseursDePaiement: (() => {
        const lu = fournisseursDeclares(process.env[CLE_FOURNISSEURS]);
        return {
          variable: CLE_FOURNISSEURS,
          declaration: lu.declaration,
          ouverts: lu.fournisseurs,
          ...(lu.inconnus.length > 0 ? { inconnus: lu.inconnus } : {}),
        };
      })(),
      dependances: Object.fromEntries(
        constats.map((c) => [c, raisonsIA.get(c.cle)] as const).map(([c, raison]) => [
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
            /*
              Pourquoi la lecture ou la rédaction n'est pas branchée — 06/10.
              « Configuration absente » ne disait pas laquelle des variables
              manquait : une autorisation écrite `oui` au lieu du code du
              sous-traitant se cherchait dans le paquet compilé. La raison
              est celle de B-07, sans aucune valeur secrète.
            */
            ...(raison ? { raison } : {}),
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
        sansEcheance: purge.sansEcheance,
        message: !purge.lisible
          ? "Les échéances de rétention n'ont pas pu être lues."
          : messageDeLaPurge(purge),
      },
      suspensions: {
        lisible: suspensions.lisible,
        enCours: suspensions.enCours,
        plusAncienneJours: suspensions.plusAncienneJours,
        averties: suspensions.averties,
        message: messageDesSuspensions(suspensions),
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
      // Revue M8 : une divergence que deux reprises n'ont pas propagée.
      divergences: {
        lisible: divergences.lisible,
        enRetard: divergences.enRetard,
        depuisHeures: divergences.depuisHeures,
        message: !divergences.lisible
          ? "Les divergences à propager n'ont pas pu être lues."
          : divergences.enRetard === 0
            ? "Aucune divergence en attente de propagation."
            : `${divergences.enRetard} version(s) publiée(s) dont les dossiers ne sont pas encore prévenus, la plus ancienne depuis ${divergences.depuisHeures} h.`,
      },
      // Revue M9 : ce que pg-boss a abandonné, file par file.
      taches: { ...taches, message: messageDesTachesEnEchec(taches) },
      // Revue E6, étape 5 : des pièces saines que la reprise ne parvient pas à faire lire.
      analyses: {
        lisible: analyses.lisible,
        enAttente: analyses.enAttente,
        depuisHeures: analyses.depuisHeures,
        message: !analyses.lisible
          ? "Les analyses en attente n'ont pas pu être lues."
          : analyses.enAttente === 0
            ? "Aucune pièce n'attend son analyse depuis plus d'une heure."
            : `${analyses.enAttente} pièce(s) saine(s) attendent leur analyse depuis plus d'une heure, la plus ancienne depuis ${analyses.depuisHeures} h. La reprise horaire les remet en file : relire le journal du worker.`,
      },
    },
  };
}
