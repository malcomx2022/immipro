import { describe, expect, it } from "vitest";
import {
  AUCUNE_PIECE,
  MENTION_DOSSIER_FIGE,
  MENTION_VERSION_EN_RELECTURE,
  MENTION_VERSION_REMPLACEE,
  ceQuiSepare,
  confirmationDArbitrage,
  ecartMontant,
  libelleDelaiVersion,
  libelleImpact,
  lignesDesPieces,
  optionsArbitrage,
  resumeDesPieces,
  type VersionRegle,
} from "@/domain/notifications/divergence";
import type { EvolutionDesPieces } from "@/domain/rules/comparaison";
import { formatMontant } from "@/lib/utils";

/**
 * Ce qu'un arbitrage doit montrer — T-02, correctif du 22/09/2026.
 *
 * L'écran supposait que ce qui sépare deux versions est le **montant**.
 * C'était vrai des cas qu'il avait vus. Depuis que la comparaison voit
 * aussi le délai d'instruction (RG-09.3), une version peut n'en changer
 * que le délai — et l'écran posait alors deux cartes portant la même
 * somme. Exécuté avant correction :
 *
 *     ce que ça change : « … c'est la version 2 qui s'appliquera,
 *                          et il te faut 0 € de plus. »
 *     option : « Ta checklist et tes montants passent à 11 500 €. »
 *     option : « Ta checklist reste à 11 500 €. »
 *     le mot « délai » apparaît-il ? false
 *
 * On demandait de trancher entre deux options présentées comme la même.
 */

const V1: VersionRegle = {
  numero: 1,
  montant: { valeur: 11500, devise: "EUR" },
  intitule: "sur compte bloqué",
  publieeLe: "2026-01-01",
  applicableJusquau: "2026-08-31",
  delai: { min: 60, max: 90 },
};

const V2: VersionRegle = {
  ...V1,
  numero: 2,
  montant: { valeur: 13000, devise: "EUR" },
  publieeLe: "2026-06-01",
  applicableDepuis: "2026-09-01",
  delai: { min: 60, max: 150 },
};

const sansLeMontant = { ...V2, montant: V1.montant };
const sansLeDelai = { ...V2, delai: V1.delai };

/**
 * Le même calcul que l'écran, et non une mise en forme réécrite ici.
 *
 * Le montage composait `${ecartMontant(a, b)} €` : il ne passait donc pas
 * par `formatMontant`, ne voyait pas la devise, et prenait le signe tel
 * quel. C'est ce qui a rendu « il te faut -3 000 € de plus » invisible
 * pendant que cet essai restait vert. La valeur absolue et la devise
 * réelle sont ce que `DivergenceReglementaire` passe.
 */
const ecartFormate = (a: VersionRegle, b: VersionRegle): string | null => {
  const ecart = ecartMontant(a, b);
  return ecart === null ? null : formatMontant(Math.abs(ecart.valeur), ecart.devise);
};

const impact = (a: VersionRegle, b: VersionRegle, depot?: string) =>
  libelleImpact(a, b, ecartFormate(a, b), depot);

/** `Intl` sépare les milliers par une espace fine insécable. */
const normalise = (s: string) => s.replace(/\s/gu, " ");

describe("ce qui sépare deux versions", () => {
  it("le montant seul, le délai seul, ou les deux", () => {
    // Les pièces se passent à part : elles ne se lisent pas sur une
    // `VersionRegle`, qui porte le montant et le délai et rien d'autre.
    const sansPiece = { pieces: false };
    expect(ceQuiSepare(V1, V2)).toEqual({ montant: true, delai: true, ...sansPiece });
    expect(ceQuiSepare(V1, sansLeMontant)).toEqual({ montant: false, delai: true, ...sansPiece });
    expect(ceQuiSepare(V1, sansLeDelai)).toEqual({ montant: true, delai: false, ...sansPiece });
    expect(ceQuiSepare(V1, { ...V1, numero: 9 })).toEqual({
      montant: false,
      delai: false,
      ...sansPiece,
    });
  });

  /** Changer de devise change le montant exigé, même à valeur égale. */
  it("un changement de devise est un changement de montant", () => {
    expect(ceQuiSepare(V1, { ...V1, montant: { valeur: 11500, devise: "CHF" } }).montant).toBe(true);
  });

  /** Une version sans délai renseigné n'est pas une version sans délai. */
  it("l'absence de délai se distingue du délai absent", () => {
    expect(libelleDelaiVersion(V1)).toBe("Instruction : 60–90 jours");
    expect(libelleDelaiVersion({ ...V1, delai: null })).toContain("Aucun délai");
    expect(libelleDelaiVersion({ ...V1, delai: undefined })).toContain("non renseigné");
  });
});

