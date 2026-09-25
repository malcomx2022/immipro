/**
 * Le suivi après dépôt — WF-10 étape 2, arbitrage S.89.
 *
 * « Relance à J+30 puis J+60 pour connaître l'issue. » L'étape était
 * écrite depuis DOC-11 et rien ne la tenait : un candidat qui déclarait son
 * dépôt n'entendait plus parler de son dossier avant l'invitation à
 * confirmer l'instruction, dix mois plus tard.
 *
 * ── Ce que la date réelle change ────────────────────────────────────
 *
 * Les jalons se comptent depuis **la date réelle du dépôt**, que le
 * candidat déclare, et non depuis le jour où il l'a déclarée dans
 * ImmiPro. Un dépôt fait le 1er septembre et déclaré le 20 appelle sa
 * première relance le 1er octobre, pas le 20.
 *
 * Et une déclaration tardive ne déclenche pas de rafale : un jalon déjà
 * dépassé **le jour de la déclaration** ne part jamais — le candidat
 * vient de nous parler de son dépôt, lui demander s'il a eu une réponse
 * le même jour serait un bruit. Seul le prochain jalon encore utile se
 * planifie.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */
import { jourCivilPlus } from "@/domain/format/fuseau";
import { jourEnFrancais } from "@/domain/format/moment";

/** Les jalons, en jours après la date réelle du dépôt. */
export const JALONS_DE_SUIVI = [30, 60] as const;
export type JalonDeSuivi = (typeof JALONS_DE_SUIVI)[number];

export interface SuiviDuDepot {
  /** Date réelle du dépôt, `AAAA-MM-JJ`. */
  deposeLe: string;
  /** Jour où le candidat l'a déclarée dans ImmiPro, dans son fuseau. */
  declareLe: string;
  /** Jalons déjà envoyés. */
  envoyes: readonly number[];
  /** Aujourd'hui, dans le fuseau du candidat. */
  aujourdhui: string;
}

export const dateDuJalon = (deposeLe: string, jalon: number): string =>
  jourCivilPlus(deposeLe, jalon);

/**
 * Les jalons qui ont encore un sens : ceux dont la date n'était pas passée
 * le jour de la déclaration. Un jalon qui tombe le jour même compte — il
 * n'était pas dépassé.
 */
export const jalonsUtiles = (s: Pick<SuiviDuDepot, "deposeLe" | "declareLe">): JalonDeSuivi[] =>
  JALONS_DE_SUIVI.filter((j) => dateDuJalon(s.deposeLe, j) >= s.declareLe);

/**
 * La relance à envoyer aujourd'hui, ou `null`.
 *
 * Parmi les jalons utiles, échus et pas encore envoyés, **le plus
 * récent** seulement : une passe arrêtée pendant des semaines ne rattrape
 * pas J+30 puis J+60 le même matin. Et un jalon plus ancien qu'un jalon
 * déjà envoyé ne part plus : il a été dépassé par la relance suivante.
 */
export function relanceDuJour(s: SuiviDuDepot): JalonDeSuivi | null {
  const dernierEnvoye = Math.max(0, ...s.envoyes);
  const echus = jalonsUtiles(s).filter(
    (j) => dateDuJalon(s.deposeLe, j) <= s.aujourdhui && j > dernierEnvoye,
  );
  return echus.length > 0 ? echus[echus.length - 1]! : null;
}

/** La prochaine relance prévue, pour l'écran — ou `null` s'il n'y en a plus. */
export function prochaineRelance(s: SuiviDuDepot): { jalon: JalonDeSuivi; le: string } | null {
  const dernierEnvoye = Math.max(0, ...s.envoyes);
  const suivante = jalonsUtiles(s).find(
    (j) => j > dernierEnvoye && dateDuJalon(s.deposeLe, j) >= s.aujourdhui,
  );
  return suivante ? { jalon: suivante, le: dateDuJalon(s.deposeLe, suivante) } : null;
}

export interface RelanceDeSuivi {
  titre: string;
  objet: string;
  corps: string;
}

/**
 * Le texte d'une relance.
 *
 * Il demande une information et dit où la donner. Il ne suppose rien de
 * la réponse de l'autorité, ne commente pas le délai, et n'avance aucune
 * probabilité (INV-1, INV-2). Attendre encore est une réponse normale, et
 * la relance le dit : il n'y a rien à faire.
 */
export function relanceDeSuivi(
  jalon: JalonDeSuivi,
  destination: string,
  deposeLe: string,
): RelanceDeSuivi {
  const suite =
    jalon === JALONS_DE_SUIVI[0]
      ? "Si tu attends encore, tu n'as rien à faire : nous te reposerons la question dans trente jours."
      : "Si tu attends encore, tu n'as rien à faire. Avant la fin de la conservation de tes pièces, nous te demanderons si l'instruction continue.";
  return {
    titre: "As-tu reçu une réponse ?",
    objet: `${destination} — as-tu reçu une réponse à ta demande ?`,
    corps: [
      `Tu as déposé ta demande le ${jourEnFrancais(deposeLe)}.`,
      "",
      "Si l'autorité t'a répondu, déclare l'issue depuis « Clôturer » dans ton dossier.",
      suite,
    ].join("\n"),
  };
}
