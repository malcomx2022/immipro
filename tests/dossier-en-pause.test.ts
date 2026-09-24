import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sansCommentaires } from "@/domain/copy/source";
import { ETATS_A_PREVENIR, REPRISE_APRES_PAUSE } from "@/domain/dossiers/etat";
import {
  AUCUNE_SUITE_ATTENDUE,
  LIBELLE_STATUT,
  MENTION_CLOTURE,
  MENTION_DEPOSE,
  MENTION_EN_PAUSE,
  attendUneSuite,
  resumeDuJour,
  trierDossiers,
  type Dossier,
  type StatutDossier,
} from "@/domain/dossiers/dossier";
import { prochaineAction, versStatut } from "@/server/vue/dossier";
import { completudeDesPieces, type Piece } from "@/domain/dossiers/piece";

/**
 * Un dossier mis en pause par une divergence critique — WF-11, C-01, C-07.
 *
 * L'état existait en base depuis le premier jour et n'avait pas de mot sur
 * l'écran : il s'affichait « Actif ». Toutes les pièces pouvant être
 * conformes, la prochaine action annonçait « Rien ne bloque un dépôt » sur
 * le seul dossier dont le dépôt était bloqué, et le refus du dépôt envoyait
 * chercher des pièces manquantes qui n'existaient pas.
 */

const piece = (etat: Piece["etat"]): Piece => ({
  id: "p1",
  code: "PAS",
  libelle: "Passeport",
  famille: "OBLIGATOIRE",
  etat,
  remede: "REMPLACER",
});

const dossier = (statut: StatutDossier): Dossier =>
  ({ id: statut, statut }) as Dossier;

describe("La pause a un mot sur l'écran du candidat", () => {
  it("un dossier suspendu ne se lit plus « Actif »", () => {
    expect(versStatut("SUSPENDU")).toBe("EN_PAUSE");
    expect(LIBELLE_STATUT.EN_PAUSE).toBe("En pause");
  });

  it("et reste distinct d'un dossier actif", () => {
    // Les confondre est exactement ce que faisait la vue : deux états qui
    // n'attendent pas la même chose du candidat.
    expect(versStatut("ACTIF")).toBe("ACTIF");
    expect(LIBELLE_STATUT.ACTIF).not.toBe(LIBELLE_STATUT.EN_PAUSE);
  });

  it("passe devant tout dans la liste des dossiers", () => {
    // Le seul dossier qu'aucune pièce ne fera avancer : il attend une
    // décision, et elle ne se prend pas sur l'écran du dossier.
    const tries = trierDossiers([
      dossier("SOUMIS"),
      dossier("BROUILLON"),
      dossier("ACTIF"),
      dossier("EN_PAUSE"),
      dossier("PRET"),
    ]);
    expect(tries[0]?.statut).toBe("EN_PAUSE");
  });
});

