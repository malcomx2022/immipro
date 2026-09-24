import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sansCommentaires } from "@/domain/copy/source";
import {
  A_PROPOS,
  CE_QUE_CONTIENT,
  CE_QUE_NE_CONTIENT_PAS,
  MENTION_LIEN_COURT,
  MENTION_PIECE_PURGEE,
  VERSION_EXPORT,
  nomDuFichier,
} from "@/domain/comptes/portabilite";
import { A_FAIRE_AVANT, LIEN_AVANT_SUPPRESSION } from "@/domain/comptes/suppression";
import { TTL_PRESIGNE_SECONDES } from "@/server/acces/pieces";
import {
  CE_QUI_DECIDE,
  CE_QUI_NE_PESE_PAS,
  HORS_CALCUL,
  LIMITE_DE_LA_RESTITUTION,
  expliquerLaCompletude,
} from "@/domain/completeness/explication";
import { completudeDesPieces } from "@/domain/dossiers/piece";
import type { Piece } from "@/domain/dossiers/piece";

const lire = (f: string) => readFileSync(f, "utf8");

/**
 * Export des données — A-05, C-11, WF-15.
 *
 * Ce qui se vérifie ici, c'est surtout ce que l'export **ne** fait **pas** :
 * il ne fait pas sortir par la porte de derrière ce que l'arbitrage C-09
 * interdit d'afficher, et il ne promet pas de contenir les fichiers.
 */
