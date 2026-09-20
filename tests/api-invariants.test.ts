import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { filtrePourCandidat } from "@/server/acces/regles";
import { evaluerConditions, moisEntre } from "@/domain/dossiers/verification";
import {
  classer,
  POIDS,
  COMPOSANTES_ABSENTES,
  COMPOSANTES_PESEES,
  perimetreDuClassement,
} from "@/domain/simulateur/classement";
import { versXOF, convertible } from "@/domain/format/change";
import { verdictDeConnexion, aBloquer, libelleEchec, ESSAIS_AVANT_BLOCAGE } from "@/domain/comptes/connexion";
import { comparer } from "@/server/jobs/divergence";
import { sansCommentaires } from "@/domain/copy/source";
import { refusDuFichier } from "@/domain/dossiers/televersement";
import { dateAuPlusTot } from "@/domain/dossiers/echeancier";
import { z } from "zod";
// L'import installe la table de messages française, comme pour une route.
import "@/server/http/messages-zod";

/**
 * Invariants tenus par la couche serveur.
 *
 * Ce fichier lit aussi les routes **comme un texte**, sans les exécuter :
 * c'est le même garde-fou de dérive que `schema-domaine`, appliqué à
 * l'API. Une route ajoutée sans passer par le composeur, ou une dispense de
 * limitation prise sans signature, échoue ici plutôt qu'en production.
 */

function fichiersDeRoute(dir = "src/app/api", acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) fichiersDeRoute(chemin, acc);
    else if (nom === "route.ts") acc.push(chemin);
  }
  return acc;
}

const ROUTES = fichiersDeRoute();
const lire = (f: string) => readFileSync(f, "utf8");

