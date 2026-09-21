import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { echeanceEnAnnees, echeanceEnJours, echeanceEnMois } from "@/server/jobs/purge";
import { CONSERVATION_MOIS, MENTION_PORTEE } from "@/domain/notifications/alerte";
import { CONSERVATION_ANNEES, MENTION_IMMUABLE } from "@/domain/backoffice/audit";
import { PURGE_JOURS } from "@/domain/dossiers/cloture";
import {
  CONSERVATION_MOTIF_JOURS,
  SURSIS_APRES_CLOTURE_JOURS,
  echeanceDuMotif,
  motifEffacable,
} from "@/domain/paiement/conservation";

/**
 * Une durée de conservation annoncée est tenue.
 *
 * Trois durées sont déclarées dans le domaine et affichées à quelqu'un :
 * trente jours pour les pièces d'un dossier clos, six mois pour les
 * alertes, cinq ans pour le journal d'audit. Une seule était appliquée. Les
 * deux autres étaient des phrases, et une base qui garde tout ne les tient
 * pas.
 */

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (nom.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

describe("le point de coupure suit le calendrier, pas une multiplication", () => {
  /**
   * Six mois n'est pas cent quatre-vingts jours : de mars à septembre il y
   * en a cent quatre-vingt-quatre, et de septembre à mars cent
   * quatre-vingt-un. Une durée annoncée en mois se compte en mois, sinon
   * la purge tombe quelques jours à côté de ce qui est écrit.
   */
  it("six mois en arrière depuis le 20 septembre", () => {
    expect(echeanceEnMois(6, new Date("2026-09-20T03:30:00Z")).toISOString()).toBe(
      "2026-03-20T03:30:00.000Z",
    );
  });

  it("cinq ans en arrière, années bissextiles comprises", () => {
    expect(echeanceEnAnnees(5, new Date("2029-02-28T03:30:00Z")).toISOString()).toBe(
      "2024-02-28T03:30:00.000Z",
    );
  });

  /**
   * Les jours, eux, n'ont pas de longueur variable en UTC : la vérification
   * porte sur le passage de mois, qui est là où une soustraction naïve de
   * numéros de jour se tromperait.
   */
  it("quatre-vingt-dix jours en arrière traversent trois mois inégaux", () => {
    expect(echeanceEnJours(90, new Date("2026-09-20T03:30:00Z")).toISOString()).toBe(
      "2026-06-22T03:30:00.000Z",
    );
  });

  it("le passage d'année se fait sans arithmétique à la main", () => {
    expect(echeanceEnMois(6, new Date("2026-02-15T00:00:00Z")).toISOString()).toBe(
      "2025-08-15T00:00:00.000Z",
    );
  });
});

describe("chaque durée déclarée a son exécutant", () => {
  const PURGE = readFileSync("src/server/jobs/purge.ts", "utf8");

  /**
   * Le garde-fou du lot. Une durée de conservation est une phrase tant
   * qu'aucun code d'exécution ne la lit : c'est ce qui était arrivé aux
   * alertes et au journal, déclarés dans le domaine, affichés à quelqu'un,
   * et lus par personne.
   *
   * La lecture cherche dans `src/server`, pas dans le seul job : les trente
   * jours des pièces ne sont pas lus par la purge mais par le calcul de
   * l'échéance à la clôture, et la purge n'y voit qu'une date. Les deux
   * façons d'appliquer une durée sont légitimes ; ne l'appliquer nulle part
   * ne l'est pas.
   */
  it("aucune constante de conservation n'est laissée sans exécutant", () => {
    const declarees = fichiers("src/domain").flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/^export const ((?:CONSERVATION|PURGE|RETENTION)[A-Z_]*)/gmu)]
        .map((m) => `${f} :: ${m[1]!}`),
    );
    expect(declarees.length).toBeGreaterThanOrEqual(3);

    const serveur = fichiers("src/server")
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const orphelines = declarees.filter((d) => !serveur.includes(d.split(" :: ")[1]!));
    expect(orphelines).toEqual([]);
  });

  it("les durées lues sont celles que les phrases annoncent", () => {
    // Le nombre affiché et le nombre appliqué sortent de la même constante :
    // raccourcir une conservation change le texte du même coup.
    expect(MENTION_PORTEE).toContain(`${CONSERVATION_MOIS} mois`);
    expect(MENTION_IMMUABLE).toContain(`${CONSERVATION_ANNEES} ans`);
    expect(PURGE_JOURS).toBe(30);
    // O.B : quatre-vingt-dix jours, et trente de sursis après une clôture.
    expect(CONSERVATION_MOTIF_JOURS).toBe(90);
    expect(SURSIS_APRES_CLOTURE_JOURS).toBe(30);
  });

  /**
   * B-06 annonce que rien ne se supprime « depuis l'interface ». Une tâche
   * planifiée n'est pas l'interface — c'est même la seule façon de tenir
   * les deux moitiés de la phrase, l'immuabilité et la durée.
   */
  it("le journal se purge par échéance, et par rien d'autre", () => {
    expect(MENTION_IMMUABLE).toContain("depuis l'interface");
    const routes = fichiers("src/app/api").filter((f) => f.endsWith("route.ts"));
    const suppressions = routes.filter((f) => /auditLog\.delete/u.test(readFileSync(f, "utf8")));
    expect(suppressions).toEqual([]);
    expect(PURGE).toContain("auditLog.deleteMany");
  });

  /**
   * O.B — le motif d'un échec de paiement s'efface, le paiement reste.
   *
   * La purge ne lit pas la règle elle-même : elle réduit grossièrement par
   * la date, puis laisse le domaine trancher. C'est ce partage qu'on
   * vérifie ici, parce qu'une règle écrite dans un `where` SQL ne se teste
   * pas sans base.
   */
  it("le motif d'échec a son exécutant, et il appelle le domaine", () => {
    expect(PURGE).toMatch(/echeanceEnJours\(CONSERVATION_MOTIF_JOURS,/u);
    expect(PURGE).toContain("motifEffacable");
    expect(PURGE).toMatch(/failureCause: null, failureCauseAt: null/u);
  });

  /**
   * Et le point de coupure se calcule sur la constante, jamais sur un
   * nombre écrit à la main.
   *
   * Trouvé en éprouvant le test précédent : remplacer
   * `echeanceEnJours(CONSERVATION_MOTIF_JOURS, …)` par
   * `echeanceEnJours(90, …)` ne le faisait pas tomber, parce que le nom de
   * la constante restait visible dans l'import et dans le motif du journal.
   * Le garde-fou du lot — « une durée déclarée a un exécutant » — cherche
   * lui aussi le nom quelque part dans `src/server`, et se serait laissé
   * berner de la même façon : la conservation aurait été raccourcie à la
   * constante sans que la purge change d'un jour.
   */
  /**
   * La réduction grossière n'écarte que ce que la règle écarterait.
   *
   * `lt` écartait le motif échu du jour même, que le domaine déclare
   * effaçable — la borne est incluse. Les deux avaient raison séparément,
   * et la purge tombait un jour à côté de ce qui est annoncé. C'est le
   * défaut que ce fichier de tests existe pour empêcher, arrivé par la
   * requête plutôt que par la constante.
   */
  it("la requête n'écarte pas un motif que la règle effacerait", () => {
    expect(PURGE).toMatch(/failureCauseAt: \{ lte: echeanceEnJours\(/u);
  });

  it("aucune échéance ne se calcule sur un nombre écrit à la main", () => {
    const littérales = [...PURGE.matchAll(/echeanceEn(?:Jours|Mois|Annees)\((\d+)/gu)];
    expect(littérales.map((m) => m[0])).toEqual([]);
  });

  /**
   * Ce que la purge **ne** touche pas. Le montant, la date, le statut et la
   * référence sont la preuve comptable ; c'est parce que le motif vit dans
   * sa propre colonne qu'on peut n'effacer que lui.
   */
  it("elle n'efface que le motif, pas le paiement", () => {
    const fonction = /async function effacerLesMotifsEchus[\s\S]*?\n\}/u.exec(PURGE)![0];
    expect(fonction).not.toMatch(/transaction\.deleteMany|transaction\.delete\b/u);
    const ecriture = /data: \{[^}]*\}/u.exec(
      fonction.slice(fonction.indexOf("updateMany")),
    )![0];
    for (const garde of ["amount", "currency", "reference", "status", "createdAt"]) {
      expect(ecriture, garde).not.toContain(garde);
    }
  });

  it("une session échue ne se conserve pas sans motif", () => {
    expect(PURGE).toContain("session.deleteMany");
    expect(PURGE).toContain("expiresAt");
  });
});

