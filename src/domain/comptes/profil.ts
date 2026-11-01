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

/* ------------------------------------------------------------------ *
 * Le numéro Mobile Money — 03/10/2026.
 * ------------------------------------------------------------------ */

/**
 * Le récapitulatif de paiement renvoyait à « Renseigner mon numéro » vers
 * ce profil, qui n'avait aucun champ téléphone : l'API l'acceptait
 * (RG-02.3), l'écran ne le proposait pas.
 *
 * Il n'entre pas dans le décompte des champs : il n'affine pas la
 * checklist, et le compter ferait mentir « Chaque champ rempli affine ta
 * checklist ».
 */
export const CHAMP_TELEPHONE = {
  libelle: "Numéro Mobile Money",
  aide: "Indicatif pays compris : +229 pour le Bénin, +225 pour la Côte d'Ivoire.",
} as const;

/**
 * Le format que l'API exige (`+` puis 8 à 15 chiffres), obtenu à partir de
 * ce qu'on tape d'habitude : espaces, points et tirets retirés. « 00 »
 * initial lu comme « + ». Rien d'autre n'est deviné : pas d'indicatif
 * ajouté à un numéro local, ce serait choisir le pays à la place de la
 * personne.
 */
export function normaliserTelephone(valeur: string): string {
  const net = valeur.replace(/[\s.\-()]/gu, "");
  return net.startsWith("00") ? `+${net.slice(2)}` : net;
}

/** Format international partagé par le profil et l’inscription ; aucun pays deviné. */
export const TELEPHONE_INTERNATIONAL = /^\+[1-9]\d{7,14}$/u;

/* ------------------------------------------------------------------ *
 * L'identité du compte — S.210, écran « Mon compte » (/compte).
 * ------------------------------------------------------------------ */

/**
 * C-02 (`/profil`) porte ce qui affine la checklist ; « Mon compte » porte
 * qui est la personne : prénom, nom, nom affiché, téléphone, date de
 * naissance, pays de résidence, langue et fuseau. Les deux écrans écrivent
 * les mêmes colonnes `firstName`, `lastName` et `phone` : il n'y a qu'une
 * identité, et chaque écran la relit en base à l'ouverture.
 *
 * L'adresse électronique est en lecture seule : elle reçoit la
 * réinitialisation du mot de passe, et la changer depuis une session
 * suffirait à prendre le compte de qui a laissé son téléphone ouvert
 * (`corrigerLAdresse`). Ni photo ni avatar : rien à conserver qui ne
 * serve au dossier.
 *
 * Une facture déjà émise garde l'identité figée à son émission
 * (`billingName`, M.C) : modifier ce profil ne rétroagit sur aucune pièce
 * comptable.
 */

export const BORNES_NOM_AFFICHE = { min: 2, max: 80 } as const;
export const BORNES_PRENOM_NOM = { max: 80 } as const;
export const BORNES_AGE = { min: 13, max: 110 } as const;
/** En dessous, la personne est mineure : aucune proposition commerciale. */
export const AGE_MAJORITE = 18;
/** E.164 : l'indicatif compris, de 8 à 15 chiffres après le « + ». */
export const BORNES_TELEPHONE_CHIFFRES = { min: 8, max: 15 } as const;

/**
 * Les pays couverts et leur indicatif.
 *
 * Ceux d'où partent les candidats — l'UEMOA, dont la devise par défaut est
 * le franc CFA (`deviseParDefaut`), le Cameroun et la RD Congo que les
 * fuseaux proposés couvrent déjà — et ceux où ils partent ou résident.
 * Un téléphone dont l'indicatif n'est pas dans la liste est refusé avec
 * la liste des indicatifs admis : un paiement Mobile Money se fait vers
 * un opérateur de l'un de ces pays.
 */