describe("toutes les routes passent par le composeur", () => {
  it("il y a des routes à vérifier", () => {
    expect(ROUTES.length).toBeGreaterThan(20);
  });

  it.each(ROUTES.filter((f) => f !== "src/app/api/health/route.ts"))(
    "%s déclare son accès et son régime de débit",
    (fichier) => {
      const source = lire(fichier);
      expect(source).toMatch(/route\(\{/u);
      expect(source).toMatch(/acces:\s*"(public|candidat|candidat_verifie|veilleur|admin)"/u);
      expect(source).toMatch(/limite:\s*"(lecture|sensible|attente|webhook)"/u);
      // Un gestionnaire écrit à la main contournerait tout le socle.
      expect(source).not.toMatch(/export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/u);
    },
  );
});

describe("règle d'architecture 5 — webhooks", () => {
  const webhooks = ROUTES.filter((f) => lire(f).includes('limite: "webhook"'));

  it("les seules routes exemptées de limitation sont les webhooks", () => {
    expect(webhooks.map((f) => f.replace(/\\/gu, "/")).sort()).toEqual([
      "src/app/api/webhooks/fedapay/route.ts",
      "src/app/api/webhooks/stripe/route.ts",
    ]);
  });

  it.each(webhooks)("%s vérifie une signature", (fichier) => {
    expect(lire(fichier)).toMatch(/signature:\s*signature/u);
  });

  it("aucune route hors webhooks/ ne prend la dispense", () => {
    const hors = webhooks.filter((f) => !f.replace(/\\/gu, "/").includes("/api/webhooks/"));
    expect(hors).toEqual([]);
  });
});

describe("arbitrage C-09 et INV-6 — ce qui ne franchit pas la frontière", () => {
  const INTERDITS_EN_ROUTE = ["internalScore", "tokensIA", ".interne"];

  // Les commentaires sont retirés : c'est ce que le code **fait** qui est
  // vérifié, pas ce qu'il dit. Sans cela, le commentaire qui explique
  // pourquoi le barème ne sort pas déclenche lui-même l'alerte.
  const code = (f: string) => sansCommentaires(lire(f));

  it.each(ROUTES.filter((f) => !f.includes("admin")))(
    "%s ne sérialise ni barème interne ni quota de jetons",
    (fichier) => {
      for (const interdit of INTERDITS_EN_ROUTE) {
        expect(code(fichier)).not.toContain(interdit);
      }
    },
  );

  it("la vue candidat d'un dossier n'a pas de champ où loger un barème", () => {
    expect(code("src/server/vue/dossier.ts")).not.toContain("internalScore");
  });

  it("l'extracteur de code retire bien les commentaires sans perdre le code", () => {
    const echantillon = 'const a = 1; // internalScore\nconst b = "internalScore";';
    expect(sansCommentaires(echantillon)).not.toContain("// internalScore");
    expect(sansCommentaires(echantillon)).toContain('"internalScore"');
  });
});

describe("INV-4 — le filtrage est dans la requête", () => {
  const filtre = filtrePourCandidat(new Date("2026-09-19T12:00:00Z"));

  it("exclut la source secondaire", () => {
    expect(filtre.sourceTier).toEqual({ not: "SECONDAIRE" });
  });

  it("ne retient que les règles publiées", () => {
    expect(filtre.status).toBe("PUBLISHED");
  });

  it("écarte une fiche dont la relecture est dépassée — RG-14.1", () => {
    expect(filtre.nextReviewAt).toEqual({ gte: new Date("2026-09-19T00:00:00Z") });
  });

  it("écarte une version qui n'est plus en vigueur", () => {
    expect(filtre.effectiveFrom).toEqual({ lte: new Date("2026-09-19T00:00:00Z") });
    expect(filtre.OR).toEqual([
      { effectiveTo: null },
      { effectiveTo: { gte: new Date("2026-09-19T00:00:00Z") } },
    ]);
  });

  it("seul le module d'accès et le back-office interrogent le référentiel", () => {
    const fautives = ROUTES.filter(
      (f) => lire(f).includes("visaRule.find") && !f.includes("admin"),
    );
    expect(fautives).toEqual([]);
  });
});

describe("RG-06.1 et RG-06.3 — vérifications déterministes", () => {
  const passeport = [
    {
      code: "passeport_validite_min",
      operateur: "gte" as const,
      valeur: 6,
      unite: "mois",
      message_echec: "Fais renouveler ton passeport avant de déposer.",
      bloquant: true,
    },
  ];

  it("le message dit la mesure, l'exigence, puis le geste", () => {
    const verdict = evaluerConditions(passeport, { passeport_validite_min: 4 });
    expect(verdict.verdict).toBe("A_CORRIGER");
    expect(verdict.corps).toContain("4 mois constaté");
    expect(verdict.corps).toContain("6 mois exigé");
    expect(verdict.corps).toContain("Fais renouveler ton passeport");
  });

  it("jamais « non conforme » seul", () => {
    const verdict = evaluerConditions(passeport, { passeport_validite_min: 4 });
    expect(verdict.corps).not.toMatch(/^document non conforme/iu);
    expect(verdict.corps.length).toBeGreaterThan(40);
  });

  it("une pièce qui passe est conforme", () => {
    expect(evaluerConditions(passeport, { passeport_validite_min: 8 }).verdict).toBe("CONFORME");
  });

  it("aucun champ lu : hors sujet, avec le reclassement en action", () => {
    const verdict = evaluerConditions(passeport, { passeport_validite_min: null });
    expect(verdict.verdict).toBe("HORS_SUJET");
    expect(verdict.corps).toContain("reclasse");
  });

  it("une valeur illisible n'est pas écrite en tiret", () => {
    const verdict = evaluerConditions(
      [{ ...passeport[0]!, operateur: "gte" as const }],
      { passeport_validite_min: 2, autre: 1 },
    );
    expect(verdict.corps).not.toContain("—");
  });

  it("le nombre de mois est la mesure de RG-06.3", () => {
    expect(moisEntre("2026-09-19", "2027-03-19")).toBe(6);
    expect(moisEntre("2026-09-19", "2027-01-18")).toBe(3);
  });
});

describe("WF-01 — classement des destinations", () => {
  const base = {
    code: "NL",
    slug: "pays-bas",
    pays: "Pays-Bas",
    categorie: "ETUDES" as const,
    niveauLangueMin: "B2",
    languesAcceptees: ["en"],
    coutPremiereAnneeXOF: 8_000_000,
    delaiTraitementJours: 90,
    permisEmployeurRequis: true,
    dispositifApresDiplome: "Zoekjaar",
    dureeApresDiplomeMois: 12,
  };

  it("le filtrage strict passe avant la pondération", () => {
    // Budget large, mais langue insuffisante : la destination sort, elle
    // n'est pas compensée.
    const resultat = classer([base], { objectif: "Étudier", langue: "B1 — intermédiaire", budget: "Plus de 12 millions F" });
    expect(resultat.retenues).toHaveLength(0);
    expect(resultat.ecartees[0]?.ecart).toContain("B2 exigé");
  });

  it("le motif d'exclusion est un fait chiffré, jamais un pronostic", () => {
    const resultat = classer([base], { objectif: "Étudier", langue: "B2 — avancé", budget: "Moins de 4 millions F" });
    expect(resultat.ecartees[0]?.motif).not.toMatch(/profil|chances|adapté/iu);
    expect(resultat.ecartees[0]?.ecart).toMatch(/\d/u);
  });

  it("aucune destination retenue ne renvoie tout de même les plus proches — RG-01.3", () => {
    const resultat = classer([base], { objectif: "Travailler" });
    expect(resultat.aucuneNePasse).toBe(true);
    expect(resultat.ecartees.length).toBeGreaterThan(0);
  });

  it("le permis employeur est dit au rang où la destination apparaît — RG-03.3", () => {
    const resultat = classer([base], { objectif: "Étudier", langue: "C1 et plus", budget: "Plus de 12 millions F" });
    expect(resultat.retenues[0]?.motifs.some((m) => m.texte.includes("permis"))).toBe(true);
  });

  it("le nombre pondéré reste interne", () => {
    const resultat = classer([base], { objectif: "Étudier", langue: "C1 et plus", budget: "Plus de 12 millions F" });
    const retenue = resultat.retenues[0]!;
    expect(retenue.interne.note).toBeGreaterThan(0);
    expect(JSON.stringify(retenue.motifs)).not.toContain(String(retenue.interne.note));
  });

  it("les composantes sans source sont déclarées absentes, pas inventées", () => {
    expect(COMPOSANTES_ABSENTES).toContain("qualité de vie");
    expect(COMPOSANTES_ABSENTES).toContain("coût de la vie");
    expect(Object.keys(POIDS)).toEqual(["langue", "budget", "facilite", "debouches"]);
  });

  /**
   * I.B, tranché le 20/09/2026 — un budget non comparable sort du
   * classement de sa destination, il n'y entre pas pour une valeur
   * moyenne.
   *
   * Avant, une destination dont le coût est publié en francs suisses
   * recevait la moitié des points de la composante budget sans les avoir
   * mérités — dix sur vingt — pendant qu'une destination au budget
   * réellement mesuré et défavorable en recevait moins. Le hasard de la
   * monnaie de publication décidait d'un rang.
   */
  it("un coût non converti retire le budget du classement, sans le remplacer", () => {
    const reponses = { objectif: "Étudier", langue: "C1 et plus", budget: "Plus de 12 millions F" };
    const comparable = classer([base], reponses).retenues[0]!;
    const incomparable = classer([{ ...base, coutPremiereAnneeXOF: null }], reponses).retenues[0]!;

    expect(comparable.interne.detail.budget).not.toBeNull();
    expect(comparable.nonPesees).toEqual([]);

    expect(incomparable.interne.detail.budget).toBeNull();
    expect(incomparable.nonPesees).toEqual(["le budget"]);
    // Les autres composantes valent la même chose : seule leur part change.
    expect(incomparable.interne.detail.langue).toBe(comparable.interne.detail.langue);
  });

  /**
   * La note est renormalisée sur ce qui reste, comme les quatre composantes
   * disponibles le sont sur les six de DOC-11 — la même opération, appliquée
   * destination par destination.
   */
  it("la note se calcule sur les seules composantes pesées", () => {
    const sansBudget = classer([{ ...base, coutPremiereAnneeXOF: null }], {
      objectif: "Étudier",
      langue: "C1 et plus",
    }).retenues[0]!;

    const { langue, facilite, debouches } = sansBudget.interne.detail;
    const attendue = Math.round(
      ((langue! + facilite! + debouches!) / (POIDS.langue + POIDS.facilite + POIDS.debouches)) * 100,
    );
    expect(sansBudget.interne.note).toBe(attendue);
  });

  /**
   * Un candidat qui n'a pas déclaré de budget n'a pas de budget à comparer
   * non plus. Deux causes, la même conséquence : la composante sort, elle
   * ne se remplit pas au jugé.
   */
  it("un budget non déclaré sort de la même façon", () => {
    const sansReponse = classer([base], { objectif: "Étudier", langue: "C1 et plus" }).retenues[0]!;
    expect(sansReponse.interne.detail.budget).toBeNull();
    expect(sansReponse.nonPesees).toEqual(["le budget"]);
  });

  /**
   * La conséquence assumée de la décision, écrite ici pour qu'elle ne
   * surprenne personne.
   *
   * Exclure une composante, ce n'est pas la mettre à zéro : une
   * destination dont le budget n'est pas évaluable est classée sur ses
   * autres critères, et peut donc passer devant une destination identique
   * dont le budget, lui, a été mesuré et trouvé médiocre. C'est ce que
   * « incomplet mais honnêtement qualifié » veut dire — et la réserve
   * affichée à côté du rang le dit au candidat.
   */
  it("une destination non évaluable sur le budget est classée sur le reste", () => {
    const mesuree = { ...base, coutPremiereAnneeXOF: 12_836_580 };
    const inevaluable = { ...mesuree, code: "CH", slug: "suisse", pays: "Suisse", coutPremiereAnneeXOF: null };

    const { retenues } = classer([mesuree, inevaluable], {
      objectif: "Étudier",
      langue: "C1 et plus",
      budget: "Plus de 12 millions F",
    });

    // Le budget des Pays-Bas est mesuré et médiocre ; celui de la Suisse
    // n'est pas mesurable. La seconde passe devant, sur les trois autres.
    expect(retenues.map((r) => r.destination.pays)).toEqual(["Suisse", "Pays-Bas"]);
    expect(retenues[0]!.nonPesees).toEqual(["le budget"]);
  });

  /**
   * I.A — le classement dit ce qu'il a pesé et ce qu'il n'a pas pu peser.
   * Les deux phrases sont dérivées de `POIDS` et de la liste reçue : c'est
   * ce qui permet de brancher un indice demain sans relire l'écran.
   */
  it("les critères pesés sont nommés dans l'ordre de leur poids", () => {
    expect(COMPOSANTES_PESEES).toEqual([
      "le niveau de langue exigé",
      "le budget de la première année",
      "la facilité administrative",
      "les débouchés après le diplôme",
    ]);
  });

  it("la phrase nomme les critères comparés sans citer aucune part", () => {
    const { peses } = perimetreDuClassement(COMPOSANTES_ABSENTES);
    expect(peses).toContain("quatre critères publiés");
    expect(peses).toContain("le niveau de langue exigé");
    expect(peses).toContain("les débouchés après le diplôme");
    // Arbitrage C-09 : la part de chaque critère ordonne, elle ne s'affiche pas.
    expect(peses).not.toMatch(/\d/u);
  });

  it("ce qui manque est dit, avec la raison", () => {
    const { absentes } = perimetreDuClassement(COMPOSANTES_ABSENTES);
    expect(absentes).toBe(
      "Deux critères prévus n'y entrent pas, faute d'une source datée : qualité de vie et coût de la vie.",
    );
  });

  it("un seul critère manquant s'accorde au singulier", () => {
    expect(perimetreDuClassement(["coût de la vie"]).absentes).toBe(
      "Un critère prévu n'y entre pas, faute d'une source datée : coût de la vie.",
    );
  });

  /**
   * Le jour où les six composantes ont une source, la phrase disparaît
   * d'elle-même : l'écran n'a pas de « sauf si » à retirer à la main.
   */
  it("plus rien ne manque, plus rien n'est dit", () => {
    expect(perimetreDuClassement([]).absentes).toBeNull();
  });

  /**
   * Le champ envoyé que personne ne lit.
   *
   * `composantesAbsentes` sortait de la route depuis le premier jour et
   * n'apparaissait dans aucune interface de P-03 : ni le typage ni l'écran
   * ne le voyaient. Le test compare donc les clés rendues par la route aux
   * clés déclarées par l'écran, et refuse qu'elles divergent — dans un sens
   * comme dans l'autre.
   */
  it("P-03 déclare exactement ce que /api/simulations renvoie", () => {
    const route = lire("src/app/api/simulations/route.ts");
    const rendu = route.slice(route.indexOf("    return {"));
    const envoyees = [...rendu.matchAll(/^ {6}(\w+):/gmu)].map((m) => m[1]!).sort();

    const ecran = lire("src/app/(public)/resultats/Resultats.tsx");
    const bloc = ecran.slice(ecran.indexOf("interface Classement {"));
    const declarees = [...bloc.slice(0, bloc.indexOf("\n}")).matchAll(/^ {2}(\w+)[?]?:/gmu)]
      .map((m) => m[1]!)
      .sort();

    expect(envoyees).toContain("composantesAbsentes");
    expect(declarees).toEqual(envoyees);
  });
});

describe("conversion de devises", () => {
  it("la parité fixe du franc CFA est utilisable", () => {
    expect(versXOF(100, "EUR")).toBe(65_596);
    expect(convertible("EUR")).toBe(true);
  });

  it("une monnaie sans parité sûre ne se convertit pas au hasard", () => {
    expect(versXOF(100, "CHF")).toBeNull();
    expect(versXOF(100, "AED")).toBeNull();
  });
});

describe("A-02 — blocage de connexion", () => {
  const maintenant = new Date("2026-09-19T10:00:00Z");

  it("le compte se bloque au cinquième échec", () => {
    expect(aBloquer(ESSAIS_AVANT_BLOCAGE - 1)).toBe(false);
    expect(aBloquer(ESSAIS_AVANT_BLOCAGE)).toBe(true);
  });

  it("le message annonce ce qui reste avant le blocage", () => {
    const verdict = verdictDeConnexion(2, null, maintenant);
    expect(verdict.essaisRestants).toBe(3);
    expect(libelleEchec(verdict)).toContain("3 essais");
  });

  it("pendant le blocage, le message dit quand ça rouvre", () => {
    const verdict = verdictDeConnexion(5, new Date("2026-09-19T10:10:00Z"), maintenant);
    expect(verdict.bloque).toBe(true);
    expect(libelleEchec(verdict)).toContain("10 minutes");
  });

  it("le message ne dit jamais lequel des deux champs est en cause", () => {
    const verdict = verdictDeConnexion(1, null, maintenant);
    expect(libelleEchec(verdict)).not.toMatch(/adresse inconnue|compte introuvable|mot de passe faux/iu);
  });
});

describe("WF-11 — impact d'une publication", () => {
  const regle = (rules: unknown) =>
    ({ rules, countryCode: "NL", visaType: "etudes", version: 1 }) as never;

  const payloadDe = (modifs: Record<string, unknown> = {}) => ({
    libelle: "Séjour études",
    langues_acceptees: ["en"],
    niveau_langue_min: "B2",
    frais_scolarite: null,
    frais_dossier: null,
    preuve_fonds: { valeur: 1000, devise: "EUR", periodicite: "mensuel" },
    delai_traitement_jours: { min: 60, max: 90 },
    travail_autorise: {
      autorise: true,
      limite_hebdomadaire_heures: 16,
      plein_temps_vacances: true,
      delai_carence_mois: null,
      permis_employeur_requis: true,
    },
    apres_etudes: {
      dispositif: "Zoekjaar",
      duree_mois: 12,
      renouvelable: false,
      delai_depot_apres_diplome_mois: 3,
      travail_pendant_recherche_heures: null,
    },
    conditions: [
      {
        code: "fonds_min",
        operateur: "gte",
        valeur: 1000,
        message_echec: "Complète ton relevé.",
        bloquant: true,
      },
    ],
    pieces_requises: [
      { code: "passeport", libelle: "Passeport", obligatoire: true, traduction_assermentee: false, legalisation: false },
    ],
    reserves: [],
    ...modifs,
  });

  it("un montant relevé est majeur, pas critique", () => {
    const { impact } = comparer(
      regle(payloadDe()),
      regle(payloadDe({ preuve_fonds: { valeur: 1200, devise: "EUR", periodicite: "mensuel" } })),
    );
    expect(impact).toBe("MAJEUR");
  });

  it("un dispositif supprimé est critique", () => {
    const { impact } = comparer(regle(payloadDe()), regle(payloadDe({ apres_etudes: null })));
    expect(impact).toBe("CRITIQUE");
  });

  it("une condition bloquante perdue est critique au même titre", () => {
    const { impact } = comparer(regle(payloadDe()), regle(payloadDe({ conditions: [] })));
    expect(impact).toBe("CRITIQUE");
  });

  it("rien de changé reste mineur", () => {
    const { impact, diff } = comparer(regle(payloadDe()), regle(payloadDe()));
    expect(impact).toBe("MINEUR");
    expect(diff).toEqual([]);
  });
});

describe("messages de validation — aucune chaîne en anglais", () => {
  it("un identifiant mal formé est refusé en français", () => {
    const lu = z.object({ id: z.string().uuid() }).safeParse({ id: "pas-un-identifiant" });
    expect(lu.success).toBe(false);
    if (!lu.success) {
      expect(lu.error.issues[0]?.message).not.toMatch(/invalid|expected|must|string/iu);
      expect(lu.error.issues[0]?.message).toContain("Identifiant");
    }
  });

  it.each([
    [z.string().min(10), "court"],
    [z.number(), "pas un nombre"],
    [z.object({ a: z.string() }), {}],
    [z.enum(["a", "b"]), "c"],
    [z.string().url(), "pas une url"],
    [z.string().max(3), "beaucoup trop long"],
  ])("le message par défaut est français (%#)", (schema, valeur) => {
    const lu = schema.safeParse(valeur);
    expect(lu.success).toBe(false);
    if (!lu.success) {
      for (const probleme of lu.error.issues) {
        expect(probleme.message).not.toMatch(
          /\b(invalid|expected|received|required|must contain|at least|at most|string|number)\b/iu,
        );
      }
    }
  });
});

describe("un conseil ne s'affiche que sous la pièce qu'il concerne", () => {
  it("le refus de format ne parle pas d'application bancaire sous un passeport", () => {
    const refus = refusDuFichier({ nom: "passeport.heic", octets: 240_000 });
    expect(refus).toBeTruthy();
    expect(refus).not.toContain("bancaire");
    // Il reste actionnable : il dit ce qui est accepté.
    expect(refus).toContain("PDF");
  });
});

describe("WF-09 — la date « au plus tôt » se calcule depuis le dépôt", () => {
  it("une pièce de trois mois se demande trois mois avant le dépôt, pas avant la rentrée", () => {
    // Le défaut corrigé : calculée depuis la date cible (1er septembre), la
    // date tombait deux jours avant le dépôt du 3 juin — trop tard pour une
    // pièce qui met trois semaines à venir.
    expect(dateAuPlusTot("2027-06-03", 3)).toBe("2027-03-03");
    expect(dateAuPlusTot("2027-09-01", 3)).toBe("2027-06-01");
  });
});
