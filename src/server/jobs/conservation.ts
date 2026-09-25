import { db } from "@/lib/db";
import { envoyerAvisDeConservation } from "@/server/courrier";
import { suiteDeLEnvoi } from "@/domain/courrier/transport";
import {
  avertissementDeSuspension,
  debutDeLInvitation,
  echeanceAnnoncee,
  echeanceDeLaSuspension,
  invitationDuDepot,
  preavisDuDepot,
  suiteDeLaSuspension,
  suiteDuDepot,
  type AvisDeConservation,
} from "@/domain/dossiers/conservation";
import { editorialDe } from "@/lib/contenu/destinations";
import { echeanceDuDossierSoumis } from "@/server/dossiers/conservation";
import { COMPTE_JOIGNABLE } from "@/server/acces/suppression";

/**
 * Conservation des pièces des dossiers soumis et suspendus — arbitrage S.78.
 *
 * Deux états que l'inactivité ne clôt pas. Un dossier soumis attend
 * l'autorité ; un dossier suspendu attend la plateforme. Ni l'un ni
 * l'autre ne garde pour autant ses pièces d'identité sans terme : c'est ce
 * que la sonde de santé comptait depuis S.78, et que rien ne traitait.
 *
 * ── Ce que ce job fait, et ce qu'il laisse à la purge ───────────────
 *
 * Il **annonce** et il pose l'échéance. Il ne supprime rien : la purge
 * ordinaire lit `purgeDueAt`, et elle sait déjà résister à un stockage
 * fâché — une version dont l'objet résiste garde sa clé, le dossier reste
 * échu, la passe du lendemain réessaie. Écrire une seconde purge ici en
 * aurait fait une seconde à tenir.
 *
 * L'échéance ne se pose qu'avec l'annonce. Le courrier part d'abord, comme
 * pour les relances : une coupure entre les deux ne doit pas laisser une
 * purge programmée dont personne n'a été averti. Un courrier retenu laisse
 * le dossier tel quel, et la passe suivante recommence.
 *
 * ── Ce que la décision elle-même tient ──────────────────────────────
 *
 * Quand annoncer, et ce qu'on écrit : `domain/dossiers/conservation`, sans
 * base ni réseau. Ce fichier lit, envoie, écrit.
 */

export interface BilanDeConservation {
  /** Dossiers soumis invités à confirmer l'instruction. */
  invitations: number;
  /** Dossiers soumis dont la purge vient d'être annoncée. */
  preavis: number;
  /** Dossiers suspendus dont la purge vient d'être annoncée. */
  avertissements: number;
  /** Annonces dont le courrier n'est pas parti : rien n'est écrit. */
  courriersRetenus: number;
  incidents: readonly string[];
}

/** Un dossier qui échoue ne fait pas tomber les autres ; la file rejoue. */
export const doitRejouer = (bilan: BilanDeConservation): boolean =>
  bilan.incidents.length > 0;

/** Des pièces encore dans le stockage : sans elles, rien n'est à conserver. */
const PORTE_DES_PIECES = {
  documents: { some: { versions: { some: { purgedAt: null } } } },
} as const;

const destinationDe = (regle: { countryCode: string; visaType: string } | null): string => {
  const edito = regle ? editorialDe(regle.countryCode, regle.visaType) : null;
  return edito?.pays ?? regle?.countryCode ?? "en cours";
};

/**
 * Envoie l'avis, puis dit s'il est parti. Un transport en panne qui peut
 * être rejoué laisse le dossier en l'état : l'annonce repartira demain.
 */
async function envoyer(email: string, avis: AvisDeConservation): Promise<boolean> {
  const envoi = await envoyerAvisDeConservation(email, avis.objet, avis.corps).catch(() => null);
  const suite = envoi ? suiteDeLEnvoi(envoi.issue) : { parti: false, renvoyable: true };
  return suite.parti || !suite.renvoyable;
}

const notification = (
  dossier: { id: string; userId: string },
  avis: AvisDeConservation,
  maintenant: Date,
) =>
  db.notification.create({
    data: {
      userId: dossier.userId,
      applicationId: dossier.id,
      kind: "CONSERVATION",
      title: avis.titre,
      body: avis.corps,
      /*
        L'horloge de la passe, pas celle du serveur : c'est cette date que
        la passe suivante relit pour savoir si elle a déjà invité ou
        averti. Même raison que pour les relances d'inactivité.
      */
      createdAt: maintenant,
    },
  });

/**
 * Les dossiers soumis — conservation douze mois après le dépôt déclaré,
 * prolongée par chaque confirmation.
 */
