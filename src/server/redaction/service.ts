import {
  CRITIQUE_NON_BRANCHEE,
  REDACTEUR_NON_BRANCHE,
  type Critique,
  type Redacteur,
} from "./redacteur";

/**
 * Le point où la mise en forme et l'analyse critique seront branchées.
 *
 * Les deux rendent `null` aujourd'hui, et c'est tout ce que ce module
 * fait. Écrire `redactionConfiguree() ? leVrai : NON_BRANCHE` alors que
 * `leVrai` n'existe pas donnerait un aiguillage qui n'aiguille rien —
 * du code qui a l'air de brancher, ce qui est précisément le genre de
 * faux-semblant qu'I.C interdit. Le jour où la clé et l'appel existent,
 * c'est ici, sur deux lignes, que l'aiguillage apparaîtra.
 *
 * Des fonctions et non des constantes : l'appelant demande le service au
 * moment de s'en servir, et non au chargement du module — c'est-à-dire au
 * démarrage du serveur, avant qu'une recette ait reçu sa clé.
 */
export const leRedacteur = (): Redacteur => REDACTEUR_NON_BRANCHE;

export const laCritique = (): Critique => CRITIQUE_NON_BRANCHEE;
