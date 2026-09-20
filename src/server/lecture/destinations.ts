import type { VisaRule } from "@prisma/client";
import { db } from "@/lib/db";
import { mentionDe, payload, reglePubliieParSlug, reglesPubliees, versFiche } from "@/server/acces/regles";
import type { FicheDestination, Mention } from "@/domain/destinations/fiche";
import { versXOF, MENTION_NON_COMPARABLE, type DeviseSource } from "@/domain/format/change";

/**
 * Lecture des destinations, partagée par les pages serveur et les routes.
 *
 * Une seule assemblée, deux points d'entrée. Les routes existent pour les
 * écrans interactifs et pour un client qui ne serait pas cette application ;
 * une page serveur, elle, appelle directement — passer par HTTP pour
 * s'interroger soi-même coûte un aller-retour, oblige à réémettre le cookie
 * de session, et fait dépendre le rendu de sa propre disponibilité.
 *
 * Ce qui compte est qu'il n'y ait **qu'une** assemblée : deux chemins vers
 * la même donnée divergent, et c'est l'écran qui finit par mentir.
 */

export interface FichesPubliees {
  fiches: FicheDestination[];
  mention: Mention | null;
}

export async function fichesPubliees(): Promise<FichesPubliees> {
  const regles = await reglesPubliees();
  const fiches = regles.map(versFiche).filter((f): f is FicheDestination => f !== null);
  return { fiches, mention: mentionLaPlusAncienne(fiches) };
}

/**
 * La mention d'un ensemble de fiches porte la **plus ancienne** vérification,
 * pas la plus récente. Un bloc de trois destinations dont l'une a été relue
 * il y a trois mois n'est pas « vérifié aujourd'hui » : la date affichée doit
 * être celle qui engage le moins.
 */
export function mentionLaPlusAncienne(fiches: readonly FicheDestination[]): Mention | null {
  if (fiches.length === 0) return null;
  const sources = [...new Set(fiches.map((f) => f.mention.source))].sort();
  const verifieeLe = fiches
    .map((f) => f.mention.verifieeLe)
    .sort()
    .at(0)!;
  return { source: sources.join(", "), verifieeLe };
}

export const ficheParSlugPubliee = async (slug: string): Promise<FicheDestination | null> => {
  const regle = await reglePubliieParSlug(slug);
  return regle ? versFiche(regle) : null;
};

export interface Vedette {
  fiche: FicheDestination;
  cout: string;
  fenetre: string;
}

export interface Vedettes {
  destinations: Vedette[];
  /**
   * Intitulé du bloc. Il suit la donnée : « les plus demandées » n'est
   * écrit que s'il y a de quoi le mesurer.
   */
  intitule: string;
  mention: Mention | null;
}

/**
 * Seuil en deçà duquel un classement par demande ne veut rien dire.
 *
 * Trente dossiers ouverts, c'est peu pour trancher entre trois pays ; en
 * deçà, l'ordre reflèterait le hasard des premiers inscrits. Le bloc
 * s'appelle alors « Destinations couvertes », ce qui est exactement vrai, au
 * lieu d'annoncer une popularité que personne n'a mesurée. C'est la même
 * discipline que partout ailleurs ici : le mot suit la donnée.
 */
export const DOSSIERS_POUR_CLASSER = 30;

