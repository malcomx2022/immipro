import { describe, expect, it } from "vitest";
import {
  alertePeremption,
  completudeDesPieces,
  grouperPourCompletude,
  libelleAction,
  libelleAlertePeremption,
  libelleAvancementFamille,
  libelleBlocage,
  premiereATraiter,
  type Piece,
} from "@/domain/dossiers/piece";
import {
  envoiEnCours,
  libelleAvancement,
  libelleCta,
  libelleFichier,
  libelleQuota,
  mentionPied,
  messageQuotaEpuise,
  quotaEpuise,
  refusDuFichier,
  titreQuotaEpuise,
  TAILLE_MAXI_MO,
} from "@/domain/dossiers/televersement";
import {
  consommeUneAnalyse,
  libelleSuite,
  mentionSuite,
  valeurAffichee,
  VALEUR_NON_LUE,
} from "@/domain/dossiers/analyse";
import {
  dateAuPlusTot,
  grouperParMois,
  joursEntre,
  libelleCompteARebours,
  libelleDelai,
  resumeEcheancier,
  urgence,
  type Echeance,
} from "@/domain/dossiers/echeancier";
import {
  demandeUnDetail,
  EFFETS_CLOTURE,
  ISSUES,
  libelleDetail,
  mentionCloture,
  PURGE_JOURS,
} from "@/domain/dossiers/cloture";
import {
  ANALYSE_RESSOURCES,
  ECHEANCES_NL,
  PIECES_NL,
  QUOTA,
  dossierParId,
} from "@/lib/contenu/dossiers";
import { INTERDITS_ECRAN_CANDIDAT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

const piece = (p: Partial<Piece> = {}): Piece => ({
  id: "passeport",
  code: "ID",
  libelle: "Passeport",
  famille: "OBLIGATOIRE",
  etat: "ATTENDUE",
  remede: "TELEVERSER",
  ...p,
});

describe("C-06 — pièces de la checklist", () => {
  it("nomme l'issue d'après le remède, pas d'après l'état", () => {
    // Un passeport trop court se remplace à l'administration : « Ajouter »
    // mentirait sur l'effort demandé.
    expect(libelleAction(piece({ etat: "A_CORRIGER", remede: "DEMARCHE" }))).toBe("Voir");
    expect(libelleAction(piece({ etat: "A_CORRIGER", remede: "REMPLACER" }))).toBe("Remplacer");
    expect(libelleAction(piece({ etat: "ATTENDUE", remede: "REDIGER" }))).toBe("Rédiger");
    expect(libelleAction(piece({ etat: "ATTENDUE", remede: "TELEVERSER" }))).toBe("Ajouter");
  });

  it("renvoie l'illisible à la prise de vue, et le conforme à la consultation", () => {
    expect(libelleAction(piece({ etat: "ILLISIBLE" }))).toBe("Reprendre");
    expect(libelleAction(piece({ etat: "CONFORME", remede: "REMPLACER" }))).toBe("Voir");
  });

  it("donne à une pièce le même libellé sur la checklist et sur la complétude", () => {
    // La divergence du prototype — « Ajouter » ici, « Déposer » là — ne peut
    // plus se produire : les deux écrans appellent la même fonction.
    for (const p of PIECES_NL) {
      expect(libelleAction(p)).toBe(libelleAction({ ...p }));
    }
  });

  it("compte l'avancement d'une famille", () => {
    expect(libelleAvancementFamille(PIECES_NL, "OBLIGATOIRE")).toBe("3 sur 5 conformes");
  });

  it("groupe pour C-09 : ce qui bloque, ce qui suit, ce qui est fait", () => {
    const { bloquantes, ensuite, conformes } = grouperPourCompletude(PIECES_NL);
    expect(bloquantes.map((p) => p.code)).toEqual(["ID", "FIN"]);
    expect(ensuite.map((p) => p.code)).toEqual(["MOT", "PHO"]);
    expect(conformes).toHaveLength(4);
  });

  it("annonce le blocage sans parler de reprise", () => {
    expect(libelleBlocage(PIECES_NL)).toBe("2 pièces bloquent le dépôt");
    expect(libelleBlocage([piece({ etat: "CONFORME" })])).toBe("Rien ne bloque le dépôt");
    expect(libelleBlocage([piece()])).toBe("1 pièce bloque le dépôt");
  });

  it("propose d'abord ce qui bloque", () => {
    expect(premiereATraiter(PIECES_NL)?.code).toBe("ID");
    expect(premiereATraiter([piece({ etat: "CONFORME" })])).toBeUndefined();
  });

  it("calcule la complétude depuis la checklist, sans compteur saisi à la main", () => {
    const completude = completudeDesPieces(PIECES_NL);
    expect(completude.compteurs).toEqual({
      obligatoiresManquantes: 2,
      exigencesNonTenues: 0,
      facultativesManquantes: 2,
      conformes: 4,
    });
    expect(completude).not.toHaveProperty("interne");
  });

  it("met le tableau de bord et la checklist d'accord", () => {
    const dossier = dossierParId("nl-4471");
    expect(dossier?.completude).toEqual(completudeDesPieces(PIECES_NL));
  });
});

describe("péremption d'une pièce", () => {
  const ielts = piece({ etat: "CONFORME", perimeLe: "2027-03-03" });

  it("distingue ce qui expire avant le dépôt de ce qui expire après", () => {
    expect(alertePeremption(ielts, "2027-01-15")).toBe("APRES_LE_DEPOT");
    expect(alertePeremption(ielts, "2027-06-01")).toBe("AVANT_LE_DEPOT");
    expect(alertePeremption(piece(), "2027-01-15")).toBe("AUCUNE");
  });

  it("ne dit jamais « expire bientôt » d'une pièce qui passe le dépôt", () => {
    expect(libelleAlertePeremption(ielts, "2027-01-15")).toBe("Valable jusqu'au 3 mars 2027");
    expect(libelleAlertePeremption(ielts, "2027-06-01")).toContain("avant le dépôt visé");
    expect(libelleAlertePeremption(piece(), "2027-01-15")).toBeNull();
  });
});

describe("C-07 — téléversement", () => {
  it("dit ce qui reste possible dans chaque état", () => {
    expect(libelleCta("PRET")).toBe("Ajouter la pièce");
    expect(libelleCta("ENVOI")).toBe("Envoi en cours…");
    expect(libelleCta("RESEAU_COUPE")).toBe("Réessayer l'envoi");
    expect(mentionPied("QUOTA_EPUISE")).toBe("Téléversement toujours possible sans analyse");
    expect(mentionPied("RESEAU_COUPE")).toBe("Envoi automatique dès le retour du réseau");
    expect(mentionPied("PRET")).toContain(`${TAILLE_MAXI_MO} Mo maximum`);
  });

  it("passe en chargement pendant l'envoi, jamais en désactivé muet", () => {
    expect(envoiEnCours("ENVOI")).toBe(true);
    expect(envoiEnCours("PRET")).toBe(false);
  });

  it("refuse un fichier en disant la mesure, l'exigence, puis le geste", () => {
    const trop = refusDuFichier({ nom: "releve.pdf", octets: 14.2 * 1024 * 1024 });
    expect(trop).toContain("14,2 Mo");
    expect(trop).toContain("la limite est de 10 Mo");
    expect(trop).toMatch(/Enregistre|photographie/);

    expect(refusDuFichier({ nom: "releve.docx", octets: 1000 })).toContain("n'est pas lu");
    expect(refusDuFichier({ nom: "releve.pdf", octets: 0 })).toContain("vide");
    expect(refusDuFichier({ nom: "photo.JPG", octets: 1000 })).toBeNull();
  });

  it("annonce l'avancement en volume, jamais en part", () => {
    const texte = libelleAvancement(1.1 * 1024 * 1024, 1.8 * 1024 * 1024, 20);
    expect(texte).toContain("1,1 Mo envoyés sur 1,8 Mo");
    expect(texte).not.toMatch(/\d\s?%/);
    expect(verifierTexte(texte, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
  });

  it("identifie le fichier envoyé", () => {
    expect(libelleFichier({ nom: "releve-bancaire.pdf", octets: 1.8 * 1024 * 1024 })).toBe(
      "releve-bancaire.pdf · 1,8 Mo",
    );
  });

  it("compte des analyses, pas des jetons", () => {
    expect(libelleQuota(QUOTA)).toBe("Analyses restantes : 12 sur 30");
    expect(quotaEpuise(QUOTA)).toBe(false);
    expect(quotaEpuise({ ...QUOTA, restantes: 0 })).toBe(true);
    expect(titreQuotaEpuise(QUOTA)).toBe("Tes 30 analyses du pack Dossier sont utilisées");
  });

  it("laisse le dépôt ouvert quand le quota est épuisé", () => {
    const message = messageQuotaEpuise(10, "3 000 F");
    expect(message).toContain("Tu peux toujours téléverser");
    expect(message).toContain("Une recharge de 10 analyses coûte 3 000 F.");
  });
});

describe("C-08 — résultat d'analyse", () => {
  it("renvoie chaque verdict au geste qui lui correspond", () => {
    expect(libelleSuite("CONFORME")).toBe("Revenir à la checklist");
    expect(libelleSuite("A_CORRIGER")).toBe("Téléverser une autre version");
    expect(libelleSuite("ILLISIBLE")).toBe("Reprendre la photo");
  });

  it("ne fait pas payer au candidat une lecture qui n'a rien rendu", () => {
    expect(consommeUneAnalyse("ILLISIBLE")).toBe(false);
    expect(consommeUneAnalyse("A_CORRIGER")).toBe(true);
    expect(consommeUneAnalyse(null)).toBe(true);
    expect(mentionSuite("ILLISIBLE", QUOTA)).toBe("Cette reprise ne consomme pas d'analyse");
    expect(mentionSuite("A_CORRIGER", QUOTA)).toBe("Analyses restantes : 12 sur 30");
  });

  it("montre un champ non lu au lieu de le laisser vide", () => {
    expect(valeurAffichee({ intitule: "Solde", valeur: null })).toBe(VALEUR_NON_LUE);
    expect(valeurAffichee({ intitule: "Solde", valeur: "10 000 €" })).toBe("10 000 €");
  });

  it("annonce un écart cohérent avec les montants qu'il affiche", () => {
    // Le prototype titrait « Il manque 1 391 € » au-dessus d'un solde de
    // 10 000 € et d'une exigence de 13 569,24 € : un troisième chiffre fait
    // douter de la lecture entière, au moment où on demande de s'y fier.
    const lu = Number(
      ANALYSE_RESSOURCES.champs
        .find((c) => c.intitule === "Solde disponible")!
        .valeur!.replace(/[^\d,]/g, "")
        .replace(",", "."),
    );
    const exige = Number(
      ANALYSE_RESSOURCES.exigence.valeur!.split("·")[0]!.replace(/[^\d,]/g, "").replace(",", "."),
    );
    // Intl sépare les milliers par une espace fine insécable selon la
    // version d'ICU : la comparaison porte sur les chiffres, pas sur l'espace.
    const espaces = (t: string) => t.replace(/[\s\u202f\u00a0]/g, " ");
    const ecart = (exige - lu).toLocaleString("fr-FR", { minimumFractionDigits: 2 });
    expect(espaces(ANALYSE_RESSOURCES.titre)).toContain(espaces(ecart));
  });
});

describe("C-10 — échéancier", () => {
  const e = (date: string, reste: Partial<Echeance> = {}): Echeance => ({
    id: date,
    date,
    titre: "Échéance",
    detail: "Détail",
    ...reste,
  });

  it("compte les jours en UTC, sans dépendre du fuseau du navigateur", () => {
    expect(joursEntre("2026-09-11", "2027-01-15")).toBe(126);
    expect(joursEntre("2027-01-20", "2027-01-15")).toBe(-5);
  });

  it("dit le rebours, et le dépassement quand la date est passée", () => {
    expect(libelleCompteARebours("2026-09-11", "2027-01-15")).toBe("126 jours restants");
    expect(libelleCompteARebours("2027-01-14", "2027-01-15")).toBe("1 jour restant");
    expect(libelleCompteARebours("2027-01-15", "2027-01-15")).toBe("C'est aujourd'hui");
    expect(libelleCompteARebours("2027-01-18", "2027-01-15")).toBe("Dépassé de 3 jours");
    /*
      Le compte à rebours ne nomme pas ce qu'il compte : l'écran le nomme
      devant lui, et « Dépôt le 2 août — date de dépôt dépassée de 50
      jours » bégayait. Aucune de ces réponses ne redit « dépôt ».
    */
    for (const [a, b] of [
      ["2026-09-11", "2027-01-15"],
      ["2027-01-15", "2027-01-15"],
      ["2027-01-18", "2027-01-15"],
    ]) {
      expect(libelleCompteARebours(a!, b!).toLowerCase()).not.toContain("dépôt");
    }
  });

  it("classe une échéance par rapport à aujourd'hui", () => {
    expect(urgence(e("2026-09-30"), "2026-09-11")).toBe("CE_MOIS_CI");
    expect(urgence(e("2026-11-15"), "2026-09-11")).toBe("A_VENIR");
    expect(urgence(e("2026-09-01"), "2026-09-11")).toBe("EN_RETARD");
  });

  it("dit l'écart, pas seulement la catégorie", () => {
    expect(libelleDelai(e("2026-09-18"), "2026-09-11")).toBe("Dans 7 jours");
    expect(libelleDelai(e("2026-09-12"), "2026-09-11")).toBe("Demain");
    expect(libelleDelai(e("2026-09-11"), "2026-09-11")).toBe("Aujourd'hui");
    expect(libelleDelai(e("2026-09-08"), "2026-09-11")).toBe("En retard de 3 jours");
  });

  it("groupe par mois dans l'ordre chronologique", () => {
    const mois = grouperParMois([e("2026-11-15"), e("2026-09-30"), e("2026-09-18")]);
    expect(mois.map((m) => m.libelle)).toEqual(["Septembre 2026", "Novembre 2026"]);
    expect(mois[0]!.echeances.map((x) => x.date)).toEqual(["2026-09-18", "2026-09-30"]);
  });

  it("met le retard avant le mois en cours", () => {
    expect(resumeEcheancier([e("2026-09-01"), e("2026-09-30")], "2026-09-11")).toBe(
      "1 échéance est en retard.",
    );
    expect(resumeEcheancier([e("2026-09-18"), e("2026-09-30")], "2026-09-11")).toBe(
      "2 échéances tombent ce mois-ci.",
    );
    expect(resumeEcheancier([e("2026-11-15")], "2026-09-11")).toBe(
      "Aucune échéance ce mois-ci.",
    );
  });

  it("calcule la date au plus tôt d'une pièce périssable", () => {
    // Un relevé de moins de trois mois au 15 janvier se demande au plus tôt
    // le 15 octobre : avant, il est périmé le jour du dépôt.
    expect(dateAuPlusTot("2027-01-15", 3)).toBe("2026-10-15");
    expect(ECHEANCES_NL.find((x) => x.id === "releve-bancaire")?.date).toBe("2026-10-15");
  });
});

describe("C-11 — clôture", () => {
  it("ne demande un détail que là où il apprend quelque chose", () => {
    expect(demandeUnDetail("OBTENU")).toBe(false);
    for (const cle of ["REFUS", "ABANDON", "AUTRE"] as const) {
      expect(demandeUnDetail(cle)).toBe(true);
    }
  });

  it("pose une question différente selon l'issue", () => {
    expect(libelleDetail("REFUS")).toBe("Quel motif de refus a été indiqué ?");
    expect(libelleDetail("ABANDON")).toBe("Qu'est-ce qui t'a arrêté ?");
    expect(libelleDetail("AUTRE")).toBe("Précise ta situation");
  });

  it("annonce la purge dans tous les cas (INV-5)", () => {
    expect(PURGE_JOURS).toBe(30);
    for (const { cle } of ISSUES) {
      expect(mentionCloture(cle)).toContain(`supprimées sous ${PURGE_JOURS} jours`);
    }
    expect(mentionCloture("OBTENU")).toContain("Félicitations");
    expect(EFFETS_CLOTURE[0]).toContain(`${PURGE_JOURS} jours`);
  });
});

describe("lot Dossier 2 — vocabulaire", () => {
  it("aucun texte de pièce, d'analyse, d'échéance ou de clôture ne promet un résultat", () => {
    const textes = [
      ...PIECES_NL.flatMap((p) => [p.libelle, p.message ?? "", p.constat ?? ""]),
      ANALYSE_RESSOURCES.titre,
      ANALYSE_RESSOURCES.corps,
      ...ECHEANCES_NL.flatMap((e) => [e.titre, e.detail]),
      ...EFFETS_CLOTURE,
      ...ISSUES.map((i) => i.libelle),
      ...ISSUES.map((i) => mentionCloture(i.cle)),
      libelleBlocage(PIECES_NL),
      libelleQuota(QUOTA),
    ];
    for (const texte of textes) {
      expect(verifierTexte(texte, INTERDITS_ECRAN_CANDIDAT), texte).toEqual([]);
    }
  });
});
