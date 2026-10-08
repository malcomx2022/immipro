import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { HORS_LIGNE, echecSansCorps } from "@/lib/api";
import {
  CONSERVE_DU_CANDIDAT,
  ECHECS,
  INTERROMPENT_UNE_SAISIE,
  echec,
  pourCandidat,
  pourOperateur,
  type CodeEchec,
} from "@/server/http/echecs";
import {
  adresseDeLAppelant,
  decider,
  REGLES,
  cleDAppel,
  consommer,
  reinitialiser,
} from "@/server/http/limites";
import { signatureValide, lireEntete, TOLERANCE_SECONDES } from "@/server/paiement/signature";
import { createHmac } from "node:crypto";
import { effetDeLaNotification, aExpirer, aReconcilier } from "@/server/paiement/cycle";

/**
 * Socle de l'API. Ce qui est vérifié ici ne l'est nulle part ailleurs : ce
 * sont des décisions pures, prises une fois pour trente-cinq routes.
 */

describe("contrat d'échec — DOC-12 §16", () => {
  const codes = Object.keys(ECHECS) as CodeEchec[];

  it.each(codes)("%s nomme le fait et propose une suite (règles 1 et 4)", (code) => {
    const e = ECHECS[code];
    expect(e.titre.length).toBeGreaterThan(0);
    expect(e.action.length).toBeGreaterThan(0);
    // Règle 1 : le titre nomme le fait, pas le sentiment.
    expect(e.titre).not.toMatch(/oups|désolé|erreur est survenue|quelque chose/iu);
  });

  it.each(INTERROMPENT_UNE_SAISIE)("%s dit ce qui est conservé (règle 2)", (code) => {
    expect(ECHECS[code].conserve).toBeTruthy();
  });

  it("aucun message n'est un constat nu", () => {
    const nus = /^(document\s+)?(non\s+conforme|invalide|illisible|refus[ée]e?|ko)\.?$/iu;
    for (const code of codes) {
      expect(nus.test(ECHECS[code].corps)).toBe(false);
    }
  });

  it("le tutoiement est tenu là où la phrase s'adresse au candidat (règle 5)", () => {
    const vouvoiement = /\bvous\b|\bvotre\b|\bvos\b/iu;
    for (const code of codes) {
      expect(`${ECHECS[code].corps} ${ECHECS[code].conserve ?? ""}`).not.toMatch(vouvoiement);
    }
  });

  it("un écran candidat ne reçoit ni code, ni service, ni trace (règle 3)", () => {
    const e = echec("service_indisponible", {
      diagnostic: { service: "fedapay", statutAmont: 503, survenuA: "2026-09-19T09:18:00Z" },
    });
    const candidat = pourCandidat(e);

    expect(JSON.stringify(candidat)).not.toContain("fedapay");
    expect(JSON.stringify(candidat)).not.toContain("503");
    expect(candidat).not.toHaveProperty("code");
    expect(candidat).not.toHaveProperty("diagnostic");
  });

  it("le back-office reçoit le code et l'horodatage — l'exception B-02", () => {
    const e = echec("service_indisponible", {
      diagnostic: { service: "regles", statutAmont: 503, survenuA: "2026-09-19T09:18:00Z" },
    });
    const operateur = pourOperateur(e);

    expect(operateur.code).toBe("service_indisponible");
    expect(operateur.diagnostic?.service).toBe("regles");
    expect(operateur.diagnostic?.statutAmont).toBe(503);
  });

  /**
   * Ce que le serveur calculait pour l'opérateur, et que le client jetait.
   *
   * Sur une fiche au contenu illisible, l'administrateur lisait :
   *
   *     Les conditions n'ont pas pu être chargées
   *     Rien n'est affiché plutôt qu'une information peut-être périmée […]
   *     **Ton dossier et tes pièces ne changent pas.**
   *     Réessayer
   *
   * Il n'a ni dossier ni pièces. Et « Réessayer » était la seule issue,
   * alors que `payload()` avait posé `trace: "NL/etudes_mvv_vvr v3"` — le
   * nom de la fiche à réparer — dans une charge qu'`appeler` typait en
   * `EchecCandidat`, donc perdait.
   */
  it("l'opérateur ne reçoit pas le « ce qui reste » d'un candidat", () => {
    const e = echec("regle_indisponible", {
      diagnostic: { service: "regles", survenuA: "2026-09-24T10:00:00Z", trace: "NL/etudes v3" },
    });
    // Le candidat, lui, le garde : c'est sa question à lui.
    expect(pourCandidat(e).conserve).toContain("Ton dossier");
    expect(pourOperateur(e)).not.toHaveProperty("conserve");
    // Et il reçoit ce qui répond à la sienne.
    expect(pourOperateur(e).diagnostic?.trace).toBe("NL/etudes v3");
  });

  it("celui qui parle du référentiel suit, lui", () => {
    /*
      « Rien n'est écrit : la version enregistrée reste celle d'avant » dit
      à l'opérateur ce qu'il voulait savoir. Omettre tout `conserve` aurait
      emporté celui-là avec les autres.
    */
    const e = echec("publication_refusee");
    expect(pourOperateur(e).conserve).toBeDefined();
    expect(CONSERVE_DU_CANDIDAT).not.toContain("publication_refusee");
    // Et celui qui parle de la saisie de l'opérateur aussi : il en a une.
    expect(pourOperateur(echec("champs_invalides")).conserve).toBeDefined();
  });

  /**
   * La liste dans les deux sens. Un `conserve` qui parle de ce que le
   * candidat possède doit y être ; un code qui y est doit avoir un
   * `conserve` de cette nature. Un échec nouveau force la décision, au lieu
   * de reconduire en silence la phrase d'un autre lecteur.
   */
  it("la liste nomme exactement les « ce qui reste » du candidat", () => {
    /*
      Le critère est de **nommer un objet du candidat**, non d'employer la
      deuxième personne : le back-office tutoie aussi son opérateur. « Tes
      autres réponses sont gardées » suit donc — un veilleur qui édite une
      règle a bien des réponses —, « ton panier reste tel quel » non.
    */
    const OBJETS_DU_CANDIDAT = /dossiers?|pièces?|panier|accord de partage|analyse|vérification/iu;
    const codes = Object.keys(ECHECS) as CodeEchec[];
    const nomment = codes.filter((c) => {
      const conserve = ECHECS[c].conserve;
      return conserve !== undefined && OBJETS_DU_CANDIDAT.test(conserve);
    });
    expect(nomment.length).toBeGreaterThan(5);
    expect([...nomment].sort()).toEqual([...CONSERVE_DU_CANDIDAT].sort());
  });

  it("et le bloc d'échec sait rendre le diagnostic", () => {
    // Le serveur l'envoyait, le client le jetait : `appeler` typait toute
    // réponse d'échec en `EchecCandidat`. Les deux moitiés se lisent ici.
    const client = readFileSync("src/lib/api.ts", "utf8");
    expect(client).toMatch(/export type EchecRecu = EchecCandidat & Partial</u);
    expect(client).toMatch(/echec\?: EchecRecu/u);
    const bloc = readFileSync("src/components/ui/BlocEchec.tsx", "utf8");
    expect(bloc).toMatch(/echec: EchecRecu/u);
    expect(bloc).toMatch(/echec\.diagnostic \?/u);
    expect(bloc).toMatch(/diagnostic\.trace/u);
  });

  it("le ton distingue l'échec de l'attente et de la limite (règle 7)", () => {
    expect(ECHECS.quota_epuise.ton).toBe("limite");
    expect(ECHECS.trop_de_requetes.ton).toBe("attente");
    expect(ECHECS.corps_illisible.ton).toBe("echec");
  });
});

