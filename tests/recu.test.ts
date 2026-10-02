import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CLES_EMETTEUR,
  EMETTEUR_NON_RENSEIGNE,
  emetteurDuRecu,
  LIBELLE_ETAT,
  MENTION_ATTESTATION,
  MENTION_PDF,
  mentionRembourse,
  RAISON_RENVOI_FERME,
  confirmationDeRenvoi,
  estAttestable,
  etatDuRecu,
  libelleDeLAchat,
  moyenDe,
} from "@/domain/paiement/recu";
import { momentEnFrancais } from "@/domain/format/moment";
import { PACKS, RECHARGE_ANALYSES, CONSULTATION } from "@/domain/payments/pricing";
import { ECHECS } from "@/server/http/echecs";

const lire = (f: string) => readFileSync(f, "utf8");

const IDENTITE = {
  denomination: "Société Fictive de Test",
  forme_juridique: "SARL",
  siege_social: "Lot 000, quartier fictif, Cotonou, Bénin",
  rccm: "RB/COT/00 B 00000",
  ifu: "0000000000000",
  email_contact: "contact@exemple.test",
};


/**
 * Reçu de paiement — $-06, WF-05.
 *
 * Un reçu est une pièce comptable : ce qui se vérifie ici, c'est surtout
 * qu'il ne s'établit pas trop tôt, qu'il ne se présente pas comme acquis
 * quand l'argent est reparti, et qu'il n'invente rien que la base ignore.
 */
