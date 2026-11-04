/**
 * Les jetons mesurés par le banc, comparés aux jetons facturés — S.212.
 *
 * Le 28/10, le banc mesurait 18 034 jetons d'entrée et 1 631 de sortie ;
 * la facture du jour en portait 21 986 et 3 201. L'écart ne s'est vu que
 * parce que le responsable a relevé la console à la main et que le suivi
 * L5 a fait la soustraction. Ce module la fait à chaque fois, sur la même
 * base : la facture par SKU fait foi pour les jetons (S.205), la métrique
 * par minute ne sert qu'à attribuer les requêtes.
 *
 * Un écart au-delà de 5 % de la quantité facturée est signalé, dans un
 * sens comme dans l'autre : une mesure trop basse sous-estime le coût
 * (INV-6), une mesure trop haute dit que le banc ne compte pas ce que le
 * fournisseur compte. Un appel dont la mesure n'est pas `CONNUE` rend la
 * comparaison incomplète, et elle le dit au lieu de compter zéro.
 *
 * Module pur : aucune dépendance à Prisma, Next, au réseau ou à un SDK.
 */

/** Au-delà de 5 % de la quantité facturée, l'écart est signalé. */
export const SEUIL_ECART_FACTURE = 0.05;

export interface AppelMesure {
  cas: string;
  fonction: string;
  mesure: { etat: string; jetonsEntree: number | null; jetonsSortie: number | null };
}

/** Ce que la facture porte pour la période, relevé par une personne. */
export interface QuantitesFacturees {
  entree: number;
  sortie: number;
}

export interface LigneDeComparaison {
  grandeur: "entree" | "sortie";
  mesure: number;
  facture: number;
  /** Facturé moins mesuré : positif quand le banc compte moins que la facture. */
  ecart: number;
  /** Rapporté au facturé ; `null` quand rien n'est facturé. */
  ecartRelatif: number | null;
  signale: boolean;
}

export interface ComparaisonALaFacture {
  appelsComptes: number;
  /** Appels sans mesure connue : leur part est inconnue, jamais nulle. */
  appelsSansMesure: readonly string[];
  lignes: readonly LigneDeComparaison[];
  /** Vrai si au moins une grandeur dépasse le seuil, ou si la mesure est incomplète. */
  aRapprocher: boolean;
  constats: readonly string[];
}

const ligne = (grandeur: "entree" | "sortie", mesure: number, facture: number, seuil: number): LigneDeComparaison => {
  const ecart = facture - mesure;
  const ecartRelatif = facture === 0 ? null : ecart / facture;
  // Rien de facturé mais quelque chose de mesuré : l'écart est infini.
  const signale = ecartRelatif === null ? mesure !== 0 : Math.abs(ecartRelatif) > seuil;
  return { grandeur, mesure, facture, ecart, ecartRelatif, signale };
};

const pourcent = (r: number) => `${(r * 100).toFixed(1).replace(".", ",")} %`;
const libelle = { entree: "entrée", sortie: "sortie" } as const;

export function comparerALaFacture(
  appels: readonly AppelMesure[],
  facture: QuantitesFacturees,
  seuil: number = SEUIL_ECART_FACTURE,
): ComparaisonALaFacture {
  // Un appel qui n'est pas parti n'a rien coûté : il n'entre pas dans la somme.
  const partis = appels.filter((a) => a.mesure.etat !== "NON_APPELE");
  const connus = partis.filter((a) => a.mesure.etat === "CONNUE" || a.mesure.etat === "SIMULATION");
  const appelsSansMesure = partis.filter((a) => !connus.includes(a)).map((a) => `${a.cas}/${a.fonction}`);
  const somme = (cle: "jetonsEntree" | "jetonsSortie") => connus.reduce((n, a) => n + (a.mesure[cle] ?? 0), 0);
  const lignes = [
    ligne("entree", somme("jetonsEntree"), facture.entree, seuil),
    ligne("sortie", somme("jetonsSortie"), facture.sortie, seuil),
  ];
  const constats: string[] = lignes
    .filter((l) => l.signale)
    .map((l) =>
      l.ecartRelatif === null
        ? `${libelle[l.grandeur]} : ${l.mesure} jetons mesurés, rien de facturé ; vérifier la période et le projet relevés`
        : `${libelle[l.grandeur]} : ${l.mesure} mesurés pour ${l.facture} facturés, écart de ${pourcent(l.ecartRelatif)} (seuil ${pourcent(seuil)}) ; ${
            l.ecart > 0
              ? "le banc compte moins que la facture : coût sous-estimé, ne pas reprendre la campagne avant d'en trouver la cause"
              : "le banc compte plus que la facture : vérifier la période relevée et l'attribution des requêtes"
          }`,
    );
  if (appelsSansMesure.length > 0) {
    constats.push(
      `${appelsSansMesure.length} appel(s) sans mesure connue (${appelsSansMesure.join(", ")}) : la comparaison est incomplète ; les rapprocher dans la console avant de conclure`,
    );
  }
  return {
    appelsComptes: connus.length,
    appelsSansMesure,
    lignes,
    aRapprocher: constats.length > 0,
    constats,
  };
}
