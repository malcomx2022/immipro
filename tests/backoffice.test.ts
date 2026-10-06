import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CHAMPS_CANDIDAT,
  MENTION_SANS_MONTANT,
  aChange,
  comparer,
  compterChangements,
  effetDeLaPublication,
  messageDeRefus,
  publiable,
  verifierTextesCandidat,
  visiblePourLeCandidat,
} from "@/domain/backoffice/regle";
import {
  collecteComplete,
  enRetard,
  filtrerVeille,
  joursDeRetard,
  libelleRelecture,
  messageSourceInjoignable,
  resumeCollecte,
  resumeVeille,
  trierParEcheance,
} from "@/domain/backoffice/veille";
import {
  DELAI_CIBLE_HEURES,
  horsDelai,
  libelleAge,
  messageValide,
  recrediteLeQuota,
  refusDuMessage,
  resumeRevue,
  trierParAnciennete,
} from "@/domain/backoffice/revue";
import {
  ACTIONS_ATTENDUES,
  ACTIONS_COMPTE,
  messageDeRelance,
  obstacleALActionCompte,
  actionsPour,
  diagnostiquerRecherche,
  filtrerComptes,
  resumeComptes,
} from "@/domain/backoffice/comptes";
import {
  agreger,
  libelleEcarts,
  messageIncidentOperateur,
  totalPubliable,
} from "@/domain/backoffice/reconciliation";
import { diagnostiquerPeriode, filtrerAudit } from "@/domain/backoffice/audit";
import {
  COMMANDES_ATTENDUES,
  GARDE_FOUS,
  METRIQUES,
  coutMicrosDesJetons,
  depassements,
  hauteurRelative,
  libelleDepassement,
  candidatsAuDepassement,
  partDuQuotaIA,
  mesureDepuisLesLignes,
  metriquesMesurees,
  serieQuotidienne,
  serieVide,
  tarifDepuisEnvironnement,
  aucuneMesure,
  gardeFousTenus,
  libelleDesGardeFous,
  medianeQuotidienne,
  plafondQuotidien,
} from "@/domain/backoffice/couts";
import {
  COLLECTE,
  COLLECTE_PARTIELLE,
  COMPTES,
  DOSSIERS_EN_VERSION_4,
  DOSSIERS_SOUS_LA_VERSION_5,
  ECRITURES_AUDIT,
  FICHES_SUIVIES,
  OPERATEUR,
  OPERATEUR_MUET,
  PAIEMENTS,
  piecesEnEchec,
  REGLE_BROUILLON,
  REGLE_EN_VIGUEUR,
} from "@/lib/contenu/backoffice";
import { formatMontant } from "@/lib/utils";
import { jourEnFrancais } from "@/domain/format/moment";

const lire = (f: string) => readFileSync(f, "utf8");

/** Tous les fichiers TypeScript d'une arborescence, chemins en barres obliques. */
function fichiersDe(dir: string, filtre: RegExp, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) fichiersDe(chemin, filtre, acc);
    else if (filtre.test(nom)) acc.push(chemin.replace(/\\/gu, "/"));
  }
  return acc;
}


const AUJOURDHUI = "2026-09-18";

/* ------------------------------------------------------------------ *
 * B-02 — le troisième point d'application du vocabulaire interdit.
 * ------------------------------------------------------------------ */

describe("B-02 — un administrateur ne peut pas écrire une promesse au candidat", () => {
  const texte = (libelleCandidat: string, reserveCandidat = "Réserve neutre.") => ({
    libelleCandidat,
    reserveCandidat,
  });

  it("refuse le cas exact que le garde-fou ne couvrait pas", () => {
    // « Un admin qui tape "95 % de réussite" dans un guide pays contourne
    // aujourd'hui tout le dispositif. C'est le vrai trou. »
    const fautes = verifierTextesCandidat(texte("95 % de réussite sur cette procédure."));
    expect(fautes.length).toBeGreaterThan(0);
    expect(publiable(texte("95 % de réussite sur cette procédure."))).toBe(false);
  });

  it("refuse les promesses de résultat comme dans le code", () => {
    for (const promesse of [
      "Tes chances d'obtention sont élevées avec ce dossier.",
      "Visa garanti si tu suis la checklist.",
      "Nous déposons ton dossier à ta place.",
      "Notre avocat vérifie chaque pièce.",
    ]) {
      expect(publiable(texte(promesse)), promesse).toBe(false);
    }
  });

  it("laisse écrire la phrase qui protège : la négation est reconnue ici aussi", () => {
    for (const phrase of [
      "ImmiPro ne garantit pas l'obtention du visa.",
      "Ce montant n'est pas une probabilité d'acceptation.",
      "Un dossier complet n'est pas un dossier accepté.",
    ]) {
      expect(publiable(texte(phrase)), phrase).toBe(true);
    }
  });

  it("valide les deux champs destinés au candidat, pas seulement le premier", () => {
    expect(CHAMPS_CANDIDAT.map((c) => c.cle)).toEqual([
      "libelleCandidat",
      "reserveCandidat",
    ]);
    const fautes = verifierTextesCandidat(
      texte("Texte neutre.", "Taux d'acceptation de 92 % l'an dernier."),
    );
    expect(fautes.map((f) => f.champ)).toContain("reserveCandidat");
  });

  it("cite la formulation exacte et pointe le champ à corriger", () => {
    const faute = verifierTextesCandidat(texte("Visa garanti sous six semaines."))[0]!;
    const message = messageDeRefus(faute);
    expect(message).toContain("Visa garanti");
    expect(message).toContain("Libellé affiché au candidat");
    expect(message).toContain("Reformule");
  });

  it("laisse passer le libellé réel de la règle allemande", () => {
    expect(publiable(REGLE_BROUILLON)).toBe(true);
    expect(verifierTextesCandidat(REGLE_EN_VIGUEUR)).toEqual([]);
  });
});

