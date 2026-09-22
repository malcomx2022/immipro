import { db } from "@/lib/db";
import { envoyerRelanceDeBrouillon } from "@/server/courrier";
import { suiteDeLEnvoi } from "@/domain/courrier/transport";
import { miseEnEtat } from "@/domain/dossiers/etat";
import { PURGE_JOURS } from "@/domain/dossiers/cloture";
import {
  abandonDeBrouillon,
  debutDeLInactivite,
  joursDInactivite,
  relanceDeBrouillon,
  suiteDInactivite,
  RELANCE_JOURS,
} from "@/domain/dossiers/inactivite";
import { editorialDe } from "@/lib/contenu/destinations";
import { COMPTE_JOIGNABLE } from "@/server/acces/suppression";

/**
 * Les brouillons laissés de côté — RG-04.2.
 *
 * « Un dossier `BROUILLON` inactif depuis 90 jours déclenche une relance,
 * puis passe en `ABANDONNE` à 12 mois. » Rien ne l'appliquait : `ABANDONNE`
 * était un état que l'enum portait, que l'écran savait afficher, et
 * qu'aucune écriture ne produisait.
 *
 * ── Ce que ce job ne décide pas ─────────────────────────────────────
 *
 * Quoi faire, et ce qu'on écrit. `suiteDInactivite` le dit sans base ni
 * réseau, et les deux textes viennent du domaine. Ce fichier lit, envoie,
 * écrit — et c'est tout ce qui demande une base.
 *
 * ── L'horloge ───────────────────────────────────────────────────────
 *
 * `updatedAt` ne peut pas servir : il est `@updatedAt`, donc déplacé par
 * **toute** écriture, y compris celles de la plateforme. Le job de rappels
 * d'échéance réveille aussi les brouillons et pose `lastReminderAt` ; il
 * aurait remis l'horloge à zéro chaque semaine et les douze mois ne
 * seraient jamais arrivés.
 *
 * L'horloge est donc ce que le candidat a produit : l'ouverture du
 * dossier, et le dernier dépôt de pièce. Aucune passe de nuit n'écrit de
 * `DocumentVersion`.
 *
 * ── Ce que l'abandon emporte ────────────────────────────────────────
 *
 * `purgeDueAt`. Un dossier clos garde sinon ses pièces d'identité pour
 * toujours : seule la clôture déclarée en posait une, et `ABANDONNE` est
 * terminal — `exigerModifiable` le refuse, plus rien ne viendra derrière.
 * Clore sans programmer la purge aurait ouvert un trou d'INV-5 à l'endroit
 * même où on ferme un dossier.
 *
 * Le statut passe par `miseEnEtat`, comme les sept autres écritures : un
 * brouillon n'est jamais `PRET`, mais la règle ne souffre pas d'exception
 * locale — c'est ainsi qu'elle avait disparu six fois sur sept.
 */

export interface BilanDInactivite {
  /** Brouillons examinés — inactifs au-delà du seuil de relance. */
  examines: number;
  relances: number;
  abandons: number;
  /**
   * Relances dont le **courrier** n'a pas quitté la plateforme. La
   * notification est écrite quand même : le candidat la lira en revenant.
   * Compté à part pour ne pas faire dire au bilan qu'un courrier est parti.
   */
  courriersRetenus: number;
  /** Ce qui a empêché un dossier d'être traité, dossier par dossier. */
  incidents: readonly string[];
}

const BILAN_VIDE: BilanDInactivite = {
  examines: 0,
  relances: 0,
  abandons: 0,
  courriersRetenus: 0,
  incidents: [],
};

/** Un dossier qui échoue ne fait pas tomber les autres ; la file rejoue. */
export const doitRejouer = (bilan: BilanDInactivite): boolean =>
  bilan.incidents.length > 0;

