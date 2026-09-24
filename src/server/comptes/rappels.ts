import { db } from "@/lib/db";
import { sonderLeCourrier } from "@/server/courrier";
import { lireLesConstats } from "@/server/exploitation/constats";
import {
  canalDepuisLaSonde,
  lirePreferences,
  type CanalEmail,
  type EtatDuCourrier,
  type PreferencesDeRappel,
} from "@/domain/dossiers/preferences-rappels";

/**
 * Les préférences de rappel d'un compte, et l'état réel du canal email —
 * S.87.
 *
 * Les deux se lisent ensemble parce qu'aucun écran ne doit afficher l'un
 * sans l'autre : « tu recevras un email » n'est vrai que si le candidat le
 * veut **et** que le transport l'a prouvé.
 */

/**
 * Le canal email, sur le même constat que l'état de service : un envoi ou
 * une vérification réels et récents. Jamais la seule présence de
 * `SMTP_URL`.
 */
export async function canalEmail(maintenant = new Date()): Promise<CanalEmail> {
  const constats = await lireLesConstats();
  return canalDepuisLaSonde(sonderLeCourrier(process.env, constats.messagerie, maintenant));
}

export interface DernierRappel {
  quand: Date;
  titre: string;
  /** `null` : aucun courrier demandé pour ce rappel. */
  courrier: EtatDuCourrier | null;
}

export interface EtatDesRappels {
  preferences: PreferencesDeRappel;
  canal: CanalEmail;
  dernier: DernierRappel | null;
}

export async function etatDesRappels(userId: string): Promise<EtatDesRappels> {
  const [ligne, canal, dernier] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        remindersEnabled: true,
        reminderEmail: true,
        reminderTimeZone: true,
        reminderLeadDays: true,
      },
    }),
    canalEmail(),
    db.notification.findFirst({
      where: { userId, kind: "ECHEANCE", dedupKey: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, title: true, emailStatus: true },
    }),
  ]);
  return {
    preferences: lirePreferences(ligne),
    canal,
    dernier: dernier
      ? { quand: dernier.createdAt, titre: dernier.title, courrier: dernier.emailStatus }
      : null,
  };
}

export async function enregistrerLesPreferencesDeRappel(
  userId: string,
  prefs: PreferencesDeRappel,
): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      remindersEnabled: prefs.actifs,
      reminderEmail: prefs.email,
      reminderTimeZone: prefs.fuseau,
      reminderLeadDays: prefs.joursAvant,
    },
  });
}