describe("état d'un reçu", () => {
  it("n'est payé que sur confirmation du fournisseur", () => {
    expect(etatDuRecu("CONFIRMEE")).toBe("paye");
    expect(etatDuRecu("INITIEE")).toBe("en_cours");
    expect(etatDuRecu("EN_ATTENTE")).toBe("en_cours");
  });

  it("distingue le remboursé du payé", () => {
    // La ligne comptable survit au remboursement ; la somme, non.
    expect(etatDuRecu("REMBOURSEE")).toBe("rembourse");
    expect(LIBELLE_ETAT.rembourse).toBe("Remboursé");
    // Une pièce comptable est datée : la mention porte le jour où la somme
    // est repartie, et pas seulement le fait qu'elle soit repartie (M.B).
    const mention = mentionRembourse("14 septembre 2026, 10 h 12");
    expect(mention).toMatch(/n'atteste plus/u);
    expect(mention).toContain("remboursé le 14 septembre 2026, 10 h 12");
  });

  it("un statut inconnu ne devient jamais payé", () => {
    // Un état ajouté au schéma sans passer par ici ne doit pas produire
    // un document qui atteste d'un encaissement.
    expect(etatDuRecu("UN_ETAT_QUI_N_EXISTE_PAS")).toBe("sans_suite");
    expect(estAttestable(etatDuRecu("UN_ETAT_QUI_N_EXISTE_PAS"))).toBe(false);
  });

  it("n'établit un document que pour un paiement abouti", () => {
    expect(estAttestable("paye")).toBe(true);
    expect(estAttestable("rembourse")).toBe(true);
    expect(estAttestable("en_cours")).toBe(false);
    expect(estAttestable("sans_suite")).toBe(false);
  });
});

describe("ce que le reçu nomme", () => {
  it("nomme le moyen, pas le fournisseur technique", () => {
    // « FedaPay » ne dit rien à qui a payé depuis son téléphone.
    expect(moyenDe("FEDAPAY")).toBe("Mobile Money");
    expect(moyenDe("STRIPE")).toBe("Carte bancaire");
    expect(moyenDe("FEDAPAY")).not.toMatch(/fedapay/iu);
  });

  it("tire les intitulés de la grille tarifaire, jamais d'une recopie", () => {
    const pack = PACKS[0]!;
    expect(libelleDeLAchat(pack.code)).toBe(pack.libelle);
    expect(libelleDeLAchat("recharge")).toBe(RECHARGE_ANALYSES.libelle);
    expect(libelleDeLAchat("consultation")).toBe(CONSULTATION.libelle);
  });

  it("dit ce qu'il atteste, et ce qu'il n'atteste pas (INV-1)", () => {
    expect(MENTION_ATTESTATION).toMatch(/service de préparation/u);
    expect(MENTION_ATTESTATION).toMatch(/ne constitue pas une pièce à joindre/u);
  });

  describe("l'émetteur vient des variables des textes juridiques — 02/10/2026", () => {
    it("compose l'identité saisie, et rien d'autre", () => {
      expect(emetteurDuRecu(IDENTITE)).toEqual([
        "Société Fictive de Test, SARL",
        "Lot 000, quartier fictif, Cotonou, Bénin",
        "RCCM RB/COT/00 B 00000 · IFU 0000000000000",
        "contact@exemple.test",
      ]);
    });

    it.each(CLES_EMETTEUR.map((c) => [c]))("sans %s, il n'y a pas d'émetteur", (cle) => {
      expect(emetteurDuRecu({ ...IDENTITE, [cle]: "  " })).toBeNull();
    });

    it("le dit au lieu d'inventer une identité", () => {
      expect(emetteurDuRecu({})).toBeNull();
      expect(EMETTEUR_NON_RENSEIGNE).toMatch(/pas encore enregistrée/u);
    });

    it("plus aucune identité écrite en dur dans le code du reçu", () => {
      for (const f of ["src/domain/paiement/recu.ts", "src/app/(app)/paiement/recu/[id]/Recu.tsx"]) {
        const source = lire(f).replace(/\/\*[\s\S]*?\*\//gu, "");
        expect(source, f).not.toMatch(/ImmiPro SAS|immipro\.bj|RCCM Cotonou/u);
      }
    });

    it("chaque clé de l'émetteur est une variable déclarée des textes juridiques", async () => {
      const { variable } = await import("@/domain/juridique/variables");
      for (const cle of CLES_EMETTEUR) expect(variable(cle), cle).toBeDefined();
    });
  });

  it("porte l'heure autant que le jour", () => {
    // Deux paiements du même jour ne se distinguent que par elle, et c'est
    // ce qu'on lit à voix haute en réclamation.
    expect(momentEnFrancais("2026-09-11T09:43:00.000Z")).toBe("11 septembre 2026, 10 h 43");
    // L'heure est celle de Cotonou, et le jour aussi : un paiement fait à
    // 0 h 30 n'est pas daté de la veille parce qu'il est 23 h 30 en UTC.
    expect(momentEnFrancais("2026-09-11T23:30:00.000Z")).toBe("12 septembre 2026, 0 h 30");
    expect(momentEnFrancais("2026-09-30T23:15:00.000Z")).toBe("1er octobre 2026, 0 h 15");
    expect(momentEnFrancais("2026-09-01T14:05:00.000Z")).toBe("1er septembre 2026, 15 h 05");
  });
});

describe("les deux boutons du reçu", () => {
  it("« Imprimer » n'embarque aucune bibliothèque de rendu", () => {
    // Même doctrine que l'archive d'un dossier : c'est le navigateur qui
    // fabrique le PDF (annexe L.3).
    const composant = lire("src/app/(app)/paiement/recu/[id]/Recu.tsx");
    expect(composant).toMatch(/window\.print\(\)/u);
    expect(composant).not.toMatch(/jspdf|pdfkit|puppeteer|html2canvas/iu);
    const paquets = JSON.parse(lire("package.json")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(paquets.dependencies ?? {})).not.toContain("jspdf");
  });

  it("le libellé ne promet pas un téléchargement qui n'a pas lieu", () => {
    // Rien ne descend dans les téléchargements : la fenêtre d'impression
    // s'ouvre, et la mention dit où trouver « Enregistrer au format PDF ».
    const composant = lire("src/app/(app)/paiement/recu/[id]/Recu.tsx");
    expect(composant).not.toMatch(/>\s*Télécharger\s*</u);
    expect(MENTION_PDF).toMatch(/Enregistrer au format PDF/u);
  });

  it("« Renvoyer par email » appelle la route, et nomme l'adresse atteinte", () => {
    const composant = lire("src/app/(app)/paiement/recu/[id]/Recu.tsx");
    expect(composant).toMatch(/\/api\/paiements\/\$\{[^}]+\}\/recu/u);
    expect(confirmationDeRenvoi("a@b.bj")).toBe("Reçu renvoyé à a@b.bj.");
  });

  it("le renvoi est fermé sur un remboursement, avec sa raison", () => {
    // Règle de désactivation 3 : un bouton gris sans explication est un
    // défaut, et le composant rend la légende obligatoire.
    const composant = lire("src/app/(app)/paiement/recu/[id]/Recu.tsx");
    expect(composant).toMatch(/raisonDesactivation=\{RAISON_RENVOI_FERME\}/u);
    expect(RAISON_RENVOI_FERME).toMatch(/remboursé/u);
  });
});

describe("la lecture du reçu", () => {
  it("filtre sur le propriétaire dans la requête, pas après (INV-4)", () => {
    const lecture = lire("src/server/lecture/paiements.ts");
    expect(lecture).toMatch(/where:\s*\{\s*reference,\s*userId\s*\}/u);
  });

  it("n'invente pas le numéro qui a payé", () => {
    // Il n'est pas conservé : le reçu nomme le moyen, pas le téléphone.
    // La portée est la lecture du reçu, pas le fichier : les écrans du
    // tunnel voisinent dedans et citent le numéro à bon droit, parce que
    // c'est l'appareil qu'ils demandent d'aller regarder.
    const lecture = lire("src/server/lecture/paiements.ts");
    const recu = lecture.slice(
      lecture.indexOf("export interface Recu"),
      lecture.indexOf("export interface Tunnel"),
    );
    const composant = lire("src/app/(app)/paiement/recu/[id]/Recu.tsx");
    expect(recu).toMatch(/recuDuPaiement/u);
    expect(recu).not.toMatch(/masquerNumero|telephone/u);
    expect(composant).not.toMatch(/masquerNumero/u);
  });

  it("n'écrit plus de transaction en dur sur les deux écrans", () => {
    // $-04 affichait « IMP-2609-4471 » et $-06 servait le premier pack de
    // la grille à n'importe quelle référence de l'URL.
    const confirme = lire("src/app/(app)/paiement/confirme/page.tsx");
    const recu = lire("src/app/(app)/paiement/recu/[id]/page.tsx");
    for (const source of [confirme, recu]) {
      expect(source).not.toMatch(/IMP-\d{4}-/u);
      expect(source).not.toMatch(/PACKS\[0\]/u);
    }
  });

  it("les deux écrans lisent la même assemblée", () => {
    // Deux montants annoncés pour un même paiement sont un litige.
    for (const f of [
      "src/app/(app)/paiement/confirme/page.tsx",
      "src/app/(app)/paiement/recu/[id]/page.tsx",
      "src/app/api/paiements/[reference]/recu/route.ts",
    ]) {
      expect(lire(f)).toMatch(/recuDuPaiement/u);
    }
  });
});

describe("le renvoi par email", () => {
  it("n'expédie que vers une adresse confirmée", () => {
    // Un montant et une référence ne partent pas vers une adresse que
    // personne n'a prouvé lire.
    const route = lire("src/app/api/paiements/[reference]/recu/route.ts");
    expect(route).toMatch(/acces:\s*"candidat_verifie"/u);
  });

  it("compte chaque appel comme un geste sensible", () => {
    // Chaque clic déclenche un envoi : le débit d'une lecture ordinaire
    // ferait de l'écran un expéditeur de courrier indésirable.
    const route = lire("src/app/api/paiements/[reference]/recu/route.ts");
    expect(route).toMatch(/limite:\s*"sensible"/u);
  });

  it("refuse en nommant le fait, pas une étape fermée (DOC-12 §16 règle 1)", () => {
    // Trouvé en appelant la route : `etat_incompatible` titrait « Cette
    // étape n'est pas encore ouverte » sur un paiement remboursé, où rien
    // n'est en attente d'ouverture — le titre nommait un autre fait que
    // le corps. Ni panne ni saisie perdue : le ton est `limite`.
    const refus = ECHECS.recu_indisponible;
    expect(refus.titre).toBe("Ce reçu n'a pas été envoyé");
    expect(refus.titre).not.toMatch(/étape/u);
    expect(refus.ton).toBe("limite");
    expect(refus.conserve).toBeTruthy();
    const route = lire("src/app/api/paiements/[reference]/recu/route.ts");
    expect(route).not.toMatch(/etat_incompatible/u);
  });

  it("passe par le point de branchement unique du courrier", () => {
    const route = lire("src/app/api/paiements/[reference]/recu/route.ts");
    expect(route).toMatch(/envoyerRecu/u);
    expect(route).not.toMatch(/nodemailer|smtp\.|createTransport/iu);
  });
});

describe("le reçu à l'impression", () => {
  it("le gabarit de paiement marque sa propre chrome", () => {
    // Le fil des étapes imprimé sur un reçu ferait croire à une commande
    // en cours. Défaut déjà rencontré sur l'archive (annexe L).
    expect(lire("src/app/(app)/paiement/layout.tsx")).toMatch(/pas-a-imprimer/u);
  });

  it("le document s'imprime et les boutons non", () => {
    const composant = lire("src/app/(app)/paiement/recu/[id]/Recu.tsx");
    expect(composant).toMatch(/className="a-imprimer/u);
    // La barre d'action, le bloc d'échec : tout ce qui ne s'imprime pas
    // est marqué, plutôt que masqué par nom de balise.
    expect((composant.match(/pas-a-imprimer/gu) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