describe("le worker passe les trois purges dans la même tâche", () => {
  const WORKER = readFileSync("src/server/jobs/worker.ts", "utf8");

  it("la tâche de rétention appelle les deux lots", () => {
    expect(WORKER).toContain("purgerLesPiecesEchues");
    expect(WORKER).toContain("purgerCeQuiEstEchu");
  });

  it("elle reste quotidienne, comme l'annonce DOC-11", () => {
    expect(WORKER).toMatch(/PURGE_RETENTION, "\d+ \d+ \* \* \*"/u);
  });
});

/**
 * O.B, tranché à quatre-vingt-dix jours le 20/09/2026 — le motif d'un
 * échec de paiement ne se garde pas indéfiniment sur un compte vivant.
 *
 * Il partait déjà avec le compte (RG-10.4) ; ici c'est la même règle sur
 * une horloge. Ce qui se vérifie : la durée ordinaire, la suspension d'un
 * dossier ouvert, et le sursis après clôture — dont le piège est qu'il ne
 * doit jamais raccourcir la conservation.
 */
describe("le motif d'un échec ne se garde que le temps de la réclamation", () => {
  const ECHEC = new Date("2026-06-22T10:00:00Z");
  const SANS_LITIGE = { ouvert: false, closLe: null };
  const jours = (depuis: Date, n: number) =>
    new Date(depuis.getTime() + n * 24 * 60 * 60 * 1000);

  it("il tient quatre-vingt-dix jours, puis s'efface", () => {
    expect(motifEffacable(ECHEC, SANS_LITIGE, jours(ECHEC, 89))).toBe(false);
    expect(motifEffacable(ECHEC, SANS_LITIGE, jours(ECHEC, 90))).toBe(true);
    expect(motifEffacable(ECHEC, SANS_LITIGE, jours(ECHEC, 400))).toBe(true);
  });

  /**
   * Un dossier ouvert suspend, et sans échéance : rendre une date lointaine
   * aurait laissé croire qu'on sait quand il se refermera.
   */
  it("un dossier ouvert suspend l'effacement, quelle que soit l'ancienneté", () => {
    const ouvert = { ouvert: true, closLe: null };
    expect(echeanceDuMotif(ECHEC, ouvert)).toBeNull();
    expect(motifEffacable(ECHEC, ouvert, jours(ECHEC, 3650))).toBe(false);
  });

  it("refermé, il s'efface trente jours plus tard", () => {
    const clos = { ouvert: false, closLe: jours(ECHEC, 200) };
    expect(motifEffacable(ECHEC, clos, jours(ECHEC, 229))).toBe(false);
    expect(motifEffacable(ECHEC, clos, jours(ECHEC, 230))).toBe(true);
  });

  /**
   * **Le piège de la décision.** « Puis intervient trente jours plus tard »
   * se lit comme une échéance de remplacement : une réclamation ouverte le
   * deuxième jour et refermée le cinquième ferait alors disparaître le
   * motif au trente-cinquième, soit bien avant les quatre-vingt-dix jours
   * que la même décision garantit au support. Ouvrir puis refermer une
   * réclamation deviendrait un moyen d'effacer plus tôt que la règle.
   *
   * Les deux échéances valent donc ensemble, et c'est la plus tardive qui
   * s'applique. Le sursis ne peut qu'ajouter du temps.
   */
  it("une clôture précoce n'avance jamais l'effacement", () => {
    const closTot = { ouvert: false, closLe: jours(ECHEC, 5) };
    expect(motifEffacable(ECHEC, closTot, jours(ECHEC, 35))).toBe(false);
    expect(motifEffacable(ECHEC, closTot, jours(ECHEC, 89))).toBe(false);
    expect(motifEffacable(ECHEC, closTot, jours(ECHEC, 90))).toBe(true);
    expect(echeanceDuMotif(ECHEC, closTot)).toEqual(jours(ECHEC, CONSERVATION_MOTIF_JOURS));
  });

  /** La borne est incluse : au jour dit, l'effacement a lieu. */
  it("l'échéance rendue est celle que la règle applique", () => {
    const echeance = echeanceDuMotif(ECHEC, SANS_LITIGE)!;
    expect(motifEffacable(ECHEC, SANS_LITIGE, echeance)).toBe(true);
    expect(motifEffacable(ECHEC, SANS_LITIGE, new Date(echeance.getTime() - 1))).toBe(false);
  });
});

