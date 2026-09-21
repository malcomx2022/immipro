import { describe, expect, it } from "vitest";
import {
  CHAMPS_CANDIDAT,
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
  GARDE_FOUS,
  METRIQUES,
  aucuneMesure,
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
    expect(actionsPour(nonVerifie).map((a) => a.cle)).toEqual(["suspendre"]);
    // Une suppression demandée suit son cours : la suspendre en plus ne
    // ferait que retarder une purge que le candidat a réclamée.
    const partant = COMPTES.find((c) => c.statut === "SUPPRESSION_DEMANDEE")!;
    expect(actionsPour(partant)).toEqual([]);
  });

  it("un compte suspendu n'a qu'une issue : le rétablir", () => {
    const suspendu = { ...COMPTES[0]!, statut: "SUSPENDU" as const };
    expect(actionsPour(suspendu).map((a) => a.cle)).toEqual(["retablir"]);
  });

  /**
   * Les trois actions retirées de l'écran sont nommées, avec ce qui
   * manque à chacune. Les retirer sans les nommer ferait disparaître le
   * besoin avec le bouton.
   */
  it("ce qui manque est nommé, pas oublié", () => {
    expect(ACTIONS_ATTENDUES.map((a) => a.cle).sort()).toEqual([
      "recrediter",
      "renvoyer-verification",
      "suppression",
    ]);
    for (const a of ACTIONS_ATTENDUES) {
      expect(a.manque.length, a.cle).toBeGreaterThan(15);
    }
    // Le recrédit n'est pas qu'une route manquante : c'est une décision
    // commerciale, et elle ne s'invente pas depuis un écran.
    const recredit = ACTIONS_ATTENDUES.find((a) => a.cle === "recrediter")!;
    expect(recredit.manque).toMatch(/commerciale/u);
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