describe("B-02 — versionnement et INV-3", () => {
  it("ne migre aucun dossier, et le type le dit", () => {
    const effet = effetDeLaPublication(DOSSIERS_EN_VERSION_4, DOSSIERS_SOUS_LA_VERSION_5);
    expect(effet.migrationsAutomatiques).toBe(0);
    expect(effet.dossiersConcernes).toBe(37);
    expect(effet.arbitragesRequis).toBe(29);
    // Tous les dossiers concernés sont alertés, pas seulement ceux en arbitrage.
    expect(effet.alertes).toBe(effet.dossiersConcernes);
  });

  it("compare N et N+1 en gardant les champs inchangés", () => {
    const differences = comparer(
      REGLE_EN_VIGUEUR,
      REGLE_BROUILLON,
      formatMontant,
      MENTION_SANS_MONTANT,
      jourEnFrancais,
    );
    expect(differences).toHaveLength(4);
    expect(compterChangements(differences)).toBe(3);
    const delai = differences.find((d) => d.champ === "Délai d'instruction")!;
    expect(aChange(delai)).toBe(false);
  });

  it("tient INV-4 : une source secondaire n'est jamais visible du candidat", () => {
    expect(visiblePourLeCandidat("OFFICIEL")).toBe(true);
    expect(visiblePourLeCandidat("INSTITUTIONNEL")).toBe(true);
    expect(visiblePourLeCandidat("SECONDAIRE")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * B-01 — veille
 * ------------------------------------------------------------------ */

describe("B-01 — file de veille", () => {
  it("compte le retard en jours et le dit dans les deux sens", () => {
    const fiche = FICHES_SUIVIES[0]!;
    expect(joursDeRetard(fiche, AUJOURDHUI)).toBe(3);
    expect(libelleRelecture(fiche, AUJOURDHUI)).toBe("En retard de 3 j");
    const nl = FICHES_SUIVIES[1]!;
    expect(enRetard(nl, AUJOURDHUI)).toBe(false);
    expect(libelleRelecture(nl, AUJOURDHUI)).toBe("Dans 84 j");
    expect(libelleRelecture({ ...nl, relectureLe: AUJOURDHUI }, AUJOURDHUI)).toBe(
      "À relire aujourd'hui",
    );
  });

  it("met le plus en retard en tête : c'est l'ordre du travail", () => {
    const triees = trierParEcheance(FICHES_SUIVIES, AUJOURDHUI);
    expect(triees[0]!.id).toBe("pt-etudes");
    expect(joursDeRetard(triees[0]!, AUJOURDHUI)).toBeGreaterThan(
      joursDeRetard(triees[1]!, AUJOURDHUI),
    );
  });

  it("filtre sans jamais masquer ce qui est en retard sous « Toutes »", () => {
    expect(filtrerVeille(FICHES_SUIVIES, "TOUTES", "", AUJOURDHUI)).toHaveLength(
      FICHES_SUIVIES.length,
    );
    const retard = filtrerVeille(FICHES_SUIVIES, "EN_RETARD", "", AUJOURDHUI);
    expect(retard.every((f) => enRetard(f, AUJOURDHUI))).toBe(true);
    expect(filtrerVeille(FICHES_SUIVIES, "TOUTES", "allemagne", AUJOURDHUI)).toHaveLength(2);
    expect(
      filtrerVeille(FICHES_SUIVIES, "BROUILLON", "", AUJOURDHUI).map((f) => f.id),
    ).toEqual(["be-etudes"]);
  });

  it("résume la file avec les trois compteurs qui décident du travail", () => {
    expect(resumeVeille(FICHES_SUIVIES, AUJOURDHUI)).toMatch(
      /^8 fiches suivies · \d+ en retard de relecture · 1 écart détecté$/,
    );
  });

  it("dit une collecte partielle avec son compte exact", () => {
    expect(collecteComplete(COLLECTE)).toBe(true);
    expect(collecteComplete(COLLECTE_PARTIELLE)).toBe(false);
    const moment = (iso: string) => `le ${iso.slice(0, 10)}`;
    expect(resumeCollecte(COLLECTE_PARTIELLE, moment)).toContain(
      "13 sources sur 14 relevées",
    );
  });

  it("dit d'abord ce qui continue de fonctionner quand une source est muette", () => {
    const moment = (iso: string) => `le ${iso.slice(0, 10)}`;
    expect(messageSourceInjoignable(COLLECTE, moment)).toBeNull();
    const message = messageSourceInjoignable(COLLECTE_PARTIELLE, moment)!;
    expect(message).toContain("ind.nl n'a pas répondu, après 3 tentatives");
    expect(message).toContain("Elles restent publiées");
    expect(message).toContain("une source muette ne vaut pas un changement de règle");
  });
});

/* ------------------------------------------------------------------ *
 * B-05 — revue manuelle
 * ------------------------------------------------------------------ */

describe("B-05 — revue manuelle des pièces", () => {
  const maintenant = new Date("2026-09-18T09:41:00Z");
  const PIECES_EN_ECHEC = piecesEnEchec(maintenant);

  it("calcule l'âge d'une pièce au lieu de le saisir", () => {
    expect(libelleAge(PIECES_EN_ECHEC[0]!, maintenant)).toBe("4 h 32");
    expect(libelleAge(PIECES_EN_ECHEC[5]!, maintenant)).toBe("26 min");
  });

  it("marque le dépassement du délai cible, et lui seul", () => {
    expect(DELAI_CIBLE_HEURES).toBe(4);
    expect(PIECES_EN_ECHEC.filter((p) => horsDelai(p, maintenant))).toHaveLength(1);
    expect(horsDelai(PIECES_EN_ECHEC[0]!, maintenant)).toBe(true);
    expect(horsDelai(PIECES_EN_ECHEC[1]!, maintenant)).toBe(false);
  });

  it("garde la file lisible quelle que soit l'heure du rendu", () => {
    // Des horodatages figés faisaient basculer toute la file hors délai au
    // fil de la journée.
    const plusTard = new Date("2026-09-18T18:00:00Z");
    expect(piecesEnEchec(plusTard).filter((p) => horsDelai(p, plusTard))).toHaveLength(1);
  });

  it("traite la file par ordre d'attente", () => {
    const triees = trierParAnciennete(PIECES_EN_ECHEC);
    expect(triees[0]!.id).toBe("nl-4471-photo");
    expect(resumeRevue(triees, maintenant)).toContain("plus ancienne : 4 h 32");
    expect(resumeRevue([], maintenant)).toBe("Aucune pièce en attente de revue");
  });

  it("refuse un constat nu, comme le code se l'interdit à lui-même", () => {
    for (const nu of ["Non conforme", "document non conforme.", "Illisible", "KO"]) {
      const refus = refusDuMessage(nu, "A_CORRIGER");
      expect(refus, nu).not.toBeNull();
      expect(refus!.consigne).toContain("constat");
    }
  });

  it("refuse un message vide ou trop court pour dire constat et action", () => {
    expect(refusDuMessage("", "A_CORRIGER")!.raison).toContain("Aucun message");
    expect(refusDuMessage("Reprends la photo.", "A_CORRIGER")!.raison).toContain(
      "trop court",
    );
  });

  it("applique le vocabulaire interdit au texte saisi par un humain", () => {
    const refus = refusDuMessage(
      "Ta pièce est bonne, tes chances d'obtention sont excellentes avec ce dossier.",
      "CONFORME",
    );
    expect(refus).not.toBeNull();
    expect(refus!.raison).toContain("chances d'obtention");
  });

  it("accepte un message qui dit la mesure puis le geste", () => {
    const bon =
      "Ton relevé s'arrête en juin, il en faut trois consécutifs. Demande à ta banque un relevé couvrant juin, juillet et août.";
    expect(refusDuMessage(bon, "A_CORRIGER")).toBeNull();
    expect(messageValide(bon, "A_CORRIGER")).toBe(true);
  });

  it("recrédite le quota quand la lecture n'a rien rendu", () => {
    expect(recrediteLeQuota("ILLISIBLE")).toBe(true);
    expect(recrediteLeQuota("HORS_SUJET")).toBe(true);
    expect(recrediteLeQuota("CONFORME")).toBe(false);
    expect(recrediteLeQuota("A_CORRIGER")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * B-03, B-04, B-06, B-07
 * ------------------------------------------------------------------ */

describe("B-03 — comptes", () => {
  it("nomme le critère qui exclut le reste", () => {
    // « Un compte porte cette adresse, mais son email est vérifié. »
    const diagnostic = diagnostiquerRecherche(COMPTES, "EMAIL_NON_VERIFIE", "aline")!;
    expect(diagnostic.message).toContain("avec ce filtre");
    expect(diagnostic.critere?.libelle).toBe("Email non vérifié");
    expect(diagnostic.critere?.explication).toContain("Retire le filtre");
  });

  it("ne diagnostique rien quand il y a des résultats", () => {
    expect(diagnostiquerRecherche(COMPTES, "TOUS", "aline")).toBeNull();
    expect(filtrerComptes(COMPTES, "TOUS", "aline")).toHaveLength(1);
  });

  it("distingue une recherche vide d'un filtre trop étroit", () => {
    const introuvable = diagnostiquerRecherche(COMPTES, "TOUS", "zzzz")!;
    expect(introuvable.critere).toBeUndefined();
    expect(introuvable.message).toContain("« zzzz »");
  });

  /**
   * La liste était fausse dans les deux sens : elle offrait trois actions
   * sans route et omettait la seule dont la route existe. Ce qui reste
   * est ce qui part vraiment au serveur.
   */
  it("n'offre que les actions qui ont un sens, et qui existent", () => {
    const actif = COMPTES.find((c) => c.statut === "ACTIF")!;
    expect(actionsPour(actif).map((a) => a.cle)).toEqual(["suspendre"]);
    const nonVerifie = COMPTES.find((c) => c.statut === "EMAIL_NON_VERIFIE")!;
    expect(actionsPour(nonVerifie).map((a) => a.cle)).toEqual([
      "suspendre",
      "renvoyer-verification",
    ]);
    // Une suppression demandée suit son cours : la suspendre en plus ne
    // ferait que retarder une purge que le candidat a réclamée. Seule
    // issue : la reprendre si elle est restée à mi-chemin (S.121).
    const partant = COMPTES.find((c) => c.statut === "SUPPRESSION_DEMANDEE")!;
    expect(actionsPour(partant).map((a) => a.cle)).toEqual(["relancer-suppression"]);
  });

  it("un compte suspendu n'a qu'une issue : le rétablir", () => {
    const suspendu = { ...COMPTES[0]!, statut: "SUSPENDU" as const };
    expect(actionsPour(suspendu).map((a) => a.cle)).toEqual(["retablir"]);
  });

  /**
   * Ce qui n'est pas fait est nommé, avec ce qui manque. Le renvoi du
   * code et la relance d'une suppression en sont sortis en S.121 : leurs
   * routes existent, et elles sont dans `ACTIONS_COMPTE`.
   */
  it("ce qui manque est nommé, pas oublié", () => {
    expect(ACTIONS_ATTENDUES.map((a) => a.cle)).toEqual(["recrediter"]);
    for (const a of ACTIONS_ATTENDUES) {
      expect(a.manque.length, a.cle).toBeGreaterThan(15);
    }
    // Le recrédit n'est pas qu'une route manquante : c'est une décision
    // commerciale, et elle ne s'invente pas depuis un écran.
    const recredit = ACTIONS_ATTENDUES.find((a) => a.cle === "recrediter")!;
    expect(recredit.manque).toMatch(/commerciale/u);
  });

  it("une action n'est jamais à la fois offerte et attendue", () => {
    const offertes = ACTIONS_COMPTE.map((a) => a.libelle);
    for (const a of ACTIONS_ATTENDUES) expect(offertes).not.toContain(a.libelle);
  });

  it("le renvoi du code ne s'offre qu'à une adresse non vérifiée", () => {
    const renvoi = ACTIONS_COMPTE.find((a) => a.cle === "renvoyer-verification")!;
    expect(renvoi.statuts).toEqual(["EMAIL_NON_VERIFIE"]);
    expect(renvoi.consequence).toMatch(/dix minutes/u);
  });

  it("la relance d'une suppression ne s'offre qu'à une suppression demandée", () => {
    const relance = ACTIONS_COMPTE.find((a) => a.cle === "relancer-suppression")!;
    expect(relance.statuts).toEqual(["SUPPRESSION_DEMANDEE"]);
    expect(relance.libelle).toBe("Traiter la demande de suppression");
  });

  it("la relance dit si le compte est anonymisé, ou ce qui reste à faire", () => {
    const fini = messageDeRelance({ anonymise: true, dossiers: 2, versions: 5 });
    expect(fini.achevee).toBe(true);
    expect(fini.texte).toMatch(/anonymisé, 2 dossiers purgés/u);
    expect(messageDeRelance({ anonymise: true, dossiers: 1, versions: 1 }).texte).toMatch(
      /1 dossier purgé\./u,
    );
    // Une pièce résiste : ce n'est pas un succès, et le texte dit quoi faire.
    const reste = messageDeRelance({ anonymise: false, dossiers: 0, versions: 0 });
    expect(reste.achevee).toBe(false);
    expect(reste.texte).toMatch(/pas anonymisé/u);
    expect(reste.texte).toMatch(/relance/u);
  });

  /** Le motif part au journal, et une suspension sans motif ne se relit pas. */
  it("aucune action sans motif suffisant", () => {
    expect(obstacleALActionCompte("")).toMatch(/Écris pourquoi/u);
    // « abus » fait quatre caractères ; le seuil en demande dix, pour
    // qu'un motif dise quelque chose à qui le relira dans six mois.
    expect(obstacleALActionCompte("abus")).toMatch(/Écris pourquoi/u);
    expect(obstacleALActionCompte("   espaces   ")).toMatch(/Écris pourquoi/u);
    expect(obstacleALActionCompte("Compte signalé pour usurpation d'identité.")).toBeNull();
  });

  it("résume les comptes avec les demandes de suppression en cours", () => {
    expect(resumeComptes(COMPTES)).toContain("1 demande de suppression en cours");
  });
});

describe("B-04 — réconciliation", () => {
  it("n'additionne que les paiements rapprochés", () => {
    const a = agreger(PAIEMENTS);
    // Une somme par monnaie depuis M.B : additionner deux rails produisait
    // un total en francs qui contenait des euros.
    expect(a.encaisse).toEqual({ XOF: 60000 });
    expect(a.confirmes).toBe(2);
    expect(a.enAttente).toEqual({ XOF: 8000 });
    expect(a.echecs).toBe(1);
    expect(a.ecarts).toBe(1);
  });

  it("retire le total du jour pendant un incident opérateur", () => {
    expect(totalPubliable(OPERATEUR)).toBe(true);
    expect(totalPubliable(OPERATEUR_MUET)).toBe(false);
  });

  it("ne marque aucun paiement en échec sur le silence de l'opérateur", () => {
    const heure = (iso: string) => iso.slice(11, 16);
    expect(messageIncidentOperateur(OPERATEUR, heure)).toBeNull();
    const message = messageIncidentOperateur(OPERATEUR_MUET, heure)!;
    expect(message).toContain("reprendra seul");
    expect(message).toContain("aucun n'est marqué en échec");
    expect(message).toContain("aucun pack n'est fermé");
  });

  it("accorde le libellé des écarts", () => {
    expect(libelleEcarts(agreger(PAIEMENTS))).toBe("Traiter l'écart");
    expect(libelleEcarts({ ...agreger(PAIEMENTS), ecarts: 0 })).toBe(
      "Aucun écart à traiter",
    );
    expect(libelleEcarts({ ...agreger(PAIEMENTS), ecarts: 2 })).toBe("Traiter les 2 écarts");
  });
});

describe("B-06 — journal d'audit", () => {
  const periode = { du: "2026-09-01", au: "2026-09-30" };
  const moment = (iso: string) => iso.slice(0, 10);

  it("rend les écritures les plus récentes d'abord", () => {
    const visibles = filtrerAudit(ECRITURES_AUDIT, periode, []);
    expect(visibles[0]!.id).toBe("a-1");
    expect(visibles).toHaveLength(ECRITURES_AUDIT.length);
  });

  it("distingue une période vide d'un filtre trop étroit", () => {
    // Période réellement sans écriture.
    const vide = diagnostiquerPeriode(
      ECRITURES_AUDIT,
      { du: "2026-09-01", au: "2026-09-07" },
      [],
      moment,
    )!;
    expect(vide.message).toContain("Aucune écriture entre");
    expect(vide.suivante?.message).toContain("ne comble jamais une période vide");
    expect(vide.categorieExcluante).toBeUndefined();

    // Filtre trop étroit sur une période qui, elle, porte des écritures.
    const filtre = diagnostiquerPeriode(ECRITURES_AUDIT, periode, ["COMPTE"], moment);
    expect(filtre).toBeNull();
  });

  it("ne diagnostique rien quand des écritures répondent", () => {
    expect(diagnostiquerPeriode(ECRITURES_AUDIT, periode, [], moment)).toBeNull();
  });
});

describe("B-07 — coûts IA, livré vide", () => {
  it("n'affiche aucune valeur tant qu'aucune mesure n'existe", () => {
    expect(aucuneMesure(METRIQUES)).toBe(true);
    for (const m of METRIQUES) expect(m.valeur, m.cle).toBeNull();
  });

  it("nomme la source de calcul de chaque métrique, à la place du chiffre", () => {
    for (const m of METRIQUES) expect(m.source.length).toBeGreaterThan(10);
  });

  it("exprime les garde-fous en ratio : ils restent vrais sans mesure", () => {
    expect(GARDE_FOUS).toHaveLength(3);
    for (const g of GARDE_FOUS) {
      expect(g.seuil).not.toMatch(/\d+\s?(F|€)/);
      expect(g.consequence.length).toBeGreaterThan(10);
    }
    expect(GARDE_FOUS[0]!.seuil).toMatch(/15\s?%/);
  });

  /**
   * ── Deux des trois ne gardaient rien ────────────────────────────────
   *
   * Le module dit lui-même : « un seuil sans conséquence n'est pas un
   * garde-fou ». Deux de ses trois seuils annonçaient pourtant une
   * conséquence que rien ne produit — `plafondQuotidien` est écrit, testé et
   * lu par personne ; la seule bascule en revue humaine se déclenche sur
   * trois tentatives d'analyse en échec ; aucun budget de référence n'existe.
   */
  it("un seuil non appliqué dit ce qui lui manque, et lui seul", () => {
    for (const g of GARDE_FOUS) {
      if (g.tenu) {
        expect(g.manque, g.libelle).toBeUndefined();
      } else {
        // Nommer le manque, sinon le retirer ferait disparaître le besoin
        // avec la ligne.
        expect(g.manque, g.libelle).toBeTruthy();
        expect(g.manque!.length, g.libelle).toBeGreaterThan(20);
        // Et ne pas promettre de date : le registre dit ce qui manque, pas
        // quand il arrivera.
        expect(g.manque, g.libelle).not.toMatch(/bientôt|prochainement|\d{4}/u);
      }
    }
    expect(gardeFousTenus()).toHaveLength(1);
    expect(libelleDesGardeFous()).toBe("1 seuil appliqué sur 3");
  });

  /**
   * Le seul seuil déclaré appliqué l'est parce que sa conséquence existe :
   * `depassements` alimente la liste que l'écran affiche. Les deux autres
   * s'appuieraient sur `plafondQuotidien`, que rien en production ne lit —
   * et c'est cela que `tenu: false` dit.
   */
  it("« appliqué » se vérifie : le calcul du plafond n'a aucun lecteur en production", () => {
    const sources = fichiersDe("src", /\.tsx?$/u)
      .filter((f) => f !== "src/domain/backoffice/couts.ts")
      .map((f) => lire(f))
      .join("\n");
    // Le jour où un ouvrier lit le plafond, ce test tombe et oblige à
    // repasser `tenu` à vrai — c'est là qu'on relit la conséquence.
    expect(sources).not.toMatch(/plafondQuotidien\(/u);
    expect(sources).not.toMatch(/medianeQuotidienne\(/u);
    // Celui qui garde, lui, est bien branché.
    expect(sources).toMatch(/depassements\(/u);
  });

  it("la seule bascule en revue humaine se déclenche sur des échecs, pas sur un coût", () => {
    const analyse = lire("src/server/jobs/analyse.ts");
    expect(analyse).toMatch(/tentatives < TENTATIVES_AVANT_REVUE/u);
    expect(analyse).not.toMatch(/plafond|mediane|coutMicros/u);
  });

  it("prend la médiane et non la moyenne, pour résister à une journée exceptionnelle", () => {
    const depenses = [100, 110, 120, 130, 140, 150, 9000];
    expect(medianeQuotidienne(depenses)).toBe(130);
    expect(plafondQuotidien(depenses)).toBe(390);
    expect(medianeQuotidienne([])).toBeNull();
    expect(medianeQuotidienne([10, 20])).toBe(15);
  });

  it("ne garde que les sept derniers jours pour le plafond", () => {
    const dix = [1, 1, 1, 100, 110, 120, 130, 140, 150, 160];
    expect(plafondQuotidien(dix)).toBe(130 * 3);
  });
  // ── S.6 : ce qui se compte, et ce qui se tarife ─────────────────────

  it("n'a pas de tarif tant que les trois variables ne sont pas là", () => {
    expect(tarifDepuisEnvironnement({})).toBeNull();
    // Un tarif partiel est un tarif absent : facturer l'entrée sans la
    // sortie donnerait un coût inférieur au vrai.
    expect(
      tarifDepuisEnvironnement({
        AI_TARIF_ENTREE_PAR_MILLION: "3",
        AI_TARIF_DEVISE: "XOF",
      }),
    ).toBeNull();
    expect(
      tarifDepuisEnvironnement({
        AI_TARIF_ENTREE_PAR_MILLION: "3",
        AI_TARIF_SORTIE_PAR_MILLION: "15",
      }),
    ).toBeNull();
    // Une valeur illisible n'est pas lue comme zéro.
    expect(
      tarifDepuisEnvironnement({
        AI_TARIF_ENTREE_PAR_MILLION: "gratuit",
        AI_TARIF_SORTIE_PAR_MILLION: "15",
        AI_TARIF_DEVISE: "XOF",
      }),
    ).toBeNull();
  });

  it("lit le tarif complet, et tarife d'entrée et de sortie séparément", () => {
    const tarif = tarifDepuisEnvironnement({
      AI_TARIF_ENTREE_PAR_MILLION: "1800",
      AI_TARIF_SORTIE_PAR_MILLION: "9000",
      AI_TARIF_DEVISE: "XOF",
    });
    expect(tarif).toEqual({
      entreeParMillion: 1800,
      sortieParMillion: 9000,
      devise: "XOF",
    });
    // 1 000 000 d'entrée + 1 000 000 de sortie = 10 800 XOF, en micros.
    expect(coutMicrosDesJetons(tarif, 1_000_000, 1_000_000)).toBe(10_800_000_000);
    // La sortie coûte cinq fois l'entrée : les confondre fausserait le coût.
    expect(coutMicrosDesJetons(tarif, 0, 1_000_000)).toBe(9_000_000_000);
  });

  it("rend null sans tarif, jamais zéro", () => {
    expect(coutMicrosDesJetons(null, 4200, 310)).toBeNull();
  });

  /**
   * Le défaut de S.6, en une assertion.
   *
   * L'écran sortait de l'état vide au premier dossier et affichait « 0,00 F
   * par dossier », parce que l'écrivain de `AiUsage` posait un zéro faute de
   * tarif. Les jetons se comptent, le coût se tarife : les deux ne quittent
   * plus l'état vide ensemble.
   */
  it("compte les jetons sans tarif, et laisse les montants absents", () => {
    const mesurees = metriquesMesurees({
      dossiers: 3,
      jetons: 16_500,
      appels: 4,
      coutMicros: null,
      pirePart: null,
      devise: null,
    });
    const par = (cle: string) => mesurees.find((m) => m.cle === cle)!;

    expect(par("jetons").valeur).toMatch(/16.500 jetons/);
    expect(par("analyses").valeur).toBe("4 appels");
    for (const cle of ["depense-mois", "cout-par-dossier", "part-du-pack"]) {
      expect(par(cle).valeur, cle).toBeNull();
      expect(par(cle).tarifee, cle).toBe(true);
    }
    expect(aucuneMesure(mesurees)).toBe(false);
  });

  it("libelle les montants dans la devise du tarif", () => {
    const mesurees = metriquesMesurees({
      dossiers: 2,
      jetons: 9_000,
      appels: 3,
      coutMicros: 1_250_000,
      pirePart: 0.03,
      devise: "XOF",
    });
    const par = (cle: string) => mesurees.find((m) => m.cle === cle)!;
    expect(par("depense-mois").valeur).toBe("1,25 XOF");
    expect(par("cout-par-dossier").valeur).toContain("0,63 XOF sur 2 dossiers");
    // « sur 1 dossiers » s'est lu à l'exécution, pas dans un test.
    expect(
      metriquesMesurees({
        dossiers: 1,
        jetons: 559_000,
        appels: 2,
        coutMicros: 1_287_000_000,
        pirePart: null,
        devise: "XOF",
      }).find((m) => m.cle === "cout-par-dossier")!.valeur,
    ).toMatch(/sur 1 dossier$/);
    expect(par("part-du-pack").valeur).toBe("3,0 % au plus haut");
  });

  it("reste entièrement vide sans aucun dossier", () => {
    const mesurees = metriquesMesurees({
      dossiers: 0,
      jetons: 0,
      appels: 0,
      coutMicros: null,
      pirePart: null,
      devise: null,
    });
    expect(aucuneMesure(mesurees)).toBe(true);
  });

  // ── L'histogramme ────────────────────────────────────────────────────

  it("comble les jours sans appel par des zéros, sans les masquer", () => {
    const serie = serieQuotidienne(
      [{ jour: "2026-09-19", jetons: 12_000, appels: 3 }],
      "2026-09-21",
      4,
    );
    expect(serie.map((j) => j.jour)).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
    ]);
    expect(serie.map((j) => j.appels)).toEqual([0, 3, 0, 0]);
    expect(serieVide(serie)).toBe(false);
    expect(serieVide(serieQuotidienne([], "2026-09-21", 4))).toBe(true);
  });

  it("donne une hauteur nulle au jour sans appel, et pleine au maximum", () => {
    const serie = serieQuotidienne(
      [
        { jour: "2026-09-20", jetons: 6_000, appels: 2 },
        { jour: "2026-09-21", jetons: 12_000, appels: 3 },
      ],
      "2026-09-21",
      3,
    );
    expect(hauteurRelative(serie[0]!, serie)).toBe(0);
    expect(hauteurRelative(serie[1]!, serie)).toBe(0.5);
    expect(hauteurRelative(serie[2]!, serie)).toBe(1);
    // Aucune division par zéro sur une série entièrement nulle.
    const nulle = serieQuotidienne([], "2026-09-21", 2);
    expect(hauteurRelative(nulle[0]!, nulle)).toBe(0);
  });

  // ── Les dépassements individuels, RG-16.2 ────────────────────────────

  const marge = (dossierId: string, pack: string, part: number, appels: number) =>
    ({ dossierId, pack, part, appels, nature: "marge" }) as const;

  it("nomme les dossiers au-delà du seuil, du pire au moindre", () => {
    const releves = depassements([
      marge("a", "ESSENTIEL", 0.04, 2),
      marge("b", "DOSSIER", 0.22, 9),
      marge("c", "PRO", 0.17, 5),
      // Exactement au seuil : la règle dit « au-delà ».
      marge("d", "PRO", 0.15, 4),
    ]);
    expect(releves.map((d) => d.dossierId)).toEqual(["b", "c"]);
  });

  it("accorde le singulier du nombre d'appels", () => {
    expect(libelleDepassement(marge("a", "PRO", 0.22, 1))).toMatch(/sur 1 appel$/);
    expect(libelleDepassement(marge("a", "PRO", 0.22, 2))).toMatch(/sur 2 appels$/);
  });

  /* ── Le quota de jetons, la mesure qui tient sans tarif ───────────── */

  /**
   * `candidatsAuDepassement` écartait toute ligne dont `partDuPrix`
   * valait `null`, c'est-à-dire **toutes** tant qu'aucun tarif de jeton
   * n'est configuré. La liste d'alerte ne pouvait donc pas être non
   * vide, et un dossier à dix fois son quota n'apparaissait nulle part.
   */
  it("un dossier hors quota se voit sans qu'aucun tarif soit configuré", () => {
    const sansTarif = {
      dossierId: "a",
      appels: 3,
      jetonsEntree: 800_000,
      jetonsSortie: 400_000,
      coutMicros: null,
      pack: "essentiel",
      partDuPrix: null,
      partDuQuota: partDuQuotaIA(1_200_000, 120_000),
    };
    const releves = depassements(candidatsAuDepassement([sansTarif]));
    expect(releves).toHaveLength(1);
    expect(releves[0]!.nature).toBe("quota");
    expect(libelleDepassement(releves[0]!)).toContain("du quota de jetons");
  });

  /** Sous le quota, rien ne remonte : le seuil est le quota lui-même. */
  it("un dossier dans son quota ne remonte pas", () => {
    const dansLeQuota = {
      dossierId: "a",
      appels: 1,
      jetonsEntree: 40_000,
      jetonsSortie: 20_000,
      coutMicros: null,
      pack: "essentiel",
      partDuPrix: null,
      partDuQuota: partDuQuotaIA(60_000, 120_000),
    };
    expect(depassements(candidatsAuDepassement([dansLeQuota]))).toEqual([]);
  });

  /**
   * Les deux mesures sont deux constats, pas un seul : un dossier peut
   * figurer pour sa marge **et** pour son quota, et les confondre ferait
   * disparaître celui qui tient sans tarif.
   */
  it("les deux mesures se lisent côte à côte quand les deux existent", () => {
    const releves = depassements(
      candidatsAuDepassement([
        {
          dossierId: "a",
          appels: 3,
          jetonsEntree: 800_000,
          jetonsSortie: 400_000,
          coutMicros: 9_000_000,
          pack: "essentiel",
          partDuPrix: 0.75,
          partDuQuota: partDuQuotaIA(1_200_000, 120_000),
        },
      ]),
    );
    expect(releves.map((d) => d.nature)).toEqual(["quota", "marge"]);
  });

  /** Sans pack payé, il n'y a pas de quota : rien à dépasser. */
  it("un dossier sans pack n'a ni marge ni quota", () => {
    expect(partDuQuotaIA(500_000, null)).toBeNull();
    expect(
      candidatsAuDepassement([
        {
          dossierId: "a",
          appels: 1,
          jetonsEntree: 500_000,
          jetonsSortie: 0,
          coutMicros: null,
          pack: null,
          partDuPrix: null,
          partDuQuota: null,
        },
      ]),
    ).toEqual([]);
  });

  /** Un quota nul ou négatif ne se divise pas : la grille serait fautive. */
  it("un quota nul ne produit pas d'infini", () => {
    expect(partDuQuotaIA(500_000, 0)).toBeNull();
    expect(partDuQuotaIA(500_000, -1)).toBeNull();
  });

  // ── L'agrégat, sorti de la page ──────────────────────────────────────

  /**
   * Il vivait dans la page, en `reduce` empilés, et aucun test ne
   * l'atteignait : remplacer la somme prudente par un `?? 0` ne faisait
   * rien échouer. Un calcul qu'aucun test ne peut appeler est un calcul
   * que rien ne tient.
   */
  const LIGNES = [
    {
      dossierId: "a",
      appels: 3,
      jetonsEntree: 4000,
      jetonsSortie: 500,
      coutMicros: 900_000,
      pack: "DOSSIER",
      partDuPrix: 0.22,
      // Loin sous le quota : ces lignes éprouvent la marge, pas les jetons.
      partDuQuota: 0.01,
    },
    {
      dossierId: "b",
      appels: 1,
      jetonsEntree: 1000,
      jetonsSortie: 100,
      coutMicros: 200_000,
      pack: "ESSENTIEL",
      partDuPrix: 0.03,
      partDuQuota: 0.01,
    },
  ];

  it("agrège jetons, appels et coûts d'un seul endroit", () => {
    expect(mesureDepuisLesLignes(LIGNES, "XOF")).toEqual({
      dossiers: 2,
      jetons: 5600,
      appels: 4,
      coutMicros: 1_100_000,
      pirePart: 0.22,
      devise: "XOF",
    });
  });

  it("refuse de totaliser dès qu'une ligne n'est pas tarifée", () => {
    const partiel = [LIGNES[0]!, { ...LIGNES[1]!, coutMicros: null }];
    const mesure = mesureDepuisLesLignes(partiel, "XOF");
    // Un total partiel présenté comme un total est une erreur comptable, et
    // elle se propage — c'est la règle déjà tenue en B-06 pendant un incident.
    expect(mesure.coutMicros).toBeNull();
    expect(mesure.jetons).toBe(5600);
  });

  it("ne retient comme dépassables que les dossiers dont une part est connue", () => {
    const candidats = candidatsAuDepassement([
      ...LIGNES,
      // Sans tarif, la marge est inconnue — mais le quota, lui, se lit.
      { ...LIGNES[0]!, dossierId: "c", partDuPrix: null },
      // Sans pack, il n'y a aucune référence : ni marge, ni quota.
      { ...LIGNES[0]!, dossierId: "d", pack: null, partDuQuota: null },
    ]);
    expect([...new Set(candidats.map((c) => c.dossierId))]).toEqual(["a", "b", "c"]);
    expect(depassements(candidats).map((c) => c.dossierId)).toEqual(["a"]);
  });

  // ── Les commandes retirées ───────────────────────────────────────────

  it("nomme ce qui manque à chaque commande retirée", () => {
    expect(COMMANDES_ATTENDUES).toHaveLength(2);
    for (const c of COMMANDES_ATTENDUES) {
      expect(c.manque.length, c.cle).toBeGreaterThan(20);
      expect(c.libelle.length, c.cle).toBeGreaterThan(5);
    }
    expect(COMMANDES_ATTENDUES.map((c) => c.cle)).toContain("modifier-plafonds");
  });
});

describe("le motif de pourcentage cite le nombre entier", () => {
  it("rend « 95 % » et non « 5 % » dans l'extrait", () => {
    // Un message de refus qui cite le mauvais chiffre fait chercher l'erreur
    // au mauvais endroit — le défaut que ce message existe pour éviter.
    const faute = verifierTextesCandidat({
      libelleCandidat: "95 % de réussite sur cette procédure.",
      reserveCandidat: "Réserve neutre.",
    })[0]!;
    expect(faute.extrait).toBe("95 %");
    expect(messageDeRefus(faute)).toContain("« 95 % »");
  });

  it("reconnaît toujours les mêmes textes qu'avant", () => {
    for (const texte of ["3 %", "100%", "taux de 7 % constaté"]) {
      expect(
        verifierTextesCandidat({ libelleCandidat: texte, reserveCandidat: "." }).length,
        texte,
      ).toBeGreaterThan(0);
    }
  });
});
