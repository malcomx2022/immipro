import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DUREE_ATTENTE_SECONDES,
  PERIODE_RELEVE_SECONDES,
  LIBELLES_ETAPES,
  suiteDeLAttente,
} from "@/domain/paiement/attente";
import { echecPourMotif, motifParDefaut } from "@/domain/paiement/echec";
import { REGLES } from "@/server/http/limites";
import { suiteDictable } from "@/server/securite/secret";

const lire = (f: string) => readFileSync(f, "utf8");

/**
 * Le code sans ses commentaires. Les commentaires du projet citent
 * volontiers ce qu'ils remplacent — « il affichait `IMP-2609-4471` » — et
 * viser le mot plutôt que le rendu ferait échouer la bonne explication.
 */
const sansCommentaires = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");

/**
 * Tunnel de paiement — M.A, WF-05.
 *
 * L'écran d'attente ne relevait rien : la route de statut existait et
 * n'était appelée par personne. Ce qui se vérifie ici, c'est surtout ce que
 * la relève **n'a pas le droit** de conclure.
 */
describe("ce que l'écran fait de la relève", () => {
  it("ne confirme que sur un CONFIRMEE", () => {
    // Naviguer vers « paiement confirmé » sur autre chose annoncerait un
    // débit que l'opérateur n'a pas fait.
    expect(suiteDeLAttente("CONFIRMEE", 10)).toEqual({ suite: "confirme" });
    for (const statut of ["INITIEE", "EN_ATTENTE", "ECHOUEE", "EXPIREE", "REMBOURSEE"]) {
      expect(suiteDeLAttente(statut, 10).suite).not.toBe("confirme");
    }
  });

  it("patiente tant que la transaction est ouverte", () => {
    expect(suiteDeLAttente("INITIEE", 0)).toEqual({ suite: "patienter" });
    expect(suiteDeLAttente("EN_ATTENTE", 120)).toEqual({ suite: "patienter" });
  });

  it("le rebours épuisé ne vaut pas échec", () => {
    // La transaction reste ouverte tant que la base ne l'a pas fermée, et
    // un webhook en retard la confirme encore (RG-05.1). L'écran cesse de
    // relever et dit que le délai est dépassé, sans rien affirmer.
    expect(suiteDeLAttente("EN_ATTENTE", DUREE_ATTENTE_SECONDES)).toEqual({ suite: "expire" });
    expect(suiteDeLAttente("EN_ATTENTE", DUREE_ATTENTE_SECONDES + 60)).toEqual({
      suite: "expire",
    });
  });

  it("ne prononce « délai dépassé » que si la base l'a prononcé", () => {
    expect(suiteDeLAttente("EXPIREE", 5)).toEqual({ suite: "echec", motif: "delai_depasse" });
    // Un refus dont la raison n'est pas conservée n'accuse rien : $-05
    // retombe sur son cas le moins accusateur.
    expect(suiteDeLAttente("ECHOUEE", 5)).toEqual({ suite: "echec", motif: null });
  });

  it("un statut inconnu ne fait pas patienter indéfiniment", () => {
    expect(suiteDeLAttente("UN_ETAT_QUI_N_EXISTE_PAS", 5)).toEqual({
      suite: "echec",
      motif: null,
    });
  });

  it("la cadence tient dans le régime de limitation qui lui est réservé", () => {
    // Cent relevés pour un parcours parfaitement normal : c'est la raison
    // d'être du régime `attente`, et il ne doit pas couper avant la fin.
    const releves = Math.ceil(DUREE_ATTENTE_SECONDES / PERIODE_RELEVE_SECONDES);
    expect(REGLES.attente.fenetreSecondes).toBeGreaterThanOrEqual(DUREE_ATTENTE_SECONDES);
    expect(REGLES.attente.appels).toBeGreaterThan(releves);
  });
});

describe("ce que les écrans nomment quand la base ne sait pas", () => {
  it("le fil d'étapes se passe d'un numéro qui n'existe pas", () => {
    expect(LIBELLES_ETAPES.notification("97 •• •• 42")).toBe(
      "Notification envoyée au 97 •• •• 42",
    );
    expect(LIBELLES_ETAPES.notification(null)).toBe("Notification envoyée sur ton téléphone");
    expect(LIBELLES_ETAPES.notification(null)).not.toMatch(/null|undefined/u);
  });

  it("l'échec renvoie au profil plutôt que de citer un vide", () => {
    const sans = echecPourMotif("delai_depasse", "15 000 F", null);
    expect(sans.verifications.join(" ")).toContain("le numéro enregistré sur ton profil");
    expect(sans.verifications.join(" ")).not.toMatch(/le null|le undefined/u);
    const avec = echecPourMotif("delai_depasse", "15 000 F", "97 •• •• 42");
    expect(avec.verifications.join(" ")).toContain("97 •• •• 42");
  });
});