describe("« ce que ça change pour ton dossier »", () => {
  const DEPOT_SOUS_LA_NOUVELLE = "2026-10-15";

  it("ne donne plus un chiffre pour ne rien dire", () => {
    const texte = impact(V1, sansLeMontant, DEPOT_SOUS_LA_NOUVELLE);
    expect(texte).not.toContain("0 € de plus");
    expect(texte).not.toContain("de plus");
  });

  it("et nomme le délai, qui est ce qui a bougé", () => {
    const texte = impact(V1, sansLeMontant, DEPOT_SOUS_LA_NOUVELLE);
    expect(texte).toContain("60–150 jours");
    expect(texte).toContain("ton échéancier se recalcule");
  });

  /** Le montant reste dit quand il bouge : rien n'est retiré. */
  it("le montant supplémentaire est toujours annoncé quand il change", () => {
    expect(normalise(impact(V1, V2, DEPOT_SOUS_LA_NOUVELLE))).toContain("1 500 € de plus");
  });

  it("et le délai n'est pas cité quand il n'a pas bougé", () => {
    expect(impact(V1, sansLeDelai, DEPOT_SOUS_LA_NOUVELLE)).not.toContain("jours");
  });

  /**
   * Ce que le correctif ne touche pas : un dépôt antérieur à l'entrée en
   * vigueur reste régi par l'ancienne version, et la phrase le dit sans
   * parler ni du montant ni du délai de la nouvelle.
   */
  it("un dépôt avant l'entrée en vigueur reste sous l'ancienne version", () => {
    const texte = impact(V1, V2, "2026-08-01");
    expect(texte).toContain("avant l'entrée en vigueur");
    expect(texte).toContain("la version 1 reste celle de ton dossier");
    expect(texte).not.toContain("de plus");
  });

  /** Sans date de dépôt, la phrase reste conditionnelle — et complète. */
  it("sans dépôt fixé, elle conditionne sans rien taire", () => {
    const texte = impact(V1, sansLeMontant);
    expect(texte).toContain("Si tu déposes");
    expect(texte).toContain("60–150 jours");
  });
});

describe("les deux options d'arbitrage", () => {
  const options = (nouvelle: VersionRegle) =>
    optionsArbitrage(V1, nouvelle, "11 500 €", "13 000 €").map((o) => o.detail);

  /**
   * Deux options identiques ne sont pas un arbitrage. C'est exactement ce
   * que l'écran offrait quand seul le délai changeait.
   */
  it("ne se lisent jamais à l'identique", () => {
    const [migrer, conserver] = options(sansLeMontant);
    expect(migrer).not.toBe(conserver);
    expect(migrer).toContain("60–150 jours");
    expect(conserver).toContain("60–90 jours");
  });

  it("ne citent pas un montant que le choix ne change pas", () => {
    for (const detail of options(sansLeMontant)) {
      expect(detail).not.toContain("€");
    }
  });

  it("citent le montant quand c'est lui qui bouge", () => {
    const [migrer, conserver] = options(sansLeDelai);
    expect(migrer).toContain("13 000 € à prouver");
    expect(conserver).toContain("11 500 € à prouver");
    expect(migrer).not.toContain("jours");
  });

  it("citent les deux quand les deux bougent", () => {
    const [migrer] = options(V2);
    expect(migrer).toContain("13 000 € à prouver");
    expect(migrer).toContain("60–150 jours");
  });

  /** Les bornes d'application restent dites : elles décident du choix. */
  it("gardent ce qui rend chaque choix défendable", () => {
    const [migrer, conserver] = options(V2);
    expect(migrer).toContain("si tu déposes à partir du");
    expect(conserver).toContain("si tu déposes avant le");
  });
});


