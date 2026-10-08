import { createHmac, randomBytes } from "node:crypto";
import { aBloquer, finDuBlocage } from "@/domain/comptes/connexion";

/**
 * Échecs de connexion des adresses sans compte — A-02, revue du
 * 07/10/2026, M2 (décision D-3, option B).
 *
 * Le décompte « il te reste N essais » se lisait au premier essai : une
 * adresse connue rendait 4, une adresse inconnue 5, faute de compteur. Un
 * seul appel disait donc si une adresse avait un compte ici, ce que l'écran
 * existe pour taire. Le produit a choisi de garder le décompte : les
 * adresses sans compte ont donc leur compteur, avec les mêmes règles de
 * blocage que les comptes.
 *
 * L'adresse n'est pas conservée. La clé est une empreinte HMAC dont le sel
 * est tiré au démarrage du processus et ne quitte jamais la mémoire : ce
 * registre ne dresse pas la liste de qui a essayé de se connecter sans
 * être client.
 *
 * Le prix, consigné : la parité se perd au redémarrage, et un tiers peut
 * « bloquer » une adresse sans compte, ce qui ne gêne aucune inscription.
 * En mémoire du processus, comme `server/http/limites.ts` : le jour où il
 * y a plusieurs instances, c'est ce module qui change, pas la règle.
 */

interface Entree {
  echecs: number;
  bloqueJusqua: number | null;
  vu: number;
}

const SEL = randomBytes(32);

/** Au-delà, une entrée est oubliée. */
export const OUBLI_HEURES = 24;

/**
 * Plafond du registre. Une rafale d'adresses inventées ne fait pas grossir
 * la mémoire sans borne : la plus anciennement touchée sort la première.
 */
const ENTREES_MAXI = 50_000;
const PURGE_TOUS_LES = 500;

const registre = new Map<string, Entree>();
let ecritures = 0;

const cle = (email: string): string => createHmac("sha256", SEL).update(email).digest("base64url");

const perimee = (entree: Entree, maintenant: number): boolean =>
  entree.vu <= maintenant - OUBLI_HEURES * 3_600_000;

function menage(maintenant: number): void {
  for (const [k, entree] of registre) {
    if (perimee(entree, maintenant)) registre.delete(k);
  }
}

export interface EchecsSansCompte {
  echecs: number;
  bloqueJusqua: Date | null;
}

const lue = (entree: Entree | undefined): EchecsSansCompte => ({
  echecs: entree?.echecs ?? 0,
  bloqueJusqua: entree?.bloqueJusqua ? new Date(entree.bloqueJusqua) : null,
});

/** L'adresse est attendue normalisée, comme la colonne `User.email`. */
export function lireEchecsSansCompte(email: string, maintenant = new Date()): EchecsSansCompte {
  const entree = registre.get(cle(email));
  if (entree && perimee(entree, maintenant.getTime())) return lue(undefined);
  return lue(entree);
}

/**
 * Compte un échec et pose le blocage au cinquième, comme `connecter` le
 * fait pour un compte. Le compteur n'est jamais remis à zéro par le temps
 * seul avant l'oubli : un compte réel garde aussi ses échecs au-delà d'un
 * blocage, jusqu'à la connexion réussie qu'une adresse sans compte n'a pas.
 */
export function noterEchecSansCompte(email: string, maintenant = new Date()): EchecsSansCompte {
  const instant = maintenant.getTime();
  if (++ecritures % PURGE_TOUS_LES === 0) menage(instant);

  const k = cle(email);
  const avant = registre.get(k);
  const echecs = (avant && !perimee(avant, instant) ? avant.echecs : 0) + 1;
  const entree: Entree = {
    echecs,
    bloqueJusqua: aBloquer(echecs) ? finDuBlocage(maintenant).getTime() : null,
    vu: instant,
  };
  // Réinsérée en fin de registre : l'ordre d'insertion est l'ordre d'usage.
  registre.delete(k);
  registre.set(k, entree);
  while (registre.size > ENTREES_MAXI) {
    const plusAncienne = registre.keys().next().value;
    if (plusAncienne === undefined) break;
    registre.delete(plusAncienne);
  }
  return lue(entree);
}

/** Pour les tests : repart d'un registre vide. */
export function reinitialiserEchecsSansCompte(): void {
  registre.clear();
  ecritures = 0;
}