describe("le motif d'échec, quand le fournisseur n'en donne pas", () => {
  it("un refus reçu en deux secondes ne s'annonce pas comme un délai dépassé", () => {
    // Trouvé en exécutant : le webhook `declined` arrivait aussitôt, et
    // $-05 répondait « Les cinq minutes se sont écoulées sans
    // confirmation » — un fait faux, qui envoie vérifier le réseau au lieu
    // du compte (DOC-12 §16 règle 1).
    expect(motifParDefaut("ECHOUEE")).toBe("refus_operateur");
    const refus = echecPourMotif("refus_operateur", "5 000 F", "97 •• •• 42");
    expect(refus.titre).toBe("Ton opérateur n'a pas confirmé le paiement");
    expect(refus.corps).not.toMatch(/cinq minutes/u);
    // Et il n'accuse pas non plus le solde, qu'on ne connaît pas.
    expect(refus.corps).toMatch(/la raison ne nous est pas communiquée/u);
    expect(refus.titre).not.toMatch(/solde/iu);
  });

  it("un délai dépassé n'est prononcé que par la base", () => {
    expect(motifParDefaut("EXPIREE")).toBe("delai_depasse");
    expect(echecPourMotif("delai_depasse", "5 000 F", null).corps).toMatch(/cinq minutes/u);
  });

  it("une transaction encore ouverte dit que la notification manque", () => {
    // « Je n'ai rien reçu », cliqué avant la fin du rebours.
    for (const statut of ["INITIEE", "EN_ATTENTE"]) {
      expect(motifParDefaut(statut)).toBe("notification_absente");
    }
    const absente = echecPourMotif("notification_absente", "5 000 F", null);
    expect(absente.titre).toBe("La notification n'est pas arrivée");
    expect(absente.corps).not.toMatch(/cinq minutes|refusé/u);
  });

  it("chaque motif dit qu'aucun montant n'a été débité", () => {
    // La règle 2 de DOC-12 §16 : le corps dit ce qui est conservé.
    for (const motif of [
      "delai_depasse",
      "solde_insuffisant",
      "refus_operateur",
      "notification_absente",
    ] as const) {
      expect(echecPourMotif(motif, "5 000 F", null).corps).toMatch(/conservé/u);
    }
  });

  it("l'écran préfère le motif du fournisseur au sien", () => {
    const source = lire("src/app/(app)/paiement/echec/Echec.tsx");
    expect(source).toMatch(/estMotif\(motif\) \? motif : motifParDefaut\(paiement\.statut\)/u);
  });
});

