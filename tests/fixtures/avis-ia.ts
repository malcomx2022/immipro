/** Contrats REV11-L3, partagés par les tests HTTP et la recette PostgreSQL. */
const forme = {
  genre: "FORME",
  titre: "Phrase longue",
  corps: "Sépare cette phrase en deux.",
  ecarts: null,
};
const paire = [
  { source: "Paragraphe 1", valeur: "juillet" },
  { source: "Paragraphe 2", valeur: "septembre" },
];
const incoherence = {
  genre: "INCOHERENCE",
  titre: "Deux dates",
  corps: "Vérifie les dates citées.",
  ecarts: paire,
};
const charge = (remarques: unknown) => ({ remarques });

export const CAS_AVIS_IA: readonly {
  nom: string;
  charge: unknown;
  valide: boolean;
  motif?: string;
  nombre?: number;
}[] = [
  { nom: "vraie liste vide", charge: charge([]), valide: true, nombre: 0 },
  { nom: "remarque de forme", charge: charge([forme]), valide: true, nombre: 1 },
  { nom: "incohérence complète", charge: charge([incoherence]), valide: true, nombre: 1 },
  {
    nom: "huit remarques complètes",
    charge: charge(Array.from({ length: 8 }, () => forme)),
    valide: true,
    nombre: 8,
  },
  { nom: "charge nulle", charge: null, valide: false },
  { nom: "liste absente", charge: {}, valide: false },
  { nom: "liste remplacée par une chaîne", charge: charge("aucune"), valide: false },
  { nom: "remarque nulle", charge: charge([null]), valide: false },
  { nom: "genre inconnu", charge: charge([{ ...forme, genre: "EXCELLENTE" }]), valide: false },
  {
    nom: "genre déterministe réservé",
    charge: charge([{ ...forme, genre: "INCOHERENCE_DOSSIER" }]),
    valide: false,
  },
  {
    nom: "titre manquant",
    charge: charge([{ genre: "FORME", corps: "Corrige la phrase." }]),
    valide: false,
  },
  { nom: "titre blanc", charge: charge([{ ...forme, titre: "  " }]), valide: false },
  { nom: "corps manquant", charge: charge([{ genre: "FORME", titre: "Phrase" }]), valide: false },
  { nom: "corps non textuel", charge: charge([{ ...forme, corps: 12 }]), valide: false },
  { nom: "corps blanc", charge: charge([{ ...forme, corps: "  " }]), valide: false },
  {
    nom: "incohérence sans écarts",
    charge: charge([{ ...incoherence, ecarts: null }]),
    valide: false,
  },
  {
    nom: "incohérence avec un seul écart",
    charge: charge([{ ...incoherence, ecarts: paire.slice(0, 1) }]),
    valide: false,
  },
  {
    nom: "incohérence avec trois écarts",
    charge: charge([{ ...incoherence, ecarts: [...paire, paire[0]] }]),
    valide: false,
  },
  {
    nom: "source vide",
    charge: charge([{ ...incoherence, ecarts: [{ source: " ", valeur: "juillet" }, paire[1]] }]),
    valide: false,
  },
  {
    nom: "valeur vide",
    charge: charge([
      { ...incoherence, ecarts: [paire[0], { source: "Paragraphe 2", valeur: " " }] },
    ]),
    valide: false,
  },
  {
    nom: "écart non textuel",
    charge: charge([{ ...incoherence, ecarts: [paire[0], { source: 42, valeur: "septembre" }] }]),
    valide: false,
  },
  {
    nom: "écarts sur une remarque de forme",
    charge: charge([{ ...forme, ecarts: paire }]),
    valide: false,
  },
  { nom: "liste mixte", charge: charge([forme, { ...incoherence, ecarts: null }]), valide: false },
  { nom: "neuf remarques", charge: charge(Array.from({ length: 9 }, () => forme)), valide: false },
  {
    nom: "erreur après la huitième remarque",
    charge: charge([...Array.from({ length: 8 }, () => forme), null]),
    valide: false,
  },
  {
    nom: "promesse dans le corps",
    charge: charge([{ ...forme, corps: "Ton visa est garanti." }]),
    valide: false,
    motif: "formulation_refusee",
  },
  {
    nom: "promesse dans une source",
    charge: charge([
      { ...incoherence, ecarts: [{ source: "Visa garanti", valeur: "juillet" }, paire[1]] },
    ]),
    valide: false,
    motif: "formulation_refusee",
  },
  {
    nom: "promesse dans une valeur",
    charge: charge([
      { ...incoherence, ecarts: [paire[0], { source: "Paragraphe 2", valeur: "visa garanti" }] },
    ]),
    valide: false,
    motif: "formulation_refusee",
  },
  {
    nom: "liste mixte avec promesse",
    charge: charge([forme, { ...forme, titre: "Visa garanti" }]),
    valide: false,
    motif: "formulation_refusee",
  },
];