/**
 * Ce que l'arbitrage montre des **pièces** — correctif du 23/09/2026.
 *
 * L'écart laissé ouvert par S.52. L'écran disait « ta checklist passe à la
 * version 5 » : il nommait la checklist sans nommer une seule de ses
 * lignes. Exécuté avant correction, sur une version qui exige une pièce de
 * plus :
 *
 *     le mot « pièce » apparaît-il ?      false
 *     une checklist est-elle nommée ?    false
 *     option : « Ta checklist passe à la version 5, avec 11 904 € à prouver. »
 *
 * Le candidat tranchait sans savoir ce qu'il devrait fournir, et le
 * découvrait sur sa checklist après coup.
 */
const PIECES: EvolutionDesPieces = {
  ajoutees: [{ code: "assurance_maladie", libelle: "Assurance maladie" }],
  retirees: [
    { code: "casier_judiciaire", libelle: "Casier judiciaire", encoreDemandee: true },
    { code: "lettre_motivation", libelle: "Lettre de motivation", encoreDemandee: false },
  ],
  validites: [],
};

describe("ce que la checklist gagne et perd", () => {
  it("chaque pièce est nommée par son libellé, jamais par son code", () => {
    const lignes = lignesDesPieces(PIECES);
    expect(lignes).toHaveLength(3);
    for (const ligne of lignes) {
      expect(ligne.texte).not.toMatch(/_/u);
    }
    expect(lignes[0]!.texte).toContain("Assurance maladie");
  });

  it("une pièce ajoutée dit qu'elle est à fournir en plus", () => {
    expect(lignesDesPieces(PIECES)[0]!.texte).toContain("à fournir en plus");
  });

  /**
   * Une pièce sort de deux façons, et le mot n'est pas le même. Les
   * confondre ferait jeter un document qu'on pouvait encore joindre.
   */
  it("devenue complémentaire, elle reste joignable — disparue, non", () => {
    const [, complementaire, disparue] = lignesDesPieces(PIECES);
    expect(complementaire!.texte).toContain("n'est plus obligatoire");
    expect(complementaire!.texte).toContain("tu peux toujours la joindre");
    expect(disparue!.texte).toContain("n'est plus demandée");
    expect(disparue!.texte).not.toContain("joindre");
  });

  it("aucune pièce touchée : rien à montrer", () => {
    expect(lignesDesPieces(AUCUNE_PIECE)).toEqual([]);
    expect(resumeDesPieces(AUCUNE_PIECE)).toBeNull();
    expect(ceQuiSepare(V1, V1, AUCUNE_PIECE).pieces).toBe(false);
  });

  it("une seule pièce touchée suffit à séparer les deux versions", () => {
    expect(ceQuiSepare(V1, V1, PIECES).pieces).toBe(true);
  });

  /** Le résumé ne répète pas « pièces » : la phrase composée les enchaîne. */
  it("le résumé se lit d'une traite", () => {
    expect(resumeDesPieces(PIECES)).toBe("1 pièce de plus à fournir, 2 de moins à réunir");
    expect(resumeDesPieces({ ajoutees: PIECES.ajoutees, retirees: [], validites: [] })).toBe(
      "1 pièce de plus à fournir",
    );
    expect(resumeDesPieces({ ajoutees: [], retirees: PIECES.retirees, validites: [] })).toBe(
      "2 pièces de moins à réunir",
    );
  });
});

describe("les options d'arbitrage citent les pièces", () => {
  const options = (pieces: EvolutionDesPieces) =>
    optionsArbitrage(V1, sansLeDelai, "11 500 €", "13 000 €", pieces).map((o) => o.detail);

  it("migrer dit ce que la checklist gagne et perd", () => {
    expect(options(PIECES)[0]).toContain("1 pièce de plus à fournir, 2 de moins à réunir");
  });

  /**
   * Conserver ne change rien à la checklist : reprendre le même décompte
   * des deux côtés présenterait le choix comme identique. C'est le défaut
   * corrigé pour le montant, et il vaut ici mot pour mot.
   */
  it("conserver n'en cite aucune : ce choix ne change pas la checklist", () => {
    expect(options(PIECES)[1]).not.toContain("pièce");
  });

  /** Trois changements à la fois se lisent encore : « A, B et C ». */
  it("montant, délai et pièces s'énumèrent sans bégayer", () => {
    const [migrer] = optionsArbitrage(V1, V2, "11 500 €", "13 000 €", PIECES).map(
      (o) => o.detail,
    );
    expect(migrer).not.toMatch(/ et .* et /u);
    expect(migrer).toContain("13 000 € à prouver");
    expect(migrer).toContain("60–150 jours");
    expect(migrer).toContain("1 pièce de plus");
  });
});