describe("limitation de débit", () => {
  beforeEach(reinitialiser);

  it("laisse passer jusqu'au quota, puis refuse", () => {
    const regle = { appels: 3, fenetreSecondes: 60 };
    let historique: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const r = decider(historique, 1_000 + i, regle);
      historique = r.historique;
      expect(r.verdict.autorise).toBe(true);
    }
    expect(decider(historique, 1_003, regle).verdict.autorise).toBe(false);
  });

  it("la fenêtre glisse : un appel sorti de la fenêtre rouvre une place", () => {
    const regle = { appels: 2, fenetreSecondes: 10 };
    const historique = [0, 5_000];
    // À 11 s, l'appel de 0 est sorti de la fenêtre de 10 s.
    expect(decider(historique, 11_000, regle).verdict.autorise).toBe(true);
  });

  it("le délai de reprise est annoncé, pas deviné", () => {
    const regle = { appels: 1, fenetreSecondes: 60 };
    const { historique } = decider([], 0, regle);
    const refus = decider(historique, 10_000, regle);
    expect(refus.verdict.autorise).toBe(false);
    expect(refus.verdict.reprendDans).toBeGreaterThan(0);
    expect(refus.verdict.reprendDans).toBeLessThanOrEqual(60);
  });

  it("l'écran d'attente tient sa cadence : cent relevés sur cinq minutes passent", () => {
    // $-03 relève toutes les trois secondes pendant cinq minutes.
    for (let i = 0; i < 100; i += 1) {
      const verdict = consommer("paiements.statut|u1", "attente", i * 3_000);
      expect(verdict.autorise).toBe(true);
    }
  });

  it("la même cadence est refusée sur une route sensible", () => {
    let dernier = { autorise: true };
    for (let i = 0; i < 100; i += 1) {
      dernier = consommer("paiements.creation|u1", "sensible", i * 3_000);
    }
    expect(dernier.autorise).toBe(false);
  });

  it("deux comptes ne partagent pas le compteur, deux anonymes derrière une adresse si", () => {
    expect(cleDAppel("r", "u1", "1.2.3.4")).not.toBe(cleDAppel("r", "u2", "1.2.3.4"));
    expect(cleDAppel("r", null, "1.2.3.4")).toBe(cleDAppel("r", null, "1.2.3.4"));
  });

  it("le régime de lecture est plus large que le régime sensible", () => {
    expect(REGLES.lecture.appels).toBeGreaterThan(REGLES.sensible.appels);
  });
});

