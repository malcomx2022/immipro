/** S.179 : bibliothèque locale validée, jamais une URL saisie ou un portrait réel. */
export interface PhotoPublique {
  code: string;
  bureau: string;
  mobile: string;
  vignette: string;
  alt: string;
  cadrage: string;
}

function photo(code: string, alt: string, cadrage = "object-center"): PhotoPublique {
  return {
    code,
    bureau: `/photos/${code}-bureau.webp`,
    mobile: `/photos/${code}-mobile.webp`,
    vignette: `/photos/${code}-vignette.webp`,
    alt,
    cadrage,
  };
}

export const PHOTOS = {
  accueil: photo(
    "accueil",
    "Deux personnes préparent leur projet sur un ordinateur.",
    "object-photo-accueil",
  ),
  preparation: photo(
    "preparation",
    "Une femme relit des documents à côté de son ordinateur.",
    "object-photo-preparation",
  ),
  paysBas: photo(
    "pays-bas",
    "Un étudiant marche près d’un canal dans un cadre néerlandais.",
    "object-photo-pays",
  ),
  suisse: photo(
    "suisse",
    "Une étudiante marche au bord d’un lac dans un cadre suisse.",
    "object-photo-pays",
  ),
  accompagnement: photo("accompagnement", "Deux personnes relisent des documents ensemble."),
} as const;

const PAYS = new Map<string, PhotoPublique>([
  ["NL", PHOTOS.paysBas],
  ["CH", PHOTOS.suisse],
]);
const GUIDES = new Map<string, PhotoPublique>([
  ["pays-bas", PHOTOS.paysBas],
  ["suisse", PHOTOS.suisse],
]);
// Association éditoriale explicite. Un nouveau slug ne reçoit pas une image
// arbitraire. Ceci ne crée ni guide ni article : les gardes PUBLIE demeurent.
const ARTICLES = new Map<string, PhotoPublique>([
  ["releve-bancaire-quatre-mois", PHOTOS.preparation],
  ["preparer-ses-pieces", PHOTOS.preparation],
  ["relire-ses-documents", PHOTOS.accompagnement],
]);

export const photoDuPays = (code: string): PhotoPublique | undefined => PAYS.get(code);
export const photoEditoriale = (
  genre: "GUIDE" | "ARTICLE",
  slug: string,
): PhotoPublique | undefined => (genre === "GUIDE" ? GUIDES : ARTICLES).get(slug);