export async function destinationsEnVedette(combien = 3): Promise<Vedettes> {
  const { fiches } = await fichesPubliees();
  if (fiches.length === 0) return { destinations: [], intitule: "Destinations couvertes", mention: null };

  const ouverts = await db.application.groupBy({
    by: ["visaRuleId"],
    where: { visaRuleId: { not: null } },
    _count: { _all: true },
  });
  const total = ouverts.reduce((n, o) => n + o._count._all, 0);

  const regles = await reglesPubliees();
  const demandeParSlug = new Map<string, number>();
  for (const regle of regles) {
    const fiche = versFiche(regle);
    if (!fiche) continue;
    const compte = ouverts.find((o) => o.visaRuleId === regle.id)?._count._all ?? 0;
    demandeParSlug.set(fiche.slug, (demandeParSlug.get(fiche.slug) ?? 0) + compte);
  }

  const classable = total >= DOSSIERS_POUR_CLASSER;
  const ordonnees = classable
    ? [...fiches].sort(
        (a, b) => (demandeParSlug.get(b.slug) ?? 0) - (demandeParSlug.get(a.slug) ?? 0),
      )
    : fiches;

  const retenues = ordonnees.slice(0, combien);
  return {
    destinations: retenues.map((fiche) => ({
      fiche,
      cout: libelleCout(regles.find((r) => versFiche(r)?.slug === fiche.slug)),
      fenetre: libelleFenetre(regles.find((r) => versFiche(r)?.slug === fiche.slug)),
    })),
    intitule: classable ? "Destinations les plus demandées" : "Destinations couvertes",
    mention: mentionLaPlusAncienne(retenues),
  };
}

/**
 * Coût de la première année, en francs CFA. Quand la monnaie de publication
 * n'a pas de parité sûre, la phrase le dit au lieu d'un montant approché.
 */
function libelleCout(regle: VisaRule | undefined): string {
  if (!regle) return MENTION_NON_COMPARABLE;
  const p = payload(regle);
  const scolarite = p.frais_scolarite
    ? versXOF(
        p.frais_scolarite.periodicite === "mensuel"
          ? p.frais_scolarite.min * 12
          : p.frais_scolarite.min,
        p.frais_scolarite.devise as DeviseSource,
      )
    : 0;
  const fonds = p.preuve_fonds
    ? versXOF(
        p.preuve_fonds.periodicite === "mensuel"
          ? p.preuve_fonds.valeur * 12
          : p.preuve_fonds.valeur,
        p.preuve_fonds.devise as DeviseSource,
      )
    : 0;
  if (scolarite === null || fonds === null) return MENTION_NON_COMPARABLE;
  const total = scolarite + fonds;
  if (total === 0) return "Montants non publiés par l'autorité.";
  // Arrondi à la centaine de milliers : le total est une somme d'ordres de
  // grandeur, l'écrire au franc près lui donnerait une précision qu'il n'a pas.
  const arrondi = Math.round(total / 100_000) * 100_000;
  return `Environ ${new Intl.NumberFormat("fr-FR").format(arrondi)} F par an, frais et vie courante`;
}

function libelleFenetre(regle: VisaRule | undefined): string {
  if (!regle) return "";
  const apres = payload(regle).apres_etudes;
  if (!apres?.dispositif) return "Aucun dispositif après le diplôme";
  return apres.duree_mois
    ? `Fenêtre après diplôme : ${apres.duree_mois} mois`
    : `Fenêtre après diplôme : ${apres.dispositif}`;
}

/**
 * Une cellule de tableau porte une valeur, pas une phrase. Le motif exact —
 * monnaie sans parité sûre, montants non publiés — vit sur la fiche, où il y
 * a la place de le lire. Dans le tableau, une phrase de trois lignes écrase
 * les colonnes voisines et rend la comparaison illisible.
 */
function coutEnCellule(libelle: string): string {
  if (libelle === MENTION_NON_COMPARABLE) return "Non comparable";
  if (libelle.startsWith("Montants non publiés")) return "Non publié";
  return libelle.replace(/^Environ /u, "").replace(/ par an.*$/u, "");
}

/** Critères comparés sur C-03, dans l'ordre où ils écartent une destination. */
export const CRITERES = [
  { cle: "cout", intitule: "Coût 1re année" },
  { cle: "ressources", intitule: "Ressources à prouver" },
  { cle: "travail", intitule: "Travail étudiant" },
  { cle: "apres", intitule: "Après diplôme" },
  { cle: "delai", intitule: "Délai d'instruction" },
  { cle: "langue", intitule: "Langue du cursus" },
  { cle: "frais", intitule: "Frais de demande" },
] as const;

export type CleCritere = (typeof CRITERES)[number]["cle"];