/**
 * Revue du 07/10/2026, E1. `X-Forwarded-For` est une liste à laquelle
 * chaque proxy **ajoute** : le premier élément est celui que l'appelant a
 * écrit. Le lire faisait choisir la clé de comptage par l'appelant, sur
 * toutes les routes publiques.
 */
describe("l'adresse de l'appelant est celle que nginx a vue", () => {
  beforeEach(reinitialiser);
  const entetes = (valeurs: Record<string, string>) => new Headers(valeurs);

  it("prend le dernier élément, celui que nginx ajoute — le défaut reproduit", () => {
    expect(adresseDeLAppelant(entetes({ "x-forwarded-for": "6.6.6.6, 41.1.2.3" }))).toBe(
      "41.1.2.3",
    );
  });

  it("une adresse seule, un repli, et l'absence nommée", () => {
    expect(adresseDeLAppelant(entetes({ "x-forwarded-for": "41.1.2.3" }))).toBe("41.1.2.3");
    expect(adresseDeLAppelant(entetes({ "x-real-ip": "41.1.2.4" }))).toBe("41.1.2.4");
    expect(adresseDeLAppelant(entetes({}))).toBe("inconnue");
    expect(adresseDeLAppelant(entetes({ "x-forwarded-for": "a, , " }))).toBe("a");
    expect(adresseDeLAppelant(entetes({ "x-forwarded-for": "::ffff:41.1.2.3" }))).toBe("41.1.2.3");
  });

  it("une adresse forgée à chaque appel ne rouvre plus le compteur", () => {
    let dernier = { autorise: true };
    for (let i = 0; i < 11; i += 1) {
      const adresse = adresseDeLAppelant(
        entetes({ "x-forwarded-for": `10.0.0.${i}, 41.1.2.3` }),
      );
      dernier = consommer(cleDAppel("comptes.connexion", null, adresse), "sensible", 1_000 + i);
    }
    expect(dernier.autorise).toBe(false);
  });

  it("le composeur lit l'adresse par cette fonction, et plus par le premier élément", () => {
    const route = readFileSync("src/server/http/route.ts", "utf8");
    expect(route).toContain("adresseDeLAppelant(entetes)");
    expect(route).not.toMatch(/split\(","\)\[0\]/u);
  });
});