describe("export des données du compte", () => {
  it("le fichier se nomme et se date", () => {
    expect(nomDuFichier("2026-09-20")).toBe("immipro-mes-donnees-2026-09-20.json");
    expect(VERSION_EXPORT).toMatch(/^\d+\.\d+$/u);
  });

  it("le fichier dit de lui-même ce qui n'y est pas", () => {
    // Quelqu'un qui l'ouvre six mois plus tard n'a plus l'écran sous les
    // yeux : l'explication voyage avec le fichier, pas à côté.
    expect(A_PROPOS).toMatch(/téléversés n'y sont pas/u);
    expect(A_PROPOS).toMatch(/cinq minutes/u);
  });

  it("le barème interne ne sort pas par l'export (arbitrage C-09)", () => {
    const lecture = lire("src/server/lecture/portabilite.ts");
    // Le score de WF-07 est une donnée sur la personne, et l'exporter la
    // lui montrerait — un nombre lu dans un fichier se retient comme un
    // pronostic aussi sûrement qu'affiché à l'écran (INV-1).
    expect(lecture).not.toMatch(/internalScore/u);
    expect(lecture).not.toMatch(/\binterne\b\s*:/u);
    // Ce qui sort est ce que les écrans disent : un palier, un dénombrement.
    expect(lecture).toMatch(/LIBELLE_PALIER\[completude\.palier\]/u);
  });

  it("les textes rédigés sont dans l'export, les fichiers non", () => {
    const lecture = lire("src/server/lecture/portabilite.ts");
    // La lettre écrite ici n'existe nulle part ailleurs : c'est ce que la
    // suppression emporte, et donc ce que l'export doit rendre.
    expect(lecture).toMatch(/texte: v\.body/u);
    // Le fichier, lui, n'est que nommé — il se télécharge par une URL
    // signée créée au clic (règle d'architecture 4).
    expect(lecture).toMatch(/nomDuFichier: v\.objectKey/u);
    expect(lecture).not.toMatch(/presigned|urlDeLecture/u);
    expect(CE_QUE_NE_CONTIENT_PAS.join(" ")).toMatch(/fichiers eux-mêmes/u);
  });

  it("l'export descend comme un fichier, et il est journalisé", () => {
    const route = lire("src/app/api/comptes/donnees/route.ts");
    expect(route).toMatch(/content-disposition/u);
    expect(route).toMatch(/attachment; filename=/u);
    // Un appel qui rassemble tout un compte n'est pas une lecture ordinaire.
    expect(route).toMatch(/limite: "sensible"/u);
    // Après un vol de session, il faudra pouvoir dire ce qui est parti.
    expect(route).toMatch(/compte\.export/u);
  });

  it("l'écran annonce le contenu avant le bouton", () => {
    const ecran = lire("src/app/(auth)/compte/mes-donnees/MesDonnees.tsx");
    expect(ecran.indexOf("CE_QUE_NE_CONTIENT_PAS")).toBeLessThan(
      ecran.indexOf("Télécharger mes données"),
    );
    expect(CE_QUE_CONTIENT.length).toBeGreaterThan(3);
  });
});

/**
 * Archive d'un dossier — C-11.
 *
 * Elle existe parce qu'un bouton la promettait depuis le premier lot, et
 * qu'il répondait 404 juste avant une purge irréversible.
 */
describe("archive d'un dossier", () => {
  it("C-11 mène bien à l'archive", () => {
    const cloture = lire("src/app/(app)/(dossier)/dossiers/[id]/cloture/Cloture.tsx");
    expect(cloture).toMatch(/\/archive`/u);
  });

  it("l'archive porte les textes en entier, pas leur titre", () => {
    const composant = lire(
      "src/app/(app)/(dossier)/dossiers/[id]/archive/ArchiveDuDossier.tsx",
    );
    expect(composant).toMatch(/whitespace-pre-wrap/u);
    expect(composant).toMatch(/\{t\.texte\}/u);
  });

  it("aucun lien signé n'est posé dans la page ni imprimé", () => {
    // Un lien signé vaut cinq minutes : dans la page, il meurt avant qu'on
    // y arrive ; imprimé, il est mort pour toujours.
    const lecture = lire("src/server/lecture/portabilite.ts");
    expect(lecture).not.toMatch(/presignedGet/u);
    const composant = lire(
      "src/app/(app)/(dossier)/dossiers/[id]/archive/ArchiveDuDossier.tsx",
    );
    expect(composant).toMatch(/pas-a-imprimer[^"]*"\s*$|pas-a-imprimer/u);
    expect(MENTION_LIEN_COURT).toMatch(/cinq minutes/u);
    expect(TTL_PRESIGNE_SECONDES).toBe(300);
  });

  /**
   * ── La durée annoncée est celle qui est signée ──────────────────────
   *
   * Elle ne l'était pas. `lib/storage` remettait à MinIO
   * `Number(process.env.MINIO_PRESIGNED_TTL_SECONDS ?? 300)`, pendant que
   * l'accès aux pièces déclarait `300` de son côté, que l'API rendait ce
   * 300 au client sous `expireDansSecondes`, et que le candidat lisait
   * « un lien valable cinq minutes ». Une valeur dans l'environnement
   * suffisait à les séparer — exécuté sur l'expression même :
   *
   *     MINIO_PRESIGNED_TTL_SECONDS=60    → signé   60 s, annoncé 300 s
   *     MINIO_PRESIGNED_TTL_SECONDS=3600  → signé 3600 s, annoncé 300 s
   *
   * Plus court, le lien meurt avant le délai annoncé ; plus long, la
   * plateforme distribue des adresses de pièces d'identité pendant une
   * heure en affirmant cinq minutes, contre la règle d'architecture 4.
   */
  it("la durée signée, celle annoncée et celle écrite sont la même", () => {
    // Commentaires ôtés : celui de `storage.ts` cite le nom de la variable
    // pour raconter le défaut, et un garde-fou qui lit les commentaires
    // s'accuse de ce qu'il vient de corriger.
    const stockage = sansCommentaires(lire("src/lib/storage.ts"));
    // Les deux signatures emploient la constante, et rien d'autre.
    expect(stockage).toMatch(
      /presignedGetObject\(confiance\(\), key, TTL_PRESIGNE_SECONDES\)/u,
    );
    expect(stockage).toMatch(
      /presignedPutObject\(quarantaine\(\), key, TTL_PRESIGNE_SECONDES\)/u,
    );
    // Et la durée n'est plus un réglage : c'est une règle avec un nombre.
    expect(stockage).not.toMatch(/MINIO_PRESIGNED_TTL_SECONDS/u);
    expect(lire(".env.example")).not.toMatch(/MINIO_PRESIGNED_TTL_SECONDS/u);
    // L'accès aux pièces relit celle du stockage plutôt que d'en poser une.
    const pieces = sansCommentaires(lire("src/server/acces/pieces.ts"));
    expect(pieces).toMatch(/TTL_PRESIGNE_SECONDES.*from "@\/lib\/storage"/u);
    expect(pieces).not.toMatch(/const TTL_PRESIGNE_SECONDES\s*=/u);
    // Cinq minutes, dans les trois : la constante, l'API, la phrase.
    expect(TTL_PRESIGNE_SECONDES).toBe(5 * 60);
    expect(MENTION_LIEN_COURT).toMatch(/cinq minutes/u);
  });

  /**
   * Trois conditions et non une : la pièce a des octets, ils n'ont pas été
   * purgés, et le balayage les a admis (I.D). Un export est une sortie
   * comme une autre — celle qu'on oublie, parce qu'elle ne s'affiche pas.
   */
  it("une pièce purgée ou non balayée le dit, au lieu d'offrir un lien qui échoue", () => {
    const lecture = lire("src/server/lecture/portabilite.ts");
    const condition = /telechargeable: Boolean\(\s*derniere\?\.objectKey &&\s*!derniere\.purgedAt &&\s*consultable\(derniere\.scanState\),?\s*\)/u;
    expect(lecture).toMatch(condition);
    expect(MENTION_PIECE_PURGEE).toMatch(/supprimé/u);
  });

  it("l'archive porte la source et la date de la règle appliquée (INV-8)", () => {
    const composant = lire(
      "src/app/(app)/(dossier)/dossiers/[id]/archive/ArchiveDuDossier.tsx",
    );
    // Le composant partagé, et non une mention réécrite : c'est lui qui
    // tient la forme de l'engagement sur les six écrans qui le portent.
    expect(composant).toMatch(/<SourceNote/u);
    expect(composant).toMatch(/verifieeLe=\{regle\.verifieeLe\}/u);
  });

  it("la source est le domaine, pas l'adresse entière", () => {
    // Trouvé à l'écran : l'URL complète du référentiel suisse fait cent
    // trente caractères et s'étalait sur six lignes en 390 px. Partout
    // ailleurs l'application affiche « ind.nl » (`mentionDe`).
    const lecture = lire("src/server/lecture/portabilite.ts");
    expect(lecture).toMatch(/source: mentionDe\(a\.visaRule\)\.source/u);
    // L'export, lui, garde l'adresse exacte : un fichier relu par un autre
    // service doit permettre de retrouver la page, et il n'a pas de largeur
    // à tenir.
    expect(lecture).toMatch(/source: a\.visaRule\.sourceUrl/u);
  });

  it("l'impression retire la navigation, pas le contenu", () => {
    const css = lire("src/styles/globals.css");
    expect(css).toMatch(/@media print/u);
    expect(css).toMatch(/break-inside: avoid/u);

    // La règle ne devine pas par nom de balise : la première version
    // masquait `header`, `nav` et `footer`, et emportait l'en-tête de
    // l'archive — titre, pays, dates — avec sa mention de source. Vu en
    // rendant la page en média « print », jamais à l'écran.
    const bloc = /@media print \{([\s\S]*?)\n\}/u.exec(css)![1]!;
    expect(bloc).not.toMatch(/^\s*(header|nav|footer)\s*[,{]/mu);

    // Le gabarit nomme sa propre chrome.
    const gabarit = lire("src/app/(app)/(dossier)/layout.tsx");
    expect(gabarit.match(/pas-a-imprimer/gu)?.length).toBe(3);
  });
});

describe("la suppression renvoie vers l'export, maintenant qu'il existe", () => {
  it("l'écran de suppression conseille de télécharger, et y mène", () => {
    expect(A_FAIRE_AVANT).toMatch(/Télécharge tes données/u);
    expect(LIEN_AVANT_SUPPRESSION).toBe("/compte/mes-donnees");
    const ecran = lire("src/app/(auth)/compte/suppression/SuppressionDuCompte.tsx");
    expect(ecran).toMatch(/LIEN_AVANT_SUPPRESSION/u);
  });
});

/**
 * L.A — décision produit provisoire du 20/09/2026, soumise à validation
 * juridique avant lancement.
 *
 * L'export explique les principaux facteurs sans restituer le barème. Ce
 * que ces tests tiennent : l'explication est vraie du calcul appliqué, et
 * elle ne réintroduit pas par la description le nombre que C-09 a retiré.
 */
describe("l'export explique ce qui a pesé", () => {
  const piece = (code: string, famille: Piece["famille"], etat: Piece["etat"]): Piece => ({
    id: code,
    code,
    libelle: code,
    famille,
    etat,
    remede: "TELEVERSER",
  });

  const incomplet = completudeDesPieces([
    piece("PAS", "OBLIGATOIRE", "CONFORME"),
    piece("REL", "OBLIGATOIRE", "ATTENDUE"),
    piece("MOT", "COMPLEMENTAIRE", "ATTENDUE"),
  ]);

  it("dit ce qui décide, puis ce qui ne pèse pas", () => {
    const e = expliquerLaCompletude(incomplet);
    expect(e.ceQuiDecide).toEqual(CE_QUI_DECIDE);
    expect(e.ceQuiNePesePas).toEqual(CE_QUI_NE_PESE_PAS);
    expect(e.horsCalcul).toBe(HORS_CALCUL);
    expect(e.limite).toBe(LIMITE_DE_LA_RESTITUTION);
  });

  it("décrit la situation réelle du dossier, à partir des compteurs", () => {
    const e = expliquerLaCompletude(incomplet);
    const texte = e.surTonDossier.join(" ");
    // Chaque énoncé est une phrase, majuscule comprise : sans elle,
    // l'export s'ouvrait sur « une pièce conforme à ce jour. »
    expect(texte).toMatch(/Une pièce conforme à ce jour\./u);
    expect(texte).toMatch(/Une pièce obligatoire manque/u);
    expect(texte).toMatch(/Une pièce complémentaire reste à traiter/u);
    for (const phrase of e.surTonDossier) {
      expect(phrase[0], phrase).toBe(phrase[0]!.toUpperCase());
    }
  });

  it("un dossier complet le dit, plutôt que de lister des manques absents", () => {
    const complet = completudeDesPieces([
      piece("PAS", "OBLIGATOIRE", "CONFORME"),
      piece("MOT", "COMPLEMENTAIRE", "CONFORME"),
    ]);
    const e = expliquerLaCompletude(complet);
    expect(e.surTonDossier.join(" ")).toMatch(/Rien ne manque/u);
  });

  /**
   * Le garde-fou de C-09 vaut pour l'explication comme pour le reste :
   * un nombre sur cent lu dans un fichier se retient comme un pronostic
   * aussi sûrement qu'affiché à l'écran.
   */
  it("aucune phrase ne réintroduit le nombre ni son vocabulaire", () => {
    const e = expliquerLaCompletude(incomplet);
    const tout = [
      ...e.ceQuiDecide,
      ...e.ceQuiNePesePas,
      ...e.surTonDossier,
      e.horsCalcul,
      e.limite,
    ].join(" ");
    expect(tout).not.toMatch(/\bscore\b|\bchances?\b|\d+\s?%|sur\s?100|probabilit/iu);
  });

  it("elle rappelle que la complétude n'est pas une prédiction (INV-1)", () => {
    expect(HORS_CALCUL).toMatch(/décision de l'administration/u);
  });

  /** L'ordre des manques est exporté : c'est ce que la limite affirme. */
  it("l'export porte les manques dans leur ordre, comme l'annonce la limite", () => {
    const lecture = lire("src/server/lecture/portabilite.ts");
    expect(lecture).toMatch(/manques: completude\.missing\.map/u);
    expect(lecture).toMatch(/explication: expliquerLaCompletude\(completude\)/u);
    expect(LIMITE_DE_LA_RESTITUTION).toMatch(/l'ordre dans lequel les manques/u);
  });
});