export interface Comparaison {
  fiches: FicheDestination[];
  valeurs: Record<string, Record<CleCritere, string>>;
  mention: Mention | null;
  /**
   * Le critère qui se lit de travers, expliqué **depuis le tableau affiché**
   * et non depuis un texte écrit à l'avance. Celui du prototype citait
   * l'Allemagne et le Canada, qui ne sont pas comparés ici : un encadré qui
   * parle de colonnes absentes fait douter de celles qui sont là.
   */
  lectureAttentive: { titre: string; texte: string } | null;
}

/**
 * Tableau du comparateur — C-03.
 *
 * Toutes les valeurs viennent du référentiel : le prototype les écrivait à
 * la main, et trois d'entre elles avaient déjà divergé de la fiche qu'elles
 * résumaient. Un comparateur qui contredit la fiche qu'il compare est pire
 * qu'un comparateur absent.
 */
export async function comparaison(slugs: readonly string[]): Promise<Comparaison> {
  const regles = await reglesPubliees();
  const retenues = regles.filter((r) => {
    const fiche = versFiche(r);
    return fiche !== null && slugs.includes(fiche.slug);
  });

  const valeurs: Record<string, Record<CleCritere, string>> = {};
  const fiches: FicheDestination[] = [];

  for (const regle of retenues) {
    const fiche = versFiche(regle);
    if (!fiche) continue;
    fiches.push(fiche);
    const p = payload(regle);
    valeurs[fiche.slug] = {
      // Une cellule de tableau porte une valeur, pas une phrase. Le motif
      // de non-comparabilité est renvoyé au libellé court ; l'explication
      // entière vit sur la fiche, où il y a la place de la lire.
      cout: coutEnCellule(libelleCout(regle)),
      ressources: p.preuve_fonds
        ? `${new Intl.NumberFormat("fr-FR").format(p.preuve_fonds.valeur)} ${p.preuve_fonds.devise}${
            p.preuve_fonds.periodicite === "mensuel" ? " / mois" : " / an"
          }`
        : "Non exigé",
      travail: fiche.travailEtudiant,
      apres: p.apres_etudes?.duree_mois ? `${p.apres_etudes.duree_mois} mois` : "Aucun dispositif",
      delai: p.delai_traitement_jours
        ? `${p.delai_traitement_jours.min} à ${p.delai_traitement_jours.max} jours`
        : "Non communiqué",
      langue: p.niveau_langue_min
        ? `${p.langues_acceptees.join(", ")} — ${p.niveau_langue_min}`
        : p.langues_acceptees.join(", "),
      frais: p.frais_dossier
        ? `${new Intl.NumberFormat("fr-FR").format(p.frais_dossier.valeur)} ${p.frais_dossier.devise}`
        : "Aucun",
    };
  }

  return {
    fiches,
    valeurs,
    mention: mentionLaPlusAncienne(fiches),
    lectureAttentive: lectureAttentive(retenues),
  };
}

/**
 * RG-03.3 : le permis employeur est la ligne qui se lit de travers. Le droit
 * au travail appartient à l'employeur et non à l'étudiant, et beaucoup de
 * petits employeurs refusent la démarche. L'encadré ne le dit que si le
 * tableau montre réellement un contraste — sinon il n'explique rien.
 */
function lectureAttentive(regles: readonly VisaRule[]): Comparaison["lectureAttentive"] {
  const avec: string[] = [];
  const sans: string[] = [];
  for (const regle of regles) {
    const fiche = versFiche(regle);
    if (!fiche) continue;
    (payload(regle).travail_autorise.permis_employeur_requis ? avec : sans).push(fiche.pays);
  }
  if (avec.length === 0) return null;

  const nommer = (liste: readonly string[]) => [...new Set(liste)].join(", ");
  const contraste =
    sans.length > 0
      ? ` En revanche, ${nommer(sans)} n'exige aucune autorisation séparée.`
      : "";

  return {
    titre: "Le travail étudiant se lit de près",
    texte: `${nommer(avec)} : c'est l'employeur qui demande le permis de travail à ton nom, et beaucoup de petits employeurs refusent cette démarche.${contraste}`,
  };
}

export const mentionDeLaRegle = mentionDe;