/**
 * Migrer vers une version que la plateforme a retirée — RG-14.1,
 * correctif du 23/09/2026.
 *
 * « Une fiche dont `nextReviewAt` est dépassée repasse automatiquement en
 * DRAFT et disparaît de l'affichage utilisateur. Une donnée non relue ne
 * peut pas continuer à se présenter comme fiable. »
 *
 * La veille dépubliait, et l'arbitrage proposait quand même. Exécuté avant
 * correction :
 *
 *     fiches dépubliées : 1
 *     v2 : relecture au 2027-01-01, statut DRAFT
 *     version proposée  : 2
 *     arbitrage : {"decision":"MIGRER",…}
 *     son dossier est désormais figé sur la v2, statut DRAFT
 *
 * `ouvrirDossier` refuse pourtant d'ouvrir un dossier sur cette règle : la
 * plateforme refusait d'y commencer et acceptait d'y aller.
 */
describe("une version retirée ne se propose plus", () => {
  const options = (blocage: "AUCUN" | "REMPLACEE" | "EN_RELECTURE" | "DOSSIER_FIGE") =>
    optionsArbitrage(V1, V2, "11 500 €", "13 000 €", AUCUNE_PIECE, blocage);

  it("l'option « migrer » devient indisponible", () => {
    expect(options("EN_RELECTURE")[0]!.desactivee).toBe(true);
    expect(options("REMPLACEE")[0]!.desactivee).toBe(true);
    expect(options("AUCUN")[0]!.desactivee).toBeUndefined();
  });

  /**
   * Les deux causes ne se disent pas de la même façon, et un premier
   * correctif les confondait : une version **remplacée** ne reviendra
   * jamais en vigueur, une version **en relecture** reviendra. Annoncer
   * une vérification sur une version remplacée fait attendre pour rien.
   */
  it("et la raison dit laquelle des deux causes c'est", () => {
    expect(options("EN_RELECTURE")[0]!.detail).toBe(MENTION_VERSION_EN_RELECTURE);
    expect(options("REMPLACEE")[0]!.detail).toBe(MENTION_VERSION_REMPLACEE);
  });

  /*
    RF-1, FON-04, choix A-3 du 09/10/2026. Sur un dossier déposé ou
    clôturé, migrer le rouvrirait : l'option est indisponible et le dit,
    et « conserver » reste ouvert, à titre historique.
  */
  it("un dossier déposé ou clôturé ne migre pas, et peut conserver", () => {
    const [migrer, conserver] = options("DOSSIER_FIGE");
    expect(migrer!.desactivee).toBe(true);
    expect(migrer!.detail).toBe(MENTION_DOSSIER_FIGE);
    expect(conserver!.desactivee).toBeUndefined();
    expect(MENTION_DOSSIER_FIGE).toContain("Tu peux enregistrer que tu conserves ta version");
  });

  it("une version remplacée ne promet pas de revenir", () => {
    expect(MENTION_VERSION_REMPLACEE).not.toContain("revérifi");
    expect(MENTION_VERSION_REMPLACEE).toContain("plus récente");
    expect(MENTION_VERSION_REMPLACEE).toContain("C'est elle qui te sera proposée");
  });

  /**
   * Elle reste **affichée**. La retirer ferait chercher ce qu'on a mal
   * fait, là où il n'y a rien à corriger de son côté.
   */
  it("mais elle reste affichée, avec sa raison", () => {
    const [migrer] = options("EN_RELECTURE");
    expect(migrer!.titre).toContain("Migrer vers la version 2");
    expect(migrer!.detail).toBe(MENTION_VERSION_EN_RELECTURE);
  });

  /** Le motif dit qui est en retard, et que rien n'est perdu. */
  it("la raison ne met pas la faute sur le candidat", () => {
    expect(MENTION_VERSION_EN_RELECTURE).toContain("nos veilleurs");
    expect(MENTION_VERSION_EN_RELECTURE).toContain("de nouveau une fois vérifiée");
  });

  /**
   * « Conserver » reste ouvert, toujours : c'est le choix sûr, et il met
   * fin à la pause. Fermer les deux laisserait le dossier suspendu pour
   * une relecture que le candidat ne peut pas faire avancer.
   */
  it("conserver reste disponible", () => {
    for (const blocage of ["REMPLACEE", "EN_RELECTURE"] as const) {
      expect(options(blocage)[1]!.desactivee).toBeUndefined();
      expect(options(blocage)[1]!.detail).toContain("Ta checklist reste");
    }
  });
});

