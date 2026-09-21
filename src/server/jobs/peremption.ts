import { db } from "@/lib/db";
import { recalculerCompletude } from "@/server/acces/dossiers";
import { corpsEchue, TITRE_ECHUE } from "@/domain/dossiers/peremption";

/**
 * Péremption des pièces — RG-07.4, WF-09 étape 2.
 *
 * « Une pièce passant en `EXPIREE` fait régresser le score et repasse le
 * dossier de `PRET` à `ACTIF`. » La seconde moitié existait depuis
 * longtemps, dans `recalculerCompletude`. La première n'existait pas :
 * `DocumentStatus.EXPIREE` n'était écrit nulle part, seulement lu. Un
 * passeport pouvait expirer sans que rien ne bouge, et le tableau de bord
 * continuait d'annoncer que rien ne bloquait le dépôt.
 *
 * Le partage avec la lecture est celui de `depublierLesFichesEchues`, et
 * pour les mêmes raisons : la vue candidat déclasse déjà la pièce à
 * l'affichage, requête par requête, parce qu'un écran ne doit pas attendre
 * trois heures du matin pour dire vrai. Ce job rend l'état **stocké**
 * conforme à ce qui s'affiche — le barème, le statut du dossier, la date
 * de mise en état — et prévient le candidat. Les deux sont nécessaires :
 * sans le filtre, un job en retard laisse une pièce périmée passer pour
 * conforme ; sans le job, la base garde un dossier « prêt » qui ne l'est
 * plus, et personne n'est prévenu.
 *
 * Le remède passe à `REMPLACER` : « Ajouter » sur une ligne où un fichier
 * existe déjà fait croire qu'il manque, et fait chercher ce qu'on a déjà
 * envoyé. Même raison qu'à l'analyse.
 */
export interface BilanPeremption {
  /** Pièces déclassées. */
  pieces: number;
  /** Dossiers dont la complétude a été refaite. */
  dossiers: number;
  /** Dossiers qui ont quitté l'état « prêt à déposer ». */
  redescendus: number;
}

export async function declasserLesPiecesEchues(
  maintenant = new Date(),
): Promise<BilanPeremption> {
  const jour = new Date(
    Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()),
  );

  /*
    Les dossiers figés sont exclus : une pièce d'un dossier clôturé ou
    archivé n'a plus de complétude à faire régresser, et déclasser sa
    pièce ne ferait que réécrire une archive. `recalculerCompletude`
    s'abstient déjà sur ces états ; la requête s'abstient aussi, pour ne
    pas envoyer d'alerte sur un dossier que le candidat a fermé.
  */
  const echues = await db.document.findMany({
    where: {
      status: "CONFORME",
      expiresAt: { lt: jour },
      application: { status: { in: ["BROUILLON", "ACTIF", "PRET"] } },
    },
    select: {
      id: true,
      label: true,
      expiresAt: true,
      applicationId: true,
      application: { select: { userId: true, status: true } },
    },
  });

  if (echues.length === 0) return { pieces: 0, dossiers: 0, redescendus: 0 };

  const etaitPret = new Map(echues.map((d) => [d.applicationId, d.application.status === "PRET"]));

  for (const document of echues) {
    await db.document.update({
      where: { id: document.id },
      data: { status: "EXPIREE", remedy: "REMPLACER" },
    });
    await db.notification.create({
      data: {
        userId: document.application.userId,
        applicationId: document.applicationId,
        kind: "ECHEANCE",
        title: TITRE_ECHUE(document.label),
        body: corpsEchue(
          document.label,
          document.expiresAt!.toISOString().slice(0, 10),
          etaitPret.get(document.applicationId) ?? false,
        ),
        dueAt: document.expiresAt,
      },
    });
  }

  const dossiers = [...new Set(echues.map((d) => d.applicationId))];
  for (const id of dossiers) await recalculerCompletude(id);

  /*
    Redescendus : ceux qui étaient « prêts » avant la passe et ne le sont
    plus après. Compter simplement les dossiers `ACTIF` à la fin y
    rangerait ceux qui ne l'ont jamais quitté, et le bilan annoncerait une
    régression qui n'a pas eu lieu.
  */
  const etaient = dossiers.filter((id) => etaitPret.get(id));
  const encorePrets = etaient.length
    ? await db.application.count({ where: { id: { in: etaient }, status: "PRET" } })
    : 0;

  return {
    pieces: echues.length,
    dossiers: dossiers.length,
    redescendus: etaient.length - encorePrets,
  };
}
