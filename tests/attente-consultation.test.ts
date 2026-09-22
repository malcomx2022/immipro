import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  actionApresLAchat,
  ceQuiSOuvre,
  phraseDeConfirmation,
} from "@/domain/paiement/contrepartie";
import { ETAPES_ATTENTE, LIBELLES_ETAPES } from "@/domain/paiement/attente";
import { corpsDeLEtat, TENUE_MINUTES, TITRE_ETAT } from "@/domain/consultants/tenue";
import { DUREE_ATTENTE_SECONDES } from "@/domain/paiement/attente";
import { CONSULTATION, PACKS, RECHARGE_ANALYSES } from "@/domain/payments/pricing";
import { INTERDITS_PARTOUT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";
import type { Achat } from "@/domain/payments/achat";
import { sansCommentaires } from "@/domain/copy/source";

/**
 * L'écran d'attente, pour le cas de la consultation — arbitrage du
 * 22/09/2026.
 *
 * Le défaut était signalé depuis trois lots : « l'écran d'attente de
 * paiement est celui des packs ». Il disait, à qui venait de payer
 * quarante-cinq minutes d'entretien, « Nous recevons la confirmation,
 * ton pack s'ouvre » — et l'écran d'après enchaînait sur « Ton dossier
 * est ouvert » et trois étapes de démarrage de pack.
 */

const lire = (f: string) => readFileSync(f, "utf8");

const LES_TROIS: readonly Achat[] = [
  { type: "pack", code: PACKS[0]!.code },
  { type: "recharge" },
  { type: "consultation" },
];

describe("la contrepartie dépend de l'achat, pas du rail", () => {
  it("chaque achat annonce ce qu'il ouvre, et les trois diffèrent", () => {
    const dites = LES_TROIS.map(ceQuiSOuvre);
    expect(new Set(dites).size).toBe(3);
    expect(ceQuiSOuvre({ type: "pack", code: "dossier" })).toContain("pack");
    expect(ceQuiSOuvre({ type: "recharge" })).toContain("analyses");
    expect(ceQuiSOuvre({ type: "consultation" })).toContain("créneau");
  });

  /**
   * Le défaut, exactement : une consultation n'ouvre aucun pack et ne
   * crédite aucune analyse. Elle réserve un horaire.
   */
  it("une consultation ne parle ni de pack ni d'analyses", () => {
    const dit = `${ceQuiSOuvre({ type: "consultation" })} ${phraseDeConfirmation({ type: "consultation" })}`;
    expect(dit).not.toMatch(/pack|analyse|checklist/iu);
  });

  it("la confirmation dit la même chose au passé, sans divergence", () => {
    const phrases = LES_TROIS.map(phraseDeConfirmation);
    expect(new Set(phrases).size).toBe(3);
    // Phrases entières : une phrase à trous autour de la contrepartie
    // produit les accords faux qu'O.A a déjà payés une fois.
    for (const phrase of phrases) expect(phrase).toMatch(/\.$/u);
    expect(phraseDeConfirmation({ type: "consultation" })).toBe("Ton rendez-vous est réservé.");
  });

  it("et la suite proposée mène là où l'achat a un sens", () => {
    expect(actionApresLAchat({ type: "pack", code: "dossier" })).toMatch(/checklist/iu);
    expect(actionApresLAchat({ type: "consultation" })).not.toMatch(/checklist/iu);
    expect(new Set(LES_TROIS.map(actionApresLAchat)).size).toBe(3);
  });

  it("aucune catégorie nouvelle ne passe en silence", () => {
    const inventee = { type: "abonnement" } as unknown as Achat;
    expect(() => ceQuiSOuvre(inventee)).toThrow(/contrepartie/u);
    expect(() => phraseDeConfirmation(inventee)).toThrow(/confirmation/u);
    expect(() => actionApresLAchat(inventee)).toThrow(/suite/u);
  });

  /** INV-2 tient sur les trois, contrepartie comprise. */
  it("aucune contrepartie ne promet quoi que ce soit", () => {
    for (const achat of LES_TROIS) {
      for (const texte of [
        ceQuiSOuvre(achat),
        phraseDeConfirmation(achat),
        actionApresLAchat(achat),
      ]) {
        expect(verifierTexte(texte, INTERDITS_PARTOUT), texte).toEqual([]);
      }
    }
  });
});

describe("le fil d'étapes dit la bonne contrepartie", () => {
  const derniere = (achat: Achat) =>
    LIBELLES_ETAPES[ETAPES_ATTENTE[ETAPES_ATTENTE.length - 1]!](null, "MOBILE_MONEY", achat);

  it("la dernière étape suit l'achat", () => {
    expect(derniere({ type: "consultation" })).toBe(
      "Nous recevons la confirmation, ton créneau est réservé",
    );
    expect(derniere({ type: "recharge" })).toContain("analyses");
    expect(derniere({ type: "pack", code: "dossier" })).toContain("pack");
  });

  /**
   * Les deux premières étapes, elles, ne dépendent que du rail : c'est
   * l'émetteur qui notifie et le candidat qui valide, quel que soit ce
   * qu'il achète. Les mélanger rendrait l'écran incompréhensible.
   */
  it("les deux premières étapes ne dépendent pas de l'achat", () => {
    for (const etape of ["notification", "code"] as const) {
      const vues = LES_TROIS.map((a) => LIBELLES_ETAPES[etape]("97 •• •• 42", "CARTE", a));
      expect(new Set(vues).size).toBe(1);
    }
  });
});

describe("les deux décomptes ne se confondent pas", () => {
  /**
   * **La confusion qui coûte.** L'attente dure cinq minutes, la tenue du
   * créneau vingt. Un candidat qui voit le décompte de l'attente
   * s'épuiser pourrait croire son créneau perdu — alors qu'il lui reste
   * un quart d'heure pour reprendre le paiement.
   */
  it("la tenue dure plus longtemps que l'attente, et l'écran le dit", () => {
    expect(TENUE_MINUTES * 60).toBeGreaterThan(DUREE_ATTENTE_SECONDES);
    const source = lire("src/app/(app)/paiement/attente/Attente.tsx");
    expect(source).toMatch(/consultation\.tenuJusqua/u);
    expect(source).toMatch(/porte sur la\s*\n?\s*confirmation du paiement, pas sur le créneau/u);
  });

  /** Et la phrase de l'état vient du domaine de la tenue, pas de l'écran. */
  it("l'écran emprunte la phrase de l'état au domaine de la tenue", () => {
    const source = lire("src/app/(app)/paiement/attente/Attente.tsx");
    expect(source).toMatch(/corpsDeLEtat\("EN_ATTENTE"\)/u);
    expect(source).toMatch(/TITRE_ETAT\.EN_ATTENTE/u);
    // La phrase dit ce qui compte : le créneau tient, et le retour de la
    // page de paiement ne confirme rien.
    expect(corpsDeLEtat("EN_ATTENTE")).toMatch(/créneau reste tenu/u);
    expect(corpsDeLEtat("EN_ATTENTE")).toMatch(/ne suffit pas à confirmer/u);
    expect(TITRE_ETAT.EN_ATTENTE).toBeTruthy();
  });
});

describe("les écrans du bout du tunnel ne recopient plus la contrepartie", () => {
  it("$-03 et $-04 la demandent au domaine", () => {
    const attente = lire("src/app/(app)/paiement/attente/Attente.tsx");
    const confirme = lire("src/app/(app)/paiement/confirme/page.tsx");
    expect(attente).toMatch(/achatDepuisLeCode\(attente\.achatCode\)/u);
    expect(confirme).toMatch(/phraseDeConfirmation\(achat\)/u);
    expect(confirme).toMatch(/actionApresLAchat\(achat\)/u);
    /*
      Et aucun des deux ne l'écrit en dur — commentaires retirés : les
      deux fichiers citent les anciennes phrases pour expliquer ce qui a
      changé, et c'est très bien ainsi.
    */
    for (const [nom, source] of [
      ["attente", sansCommentaires(attente)],
      ["confirme", sansCommentaires(confirme)],
    ] as const) {
      expect(source, nom).not.toMatch(/ton pack s'ouvre/u);
      expect(source, nom).not.toMatch(/Ton dossier est ouvert\./u);
    }
  });

  /**
   * Les trois étapes de démarrage ne s'affichent que pour ce qui ouvre un
   * dossier — et pas masquées par une classe, qui les laisserait dans le
   * balisage.
   */
  it("$-04 n'énumère pas les étapes d'un pack après une consultation", () => {
    const confirme = lire("src/app/(app)/paiement/confirme/page.tsx");
    expect(confirme).toMatch(/achat\.type === "consultation" \? null : \(/u);
    expect(confirme).not.toMatch(/"hidden"/u);
    // Et il nomme le rendez-vous, avec sa limite d'annulation opposable.
    expect(confirme).toMatch(/libelleRendezVous/u);
    expect(confirme).toMatch(/libelleLimiteAnnulation/u);
  });

  /** Les métadonnées statiques ne nomment plus une contrepartie sur trois. */
  it("aucune métadonnée ne promet un pack", () => {
    for (const f of [
      "src/app/(app)/paiement/attente/page.tsx",
      "src/app/(app)/paiement/confirme/page.tsx",
    ]) {
      const source = lire(f);
      const bloc = source.slice(source.indexOf("export const metadata"));
      const description = /description: "([^"]*)"/u.exec(bloc)?.[1] ?? "";
      expect(description, f).not.toMatch(/pack|dossier est ouvert/iu);
      expect(description.length, f).toBeGreaterThan(10);
    }
  });
});

describe("abandonner une consultation ne se dit pas comme abandonner un pack", () => {
  /**
   * Le lien ramenait au tableau de bord en disant « Annuler le
   * paiement ». Pour une consultation, le créneau redevient libre — et le
   * tableau de bord n'en montre aucun, donc ne permet pas d'en reprendre.
   */
  it("il dit ce qui arrive au créneau, et mène là où on en reprend un", () => {
    const source = lire("src/app/(app)/paiement/attente/Attente.tsx");
    expect(source).toMatch(/Abandonner et libérer le créneau/u);
    expect(source).toMatch(/\/consultants\?dossier=\$\{attente\.dossierId\}/u);
    // Le cas du pack ne bouge pas.
    expect(source).toMatch(/"Annuler le paiement"/u);
  });
});

describe("la lecture du rendez-vous payé", () => {
  const lecture = lire("src/server/lecture/paiements.ts");

  /**
   * Lecture séparée du reçu, et c'est une décision : un reçu est une
   * pièce comptable, qui nomme le moyen de paiement et jamais le
   * portefeuille. Y faire entrer le nom d'un consultant et un horaire
   * irait contre la minimisation que ce module tient ailleurs.
   */
  it("elle ne passe pas par le reçu", () => {
    expect(lecture).toMatch(/export async function consultationDuPaiement/u);
    // L'interface seule, sans le corps de la fonction ni les
    // commentaires qui l'entourent.
    const debut = lecture.indexOf("export interface Recu {");
    const recu = lecture.slice(debut, lecture.indexOf("\n}", debut));
    expect(recu).not.toMatch(/consultant|creneau|créneau|rendez-vous/iu);
  });

  it("elle filtre sur le propriétaire dans la requête", () => {
    const fonction = /export async function consultationDuPaiement[\s\S]*?\n\}/mu.exec(lecture)![0];
    expect(fonction).toMatch(/where: \{ reference, userId \}/u);
    // La catégorie est relue par le domaine, jamais comparée à une chaîne.
    expect(fonction).toMatch(/achatDepuisLeCode\(transaction\.packCode\)/u);
    expect(fonction).not.toMatch(/packCode === "consultation"/u);
  });

  /** Un paiement sans rendez-vous ne fait pas planter l'écran. */
  it("elle rend l'absence plutôt que de supposer", () => {
    const fonction = /export async function consultationDuPaiement[\s\S]*?\n\}/mu.exec(lecture)![0];
    expect((fonction.match(/return null;/gu) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("les montants des trois achats restent distincts", () => {
  /**
   * Ce qui rend le défaut visible : si une consultation coûtait le prix
   * d'un pack, l'écran d'attente aurait pu annoncer n'importe laquelle
   * des deux contreparties sans que rien ne cloche à la lecture.
   */
  it("un écran qui se trompe d'achat se trompe aussi de montant", () => {
    const montants = [PACKS[0]!.prix.XOF, RECHARGE_ANALYSES.prix.XOF, CONSULTATION.prix.XOF];
    expect(new Set(montants).size).toBe(3);
  });
});