/**
 * Ce que la purge appelle un dossier ouvert.
 *
 * Aucun modèle de réclamation n'a été inventé pour l'occasion : un état
 * existant le dit, et ces tests tiennent qu'on ne s'en invente pas un —
 * ni qu'on en lise un qui ne peut pas se produire.
 */
describe("un dossier ouvert se lit dans ce qui existe déjà", () => {
  const PURGE = readFileSync("src/server/jobs/purge.ts", "utf8");
  // Le corps, pas la seule signature : le `}` qui ferme le type du
  // paramètre est suivi d'une parenthèse, celui de la fonction d'une fin
  // de ligne. La première version s'arrêtait au premier des deux et ne
  // lisait donc que la liste des champs — elle aurait passé quoi qu'on
  // écrive dedans.
  const litige = /function litigeDe[\s\S]*?\n\}$/mu.exec(PURGE)![0];

  it("un écart de réconciliation non résolu suspend", () => {
    expect(litige).toMatch(/ouvert: ecartOuvert\(t\)/u);
    // Et « ouvert » veut bien dire les deux moitiés : il existe, et
    // personne ne l'a refermé.
    const regle = readFileSync("src/domain/backoffice/ecart.ts", "utf8");
    expect(regle).toMatch(
      /etat\.discrepancy !== null && etat\.discrepancyResolvedAt === null/u,
    );
  });

  /**
   * **Et pas le remboursement dû, qui ne peut pas coexister avec un
   * motif.** Trouvé en exécutant la purge contre PostgreSQL : semer une
   * transaction en échec portant une obligation de remboursement est
   * refusé par la base. `transaction_remboursement_du_suppose_un_encaissement`
   * veut `CONFIRMEE` ou `REMBOURSEE` ; `transaction_motif_seulement_sur_un_echec`
   * veut `ECHOUEE` ou `EXPIREE`. La branche était morte — et une règle qui
   * ne peut pas s'appliquer se relit comme une protection qu'on a.
   *
   * Les deux contraintes sont lues ici plutôt que recopiées : si l'une des
   * deux s'élargit un jour, les ensembles pourront se recouper, et ce test
   * tombera pour dire qu'il faut reconsidérer la branche.
   */
  it("le remboursement dû n'est pas lu, parce qu'il ne peut pas se produire", () => {
    expect(litige).not.toMatch(/refundDueAt|refundedAt/u);

    const motif = readFileSync(
      "prisma/migrations/20260920000200_motif_de_refus/migration.sql",
      "utf8",
    );
    const remboursement = readFileSync(
      "prisma/migrations/20260920000600_remboursement_du/migration.sql",
      "utf8",
    );
    expect(motif).toMatch(
      /transaction_motif_seulement_sur_un_echec[\s\S]*?'ECHOUEE', 'EXPIREE'/u,
    );
    expect(remboursement).toMatch(
      /transaction_remboursement_du_suppose_un_encaissement[\s\S]*?'CONFIRMEE', 'REMBOURSEE'/u,
    );
  });

  /**
   * **Le sursis a enfin son déclencheur.** O.B avait écrit la règle des
   * trente jours et constaté qu'aucun événement ne pouvait la déclencher :
   * rien ne datait la résolution d'un écart, et `closLe` rendait `null`.
   * B-04 referme désormais un écart avec une date, et c'est elle qui
   * ouvre le sursis. La règle n'a pas bougé d'une ligne — seule la source
   * de la date.
   */
  it("la clôture d'un écart date le sursis", () => {
    expect(litige).toMatch(/closLe: t\.discrepancyResolvedAt/u);
    expect(litige).not.toMatch(/closLe: null/u);
  });
});