/**
 * T-02 — la confirmation rend au passé ce que l'écran promettait au futur.
 *
 * ── Le défaut, tel qu'il s'est présenté ─────────────────────────────
 *
 * Avant le clic, l'écran disait « Ta checklist Pays-Bas sera mise à
 * jour ». Après, la feuille se fermait et la page se rafraîchissait. Le
 * serveur rendait pourtant la liste des pièces ajoutées et libérées, et
 * l'écran la jetait :
 *
 *     appeler(…) → { ok: true, donnees: { piecesAjoutees: […],
 *                                          piecesLiberees: […] } }
 *     l'écran     : onFermer(); router.refresh();
 *     le candidat : rien
 *
 * Trois lots ont enrichi cette réponse sans que rien ne la regarde. Une
 * donnée que personne ne lit est une donnée dont on ne sait pas si elle
 * est juste.
 */
describe("la confirmation d'arbitrage", () => {
  const MENTION_MIGREE = "Aucune pièce déjà validée n'a été retirée.";
  const MENTION_CONSERVEE =
    "Ton dossier reste régi par la version que tu as figée à son ouverture.";

  it("nomme ce qu'il faut fournir en plus, avant tout le reste", () => {
    const { titre, lignes } = confirmationDArbitrage(
      "MIGRER",
      "Pays-Bas",
      MENTION_MIGREE,
      ["Diplôme le plus élevé, légalisé", "Assurance maladie"],
      [],
    );

    expect(titre).toBe("Ta checklist Pays-Bas suit la nouvelle version.");
    expect(lignes[0]).toBe(
      "À fournir en plus : Diplôme le plus élevé, légalisé et Assurance maladie.",
    );
  });

  it("dit d'une pièce libérée que sa ligne et son dépôt restent", () => {
    const { lignes } = confirmationDArbitrage("MIGRER", "Suisse", MENTION_MIGREE, [], [
      "Casier judiciaire",
    ]);

    // « N'est plus demandée » seul se lit comme « jette-la ».
    expect(lignes[0]).toBe(
      "Plus demandé : Casier judiciaire. La ligne reste dans ta checklist, et ce que tu as déjà déposé est conservé.",
    );
  });

  it("place le geste à faire avant ce qui est libéré", () => {
    const { lignes } = confirmationDArbitrage(
      "MIGRER",
      "Suisse",
      MENTION_MIGREE,
      ["Contrat de travail"],
      ["Casier judiciaire"],
    );

    expect(lignes[0]).toContain("À fournir en plus");
    expect(lignes[1]).toContain("Plus demandé");
    expect(lignes.at(-1)).toBe(MENTION_MIGREE);
  });

  it("ne nomme aucune liste quand la migration n'en change aucune", () => {
    expect(confirmationDArbitrage("MIGRER", "Pays-Bas", MENTION_MIGREE).lignes).toEqual([
      MENTION_MIGREE,
    ]);
  });

  it("reprend la phrase du serveur, elle ne la réécrit pas", () => {
    const { titre, lignes } = confirmationDArbitrage("CONSERVER", "Pays-Bas", MENTION_CONSERVEE);

    expect(titre).toBe("Ta checklist Pays-Bas reste en version antérieure.");
    expect(lignes).toEqual([MENTION_CONSERVEE]);
  });

  it("parle au passé, jamais au futur : le geste a eu lieu", () => {
    const rendus = [
      confirmationDArbitrage("MIGRER", "Pays-Bas", MENTION_MIGREE, ["Diplôme"], ["Casier"]),
      confirmationDArbitrage("CONSERVER", "Pays-Bas", MENTION_CONSERVEE),
    ];

    for (const { titre, lignes } of rendus) {
      for (const texte of [titre, ...lignes]) {
        expect(texte).not.toContain("sera ");
        expect(texte).not.toContain("restera ");
      }
    }
  });
});