describe("le branchement du tunnel", () => {
  const ecran = (f: string) => lire(`src/app/(app)/paiement/${f}`);

  it("chaque écran lit la base, aucun ne recopie la grille en dur", () => {
    for (const f of [
      "pack/page.tsx",
      "recapitulatif/page.tsx",
      "attente/page.tsx",
      "echec/page.tsx",
      "confirme/page.tsx",
      "recu/[id]/page.tsx",
    ]) {
      const source = sansCommentaires(ecran(f));
      expect(source).toMatch(/tunnelDuPaiement|paiementDuTunnel|recuDuPaiement/u);
      // Les valeurs inventées du prototype : un pack au hasard, une
      // référence écrite à la main, un numéro de téléphone.
      expect(source).not.toMatch(/PACKS\[0\]/u);
      expect(source).not.toMatch(/IMP-\d{4}-/u);
      expect(source).not.toMatch(/97000042/u);
    }
  });

  it("aucun écran du tunnel n'est pré-généré", () => {
    // Ils portent tous une transaction ou un dossier nominatif : il n'y a
    // pas de version qui vaille pour tout le monde.
    for (const f of [
      "pack/page.tsx",
      "recapitulatif/page.tsx",
      "attente/page.tsx",
      "echec/page.tsx",
      "confirme/page.tsx",
      "recu/[id]/page.tsx",
    ]) {
      expect(ecran(f)).toMatch(/export const dynamic = "force-dynamic"/u);
    }
  });

  it("le paiement s'ouvre en un seul endroit", () => {
    // Deux écrans qui créent une transaction, c'est un double débit en
    // attente d'arriver. Seul le récapitulatif appelle la route.
    const appelants = [
      "pack/ChoixDuPack.tsx",
      "recapitulatif/Recapitulatif.tsx",
      "attente/Attente.tsx",
      "echec/Echec.tsx",
    ].filter((f) => /"\/api\/paiements"/u.test(ecran(f)));
    expect(appelants).toEqual(["recapitulatif/Recapitulatif.tsx"]);
  });

  it("l'attente relève la route de statut, et elle seule", () => {
    const source = ecran("attente/Attente.tsx");
    expect(source).toMatch(/\/api\/paiements\/statut\?tx=/u);
    expect(source).toMatch(/suiteDeLAttente/u);
    // La décision n'est pas recopiée dans le composant.
    expect(source).not.toMatch(/=== "CONFIRMEE"/u);
  });

  it("la navigation de l'attente remplace au lieu d'empiler", () => {
    // Un retour arrière depuis « paiement confirmé » ne doit pas ramener
    // sur une attente qui relèverait un paiement déjà abouti.
    const source = ecran("attente/Attente.tsx");
    expect(source).toMatch(/router\.replace\(\s*`\/paiement\/confirme/u);
    expect(source).toMatch(/router\.replace\(\s*`\/paiement\/echec/u);
    expect(source).not.toMatch(/router\.push\(\s*`\/paiement\/confirme/u);
  });

  it("un pack déjà payé ne se revend pas", () => {
    expect(ecran("pack/page.tsx")).toMatch(/dejaOuvert/u);
  });

  it("la recharge ne passe plus par l'écran qui refuse de la vendre", () => {
    const quota = lire(
      "src/app/(app)/(dossier)/dossiers/[id]/pieces/[pieceId]/PieceDuDossier.tsx",
    );
    expect(quota).toMatch(/\/paiement\/recapitulatif\?dossier=\$\{dossier\.id\}&achat=recharge/u);
    expect(quota).not.toMatch(/href="\/paiement\/pack"/u);
  });

  it("« Changer de pack » ne s'affiche pas sous une recharge", () => {
    // Vu à l'écran sur un échec de recharge : le lien menait aux packs,
    // qui redirigent un dossier déjà ouvert. Il n'y avait rien à changer.
    const source = ecran("echec/Echec.tsx");
    expect(source).toMatch(/dossier && estUnPack \?/u);
  });

  it("le brouillon a enfin une porte vers le tunnel", () => {
    // $-01 n'était atteignable que depuis le bloc de quota épuisé, qui ne
    // concerne qu'un dossier déjà ouvert.
    const checklist = lire("src/app/(app)/(dossier)/dossiers/[id]/Checklist.tsx");
    expect(checklist).toMatch(/BROUILLON/u);
    expect(checklist).toMatch(/\/paiement\/pack\?dossier=\$\{id\}/u);
  });
});

describe("la référence de paiement", () => {
  it("s'épelle sans caractère ambigu", () => {
    // Trouvé en créant de vrais paiements : `base64url` produisait
    // `IMP-260920--AJX4Q`, deux tirets de suite, dans une référence dont
    // la raison d'être est d'être dictée au téléphone.
    for (let i = 0; i < 200; i += 1) {
      const suite = suiteDictable(6);
      expect(suite).toHaveLength(6);
      expect(suite).toMatch(/^[A-Z2-9]+$/u);
      expect(suite).not.toMatch(/[-_OIL01]/u);
    }
  });

  it("le tirage couvre tout l'alphabet, sans biais visible", () => {
    // Un modulo sur un octet favoriserait les premières lettres ; le
    // tirage passe par `randomInt`, qui rejette l'intervalle incomplet.
    const vus = new Set([...Array(400)].flatMap(() => [...suiteDictable(6)]));
    expect(vus.size).toBe(31);
  });

  it("la référence garde sa forme datée et non séquentielle", () => {
    const source = lire("src/server/acces/paiements.ts");
    expect(source).toMatch(/`IMP-\$\{new Date\(\)/u);
    expect(source).toMatch(/suiteDictable\(6\)/u);
    expect(source).not.toMatch(/jeton\(/u);
  });
});

describe("le reçu et le tunnel ne lisent pas la même chose", () => {
  it("le numéro de téléphone n'entre pas dans le reçu", () => {
    // Deux lectures voisines, et c'est voulu : une lecture unique aurait
    // fait apparaître le portefeuille sur un document comptable.
    const lecture = lire("src/server/lecture/paiements.ts");
    const recu = lecture.slice(
      lecture.indexOf("export interface Recu"),
      lecture.indexOf("export interface Tunnel"),
    );
    expect(recu).toMatch(/recuDuPaiement/u);
    expect(recu).not.toMatch(/telephone|masquerNumero|phone/u);
    // Le tunnel, lui, le porte : c'est l'appareil qu'il faut aller regarder.
    const tunnel = lecture.slice(lecture.indexOf("export interface PaiementEnCours"));
    expect(tunnel).toMatch(/telephone/u);
  });
});
