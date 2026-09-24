/**
 * Profil candidat — WF-02, écran C-02.
 *
 * Le prototype affichait « Profil rempli 80 % ». Le pourcentage tombe sous
 * l'arbitrage C-09 comme la note de dossier : il ne dit pas quoi faire, et il
 * se lit comme une évaluation. Le décompte du prototype — « Il manque 1 champ »
 * — dit la même chose en mieux, et c'est lui qui reste.
 *
 * ── Quatre des sept champs n'allaient nulle part ────────────────────
 *
 * L'écran affichait sept champs, en comptait sept dans « 4 à renseigner »,
 * et concluait « Profil complet. Ta checklist tient compte de toutes ces
 * informations. » Son bouton « Enregistrer » en composait **trois** :
 *
 *     champs affichés par C-02 : nom, naissance, nationalite, diplome,
 *                                anglais, personnesACharge, refusAnterieur
 *     champs que « Enregistrer » compose : nom, diplome, anglais
 *     jetés en silence : naissance, nationalite, personnesACharge,
 *                        refusAnterieur
 *
 * Les quatre n'avaient pas non plus de colonne : ni `User` ni `Profile` ne
 * porte une date de naissance, une nationalité, un nombre de personnes à
 * charge ou un refus antérieur, et aucune règle du référentiel ne s'appuie
 * dessus. Le candidat les saisissait, lisait « Profil enregistré. », et les
 * retrouvait vides au rechargement. « Personnes à charge » annonçait même
 * ce qu'il faisait — « modifie les montants de ressources à prouver » —
 * sans que rien ne le lise.
 *
 * ── Arbitrage laissé au propriétaire ────────────────────────────────
 *
 * Les rétablir demande de décider ce qui n'est pas au code : une date de
 * naissance et un refus de visa antérieur sont des données personnelles, et
 * leur durée de conservation fait partie des rétentions par état qui
 * restent à trancher (INV-5). Les inventer au passage ferait décider ici de
 * ce qu'on garde et combien de temps. La liste ne porte donc, pour
 * l'instant, que ce que le produit sait garder.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type CleChampProfil = "nom" | "diplome" | "anglais";

export interface ChampProfil {
  cle: CleChampProfil;
  libelle: string;
  section: "Identité" | "Parcours";
  /** Précision affichée sous le champ, quand elle évite une erreur. */
  aide?: string;
}

export const CHAMPS_PROFIL: readonly ChampProfil[] = [
  { cle: "nom", libelle: "Prénom et nom", section: "Identité" },
  { cle: "diplome", libelle: "Plus haut diplôme obtenu", section: "Parcours" },
  { cle: "anglais", libelle: "Niveau d'anglais attesté", section: "Parcours" },
];

export type Profil = Partial<Record<CleChampProfil, string>>;

/**
 * Le corps envoyé au serveur, composé à partir de ce que l'écran affiche.
 *
 * ── Pourquoi la composition vit ici ─────────────────────────────────
 *
 * Elle était écrite à la main dans `Profil.tsx`, en quatre lignes qui
 * nommaient chacune une clé du contrat. Rien ne reliait ces quatre lignes
 * aux sept champs affichés juste au-dessus : c'est exactement par là que
 * les quatre orphelins sont passés, et ils y seraient restés aussi
 * longtemps que personne n'aurait compté les deux listes.
 *
 * Ici, le `Record` est exhaustif sur `CleChampProfil` : un champ ajouté à
 * l'écran sans destination ne compile plus.
 *
 * **Toutes les clés sont toujours présentes**, vides comprises. Un champ
 * omis laisse la colonne intacte côté serveur — c'est ce qui protège les
 * réponses du simulateur —, si bien qu'omettre un champ vidé le rendrait
 * ineffaçable. Vider un champ est un geste, et il doit partir.
 */
export interface CorpsDuProfil {
  prenom: string;
  nom: string;
  diplome: string;
  langues: Record<string, string>;
}

/**
 * Le champ « Prénom et nom » est un seul champ à l'écran et deux colonnes
 * en base. La coupure se fait au premier blanc : c'est une convention, et
 * elle vaut mieux que deux champs pour une personne qui écrit son nom
 * d'un trait.
 */
const couperLeNom = (valeur: string): { prenom: string; nom: string } => {
  const [prenom = "", ...reste] = valeur.trim().split(/\s+/u);
  return { prenom, nom: reste.join(" ") };
};

export function corpsDuProfil(profil: Profil): CorpsDuProfil {
  return {
    ...couperLeNom(profil.nom ?? ""),
    diplome: (profil.diplome ?? "").trim(),
    langues: { en: (profil.anglais ?? "").trim() },
  };
}

const renseigne = (valeur: string | undefined): boolean =>
  typeof valeur === "string" && valeur.trim().length > 0;

export const champsRenseignes = (profil: Profil): number =>
  CHAMPS_PROFIL.filter((c) => renseigne(profil[c.cle])).length;

export const champsRestants = (profil: Profil): number =>
  CHAMPS_PROFIL.length - champsRenseignes(profil);

export const profilComplet = (profil: Profil): boolean => champsRestants(profil) === 0;

/**
 * Ce qui remplace « 80 % » : un décompte, et ce qu'il apporte. Le message dit
 * à quoi sert le champ suivant, pas où en est une jauge.
 */
export function libelleAvancementProfil(profil: Profil): string {
  const restants = champsRestants(profil);
  if (restants === 0) {
    return "Profil complet. Ta checklist tient compte de toutes ces informations.";
  }
  const champs = restants > 1 ? `${restants} champs` : "1 champ";
  return `Il manque ${champs}. Chaque champ rempli affine ta checklist.`;
}
