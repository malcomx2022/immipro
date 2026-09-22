import { describe, expect, it } from "vitest";
import {
  FRAICHEUR_DU_CONSTAT_MS,
  SERVICES_CONSTATES,
  constatFrais,
  moteurPrisEnDefaut,
  sondeDuConstat,
  type Constat,
} from "@/domain/exploitation/constats";
import { DEPENDANCES } from "@/domain/exploitation/dependances";

/**
 * Le constat d'un service, et la frontière qu'il doit franchir — I.C,
 * 22/09/2026.
 *
 * Deux sondes concluent sur un fait plutôt que sur la forme d'une
 * variable, et c'est la bonne règle. Le fait vivait dans une variable de
 * module : posé par le worker, lu par le processus web, jamais partagé.
 * Ce fichier tient la règle de lecture ; le franchissement lui-même
 * demande une base et vit dans `scripts/fumee-balayage.mts`.
 */

const ilYA = (ms: number): Constat => ({ reussi: true, quand: new Date(Date.now() - ms) });

describe("un constat a une durée de validité", () => {
  it("frais tant qu'il tient dans la fenêtre, périmé après", () => {
    expect(constatFrais(ilYA(0))).toBe(true);
    expect(constatFrais(ilYA(FRAICHEUR_DU_CONSTAT_MS - 1_000))).toBe(true);
    expect(constatFrais(ilYA(FRAICHEUR_DU_CONSTAT_MS + 1_000))).toBe(false);
  });

  /**
   * La fenêtre doit être **plus large que la cadence de resonde**, sinon
   * un simple retard de passe ferait clignoter l'état de service ; et
   * plus étroite qu'une journée, sinon une messagerie morte à l'aube
   * passerait pour vivante jusqu'au soir.
   */
  it("la fenêtre laisse passer un retard, pas une panne installée", () => {
    const uneHeure = 60 * 60 * 1000;
    expect(FRAICHEUR_DU_CONSTAT_MS).toBeGreaterThan(uneHeure);
    expect(FRAICHEUR_DU_CONSTAT_MS).toBeLessThan(24 * uneHeure);
  });
});

describe("ce qu'un constat autorise à conclure", () => {
  it("un succès frais conclut, un échec frais aussi", () => {
    expect(sondeDuConstat(true, { reussi: true, quand: new Date() })).toBe("CONCLUANTE");
    expect(sondeDuConstat(true, { reussi: false, quand: new Date() })).toBe("ECHOUEE");
  });

  it("aucun constat ne conclut rien", () => {
    expect(sondeDuConstat(true, undefined)).toBe("ABSENTE");
  });

  /**
   * **Un constat périmé ne bascule pas en échec.** Le service n'a pas
   * été pris en défaut ; on n'a plus de nouvelles, ce qui est autre
   * chose. Le confondre avec une panne ferait sonner l'alarme à chaque
   * worker arrêté pour maintenance.
   */
  it("un constat périmé redevient une absence de nouvelles", () => {
    const vieuxSucces = ilYA(FRAICHEUR_DU_CONSTAT_MS + 1_000);
    expect(sondeDuConstat(true, vieuxSucces)).toBe("ABSENTE");

    const vieilEchec = { reussi: false, quand: new Date(Date.now() - FRAICHEUR_DU_CONSTAT_MS - 1) };
    expect(sondeDuConstat(true, vieilEchec)).toBe("ABSENTE");
  });

  /**
   * Une configuration illisible est un fait, elle : elle est là et ne
   * peut pas servir. Le dire tout de suite épargne d'attendre le premier
   * candidat pour l'apprendre — et aucun constat, si beau soit-il, ne le
   * rattrape.
   */
  it("une configuration inutilisable échoue, quoi qu'un constat raconte", () => {
    expect(sondeDuConstat(false, undefined)).toBe("ECHOUEE");
    expect(sondeDuConstat(false, { reussi: true, quand: new Date() })).toBe("ECHOUEE");
  });

  /** La date de référence est passée : rien ne lit l'horloge en douce. */
  it("la fraîcheur se mesure contre l'instant qu'on lui donne", () => {
    const constat = { reussi: true, quand: new Date("2026-09-22T06:00:00Z") };
    expect(sondeDuConstat(true, constat, new Date("2026-09-22T08:00:00Z"))).toBe("CONCLUANTE");
    expect(sondeDuConstat(true, constat, new Date("2026-09-22T10:00:00Z"))).toBe("ABSENTE");
  });
});

describe("un moteur pris en défaut ferme le dépôt", () => {
  /**
   * Un moteur qui déclare sain le fichier d'essai répond sans détecter :
   * tout ce qu'il examine passera. Continuer d'accepter des dépôts
   * devant lui revient à promouvoir des fichiers que personne ne lit.
   */
  it("un échec frais ferme", () => {
    expect(moteurPrisEnDefaut({ reussi: false, quand: new Date() })).toBe(true);
  });

  /**
   * L'ignorance ne ferme pas, et c'est délibéré : une pièce déposée sans
   * constat reste **en quarantaine** — elle n'est promue que sur un
   * verdict « saine ». Fermer sur l'ignorance bloquerait chaque
   * démarrage à froid sans rien protéger de plus.
   */
  it("l'absence de constat ne ferme pas", () => {
    expect(moteurPrisEnDefaut(undefined)).toBe(false);
  });

  it("un succès ne ferme pas", () => {
    expect(moteurPrisEnDefaut({ reussi: true, quand: new Date() })).toBe(false);
  });

  /**
   * Et un échec périmé non plus : le moteur a peut-être été remplacé
   * depuis. Laisser un vieil échec fermer le dépôt indéfiniment ferait
   * d'une panne réparée une panne permanente.
   */
  it("un échec périmé ne ferme plus", () => {
    const vieil = { reussi: false, quand: new Date(Date.now() - FRAICHEUR_DU_CONSTAT_MS - 1) };
    expect(moteurPrisEnDefaut(vieil)).toBe(false);
  });
});

describe("les services constatés sont ceux que le registre connaît", () => {
  /**
   * Une clé inventée ne serait lue par personne, et se lirait comme un
   * service surveillé qui ne l'est pas. La base porte la même liste, en
   * contrainte `CHECK` — deux endroits, et un test qui les tient
   * ensemble vaut mieux qu'une divergence silencieuse.
   */
  it("chaque service constaté est une dépendance déclarée", () => {
    const cles = DEPENDANCES.map((d) => d.cle);
    for (const service of SERVICES_CONSTATES) expect(cles, service).toContain(service);
  });

  /**
   * Et ce sont exactement celles dont la sonde conclut sur un fait
   * établi ailleurs. Les signatures de webhook n'en sont pas : leur
   * sonde est entièrement locale, elle n'a rien à partager entre
   * processus.
   */
  it("et ce sont celles dont la sonde a besoin d'un fait", () => {
    expect([...SERVICES_CONSTATES].sort()).toEqual(["antivirus", "messagerie"]);
  });
});