describe("signature de webhook — INV-7, RG-05.3", () => {
  const secret = "secret-de-test";
  const corps = '{"entity":{"id":42,"status":"approved","reference":"IMP-260919-ABC123"}}';
  const maintenant = 1_758_240_000_000;
  const t = Math.floor(maintenant / 1000);
  const signer = (horodatage: number, charge: string) =>
    createHmac("sha256", secret).update(`${horodatage}.${charge}`, "utf8").digest("hex");

  const verifier = (entete: string | null, charge = corps, quand = maintenant) =>
    signatureValide({ entete, corpsBrut: charge, secret, champSignature: "s", maintenant: quand });

  it("accepte une signature juste", () => {
    expect(verifier(`t=${t},s=${signer(t, corps)}`)).toBe(true);
  });

  it("refuse une signature portant sur un autre corps", () => {
    expect(verifier(`t=${t},s=${signer(t, '{"entity":{"id":43}}')}`)).toBe(false);
  });

  it("refuse un rejeu au-delà de la tolérance", () => {
    const vieux = t - TOLERANCE_SECONDES - 1;
    expect(verifier(`t=${vieux},s=${signer(vieux, corps)}`)).toBe(false);
  });

  it("accepte pendant la rotation de secret : plusieurs signatures, une suffit", () => {
    expect(verifier(`t=${t},s=aaaa,s=${signer(t, corps)}`)).toBe(true);
  });

  it("refuse quand le secret n'est pas configuré", () => {
    expect(
      signatureValide({
        entete: `t=${t},s=${signer(t, corps)}`,
        corpsBrut: corps,
        secret: undefined,
        champSignature: "s",
        maintenant,
      }),
    ).toBe(false);
  });

  it("refuse un en-tête absent ou malformé", () => {
    expect(verifier(null)).toBe(false);
    expect(verifier("n'importe quoi")).toBe(false);
    expect(lireEntete("s=abc", "s")).toBeNull();
    expect(lireEntete(`t=${t}`, "s")).toBeNull();
  });
});

describe("cycle de paiement — INV-7", () => {
  it("un rejeu de la même notification ne fait rien", () => {
    expect(effetDeLaNotification("CONFIRMEE", "CONFIRMEE")).toEqual({ type: "rejeu" });
  });

  it("le crédit n'accompagne que l'entrée en CONFIRMEE", () => {
    expect(effetDeLaNotification("EN_ATTENTE", "CONFIRMEE")).toEqual({
      type: "appliquer",
      vers: "CONFIRMEE",
      crediteLePack: true,
    });
    expect(effetDeLaNotification("INITIEE", "EN_ATTENTE")).toEqual({
      type: "appliquer",
      vers: "EN_ATTENTE",
      crediteLePack: false,
    });
  });

  it("une transaction échouée ne revient pas à la vie", () => {
    expect(effetDeLaNotification("ECHOUEE", "CONFIRMEE").type).toBe("refus");
    expect(effetDeLaNotification("EXPIREE", "CONFIRMEE").type).toBe("refus");
  });

  it("seul un remboursement suit une confirmation", () => {
    expect(effetDeLaNotification("CONFIRMEE", "REMBOURSEE").type).toBe("appliquer");
    expect(effetDeLaNotification("CONFIRMEE", "ECHOUEE").type).toBe("refus");
  });

  it("les délais de rattrapage suivent RG-05.4", () => {
    const creee = new Date("2026-09-19T09:00:00Z");
    expect(aReconcilier(creee, new Date("2026-09-19T09:05:00Z"))).toBe(false);
    expect(aReconcilier(creee, new Date("2026-09-19T09:11:00Z"))).toBe(true);
    expect(aExpirer(creee, new Date("2026-09-19T09:30:00Z"))).toBe(false);
    expect(aExpirer(creee, new Date("2026-09-19T10:01:00Z"))).toBe(true);
  });
});

describe("règle 3 appliquée au webhook", () => {
  it("un appelant dont la signature échoue n'apprend pas la forme du secret", () => {
    // Avant la vérification d'origine, l'appelant est quelconque : il reçoit
    // ce que reçoit un écran public, sans code ni service ni horodatage.
    const e = echec("signature_invalide");
    const rendu = JSON.stringify(pourCandidat(e));
    expect(rendu).not.toContain("signature_invalide");
    expect(rendu).not.toContain("diagnostic");
    // Le message reste actionnable pour qui a le secret.
    expect(pourCandidat(e).action).toContain("secret");
  });
});

describe("le public d'une réponse est le plus bas des deux", () => {
  it("un refus de droits ne porte pas de code : celui qui le lit n'est pas opérateur", () => {
    // La route est « opérateur », l'appelant ne l'est pas — sans quoi il ne
    // se ferait pas refuser. C'est lui qui décide de la sérialisation.
    const rendu = JSON.stringify(pourCandidat(echec("droits_insuffisants")));
    expect(rendu).not.toContain("droits_insuffisants");
  });

  it("un échec rendu aux deux publics ne renvoie pas le candidat chez l'opérateur", () => {
    expect(ECHECS.introuvable.action).not.toContain("mes dossiers");
  });
});