export const PAYS_DE_RESIDENCE: readonly { code: string; libelle: string; indicatif: string }[] = [
  { code: "BJ", libelle: "Bénin", indicatif: "229" },
  { code: "BF", libelle: "Burkina Faso", indicatif: "226" },
  { code: "CI", libelle: "Côte d'Ivoire", indicatif: "225" },
  { code: "GW", libelle: "Guinée-Bissau", indicatif: "245" },
  { code: "ML", libelle: "Mali", indicatif: "223" },
  { code: "NE", libelle: "Niger", indicatif: "227" },
  { code: "SN", libelle: "Sénégal", indicatif: "221" },
  { code: "TG", libelle: "Togo", indicatif: "228" },
  { code: "CM", libelle: "Cameroun", indicatif: "237" },
  { code: "CD", libelle: "République démocratique du Congo", indicatif: "243" },
  { code: "FR", libelle: "France", indicatif: "33" },
  { code: "BE", libelle: "Belgique", indicatif: "32" },
  { code: "NL", libelle: "Pays-Bas", indicatif: "31" },
  { code: "CA", libelle: "Canada", indicatif: "1" },
];

export const paysCouvert = (code: string): boolean => PAYS_DE_RESIDENCE.some((p) => p.code === code);

/** Les indicatifs admis, du plus long au plus court : « +1 » ne masque pas « +123 ». */
const INDICATIFS = [...new Set(PAYS_DE_RESIDENCE.map((p) => p.indicatif))].sort(
  (a, b) => b.length - a.length,
);

export const indicatifAdmis = (telephone: string): boolean =>
  INDICATIFS.some((i) => telephone.startsWith(`+${i}`));

export const LANGUES_DU_COMPTE: readonly { code: "fr" | "en"; libelle: string }[] = [
  { code: "fr", libelle: "Français" },
  { code: "en", libelle: "Anglais" },
];
export type LangueDuCompte = (typeof LANGUES_DU_COMPTE)[number]["code"];

/**
 * Les autorisations qu'une personne mineure ne peut pas accorder : les
 * propositions de partenaires sont des mises en relation commerciales.
 */
export const CONSENTEMENTS_REFUSES_AU_MINEUR = ["partenaires"] as const;

/** « Awa Koffi » à partir du prénom et du nom ; vide si les deux le sont. */
export const nomAfficheParDefaut = (prenom: string | null | undefined, nom: string | null | undefined): string =>
  [prenom, nom]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" ");

/** `AAAA-MM-JJ` d'une date civile réelle (pas de 31 février). */
export function dateCivile(valeur: string): { annee: number; mois: number; jour: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(valeur);
  if (!m) return null;
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) return null;
  return { annee, mois, jour };
}

/**
 * Âge révolu au jour civil `aujourdhui` (`AAAA-MM-JJ`). Un anniversaire
 * se fête le jour même ; né un 29 février, on prend un an le 1er mars les
 * années non bissextiles.
 */
export function ageAu(naissance: string, aujourdhui: string): number | null {
  const n = dateCivile(naissance);
  const a = dateCivile(aujourdhui);
  if (!n || !a) return null;
  let age = a.annee - n.annee;
  if (a.mois < n.mois || (a.mois === n.mois && a.jour < n.jour)) age -= 1;
  return age;
}

export const estMineur = (naissance: string | null | undefined, aujourdhui: string): boolean => {
  if (!naissance) return false;
  const age = ageAu(naissance, aujourdhui);
  return age !== null && age < AGE_MAJORITE;
};

export interface SaisieDIdentite {
  prenom: string;
  nom: string;
  nomAffiche: string;
  telephone: string;
  /** `AAAA-MM-JJ`, ou vide. */
  dateNaissance: string;
  pays: string;
  langue: string;
  fuseau: string;
}

/** Ce qui s'écrit : `null` vide la colonne. */
export interface IdentiteValidee {
  prenom: string | null;
  nom: string | null;
  nomAffiche: string | null;
  telephone: string | null;
  dateNaissance: string | null;
  pays: string | null;
  langue: LangueDuCompte;
  fuseau: string;
  /** Vrai quand la date de naissance dit moins de dix-huit ans. */
  mineur: boolean;
}

const vide = (v: string): string | null => (v.trim() === "" ? null : v.trim().replace(/\s+/gu, " "));

/**
 * Valide la saisie de « Mon compte ». Chaque refus nomme le champ et dit
 * comment le corriger. La même fonction tourne à l'écran, avant l'envoi,
 * et dans le service serveur, avant l'écriture.
 *
 * `fuseauxAdmis` vient de la liste des rappels (`FUSEAUX_PROPOSES`) : un
 * fuseau par compte, celui des échéances.
 */
