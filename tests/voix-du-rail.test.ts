import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { echecPourMotif, type MotifEchec } from "@/domain/paiement/echec";
import {
  AUPRES_DE,
  CONSIGNE_ATTENTE,
  ETAPES_ATTENTE,
  LIBELLES_ETAPES,
  RIEN_RECU,
  TITRE_ATTENTE,
} from "@/domain/paiement/attente";
import { sansCommentaires } from "@/domain/copy/source";
import type { Rail } from "@/domain/payments/rail";

const lire = (f: string) => readFileSync(f, "utf8");

/**
 * La voix du rail — arbitrage du 21/09/2026, constat 3.
 *
 * O.A avait adapté un motif sur sept. Les six autres continuaient de
 * parler Mobile Money à un payeur par carte : « la notification Mobile
 * Money peut arriver avec du retard », « vérifie que le 97 •• •• 42 est
 * bien ton numéro actif », « compose le *880# ». Aucun de ces conseils
 * n'est exécutable par quelqu'un qui paie en euros par carte, et le
 * dernier est un code d'opérateur béninois.
 *
 * La décision énumère les interdits plutôt que les formulations : c'est
 * ce qui se vérifie. Une liste de bonnes phrases se périme à la première
 * réécriture ; une liste de mots proscrits tient tant que le rail existe.
 */

const MOTIFS: readonly MotifEchec[] = [
  "delai_depasse",
  "solde_insuffisant",
  "refus_operateur",
  "notification_absente",
  "annule_par_le_payeur",
  "moyen_invalide",
  "incident_technique",
];