describe("Ce que la prochaine action annonce", () => {
  it("dit la pause, et non « rien ne bloque un dépôt »", () => {
    // Toutes les pièces conformes : c'est précisément le cas où l'ancienne
    // phrase était fausse.
    const conforme = [piece("CONFORME")];
    expect(prochaineAction(conforme, "PRET", completudeDesPieces(conforme))).toBe(
      "Rien ne bloque un dépôt.",
    );
    expect(prochaineAction(conforme, "EN_PAUSE", completudeDesPieces(conforme))).toBe(
      MENTION_EN_PAUSE,
    );
  });

  it("la dit aussi quand des pièces manquent : la pause prime", () => {
    // Réunir la pièce ne lèverait pas la pause. Envoyer le candidat la
    // chercher d'abord lui ferait faire le travail dans le mauvais ordre.
    const manquante = [piece("ATTENDUE")];
    expect(prochaineAction(manquante, "EN_PAUSE", completudeDesPieces(manquante))).toBe(
      MENTION_EN_PAUSE,
    );
    expect(prochaineAction(manquante, "ACTIF", completudeDesPieces(manquante))).toMatch(
      /passeport/u,
    );
  });

  /** Le constat, puis le geste, puis où il se fait (doctrine d'erreur). */
  it("nomme ce qui a changé, ce qui est conservé, et où décider", () => {
    expect(MENTION_EN_PAUSE).toMatch(/exigence .* a changé/u);
    expect(MENTION_EN_PAUSE).toMatch(/rien n'est supprimé/u);
    expect(MENTION_EN_PAUSE).toMatch(/alertes/u);
    // INV-1 : la pause ne dit rien de l'issue de la démarche.
    expect(MENTION_EN_PAUSE).not.toMatch(/refus|chances|risque|garanti/iu);
  });
});

/**
 * Et la pause se lève — WF-11.
 *
 * Un dossier mis en pause par une divergence critique qu'il n'a pas
 * arbitrée sortait de la liste des dossiers que la publication suivante
 * prévient. Sa seule divergence visait alors une version que la nouvelle
 * venait d'archiver, et migrer vers une version archivée est refusé
 * (RG-14.1) : le candidat lisait « une version plus récente est entrée en
 * vigueur depuis : c'est elle qui t'est proposée » devant une proposition
 * qui n'existait pas.
 *
 * Le garde-fou est la **réciproque**, et non la liste recopiée : tout état
 * que la passe écrit est un état qu'elle prévient. Écrire un état dont on
 * ne ressort pas est le défaut lui-même, et il reviendrait au premier
 * nouvel état de pause. Recopier `["ACTIF", "PRET", "SUSPENDU"]` ici
 * n'aurait rien vérifié : les deux listes auraient bougé ensemble.
 */
describe("La publication suivante retrouve le dossier qu'elle a mis en pause", () => {
  const passe = sansCommentaires(
    readFileSync(join(process.cwd(), "src/server/jobs/divergence.ts"), "utf8"),
  );

  it("tout état que la passe écrit est un état qu'elle prévient", () => {
    const ecrits = [...passe.matchAll(/miseEnEtat\(\s*"([A-Z_]+)"/gu)].map((m) => m[1]!);
    expect(ecrits.length).toBeGreaterThan(0);
    expect(ecrits.filter((e) => !ETATS_A_PREVENIR.includes(e as never))).toEqual([]);
  });

  it("et la requête interroge cette liste, sans la redire ni la trier", () => {
    /*
      Le filtre est la liste, pas une expression qui en part. Une seconde
      liste en base de requête cesserait de suivre celle du domaine ; un
      `.filter()` au passage retirerait un état sans que le raisonnement
      qui le porte ait changé — et c'est le défaut lui-même, écrit à un
      endroit où personne ne va le lire.
    */
    const filtre = passe.match(/status:\s*\{\s*in:\s*([^}]+?)\s*\}/u)?.[1];
    expect(filtre).toBe("[...ETATS_A_PREVENIR]");
  });

  it("un dossier soumis n'est pas prévenu : sa version est celle du dépôt", () => {
    expect(ETATS_A_PREVENIR).not.toContain("SOUMIS");
    expect(ETATS_A_PREVENIR).not.toContain("BROUILLON");
  });

  it("et la reprise après pause vise un état que la passe prévient", () => {
    // Sans quoi le dossier repris deviendrait invisible à la publication
    // suivante — le même défaut, déplacé d'un cran.
    expect(ETATS_A_PREVENIR).toContain(REPRISE_APRES_PAUSE);
  });
});

/**
 * Les deux états que la correction de la pause avait laissés derrière —
 * C-01, WF-10.
 *
 * `prochaineAction` n'interceptait que `EN_PAUSE` ; `SOUMIS` et `CLOTURE`
 * tombaient donc sur la déduction de checklist, qui n'a de sens que sur un
 * dossier en cours. Constaté en exécution :
 *
 *     déposé    → « Remplacer ton relevé bancaire. »
 *     clôturé   → « Rien ne bloque un dépôt. »
 *     abandonné → « Ajouter ton passeport. »
 *     résumé    → « 3 dossiers ouverts, 3 pièces obligatoires à réunir. »
 *
 * Le premier est le plus coûteux : la date de péremption d'une pièce est
 * écrite au dépôt et relue chaque jour par la vue, si bien qu'un dossier
 * parti à l'autorité **finit toujours** par demander au candidat de
 * corriger ce qu'il ne peut plus toucher.
 */
describe("Un dossier déposé ou clôturé n'a pas de prochaine action de checklist", () => {
  const vide = completudeDesPieces([]);

  it("un dossier déposé nomme son état et le seul geste qui reste", () => {
    // Une pièce périmée sous la main : c'est le cas qui se produit tout
    // seul, et celui que la déduction de checklist rendait le plus faux.
    const action = prochaineAction([piece("EXPIREE")], "SOUMIS", vide);
    expect(action).toBe(MENTION_DEPOSE);
    expect(action).not.toContain("Remplacer");
    expect(MENTION_DEPOSE).toContain("Clôturer");
  });

  it("un dossier clôturé ne promet ni dépôt ni pièce à ajouter", () => {
    for (const pieces of [[], [piece("ATTENDUE")], [piece("CONFORME")]]) {
      const action = prochaineAction(pieces, "CLOTURE", completudeDesPieces(pieces));
      expect(action, JSON.stringify(pieces)).toBe(MENTION_CLOTURE);
    }
  });

  /*
    Les trois états écartés de la déduction sont ceux-là et pas d'autres :
    un dossier prêt doit continuer à lire « Rien ne bloque un dépôt », qui
    est vrai et attendu.
  */
  it("un dossier prêt garde sa phrase", () => {
    expect(prochaineAction([], "PRET", vide)).toBe("Rien ne bloque un dépôt.");
  });

  it("et les états de la base y mènent bien", () => {
    expect(versStatut("SOUMIS")).toBe("SOUMIS");
    for (const clos of ["ISSUE_DECLAREE", "ABANDONNE", "ARCHIVE"] as const) {
      expect(versStatut(clos), clos).toBe("CLOTURE");
    }
  });
});

/**
 * Et le résumé du tableau de bord compte la même population.
 *
 * Il additionnait tous les dossiers : un dossier déposé et un dossier
 * abandonné entraient dans « dossiers ouverts », et leurs pièces
 * manquantes dans « à réunir ». « Le mot suit la donnée » est la règle que
 * ce résumé énonce lui-même.
 */
describe("Le résumé du jour ne compte que ce qui attend le candidat", () => {
  const avecManques = (statut: StatutDossier, manquantes: number): Dossier =>
    ({
      id: `${statut}-${manquantes}`,
      statut,
      completude: {
        compteurs: { obligatoiresManquantes: manquantes, exigencesNonTenues: 0 },
      },
    }) as Dossier;

  it("un dossier déposé ou clôturé n'est pas un dossier ouvert", () => {
    expect(attendUneSuite(avecManques("SOUMIS", 2))).toBe(false);
    expect(attendUneSuite(avecManques("CLOTURE", 2))).toBe(false);
    for (const statut of ["BROUILLON", "ACTIF", "PRET", "EN_PAUSE"] as const) {
      expect(attendUneSuite(avecManques(statut, 0)), statut).toBe(true);
    }
  });

  it("leurs pièces ne sont pas « à réunir »", () => {
    const resume = resumeDuJour([avecManques("ACTIF", 1), avecManques("SOUMIS", 2)]);
    expect(resume).toBe("1 dossier ouvert, 1 pièce obligatoire à réunir.");
  });

  it("et quand plus rien n'attend, il le dit au lieu de compter", () => {
    const resume = resumeDuJour([avecManques("SOUMIS", 2), avecManques("CLOTURE", 1)]);
    expect(resume).toBe(AUCUNE_SUITE_ATTENDUE);
    expect(resume).not.toContain("ouvert");
  });

  /* Une liste vide reste vide : il n'y a alors rien à dire, pas même cela. */
  it("une liste vide ne dit rien", () => {
    expect(resumeDuJour([])).toBe("");
  });
});