export function validerIdentite(
  saisie: SaisieDIdentite,
  aujourdhui: string,
  fuseauxAdmis: readonly string[],
): { ok: true; identite: IdentiteValidee } | { ok: false; champs: Record<string, string> } {
  const champs: Record<string, string> = {};
  const prenom = vide(saisie.prenom);
  const nom = vide(saisie.nom);
  const nomAffiche = vide(saisie.nomAffiche);

  if (prenom && prenom.length > BORNES_PRENOM_NOM.max) {
    champs.prenom = `Le prénom tient en ${BORNES_PRENOM_NOM.max} caractères au plus.`;
  }
  if (nom && nom.length > BORNES_PRENOM_NOM.max) {
    champs.nom = `Le nom tient en ${BORNES_PRENOM_NOM.max} caractères au plus.`;
  }
  if (nomAffiche && (nomAffiche.length < BORNES_NOM_AFFICHE.min || nomAffiche.length > BORNES_NOM_AFFICHE.max)) {
    champs.nomAffiche = `Le nom affiché tient entre ${BORNES_NOM_AFFICHE.min} et ${BORNES_NOM_AFFICHE.max} caractères. Laisse-le vide pour afficher ton prénom et ton nom.`;
  }

  const telephone = saisie.telephone.trim() === "" ? null : normaliserTelephone(saisie.telephone.trim());
  if (telephone) {
    const chiffres = telephone.slice(1);
    if (!telephone.startsWith("+") || !/^\d+$/u.test(chiffres)) {
      champs.telephone = "Commence par « + » et l'indicatif du pays, puis les chiffres : +229 01 23 45 67 89.";
    } else if (
      chiffres.length < BORNES_TELEPHONE_CHIFFRES.min ||
      chiffres.length > BORNES_TELEPHONE_CHIFFRES.max ||
      !TELEPHONE_INTERNATIONAL.test(telephone)
    ) {
      champs.telephone = `Le numéro compte ${chiffres.length} chiffres, indicatif compris : il en faut entre ${BORNES_TELEPHONE_CHIFFRES.min} et ${BORNES_TELEPHONE_CHIFFRES.max}.`;
    } else if (!indicatifAdmis(telephone)) {
      champs.telephone = `Cet indicatif n'est pas celui d'un pays couvert. Indicatifs admis : ${INDICATIFS.slice()
        .sort((a, b) => Number(a) - Number(b))
        .map((i) => `+${i}`)
        .join(", ")}.`;
    }
  }

  const dateNaissance = saisie.dateNaissance.trim() === "" ? null : saisie.dateNaissance.trim();
  let mineur = false;
  if (dateNaissance) {
    const age = ageAu(dateNaissance, aujourdhui);
    if (age === null) {
      champs.dateNaissance = "Saisis une date réelle au format jour, mois, année.";
    } else if (age < BORNES_AGE.min) {
      champs.dateNaissance = `Il faut avoir au moins ${BORNES_AGE.min} ans pour avoir un compte ImmiPro.`;
    } else if (age > BORNES_AGE.max) {
      champs.dateNaissance = `Cette date donne ${age} ans : vérifie l'année saisie.`;
    } else {
      mineur = age < AGE_MAJORITE;
    }
  }

  const pays = saisie.pays.trim() === "" ? null : saisie.pays.trim().toUpperCase();
  if (pays && !paysCouvert(pays)) {
    champs.pays = "Choisis ton pays de résidence dans la liste.";
  }
  const langue = saisie.langue.trim() || "fr";
  if (!LANGUES_DU_COMPTE.some((l) => l.code === langue)) {
    champs.langue = "Choisis Français ou Anglais.";
  }
  const fuseau = saisie.fuseau.trim();
  if (!fuseauxAdmis.includes(fuseau)) {
    champs.fuseau = "Choisis ton fuseau horaire dans la liste : il fixe l'heure de tes rappels.";
  }

  if (Object.keys(champs).length > 0) return { ok: false, champs };
  return {
    ok: true,
    identite: {
      prenom,
      nom,
      nomAffiche,
      telephone,
      dateNaissance,
      pays,
      langue: langue as LangueDuCompte,
      fuseau,
      mineur,
    },
  };
}
