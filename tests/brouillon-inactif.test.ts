import { describe, expect, it } from "vitest";
import {
  ABANDON_JOURS,
  RELANCE_JOURS,
  abandonDeBrouillon,
  debutDeLInactivite,
  derniereActiviteDuCandidat,
  joursDInactivite,
  jourDeLAbandon,
  relanceDeBrouillon,
  suiteDInactivite,
} from "@/domain/dossiers/inactivite";
import { INTERDITS_PARTOUT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

/**
 * Le brouillon qu'on laisse de côté — RG-04.2, correctif du 23/09/2026.
 *
 * « Un dossier BROUILLON inactif depuis 90 jours déclenche une relance,
 * puis passe en ABANDONNE à 12 mois. » Rien ne l'appliquait. `ABANDONNE`
 * vivait dans l'enum Prisma, dans `EtatStocke`, et l'écran avait un cas
 * pour lui — aucune écriture ne le produisait. Exécuté avant correction :
 *
 *     inactif depuis              : 630 jours (21 mois)
 *     statut                      : BROUILLON
 *     relance envoyée             : 0
 *     dossiers ABANDONNE en base  : 0
 */

const etat = (inactifDepuis: number, dejaRelance = false) =>
  suiteDInactivite({ inactifDepuis, dejaRelance });

describe("ce qu'on fait d'un brouillon selon son âge", () => {
  it("avant le seuil, rien", () => {
    expect(etat(0)).toBe("RIEN");
    expect(etat(RELANCE_JOURS - 1)).toBe("RIEN");
  });

  it("au seuil, la relance — le jour même, pas le lendemain", () => {
    expect(etat(RELANCE_JOURS)).toBe("RELANCER");
  });

  /**
   * Sans cette question, la passe de nuit renverrait la même relance
   * chaque jour du quatre-vingt-dixième au trois-cent-soixante-cinquième :
   * deux cent soixante-quinze courriers identiques, et la façon la plus
   * sûre de se faire filtrer.
   */
  it("une fois relancé, il ne l'est plus tant qu'il ne bouge pas", () => {
    expect(etat(RELANCE_JOURS, true)).toBe("RIEN");
    expect(etat(ABANDON_JOURS - 1, true)).toBe("RIEN");
  });

  it("à douze mois, l'abandon", () => {
    expect(etat(ABANDON_JOURS)).toBe("ABANDONNER");
    expect(etat(ABANDON_JOURS, true)).toBe("ABANDONNER");
  });

  /**
   * L'ordre compte à la première passe après la mise en service : tout le
   * stock accumulé arrive d'un coup, et un dossier de treize mois n'a pas
   * à recevoir un avertissement pour ce qui lui arrive le jour même.
   */
  it("passé douze mois, on n'avertit pas de ce qu'on fait à l'instant", () => {
    expect(etat(ABANDON_JOURS + 200)).toBe("ABANDONNER");
  });
});

describe("l'horloge se compte en jours pleins, en UTC", () => {
  it("une activité du jour vaut zéro jour", () => {
    expect(
      joursDInactivite(new Date("2026-09-23T23:00:00Z"), new Date("2026-09-23T01:00:00Z")),
    ).toBe(0);
  });

  it("et deux dates à un jour d'écart valent un, quelle que soit l'heure", () => {
    expect(
      joursDInactivite(new Date("2026-09-22T23:59:00Z"), new Date("2026-09-23T00:01:00Z")),
    ).toBe(1);
  });

  it("la date de clôture se déduit de la dernière activité, pas du jour de la relance", () => {
    expect(jourDeLAbandon(new Date("2026-01-01T00:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2027-01-01",
    );
  });
});

describe("la relance est actionnable", () => {
  const LE_1ER = new Date("2026-01-01T00:00:00Z");

  it("elle dit la date de clôture, pas « bientôt »", () => {
    expect(relanceDeBrouillon("Pays-Bas", LE_1ER, 0).corps).toContain("1 janvier 2027");
  });

  it("et ce qu'il faut faire pour l'éviter", () => {
    expect(relanceDeBrouillon("Pays-Bas", LE_1ER, 0).corps).toContain(
      "Déposer une pièce suffit",
    );
  });

  /** Ce qui est déjà fait se dit : c'est ce qu'on perd en ne revenant pas. */
  it("elle compte les pièces déjà déposées quand il y en a", () => {
    expect(relanceDeBrouillon("Pays-Bas", LE_1ER, 3).corps).toContain("3 pièces");
    expect(relanceDeBrouillon("Pays-Bas", LE_1ER, 0).corps).toContain("aucune pièce");
  });

  /**
   * L'objet du courrier porte la date : une boîte mail n'a pas de
   * contexte, et « Ton dossier est en attente » ne se distingue pas des
   * autres messages non lus.
   */
  it("l'objet du courrier porte l'échéance, le titre de l'alerte non", () => {
    const relance = relanceDeBrouillon("Pays-Bas", LE_1ER, 0);
    expect(relance.objet).toContain("1 janvier 2027");
    expect(relance.titre).not.toContain("2027");
  });

  /** Elle ne reproche rien : un projet reporté est une raison, pas une faute. */
  it("elle laisse sa place au projet reporté", () => {
    expect(relanceDeBrouillon("Pays-Bas", LE_1ER, 0).corps).toContain("Si ton projet est reporté");
  });
});

describe("l'abandon est dit au passé, et dit ce qui reste", () => {
  it("il annonce la suppression des pièces avec son délai", () => {
    expect(abandonDeBrouillon("Pays-Bas", 30).corps).toContain("sous 30 jours");
  });

  it("et la seule chose qui reste à décider", () => {
    expect(abandonDeBrouillon("Pays-Bas", 30).corps).toContain("ouvrir un nouveau dossier");
  });
});

/**
 * Ces textes partent par courrier, donc hors de l'application : le
 * garde-fou de l'interface ne les voit pas, et `check:copy` ne lit que les
 * sources. Ils passent ici la liste que tout le dépôt passe.
 */
describe("les deux textes passent le vocabulaire interdit", () => {
  const textes = [
    relanceDeBrouillon("Pays-Bas", new Date("2026-01-01T00:00:00Z"), 2),
    abandonDeBrouillon("Pays-Bas", 30),
  ].flatMap((t) => Object.values(t));

  it("aucune promesse de résultat, nulle part", () => {
    for (const texte of textes) {
      expect(verifierTexte(texte, INTERDITS_PARTOUT), texte).toEqual([]);
    }
  });
});


/**
 * On ne compte pas comme inactif quelqu'un qui attend — correctif du
 * 23/09/2026.
 *
 * L'horloge ignorait le plan que la plateforme avait elle-même construit.
 * L'échéancier se calcule à rebours depuis la date cible : un candidat
 * visant la rentrée 2029 a un premier geste au 4 mai 2029, et rien avant.
 * Exécuté avant correction, sur un dossier ouvert quatre cents jours plus
 * tôt :
 *
 *     échéance : 2029-05-04  À demander : Diplôme le plus élevé
 *     échéance : 2029-06-03  Dépôt de la demande
 *     inactivité : {"examines":1,"relances":0,"abandons":1,…}
 *     [INACTIVITE] Ton dossier Pays-Bas a été clos
 *
 * Clos le 1er avril 2027, deux ans avant sa première tâche. La plateforme
 * lui avait fait un plan disant « rien à faire avant mai 2029 », puis
 * l'a fermé pour n'avoir rien fait.
 */
describe("l'horloge part du plan, pas seulement de l'ouverture", () => {
  const OUVERTURE = new Date("2026-01-01T00:00:00Z");
  const MAINTENANT = new Date("2027-04-01T00:00:00Z");

  it("sans échéance, elle part de ce que le candidat a produit", () => {
    expect(debutDeLInactivite(OUVERTURE, null)).toEqual(OUVERTURE);
  });

  /** Le cas du défaut : une première tâche à deux ans suspend le décompte. */
  it("une échéance à venir suspend le décompte", () => {
    const debut = debutDeLInactivite(OUVERTURE, new Date("2029-05-04T00:00:00Z"));
    expect(joursDInactivite(debut, MAINTENANT)).toBeLessThan(0);
    expect(suiteDInactivite({ inactifDepuis: joursDInactivite(debut, MAINTENANT), dejaRelance: false })).toBe(
      "RIEN",
    );
  });

  /**
   * Et elle repart le jour où l'échéance arrive : c'est bien là que
   * l'absence de geste devient un signe.
   */
  it("une échéance passée fait repartir le décompte depuis elle", () => {
    const echeance = new Date("2026-02-01T00:00:00Z");
    expect(debutDeLInactivite(OUVERTURE, echeance)).toEqual(echeance);
    expect(joursDInactivite(echeance, MAINTENANT)).toBeGreaterThan(ABANDON_JOURS);
  });

  /**
   * Un dépôt plus récent que l'échéance l'emporte : le candidat était là
   * après la date, et c'est ce geste-là qui compte.
   */
  it("un dépôt postérieur à l'échéance l'emporte", () => {
    const depot = new Date("2026-11-01T00:00:00Z");
    expect(debutDeLInactivite(depot, new Date("2026-02-01T00:00:00Z"))).toEqual(depot);
  });

  /** Le décompte négatif n'est pas une relance à rebours. */
  it("un décompte négatif ne déclenche rien, jamais", () => {
    expect(suiteDInactivite({ inactifDepuis: -700, dejaRelance: false })).toBe("RIEN");
    expect(suiteDInactivite({ inactifDepuis: -700, dejaRelance: true })).toBe("RIEN");
  });
});

/**
 * L'entretien de rédaction compte — correctif du 24/09/2026.
 *
 * L'horloge ne lisait que `DocumentVersion`. Un entretien de rédaction se
 * remplit sur des semaines, une réponse par question quittée, et aucune ne
 * produit de version : la mise en forme, qui en produirait une, demande un
 * pack qu'un brouillon n'a pas. Constaté sur une vraie base, dossier
 * ouvert quatre cents jours plus tôt, une réponse écrite l'avant-veille :
 *
 *     SONDE entretien : statut = ABANDONNE | purgeDueAt = 2027-07-01
 *     SONDE entretien : notifications = 1
 *
 * Clos, pièces programmées à la purge, et l'unique notification est l'avis
 * de clôture — pas même la relance, que l'abandon précède à cet âge.
 *
 * La garde qui mord est dans `scripts/fumee-transitions.mts` : le défaut
 * était dans la **requête** du job, et une matière fabriquée ici lui
 * donnerait justement la date qu'il ne savait pas aller chercher. Ce qui
 * se vérifie ici est la règle de composition, qui a désormais un nom.
 */
describe("tous les gestes du candidat portent l'horloge, pas seulement le dépôt", () => {
  const OUVERTURE = new Date("2026-01-01T00:00:00Z");
  const DEPOT = new Date("2026-03-01T00:00:00Z");
  const REPONSE = new Date("2026-09-01T00:00:00Z");

  it("sans aucun geste, l'ouverture fait plancher", () => {
    expect(derniereActiviteDuCandidat(OUVERTURE, [])).toEqual(OUVERTURE);
  });

  it("le geste le plus récent l'emporte, quelle que soit sa nature", () => {
    expect(derniereActiviteDuCandidat(OUVERTURE, [DEPOT, REPONSE])).toEqual(REPONSE);
    expect(derniereActiviteDuCandidat(OUVERTURE, [REPONSE, DEPOT])).toEqual(REPONSE);
  });

  /**
   * Le cas du défaut : une réponse d'entretien seule, sans aucun dépôt.
   * C'est l'état ordinaire d'un brouillon qui rédige sa lettre.
   */
  it("une réponse d'entretien seule suffit à tenir l'horloge", () => {
    expect(derniereActiviteDuCandidat(OUVERTURE, [REPONSE])).toEqual(REPONSE);
    const debut = debutDeLInactivite(
      derniereActiviteDuCandidat(OUVERTURE, [REPONSE]),
      null,
    );
    const jours = joursDInactivite(debut, new Date("2026-09-03T00:00:00Z"));
    expect(suiteDInactivite({ inactifDepuis: jours, dejaRelance: false })).toBe("RIEN");
  });

  /** Et un dépôt plus récent qu'une réponse reste le geste qui compte. */
  it("un dépôt postérieur à la dernière réponse l'emporte", () => {
    const tardif = new Date("2026-10-01T00:00:00Z");
    expect(derniereActiviteDuCandidat(OUVERTURE, [REPONSE, tardif])).toEqual(tardif);
  });
});