/**
 * Une réponse arrivée n'est jamais une coupure — 24/09/2026.
 *
 * `appeler` faisait `reponse.ok ? ILLISIBLE : HORS_LIGNE` : toute réponse
 * d'erreur sans corps JSON devenait « hors ligne ». Exécuté :
 *
 *     405 de Next, corps vide (mauvaise méthode)  → « Tu es hors ligne »
 *     502 d'un relais, page HTML                  → « Tu es hors ligne »
 *     413 sans corps JSON                         → « Tu es hors ligne »
 *
 * Or `HORS_LIGNE` affirme trois choses — « La demande n'est pas partie.
 * Rien n'a été envoyé, rien n'a changé. » — et les trois sont fausses
 * quand le serveur a répondu. La dernière est la plus coûteuse : dire
 * « rien n'a été envoyé » après un délai dépassé sur un paiement est la
 * phrase qui fait recommencer un règlement.
 *
 * `methode_refusee` était déclaré pour le 405 depuis le début — statut,
 * titre, corps, action, ton — et **personne ne le levait** : c'est Next
 * qui répond 405, sans corps. Le client le lève désormais depuis le
 * statut, ce qui est le seul endroit où il est connu.
 */
describe("ce que le client dit d'une réponse illisible", () => {
  const CAS: readonly [number, CodeEchec][] = [
    [405, "methode_refusee"],
    [429, "trop_de_requetes"],
    [500, "service_indisponible"],
    [502, "service_indisponible"],
    [503, "service_indisponible"],
    [504, "service_indisponible"],
  ];

  it("chaque statut connu reprend le contrat du serveur, mot pour mot", () => {
    // Le texte vient d'`ECHECS` et non d'une copie : deux formulations
    // pour un même échec finiraient par diverger.
    for (const [statut, code] of CAS) {
      expect(echecSansCorps(statut).titre, `${statut}`).toBe(ECHECS[code].titre);
      expect(echecSansCorps(statut).ton, `${statut}`).toBe(ECHECS[code].ton);
    }
  });

  it("et le statut annoncé par le contrat est bien celui qu'on lui associe", () => {
    // Sans cela, la table du client et le contrat du serveur pourraient
    // désigner deux statuts différents pour le même échec.
    expect(ECHECS.methode_refusee.statut).toBe(405);
    expect(ECHECS.trop_de_requetes.statut).toBe(429);
    expect(ECHECS.service_indisponible.statut).toBe(503);
  });

  it("aucun de ces messages n'affirme que rien n'est parti", () => {
    /*
      C'est tout le défaut : le serveur a répondu, donc la demande est
      partie, et une écriture a pu aboutir avant le 502. Promettre
      l'inverse fait recommencer un geste déjà fait.
    */
    for (const [statut] of CAS) {
      const dit = JSON.stringify(echecSansCorps(statut));
      expect(dit, `${statut}`).not.toMatch(/n'est pas partie|rien n'a été envoyé/iu);
    }
  });

  it("un statut sans sens arrêté ne promet rien de l'état du serveur", () => {
    const illisible = echecSansCorps(413);
    expect(illisible.titre).toMatch(/n'a pas pu être lue/u);
    expect(JSON.stringify(illisible)).not.toMatch(/rien n'a changé/iu);
  });

  it("et la coupure réelle reste une coupure", () => {
    // `HORS_LIGNE` garde son emploi : celui où aucune réponse n'arrive.
    expect(HORS_LIGNE.titre).toMatch(/hors ligne/u);
    expect(HORS_LIGNE.ton).toBe("attente");
    for (const [statut] of CAS) {
      expect(echecSansCorps(statut).titre, `${statut}`).not.toBe(HORS_LIGNE.titre);
    }
  });

  /**
   * La réciproque, et elle vaut au-delà de ce lot : un code déclaré que
   * personne ne lève est un contrat écrit pour rien. `methode_refusee` a
   * vécu ainsi — complet, argumenté, jamais atteint.
   */
  it("aucun code du contrat n'est déclaré sans être levé quelque part", () => {
    const corpus = sources("src")
      // Le catalogue déclare les codes (F8) ; le module serveur les reprend.
      .filter((f) => f !== "src/server/http/echecs.ts" && f !== "src/domain/echecs/catalogue.ts")
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const jamaisLeves = (Object.keys(ECHECS) as CodeEchec[]).filter(
      (c) => !new RegExp(`"${c}"`, "u").test(corpus),
    );
    expect(jamaisLeves).toEqual([]);
  });
});

/** Tous les fichiers de code sous une racine, essais exclus. */
function sources(racine: string): string[] {
  const sortie: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) sortie.push(...sources(chemin));
    else if (/\.tsx?$/u.test(chemin) && !chemin.includes(".test.")) sortie.push(chemin);
  }
  return sortie;
}