/**
 * Le montant qu'aucune autorité ne publie, et celui qui baisse — 24/09/2026.
 *
 * Quatre phrases fausses tenaient au même défaut : un montant absent était
 * écrit `0` avec une devise vide, et le signe de l'écart n'était pas
 * relu. Constaté en exécution avant correction :
 *
 *     carte v1 : « 21 000 € » / « à prouver, pour l'année »
 *     carte v2 : « 0 € »      / « aucune ressource à prouver »
 *     « Ce que ça change » : … et il te faut -21 000 € de plus.
 *     option MIGRER : … avec 0 € à prouver.
 *
 * et, sur deux versions entièrement publiées dans la même monnaie :
 *
 *     24 000 € → 21 000 € : … et il te faut -3 000 € de plus.
 */
describe("un montant que l'autorité ne publie pas n'est pas un montant nul", () => {
  const publie = (numero: number, valeur: number, devise = "EUR"): VersionRegle => ({
    numero,
    montant: { valeur, devise },
    intitule: "à prouver, pour l'année",
    publieeLe: "2026-01-01",
    applicableDepuis: "2026-02-01",
  });
  const muette = (numero: number): VersionRegle => ({
    numero,
    montant: null,
    intitule: "aucune ressource à prouver",
    publieeLe: "2026-01-01",
    applicableDepuis: "2026-02-01",
  });
  const DEPOT = "2026-03-01";

  it("l'écart n'est pas chiffrable quand l'une des deux ne publie rien", () => {
    expect(ecartMontant(publie(1, 21000), muette(2))).toBeNull();
    expect(ecartMontant(muette(1), publie(2, 21000))).toBeNull();
    expect(ecartMontant(muette(1), muette(2))).toBeNull();
  });

  /** Ni quand les monnaies diffèrent : la soustraction ne dirait rien. */
  it("ni quand les monnaies diffèrent", () => {
    expect(ecartMontant(publie(1, 21000, "CHF"), publie(2, 21000, "EUR"))).toBeNull();
  });

  it("mais la différence reste un écart, et la phrase le dit sans chiffre", () => {
    expect(ceQuiSepare(publie(1, 21000), muette(2)).montant).toBe(true);
    const texte = impact(publie(1, 21000), muette(2), DEPOT);
    expect(texte).toContain("ce qu'elle demande à prouver n'est pas le même");
    expect(texte).not.toContain("de plus");
    expect(texte).not.toContain("0 €");
    expect(texte).not.toContain("-");
  });

  /** Deux absences ne sont pas un écart : il n'y a rien à annoncer. */
  it("deux versions muettes ne séparent rien sur le montant", () => {
    expect(ceQuiSepare(muette(1), muette(2)).montant).toBe(false);
    expect(impact(muette(1), muette(2), DEPOT)).not.toContain("prouver");
  });

  /**
   * Le cas qui ne tient à aucune absence : l'autorité **abaisse** son
   * exigence, et « de plus » devenait « -3 000 € de plus ».
   */
  it("une exigence abaissée se dit « de moins », jamais « -X de plus »", () => {
    const texte = normalise(impact(publie(1, 24000), publie(2, 21000), DEPOT));
    expect(texte).toContain("3 000 € de moins");
    expect(texte).not.toContain("de plus");
    expect(texte).not.toContain("-3 000");
  });

  /** Et l'option d'arbitrage nomme l'absence plutôt que de chiffrer zéro. */
  it("l'option de migration n'annonce pas « 0 € à prouver »", () => {
    const ancienne = publie(1, 21000);
    const nouvelle = muette(2);
    const options = optionsArbitrage(
      ancienne,
      nouvelle,
      formatMontant(ancienne.montant!.valeur, ancienne.montant!.devise),
      null,
    );
    const migrer = options.find((o) => o.cle === "MIGRER")!;
    expect(migrer.detail).toContain("des ressources à prouver que l'autorité ne publie pas");
    expect(migrer.detail).not.toContain("0 €");
  });
});