export async function traiterLesBrouillonsInactifs(
  maintenant: Date = new Date(),
): Promise<BilanDInactivite> {
  const seuil = new Date(
    maintenant.getTime() - RELANCE_JOURS * 24 * 60 * 60 * 1000,
  );

  /*
    La requête part des brouillons seuls : RG-04.2 ne vise qu'eux. Un
    dossier actif dont le candidat a cessé de s'occuper a des échéances,
    et c'est le rappel d'échéance qui le réveille — pas une clôture.

    `createdAt <= seuil` écarte d'emblée ceux qui sont trop jeunes pour
    être inactifs, quoi qu'ils portent. Le dernier dépôt, lui, se lit sur
    les versions : il faut les charger pour le connaître.
  */
  const brouillons = await db.application.findMany({
    where: {
      status: "BROUILLON",
      purgedAt: null,
      createdAt: { lte: seuil },
      /*
        RG-10.4. Entre la demande de suppression et l'anonymisation, le
        compte existe encore et `deletedAt` est nul — c'est l'état qu'ouvre
        une panne du stockage. Le relancer reviendrait à inviter à revenir
        quelqu'un qui vient de demander à partir.
      */
      user: COMPTE_JOIGNABLE,
    },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      readyAt: true,
      visaRule: { select: { countryCode: true, visaType: true } },
      user: { select: { email: true } },
      documents: {
        select: {
          versions: {
            select: { uploadedAt: true },
            orderBy: { uploadedAt: "desc" },
            take: 1,
          },
        },
      },
      /*
        La première échéance qu'il lui reste à tenir. Elle suspend
        l'horloge tant qu'elle est à venir : l'échéancier est le plan que
        la plateforme lui a fait, et fermer son dossier avant ce plan
        reviendrait à lui reprocher de l'avoir suivi.
      */
      deadlines: {
        where: { doneAt: null },
        select: { dueAt: true },
        orderBy: { dueAt: "asc" },
        take: 1,
      },
    },
  });

  const bilan: BilanDInactivite = { ...BILAN_VIDE };
  const incidents: string[] = [];

  for (const dossier of brouillons) {
    try {
      const depots = dossier.documents
        .flatMap((d) => d.versions)
        .map((v) => v.uploadedAt);
      const derniereActivite = depots.reduce(
        (tard, date) => (date > tard ? date : tard),
        dossier.createdAt,
      );
      const debut = debutDeLInactivite(
        derniereActivite,
        dossier.deadlines[0]?.dueAt ?? null,
      );
      const inactifDepuis = joursDInactivite(debut, maintenant);

      /*
        La relance déjà envoyée se lit sur la notification, et non sur un
        champ du dossier : écrire quoi que ce soit sur `Application`
        déplacerait `updatedAt`, et le brouillon passerait pour actif.

        `createdAt: { gte: derniereActivite }` et non « existe » : si le
        candidat revient déposer une pièce, l'horloge repart, et une
        nouvelle période d'inactivité mérite sa propre relance. La
        notification de l'an dernier ne vaut pas pour celle-ci.
      */
      const dejaRelance =
        (await db.notification.count({
          where: {
            applicationId: dossier.id,
            kind: "INACTIVITE",
            createdAt: { gte: debut },
          },
        })) > 0;

      const suite = suiteDInactivite({ inactifDepuis, dejaRelance });
      if (suite === "RIEN") continue;
      bilan.examines += 1;

      const edito = dossier.visaRule
        ? editorialDe(dossier.visaRule.countryCode, dossier.visaRule.visaType)
        : null;
      const destination = edito?.pays ?? dossier.visaRule?.countryCode ?? "en cours";

      if (suite === "ABANDONNER") {
        const texte = abandonDeBrouillon(destination, PURGE_JOURS);
        await db.$transaction([
          db.notification.create({
            data: {
              userId: dossier.userId,
              applicationId: dossier.id,
              kind: "INACTIVITE",
              title: texte.titre,
              body: texte.corps,
              createdAt: maintenant,
            },
          }),
          db.application.update({
            where: { id: dossier.id },
            data: {
              ...miseEnEtat("ABANDONNE", dossier.readyAt, maintenant),
              /*
                INV-5. `ABANDONNE` est terminal : si la purge n'est pas
                programmée ici, elle ne le sera jamais, et les pièces
                d'identité d'un dossier clos resteraient en stockage.
              */
              purgeDueAt: new Date(
                maintenant.getTime() + PURGE_JOURS * 24 * 60 * 60 * 1000,
              ),
            },
          }),
        ]);
        bilan.abandons += 1;
        continue;
      }

      const texte = relanceDeBrouillon(destination, debut, depots.length);

      /*
        Le courrier part **avant** la notification, comme pour les rappels
        et les divergences : une coupure ne doit rien laisser derrière
        elle. La notification est ce qui marque le dossier relancé — écrite
        d'abord, elle ferait passer pour prévenu quelqu'un dont le courrier
        n'est jamais parti, et la relance ne repartirait plus jamais.
      */
      const envoi = await envoyerRelanceDeBrouillon(
        dossier.user.email,
        texte.objet,
        texte.corps,
      ).catch(() => null);
      const suiteEnvoi = envoi ? suiteDeLEnvoi(envoi.issue) : { parti: false, renvoyable: true };
      if (!suiteEnvoi.parti && suiteEnvoi.renvoyable) {
        bilan.courriersRetenus += 1;
        continue;
      }

      /*
        `createdAt: maintenant` et non l'horloge du serveur : c'est cette
        date que la passe suivante relit pour savoir si elle a déjà
        relancé. Laisser `now()` la poser faisait décider sur une horloge
        et marquer sur une autre — deux dates qui coïncident en
        production, et divergent dès qu'une passe est rejouée en retard ou
        éprouvée sur un calendrier choisi. La fumée l'a montré : la passe
        du lendemain renvoyait la même relance.
      */
      await db.notification.create({
        data: {
          userId: dossier.userId,
          applicationId: dossier.id,
          kind: "INACTIVITE",
          title: texte.titre,
          body: texte.corps,
          createdAt: maintenant,
        },
      });
      bilan.relances += 1;
    } catch (erreur) {
      incidents.push(`${dossier.id} : ${cause(erreur)}`);
    }
  }

  return { ...bilan, incidents };
}

/** La cause, en une ligne utilisable — même lecture que la propagation. */
const cause = (erreur: unknown): string => {
  const texte = erreur instanceof Error ? erreur.message : String(erreur);
  return texte.split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? "cause inconnue";
};
