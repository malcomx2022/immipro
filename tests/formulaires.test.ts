import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Formulaires sans élément `<form>` — revue du 07/10/2026, M11 (D-16).
 *
 * Un seul `<form>` dans toute l'interface candidat : partout ailleurs,
 * l'action était un bouton isolé, et Entrée dans un champ ne faisait rien.
 * Le gestionnaire de mots de passe ne reconnaissait pas la connexion, et le
 * lecteur d'écran n'annonçait aucun formulaire.
 *
 * Ces essais lisent les sources : un écran ramené à un bouton isolé se voit
 * sans attendre qu'un essai de rendu le remarque.
 */
const ECRANS = [
  // Lot 1
  "src/app/(auth)/connexion/Connexion.tsx",
  "src/app/(auth)/inscription/Inscription.tsx",
  "src/app/(auth)/mot-de-passe/MotDePasse.tsx",
  "src/app/(auth)/verification/Verification.tsx",
  "src/app/(app)/(dossier)/profil/Profil.tsx",
  // Lot 2
  "src/app/(app)/(dossier)/dossiers/nouveau/OuvertureDossier.tsx",
  "src/app/(app)/(dossier)/dossiers/[id]/echeancier/Faisabilite.tsx",
  "src/app/(app)/(dossier)/dossiers/[id]/depot/Depot.tsx",
  "src/app/(app)/(dossier)/dossiers/[id]/DemandeDeCorrection.tsx",
  "src/app/(auth)/compte/rappels/PreferencesDeRappels.tsx",
];

/**
 * Les gestes qui ne partent pas sur Entrée : ils se font sur leur bouton,
 * lu et visé. D-16 pour la suppression du compte ; le paiement suit la même
 * règle depuis le prototype.
 */
const GESTES_EXPLICITES = [
  "src/app/(auth)/compte/suppression/SuppressionDuCompte.tsx",
  "src/app/(app)/paiement/recapitulatif/Recapitulatif.tsx",
];

describe("les écrans de saisie sont des formulaires", () => {
  it.each(ECRANS)("%s : <form noValidate> avec onSubmit, bouton principal en submit", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).toMatch(/<form\s/u);
    expect(src).toMatch(/onSubmit=\{/u);
    expect(src).toContain('type="submit"');
    for (const [form] of src.matchAll(/<form\b[^>]*>/gu)) expect(form, f).toContain("noValidate");
  });

  it.each(ECRANS)("%s : l'envoi ne passe plus par un onClick", (f) => {
    const src = readFileSync(f, "utf8");
    for (const [bouton] of src.matchAll(/<Button\b[\s\S]*?>/gu)) {
      if (bouton.includes('type="submit"')) expect(bouton, f).not.toMatch(/onClick=/u);
    }
  });
});

describe("D-16 : un geste irréversible ne part pas sur Entrée", () => {
  it.each(GESTES_EXPLICITES)("%s n'a pas de <form>", (f) => {
    // Un élément JSX en début de ligne : le commentaire qui explique
    // l'absence du formulaire le nomme, et ne compte pas.
    expect(readFileSync(f, "utf8")).not.toMatch(/^\s*<form\b/mu);
  });
});