/** Le vocabulaire qu'un texte de carte ne peut pas employer. */
const INTERDIT_SUR_CARTE = [
  { mot: "notification Mobile Money", motif: /notification\s+Mobile\s+Money/iu },
  { mot: "Mobile Money", motif: /Mobile\s+Money/iu },
  { mot: "opérateur", motif: /opérateur/iu },
  { mot: "téléphone", motif: /téléphone/iu },
  { mot: "code USSD", motif: /\*\d{2,5}#/u },
  { mot: "portefeuille", motif: /portefeuille/iu },
  { mot: "code PIN", motif: /code\s+PIN/iu },
] as const;

/** Et celui qu'un texte Mobile Money ne peut pas employer en retour. */
const INTERDIT_SUR_MOBILE_MONEY = [
  { mot: "banque", motif: /banque|bancaire/iu },
  { mot: "carte", motif: /\bcartes?\b/iu },
] as const;

const INTERDITS: Record<Rail, readonly { mot: string; motif: RegExp }[]> = {
  CARTE: INTERDIT_SUR_CARTE,
  MOBILE_MONEY: INTERDIT_SUR_MOBILE_MONEY,
};

/** Tout ce qu'un motif met à l'écran : titre, corps et vérifications. */
const textesDe = (motif: MotifEchec, rail: Rail, numero: string | null): string[] => {
  const e = echecPourMotif(motif, "5 000 F", numero, rail);
  return [e.titre, e.corps, ...e.verifications];
};

/**
 * Le numéro compte dans le balayage. C'est par lui que le téléphone
 * revenait : `numero ? ... : ...` ne regardait pas le rail, et un payeur
 * par carte dont le compte porte un numéro se voyait renvoyer à son
 * « numéro actif ». La branche fautive était celle que les tests
 * n'appelaient pas.
 */
const NUMEROS: readonly (string | null)[] = ["97 •• •• 42", null];

describe("$-05 — chaque motif parle la langue de son rail", () => {
  it("aucun texte de carte ne nomme un opérateur, un téléphone ou un portefeuille", () => {
    for (const motif of MOTIFS) {
      for (const numero of NUMEROS) {
        for (const texte of textesDe(motif, "CARTE", numero)) {
          for (const { mot, pattern } of INTERDIT_SUR_CARTE.map((i) => ({
            mot: i.mot,
            pattern: i.motif,
          }))) {
            expect(pattern.test(texte), `${motif} · ${mot} · ${texte}`).toBe(false);
          }
        }
      }
    }
  });

  it("aucun échec Mobile Money ne nomme une banque, là où il n'y en a pas", () => {
    for (const motif of MOTIFS) {
      for (const numero of NUMEROS) {
        for (const texte of textesDe(motif, "MOBILE_MONEY", numero)) {
          for (const interdit of INTERDIT_SUR_MOBILE_MONEY) {
            expect(interdit.motif.test(texte), `${motif} · ${interdit.mot} · ${texte}`).toBe(
              false,
            );
          }
        }
      }
    }
  });

  /**
   * Le garde-fou précédent passe aussi sur un écran qui ne dirait rien.
   * Celui-ci demande que l'adaptation ait bien eu lieu : sept motifs, deux
   * rails, quatorze écrans distincts. Un motif dont les deux rails se
   * lisent à l'identique est un motif qu'on a oublié — c'était le cas de
   * six sur sept avant cet arbitrage.
   */
  it("les sept motifs produisent deux écrans distincts, pas un seul recopié", () => {
    for (const motif of MOTIFS) {
      const mm = JSON.stringify(echecPourMotif(motif, "5 000 F", null, "MOBILE_MONEY"));
      const carte = JSON.stringify(echecPourMotif(motif, "5 000 F", null, "CARTE"));
      expect(mm, motif).not.toBe(carte);
    }
  });

  /**
   * « Une phrase partagée doit rester neutre si elle ne connaît pas le
   * rail. » Les phrases identiques d'un rail à l'autre sont exactement
   * celles-là : elles ne doivent nommer aucun instrument, d'aucun côté.
   */
  it("une phrase écrite une seule fois pour les deux rails ne nomme aucun instrument", () => {
    const tous = [...INTERDIT_SUR_CARTE, ...INTERDIT_SUR_MOBILE_MONEY];
    for (const motif of MOTIFS) {
      const mm = textesDe(motif, "MOBILE_MONEY", null);
      const carte = new Set(textesDe(motif, "CARTE", null));
      for (const partagee of mm.filter((t) => carte.has(t))) {
        for (const interdit of tous) {
          expect(interdit.motif.test(partagee), `${motif} · ${partagee}`).toBe(false);
        }
      }
    }
  });

  /** DOC-12 §16 règle 1 : le titre nomme le fait, sur les deux rails. */
  it("deux titres voisins ne se lisent pas l'un pour l'autre, rail par rail", () => {
    for (const rail of ["MOBILE_MONEY", "CARTE"] as const) {
      const titres = MOTIFS.map((m) => echecPourMotif(m, "5 000 F", null, rail).titre);
      expect(new Set(titres).size, rail).toBe(titres.length);
    }
  });
});

/**
 * $-03 tient le même interdit que $-05, et c'est le vrai enseignement du
 * constat : la règle a été énoncée à propos des motifs d'échec, mais le
 * défaut vivait aussi une page plus tôt. Les deux devises mènent à
 * `/paiement/attente`, et l'écran y titrait « Confirme le paiement sur ton
 * téléphone » pour tout le monde.
 */
describe("$-03 — l'écran d'attente tient le même interdit", () => {
  const textesDAttente = (rail: Rail, numero: string | null): string[] => [
    TITRE_ATTENTE[rail],
    CONSIGNE_ATTENTE[rail],
    AUPRES_DE[rail],
    RIEN_RECU[rail],
    ...ETAPES_ATTENTE.map((e) => LIBELLES_ETAPES[e](numero, rail)),
  ];

  it("chaque rail n'entend que son propre vocabulaire", () => {
    for (const rail of ["MOBILE_MONEY", "CARTE"] as const) {
      for (const numero of NUMEROS) {
        for (const texte of textesDAttente(rail, numero)) {
          for (const interdit of INTERDITS[rail]) {
            expect(interdit.motif.test(texte), `${rail} · ${interdit.mot} · ${texte}`).toBe(
              false,
            );
          }
        }
      }
    }
  });

  /**
   * Le numéro ne se cite que là où il en existe un. Un payeur par carte
   * n'a pas de portefeuille chez nous ; lui montrer un numéro de
   * téléphone à l'étape « notification » nommerait une chose qui n'a pas
   * eu lieu.
   */
  it("le numéro ne s'affiche que sur le rail qui en a un", () => {
    expect(LIBELLES_ETAPES.notification("97 •• •• 42", "MOBILE_MONEY")).toContain("97 •• •• 42");
    expect(LIBELLES_ETAPES.notification("97 •• •• 42", "CARTE")).not.toContain("97 •• •• 42");
  });

  /**
   * Le lien d'échappement, et la limite de tous les tests ci-dessus.
   *
   * « Je n'ai rien reçu » ne contient aucun mot proscrit : les listes le
   * laissent passer sur les deux rails. Il décrit pourtant une
   * notification qu'on attend, et par carte rien ne s'envoie. Vu à
   * l'écran, pas en test — une liste de mots interdits ne dit pas si la
   * phrase décrit ce qui se passe.
   */
  it("le lien d'échappement décrit ce qui manque, et ce n'est pas la même chose", () => {
    expect(RIEN_RECU.MOBILE_MONEY).not.toBe(RIEN_RECU.CARTE);
    expect(RIEN_RECU.MOBILE_MONEY).toMatch(/reçu/u);
    expect(RIEN_RECU.CARTE).toMatch(/s'affiche/u);
  });

  it("les deux rails donnent deux fils d'étapes distincts", () => {
    const mm = ETAPES_ATTENTE.map((e) => LIBELLES_ETAPES[e](null, "MOBILE_MONEY"));
    const carte = ETAPES_ATTENTE.map((e) => LIBELLES_ETAPES[e](null, "CARTE"));
    expect(mm).not.toEqual(carte);
    // La dernière étape parle de nous, et vaut des deux côtés.
    expect(mm[2]).toBe(carte[2]);
  });
});

/**
 * Et la prose ne redescend pas dans le JSX.
 *
 * C'est la leçon de N.C, appliquée au rail : une phrase écrite directement
 * dans un composant échappe à tous les tests ci-dessus, qui lisent le
 * domaine. Les deux écrans du tunnel ne doivent contenir aucun mot de
 * rail hors de leurs commentaires — les chaînes viennent du domaine, où
 * elles se vérifient.
 *
 * **La première version de ce garde-fou lisait `extraireChaines`, et ne
 * gardait rien.** En remettant « Confirme le paiement sur ton téléphone »
 * à la place de `{TITRE_ATTENTE[rail]}`, les dix tests passaient encore :
 * un texte JSX n'est pas une chaîne entre guillemets, et c'est pourtant la
 * façon la plus naturelle d'écrire une phrase dans un composant. Le garde
 * connaissait la forme qu'il avait été écrit pour connaître. Il lit
 * maintenant tout le source, commentaires retirés — les commentaires
 * expliquent l'interdit et ne doivent pas le déclencher.
 */
describe("les écrans du tunnel ne réécrivent pas la prose du rail", () => {
  const MOTS_DE_RAIL = /Mobile Money|opérateur|téléphone|portefeuille|\*\d{2,5}#|banque|bancaire/iu;

  for (const fichier of [
    "src/app/(app)/paiement/attente/Attente.tsx",
    "src/app/(app)/paiement/echec/Echec.tsx",
  ]) {
    it(`${fichier} ne nomme aucun rail en dur`, () => {
      const code = sansCommentaires(lire(fichier));
      const trouve = MOTS_DE_RAIL.exec(code);
      expect(
        trouve,
        trouve ? code.slice(Math.max(0, trouve.index - 60), trouve.index + 60) : "",
      ).toBeNull();
    });
  }
});