export async function traiterLesDepots(maintenant: Date = new Date()): Promise<BilanDeConservation> {
  const dossiers = await db.application.findMany({
    where: {
      status: "SOUMIS",
      purgedAt: null,
      user: COMPTE_JOIGNABLE,
      ...PORTE_DES_PIECES,
    },
    select: {
      id: true,
      userId: true,
      submittedAt: true,
      depositedOn: true,
      retentionUntil: true,
      purgeDueAt: true,
      visaRule: { select: { countryCode: true, visaType: true } },
      user: { select: { email: true } },
    },
  });

  const bilan = { invitations: 0, preavis: 0, avertissements: 0, courriersRetenus: 0 };
  const incidents: string[] = [];

  for (const dossier of dossiers) {
    try {
      const echeance = echeanceDuDossierSoumis(dossier);
      const dejaInvite =
        (await db.notification.count({
          where: {
            applicationId: dossier.id,
            kind: "CONSERVATION",
            createdAt: { gte: debutDeLInvitation(echeance) },
          },
        })) > 0;

      const suite = suiteDuDepot({
        echeance,
        dejaInvite,
        purgeAnnoncee: dossier.purgeDueAt !== null,
        maintenant,
      });
      if (suite === "RIEN") continue;

      const destination = destinationDe(dossier.visaRule);

      if (suite === "INVITER") {
        const avis = invitationDuDepot(destination, echeance);
        if (!(await envoyer(dossier.user.email, avis))) {
          bilan.courriersRetenus += 1;
          continue;
        }
        await notification(dossier, avis, maintenant);
        bilan.invitations += 1;
        continue;
      }

      const purgeLe = echeanceAnnoncee(echeance, maintenant);
      const avis = preavisDuDepot(destination, purgeLe);
      if (!(await envoyer(dossier.user.email, avis))) {
        bilan.courriersRetenus += 1;
        continue;
      }
      await db.$transaction([
        notification(dossier, avis, maintenant),
        // Le dossier reste `SOUMIS` : la purge efface des octets, pas un
        // dossier (`etatApresPurge`).
        db.application.update({
          where: { id: dossier.id },
          data: { purgeDueAt: purgeLe },
        }),
      ]);
      bilan.preavis += 1;
    } catch (erreur) {
      incidents.push(`${dossier.id} : ${cause(erreur)}`);
    }
  }

  return { ...bilan, incidents };
}

/**
 * Les dossiers suspendus — avertissement à onze mois, purge à douze.
 *
 * Aucune inactivité ne clôt un dossier que la plateforme a mis en pause :
 * l'état ne change pas, la dette reste ouverte, et la sonde de santé la
 * compte. Seuls les octets ont un terme.
 *
 * Un dossier déjà purgé peut reporter des pièces : la pause n'empêche pas
 * de déposer, et c'est même ce que la reprise demandera. Il ressort donc
 * ici tant qu'il porte des pièces vivantes, et son avertissement se lit
 * depuis la dernière purge — un avis déjà suivi d'une purge n'annonce pas
 * la suivante.
 */
export async function traiterLesSuspensions(
  maintenant: Date = new Date(),
): Promise<BilanDeConservation> {
  const dossiers = await db.application.findMany({
    where: {
      status: "SUSPENDU",
      user: COMPTE_JOIGNABLE,
      ...PORTE_DES_PIECES,
      OR: [{ purgeDueAt: null }, { purgedAt: { not: null } }],
    },
    select: {
      id: true,
      userId: true,
      suspendedAt: true,
      updatedAt: true,
      purgedAt: true,
      visaRule: { select: { countryCode: true, visaType: true } },
      user: { select: { email: true } },
    },
  });

  const bilan = { invitations: 0, preavis: 0, avertissements: 0, courriersRetenus: 0 };
  const incidents: string[] = [];

  for (const dossier of dossiers) {
    try {
      // La base exige la date sur tout dossier suspendu ; le repli ne sert
      // qu'à ne pas faire tomber la passe si la garde était un jour levée.
      const suspenduLe = dossier.suspendedAt ?? dossier.updatedAt;
      const dejaAverti =
        (await db.notification.count({
          where: {
            applicationId: dossier.id,
            kind: "CONSERVATION",
            createdAt: { gte: dossier.purgedAt ?? suspenduLe },
          },
        })) > 0;

      if (suiteDeLaSuspension(suspenduLe, dejaAverti, maintenant) === "RIEN") continue;

      const purgeLe = echeanceDeLaSuspension(suspenduLe, maintenant);
      const avis = avertissementDeSuspension(destinationDe(dossier.visaRule), purgeLe);
      if (!(await envoyer(dossier.user.email, avis))) {
        bilan.courriersRetenus += 1;
        continue;
      }
      await db.$transaction([
        notification(dossier, avis, maintenant),
        db.application.update({
          where: { id: dossier.id },
          /*
            `purgedAt` repart à nul quand des pièces ont été redéposées
            après une première purge : la purge ne regarde que les
            dossiers qui ne se disent pas purgés, et celui-ci ne l'est plus.
          */
          data: { purgeDueAt: purgeLe, purgedAt: null },
        }),
      ]);
      bilan.avertissements += 1;
    } catch (erreur) {
      incidents.push(`${dossier.id} : ${cause(erreur)}`);
    }
  }

  return { ...bilan, incidents };
}

/** Les deux passes, dans l'ordre, en un bilan. */
export async function traiterLaConservation(
  maintenant: Date = new Date(),
): Promise<BilanDeConservation> {
  const depots = await traiterLesDepots(maintenant);
  const suspensions = await traiterLesSuspensions(maintenant);
  return {
    invitations: depots.invitations,
    preavis: depots.preavis,
    avertissements: suspensions.avertissements,
    courriersRetenus: depots.courriersRetenus + suspensions.courriersRetenus,
    incidents: [...depots.incidents, ...suspensions.incidents],
  };
}

/** La cause, en une ligne utilisable — même lecture que l'inactivité. */
const cause = (erreur: unknown): string => {
  const texte = erreur instanceof Error ? erreur.message : String(erreur);
  return texte.split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? "cause inconnue";
};
