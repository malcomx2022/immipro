/**
 * Balayage antivirus — I.D, tranché le 20/09/2026.
 *
 * Le moteur n'est pas branché : aucun `ANTIVIRUS_URL` n'est renseigné, et
 * un appel écrit à l'aveugle ne se vérifie pas. Ce fichier est le point de
 * branchement, unique, et il traite son absence de la seule manière que la
 * décision autorise : `null`.
 *
 * **`null` n'est pas « sain ».** C'est la ligne à ne pas franchir. Un
 * balayeur absent qui rendrait `SAINE` ferait passer chaque fichier par la
 * frontière de sécurité sans que rien ne l'ait lu, et personne ne le
 * saurait — ni le candidat, ni l'exploitant, ni le consultant à qui la
 * pièce est transmise. Un fichier que personne n'a pu lire reste en
 * quarantaine.
 *
 * Le jour du branchement, `balayeurHttp` remplace `NON_BRANCHE` ici, et
 * nulle part ailleurs : tout le reste du code parle à `Balayeur`.
 */
import type { EtatBalayage } from "@/domain/dossiers/quarantaine";

export type Verdict =
  | { etat: Extract<EtatBalayage, "SAINE"> }
  | { etat: Extract<EtatBalayage, "INFECTEE">; menace: string };

/**
 * Rend `null` quand le moteur n'a pas répondu — non branché, injoignable ou
 * en erreur. L'appelant en fait une attente, jamais une acceptation.
 */
export type Balayeur = (objectKey: string) => Promise<Verdict | null>;

export const NON_BRANCHE: Balayeur = async () => null;

/**
 * Le balayeur que l'appelant exécutera, demandé au moment de s'en servir.
 *
 * L'état de service interroge cette fonction-là, et non une déclaration
 * tenue à la main : comparer ce qu'elle rend à `NON_BRANCHE` dit si un
 * adaptateur existe, sans qu'aucun registre puisse survivre au code qu'il
 * décrit. Le jour du branchement, une seule ligne change ici, et le dépôt
 * comme l'état de service en tiennent compte au même instant.
 */
export const leBalayeur = (): Balayeur => NON_BRANCHE;

/** Les variables sans lesquelles le moteur n'existe pas. Voir `DEPENDANCES`. */
export const VARIABLES = ["ANTIVIRUS_URL"] as const;

/**
 * Le dépôt s'appuie dessus pour refuser un téléversement qu'il ne pourrait
 * pas contrôler. La lecture se fait à l'appel et non au chargement du
 * module : une variable ajoutée sans redémarrage doit prendre effet, et un
 * test doit pouvoir poser l'inverse.
 */
export const antivirusConfigure = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): boolean => VARIABLES.every((v) => (environnement[v] ?? "").trim().length > 0);
