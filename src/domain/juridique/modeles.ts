import type { Bloc } from "@/domain/editorial/document";
import { CONSULTATION, CONSULTATION_ANNULATION_HEURES, PACKS, RECHARGE_ANALYSES, analysesParDestination } from "@/domain/payments/pricing";
import { ANALYSES_AJOUTEES, LIBELLE_MONTEE, prixDeLaMontee, PACK_DE_DEPART } from "@/domain/payments/montee";

/**
 * Les quatre textes juridiques, en modèles — S.101.
 *
 * ── D'où ils viennent ───────────────────────────────────────────────
 *
 * Des brouillons de S.97 (`docs/juridique/*.brouillon.md`), qui décrivent
 * le produit tel qu'il est codé et dont chaque affirmation porte sa source
 * dans le code. Chaque `[À COMPLÉTER]` et chaque `[À TRANCHER]` y est
 * devenu une variable (`variables.ts`), saisie dans le back-office.
 *
 * ── Ce qui protège ce texte ─────────────────────────────────────────
 *
 * - **Il ne se publie pas seul.** Une page n'est servie qu'après un acte
 *   de validation tracé dans le back-office : qui a validé, qui a relu,
 *   quand. Aucun drapeau dans ce fichier ne le remplace (Q.A).
 * - **Il ne change pas en silence.** Son empreinte (`rendu.ts`) est
 *   enregistrée à chaque validation. Modifier un mot ici fait passer la
 *   version publiée « à revalider » : la page continue de servir le texte
 *   validé, jamais le nouveau.
 * - **Il ne promet rien.** Le vocabulaire interdit est vérifié sur le
 *   texte rendu, variables comprises, avant toute publication.
 *
 * Les blocs sont ceux des documents éditoriaux (B-08), rendus par le même
 * composant. `{{cle}}` désigne une variable ; un paragraphe ou un élément
 * de liste réduit à `{{cle}}` reçoit une variable de plusieurs lignes et
 * se déplie en autant de paragraphes ou d'éléments.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export const PAGES_JURIDIQUES = ["mentions-legales", "conditions", "donnees-personnelles", "contact"] as const;
export type PageJuridique = (typeof PAGES_JURIDIQUES)[number];

export const estUnePageJuridique = (valeur: string): valeur is PageJuridique =>
  (PAGES_JURIDIQUES as readonly string[]).includes(valeur);

export interface ModeleJuridique {
  page: PageJuridique;
  adresse: `/${PageJuridique}`;
  titre: string;
  chapeau: string;
  blocs: readonly Bloc[];
}

/* ------------------------------------------------------------------ *
 * Ce que le produit sait lui-même, et qui ne se saisit donc pas.
 * ------------------------------------------------------------------ */

const xof = (n: number) => `${n.toLocaleString("fr-FR")} F`;
const eur = (n: number) => `${n.toLocaleString("fr-FR")} €`;

/**
 * Les variables tirées du code. La grille des prix est celle que
 * l'écran de paiement facture : la recopier ici la ferait diverger au
 * premier changement de tarif.
 */
export function variablesDuProduit(): Record<string, string> {
  const depart = PACKS.find((p) => p.code === PACK_DE_DEPART)!;
  const grille = [
    ...PACKS.map((p) => {
      const parDestination = p.destinations > 1 ? ` (${analysesParDestination(p)} par destination)` : "";
      const redaction = p.redactionAssistee ? ", rédaction assistée" : "";
      const destinations = p.destinations > 1 ? `${p.destinations} destinations` : "1 destination";
      return `Pack ${p.libelle} — ${xof(p.prix.XOF)} ou ${eur(p.prix.EUR)} : ${destinations}, ${p.analyses} analyses de pièces${parDestination}${redaction}.`;
    }),
    `Recharge — ${xof(RECHARGE_ANALYSES.prix.XOF)} ou ${eur(RECHARGE_ANALYSES.prix.EUR)} : ${RECHARGE_ANALYSES.volume} analyses supplémentaires pour un dossier ouvert.`,
    `${LIBELLE_MONTEE} — ${xof(prixDeLaMontee({ montant: depart.prix.XOF, devise: "XOF" }))} ou ${eur(prixDeLaMontee({ montant: depart.prix.EUR, devise: "EUR" }))} : la différence avec le pack réellement payé, ${ANALYSES_AJOUTEES} analyses de plus et la rédaction assistée.`,
    `Consultation — ${xof(CONSULTATION.prix.XOF)} ou ${eur(CONSULTATION.prix.EUR)} : ${CONSULTATION.volume} minutes avec un consultant habilité.`,
  ];
  return {
    grille_des_prix: grille.join("\n"),
    annulation_consultation: `${CONSULTATION_ANNULATION_HEURES} heures`,
  };
}

/** Les clés que le produit fournit : elles ne se saisissent pas dans le back-office. */
export const CLES_DU_PRODUIT = ["grille_des_prix", "annulation_consultation"] as const;

/* ------------------------------------------------------------------ *
 * Les textes.
 * ------------------------------------------------------------------ */

const p = (texte: string): Bloc => ({ type: "paragraphe", texte });
const h = (texte: string): Bloc => ({ type: "intertitre", texte });
const l = (...items: string[]): Bloc => ({ type: "liste", items });
const e = (titre: string, texte: string): Bloc => ({ type: "encadre", titre, texte });

const MENTIONS_LEGALES: ModeleJuridique = {
  page: "mentions-legales",
  adresse: "/mentions-legales",
  titre: "Mentions légales",
  chapeau: "Qui édite ImmiPro, qui l'héberge, et ce que la plateforme fait et ne fait pas.",
  blocs: [
    h("Éditeur de la plateforme"),
    p("La plateforme ImmiPro est éditée par :"),
    l(
      "Dénomination sociale : {{denomination}}",
      "Forme juridique : {{forme_juridique}}",
      "Capital social : {{capital_social}}",
      "Siège social : {{siege_social}}",
      "Immatriculation : RCCM {{rccm}}",
      "Identifiant fiscal unique (IFU) : {{ifu}}",
      "Adresse électronique : {{email_contact}}",
      "Téléphone : {{telephone}}",
    ),
    p("Directeur de la publication : {{directeur_publication}}"),
    h("Hébergement"),
    p("La plateforme et ses données sont hébergées sur un serveur loué à {{hebergeur}}, {{hebergeur_adresse}}. Le centre de données se trouve en {{hebergeur_pays}}."),
    p("Les pièces déposées sont stockées sur ce même serveur, dans un espace de stockage privé qui n'est jamais accessible directement depuis Internet. Le serveur porte aussi le moteur antivirus qui contrôle chaque fichier déposé."),
    h("Objet de la plateforme"),
    p("ImmiPro informe sur les conditions de séjour de destinations d'études et d'emploi, et aide les candidats à préparer leur dossier : liste des pièces, vérification de leur conformité, complétude du dossier, rédaction assistée des pièces écrites, échéancier."),
    p("ImmiPro n'est ni un cabinet d'avocats, ni un conseil en immigration. La plateforme ne délivre aucun conseil juridique. Elle ne dépose aucune demande à la place du candidat et ne se prononce pas sur la décision de l'administration. Elle n'est affiliée à aucune administration, ambassade ou autorité d'immigration."),
    p("Chaque information réglementaire affichée porte sa source officielle et la date de sa dernière vérification."),
    h("Propriété intellectuelle"),
    p("La structure de la plateforme, ses textes, ses fiches et guides, ses éléments graphiques et son logotype sont la propriété de l'éditeur ou font l'objet d'une autorisation d'usage. Toute reproduction, représentation ou réutilisation, totale ou partielle, sans autorisation écrite est interdite."),
    p("{{marque}}"),
    p("Les documents déposés et les textes rédigés par un candidat restent les siens, comme le précisent les conditions d'utilisation et de vente."),
    h("Données personnelles"),
    p("Le traitement des données personnelles est décrit dans la page « Données personnelles » : finalités, bases légales, destinataires et sous-traitants, durées de conservation, et façon d'exercer vos droits."),
    h("Cookies"),
    p("La plateforme dépose un seul cookie, strictement nécessaire à son fonctionnement : « immipro_session », qui maintient votre connexion à votre espace. Il dure 30 jours au plus, et la session se ferme après 7 jours sans activité. Il n'est lisible que par la plateforme."),
    p("Aucun outil de mesure d'audience, de publicité ou de suivi n'est utilisé."),
    h("Contact"),
    p("Pour toute question sur la plateforme ou ces mentions : {{email_contact}}. Nous répondons dans un délai de {{delai_reponse}}."),
  ],
};

const CONDITIONS: ModeleJuridique = {
  page: "conditions",
  adresse: "/conditions",
  titre: "Conditions d'utilisation et de vente",
  chapeau: "Ce que fait ImmiPro, ce qu'elle ne fait pas, ce que coûtent ses services et comment ils se remboursent.",
  blocs: [
    h("1. Objet"),
    p("Les présentes conditions régissent l'utilisation de la plateforme ImmiPro et l'achat de ses services, entre {{denomination}} (« ImmiPro »), désignée dans les mentions légales, et toute personne qui crée un compte (« le candidat »)."),
    p("Créer un compte, puis payer un service, suppose de les avoir lues et acceptées. Chaque acceptation est enregistrée avec la version des conditions acceptée et sa date."),
    h("2. Ce que fait ImmiPro"),
    p("ImmiPro est une plateforme d'information et de préparation de dossier. Elle propose :"),
    l(
      "un simulateur qui situe un profil par rapport aux conditions publiées de destinations d'études et d'emploi ;",
      "des fiches par destination, chacune portant sa source officielle et la date de sa dernière vérification ;",
      "pour chaque dossier ouvert, une liste des pièces à réunir, établie d'après la règle en vigueur le jour de l'ouverture ;",
      "l'analyse des pièces déposées : lecture automatique, assistée par un service d'intelligence artificielle, et contrôles de conformité (dates de validité, montants, cohérence entre pièces). Une pièce que l'analyse ne peut pas lire passe en revue humaine ;",
      "la complétude du dossier, qui indique les pièces manquantes ou à corriger ;",
      "la rédaction assistée des pièces écrites (lettre de motivation, plan d'études…), selon le pack choisi ;",
      "un échéancier et des rappels, dans l'application et par courriel ;",
      "la mise en relation avec des consultants dont l'habilitation a été vérifiée, quand ce service est ouvert pour la destination.",
    ),
    h("3. Ce qu'ImmiPro ne fait pas"),
    l(
      "ImmiPro ne délivre aucun conseil juridique. Ni ImmiPro ni ses services ne remplacent un avocat ou un conseil habilité.",
      "ImmiPro ne se prononce pas sur la décision de l'administration, et ne garantit ni l'obtention d'un visa ou d'un titre de séjour, ni un délai de traitement. La complétude du dossier indique ce qui manque à un dossier ; elle n'est pas une appréciation de son issue.",
      "ImmiPro ne dépose aucune demande à la place du candidat, ne remplit ni ne soumet aucun formulaire officiel, et n'agit pas auprès des administrations en son nom.",
      "ImmiPro n'est affiliée à aucune administration, ambassade ou autorité d'immigration.",
      "Les frais de demande dus à l'administration, aux ambassades ou aux prestataires de visa ne sont pas compris dans les prix d'ImmiPro et se paient directement à ces organismes.",
    ),
    h("4. Informations réglementaires"),
    p("Les règles affichées sont relevées sur des sources officielles ou institutionnelles. Chacune porte sa source et sa date de vérification, et une fiche qui n'a pas été relue à l'échéance prévue est retirée de l'affichage jusqu'à sa relecture. Une règle relevée uniquement sur une source secondaire n'est jamais affichée."),
    p("Les règles évoluent. Un dossier ouvert reste établi d'après la version de la règle en vigueur le jour de son ouverture. Si la règle change, le candidat en est averti et choisit de garder la version d'origine ou de passer à la nouvelle. Il appartient au candidat de vérifier, avant tout dépôt, les exigences en vigueur auprès de l'autorité compétente."),
    h("5. Compte"),
    l(
      "La connexion se fait par adresse électronique et mot de passe. L'adresse doit être vérifiée.",
      "Le candidat fournit des informations exactes et garde ses identifiants confidentiels. Il signale sans délai tout usage qu'il n'a pas autorisé.",
      "La plateforme est proposée en français. Les dates et heures affichées sont celles de Cotonou, sauf les rappels, qui suivent le fuseau choisi par le candidat.",
    ),
    p("{{age_minimum}}"),
    h("6. Pièces déposées et rédaction assistée"),
    l(
      "Consentement préalable. Le dépôt de pièces d'identité suppose un consentement distinct, recueilli avant tout dépôt et révocable à tout moment. Le retirer arrête les nouveaux dépôts et les analyses en cours.",
      "Contrôle antivirus. Chaque fichier est contrôlé avant d'être accepté. Tant que le contrôle n'a pas conclu, le fichier reste à l'écart, et un fichier signalé est refusé.",
      "Analyse par un service d'intelligence artificielle. La lecture des pièces et la rédaction assistée font appel à un prestataire d'intelligence artificielle, qui agit comme sous-traitant. Les pièces d'identité ne sont confiées qu'au prestataire désigné à cet effet, sauf autorisation écrite pour un autre. Les prestataires sont nommés dans la page « Données personnelles ».",
      "Responsabilité du contenu. Le candidat est seul responsable de l'authenticité et de l'exactitude des pièces qu'il dépose.",
      "Textes rédigés. Un texte proposé par la rédaction assistée reste celui du candidat. Il le relit, le corrige et l'assume avant de le déposer. La relecture automatique relève des incohérences ; elle ne juge pas un dossier.",
      "Quota d'analyses. Chaque pack comprend un nombre d'analyses. Chaque appel au service d'intelligence artificielle est décompté du pack. Une analyse qui n'a rien rendu est restituée.",
    ),
    h("7. Offres et prix"),
    p("Les prix sont affichés dans la devise du compte : franc CFA (XOF) ou euro (EUR). Ce sont deux grilles distinctes, et non une conversion. {{mention_tva}}"),
    l("{{grille_des_prix}}"),
    l(
      "Un pack est un paiement unique, valable jusqu'à la clôture du dossier. Il n'y a ni abonnement ni reconduction.",
      "Le passage au pack supérieur n'est possible qu'une fois par achat, tant que le pack d'origine n'est ni remboursé ni en cours de remboursement.",
      "L'écriture et la modification de ses propres textes, la conservation de leurs versions et leur export restent ouverts à tous, quel que soit le pack.",
    ),
    h("8. Paiement"),
    l(
      "Le moyen de paiement dépend de la devise : Mobile Money pour le franc CFA, carte bancaire pour l'euro. Les paiements sont traités par des prestataires de paiement agréés, FedaPay et Stripe. ImmiPro ne reçoit ni ne conserve les données de carte ou de compte Mobile Money.",
      "Le récapitulatif indique le montant avant toute confirmation. Aucun montant n'est débité avant la confirmation du candidat.",
      "Un paiement n'est tenu pour acquis qu'à réception de la confirmation du prestataire de paiement. Tant qu'elle n'est pas reçue, le service acheté n'est pas ouvert.",
      "Un reçu est émis pour chaque paiement confirmé.",
    ),
    p("{{piece_comptable}}"),
    h("9. Droit de rétractation"),
    p("{{retractation}}"),
    h("10. Remboursements"),
    l(
      "Pack non entamé. Le remboursement retire l'intégralité des analyses du pack.",
      "Passage au pack supérieur. Le supplément est remboursé tant que les analyses ajoutées sont intactes et qu'aucune rédaction assistée n'a servi depuis le passage. Sinon, la demande est examinée par l'équipe. Le pack d'origine ne peut être remboursé seul tant que le passage n'a pas été remboursé.",
      "Consultation. Elle s'annule ou se reporte sans frais jusqu'à {{annulation_consultation}} avant le rendez-vous. Au-delà, elle est due.",
      "Ce qui reste acquis. Un remboursement retire les droits non consommés dès qu'il est engagé. Les réponses, textes et versions du candidat ne sont jamais retirés.",
      "Versement. Le remboursement est versé sur le moyen de paiement utilisé. Il n'est tenu pour effectué qu'à la confirmation du prestataire, et peut mettre quelques jours à apparaître selon la banque ou l'opérateur.",
    ),
    p("{{remboursement_entame}}"),
    p("{{remboursement_mobile_money}}"),
    p("{{remboursement_demande}}"),
    h("11. Consultants"),
    p("Quand la mise en relation est ouverte, ImmiPro intervient comme intermédiaire. La consultation est rendue par le consultant, dont ImmiPro a vérifié l'habilitation pour la destination concernée. Le conseil donné pendant le rendez-vous engage le consultant, et non ImmiPro."),
    p("{{mandat_consultant}}"),
    p("Le candidat peut partager son dossier avec le consultant. Ce partage est révocable à tout moment et prend fin 14 jours après le rendez-vous."),
    h("12. Durée, clôture et conservation"),
    p("Les présentes conditions s'appliquent tant que le compte existe. Les durées de conservation des pièces, des consentements et des écritures sont détaillées dans la page « Données personnelles ». Toute suppression de pièces programmée est annoncée au moins 30 jours à l'avance."),
    p("Le candidat peut supprimer son compte à tout moment depuis son espace. La suppression est définitive : ses pièces sont supprimées ; son nom, son adresse, son téléphone, son profil, ses réponses et ses alertes sont effacés ; ses rendez-vous à venir sont annulés. Restent, sans son nom, les reçus, le décompte des analyses et l'historique des consentements, pour les durées de conservation légales."),
    p("Le candidat peut à tout moment télécharger les données de son compte depuis la page « Mes données »."),
    p("{{suspension_compte}}"),
    h("13. Responsabilité"),
    l(
      "ImmiPro met en œuvre les moyens raisonnables pour que la plateforme soit disponible et que ses informations soient exactes et à jour. Elle est tenue d'une obligation de moyens.",
      "ImmiPro n'est pas responsable de la décision d'une administration, d'un refus, d'un retard de traitement, ni des conséquences d'une information fournie par le candidat ou d'une pièce qu'il a déposée.",
    ),
    p("{{responsabilite}}"),
    h("14. Propriété intellectuelle"),
    p("Les contenus de la plateforme (fiches, guides, textes, éléments graphiques) appartiennent à ImmiPro. Le candidat dispose d'un droit d'usage personnel, pour la préparation de son propre dossier. Les documents et textes du candidat restent sa propriété. Il autorise ImmiPro à les traiter dans la seule mesure nécessaire au service."),
    h("15. Données personnelles"),
    p("Les traitements de données personnelles sont décrits dans la page « Données personnelles »."),
    h("16. Modification des conditions"),
    p("ImmiPro peut faire évoluer les présentes conditions. Les achats déjà confirmés restent régis par la version acceptée au moment de l'achat."),
    p("{{modification_conditions}}"),
    h("17. Réclamations et contact"),
    p("Toute réclamation peut être adressée à {{email_contact}}, qui y répond dans un délai de {{delai_reponse}}."),
    h("18. Droit applicable et litiges"),
    p("{{droit_applicable}}"),
  ],
};

const DONNEES_PERSONNELLES: ModeleJuridique = {
  page: "donnees-personnelles",
  adresse: "/donnees-personnelles",
  titre: "Données personnelles",
  chapeau: "Ce que nous collectons, pourquoi, combien de temps nous le gardons, et comment exercer vos droits.",
  blocs: [
    h("1. Qui traite vos données"),
    p("{{responsable_traitement}}"),
    p("{{autorite_controle}}"),
    h("2. Ce que nous collectons, et pourquoi"),
    l(
      "Compte : adresse électronique, mot de passe (conservé sous forme d'empreinte, jamais en clair), prénom, nom, téléphone, pays — pour créer et sécuriser votre compte, et vous écrire.",
      "Profil : objectif, diplôme le plus élevé, domaine d'études, années d'expérience, langues, budget — pour situer votre profil par rapport aux conditions des destinations.",
      "Dossier : destination, date de départ visée, état du dossier, échéances, date de dépôt déclarée — pour construire votre liste de pièces, votre échéancier et vos rappels.",
      "Pièces déposées : passeport, carte d'identité, acte de naissance, diplômes, relevés bancaires, attestations…, et les informations qui en sont lues (noms, dates, montants) — pour vérifier la conformité de chaque pièce et la cohérence du dossier.",
      "Textes rédigés : réponses à l'entretien guidé, lettres et leurs versions — pour la rédaction assistée et la relecture.",
      "Paiements : référence, offre, montant, devise, prestataire, statut, remboursements — pour encaisser, émettre un reçu, rembourser et tenir la comptabilité.",
      "Consentements : chaque autorisation donnée ou retirée, avec sa date et la version du texte — pour prouver ce que vous avez accepté ou refusé.",
      "Rendez-vous avec un consultant : créneau, consultant, partage de votre dossier — pour organiser la consultation.",
      "Sécurité : sessions de connexion (navigateur utilisé, dates), tentatives de connexion échouées, journal des opérations sensibles — pour protéger votre compte et la plateforme.",
    ),
    p("Nous ne collectons pas de données que le service n'utilise pas. Les bases légales de ces traitements sont les suivantes :"),
    l("{{bases_legales}}"),
    p("Le simulateur ne garde rien de vous. Tant que vous n'êtes pas connecté, vos réponses restent sur votre appareil, le temps de votre visite. Le serveur les reçoit pour faire le calcul et n'en conserve aucune trace."),
    p("Votre adresse IP sert seulement à limiter le nombre de requêtes contre les abus. Elle est gardée quelques minutes en mémoire et n'est jamais enregistrée en base."),
    h("3. Vos autorisations"),
    p("Aucune autorisation n'est donnée par défaut. Chacune se donne et se retire à tout moment depuis la page « Mes consentements »."),
    l(
      "Analyse de mes pièces d'identité : permet de déposer et de faire lire passeport, carte d'identité, acte de naissance. Sans elle, aucune pièce ne peut être déposée, et son retrait arrête aussi l'analyse des pièces déjà déposées.",
      "Alertes de changement de règles : permet de recevoir un courriel quand une exigence de votre destination change. Sans elle, l'alerte reste visible dans votre dossier, mais aucun courriel ne part.",
      "Propositions de partenaires : permet d'être mis en relation avec un consultant ou un partenaire. Sans elle, aucune proposition ne vous est faite.",
      "Analyse de mes pièces financières et mesure d'audience anonyme : ces deux choix figurent sur la page, mais n'activent aujourd'hui aucun traitement distinct. Aucune mesure d'audience n'existe.",
    ),
    h("4. Analyse automatique et intelligence artificielle"),
    l(
      "La lecture des pièces et la rédaction assistée font appel à un prestataire d'intelligence artificielle, sous-traitant d'ImmiPro. Il reçoit le fichier ou le texte concerné, et rien d'autre : ni votre adresse, ni l'adresse du fichier dans notre stockage.",
      "Les pièces d'identité ne sont confiées qu'au prestataire désigné à cet effet. Un autre prestataire n'en reçoit que sur une autorisation écrite d'ImmiPro.",
      "La complétude du dossier est calculée automatiquement à partir des pièces et des règles de la destination. Elle indique ce qui manque ou doit être corrigé. Elle ne produit aucune décision à votre égard, et ne se prononce pas sur la décision de l'administration.",
      // Avis juridique L.A du 03/10/2026 : la pondération n'est pas
      // communiquée, et cela se dit ; une relecture humaine peut être
      // demandée.
      "La pondération interne du calcul n'est pas communiquée. L'export de vos données en indique les facteurs et l'ordre dans lequel les manques vous sont présentés.",
      "Vous pouvez demander qu'un membre de l'équipe relise l'évaluation de complétude de votre dossier, depuis l'écran de complétude. La réponse vous est adressée dans vos alertes.",
    ),
    p("{{ia_conservation}}"),
    h("5. Qui reçoit vos données"),
    p("Vos données ne sont ni vendues ni louées. Elles sont accessibles à l'équipe d'ImmiPro habilitée, pour la revue manuelle des pièces, le support et les remboursements, chaque opération sensible étant enregistrée dans un journal ; au consultant que vous avez choisi, si vous partagez votre dossier avec lui, ce partage étant révocable et prenant fin 14 jours après le rendez-vous ; et aux sous-traitants suivants, pour la seule exécution du service :"),
    l("{{sous_traitants}}"),
    p("Le contrôle antivirus et le stockage des pièces tournent sur notre propre serveur : aucun tiers ne reçoit vos pièces pour ces deux opérations."),
    p("{{transferts}}"),
    h("6. Combien de temps nous les gardons"),
    l(
      "Pièces d'un dossier clos : supprimées sous 30 jours.",
      "Pièces d'un dossier inactif : rappel à 90 jours ; dossier abandonné à 365 jours, puis pièces supprimées sous 30 jours.",
      "Pièces d'un dossier déclaré déposé : 12 mois après le dépôt, prolongeables par périodes de 6 mois à votre demande.",
      "Pièces d'un dossier en pause : 12 mois, avec un avertissement à 11 mois.",
      "Alertes réglementaires : 6 mois.",
      "Motif d'un échec de paiement : 90 jours, ou 30 jours après la clôture d'un litige s'il y en a un.",
      "Historique des consentements, journal des opérations : 5 ans.",
      "Reçus et écritures de paiement : {{duree_comptable}}.",
      "Compte : jusqu'à sa suppression.",
    ),
    p("Toute suppression de pièces programmée vous est annoncée au moins 30 jours à l'avance."),
    h("7. Vos droits"),
    l(
      "Accès et portabilité : page « Mes données », pour télécharger vos données et vos pièces.",
      "Rectification : votre prénom, votre nom, votre téléphone et votre profil se corrigent depuis votre espace. Pour le reste, écrivez à {{email_donnees}}.",
      "Retrait d'un consentement : page « Mes consentements », à tout moment.",
      "Effacement : suppression du compte depuis votre espace. Elle est immédiate et définitive. Restent, sans votre nom, les reçus, le décompte des analyses et l'historique des consentements, pour les durées ci-dessus.",
      "Opposition, limitation, réclamation : écrivez à {{email_donnees}}. Nous répondons dans un délai de {{delai_reponse}}.",
    ),
    p("Vous pouvez aussi saisir l'autorité de contrôle compétente, désignée en tête de cette page."),
    h("8. Sécurité"),
    l(
      "Les pièces déposées sont contrôlées par un antivirus avant d'être acceptées, et gardées à l'écart tant que le contrôle n'a pas conclu.",
      "Elles sont conservées dans un stockage privé, jamais accessible directement depuis Internet. Chaque téléchargement passe par un lien valable 5 minutes.",
      "Les mots de passe sont conservés sous forme d'empreinte.",
      "Les échanges avec la plateforme sont chiffrés (HTTPS).",
    ),
    p("{{securite_complements}}"),
    h("9. Cookies et stockage sur votre appareil"),
    l(
      "Cookie « immipro_session » : maintenir votre connexion. 30 jours au plus ; fermeture après 7 jours sans activité.",
      "Stockage de session du navigateur : garder vos réponses au simulateur pendant votre visite, jusqu'à la fermeture de l'onglet.",
    ),
    p("Ces deux éléments sont strictement nécessaires au service. Aucun outil de mesure d'audience, de publicité ou de suivi n'est utilisé."),
    h("10. Mineurs"),
    p("{{age_minimum}}"),
    h("11. Modifications"),
    p("{{information_modifications}}"),
  ],
};

const CONTACT: ModeleJuridique = {
  page: "contact",
  adresse: "/contact",
  titre: "Contact",
  chapeau: "Une question sur la plateforme, un paiement, vos données ? Voici comment nous joindre.",
  blocs: [
    l(
      "Adresse électronique : {{email_contact}}",
      "Téléphone : {{telephone}}",
      "Horaires : {{horaires}}",
      "Adresse postale : {{adresse_postale}}",
    ),
    e("Délai de réponse", "Nous répondons dans un délai de {{delai_reponse}}."),
    h("Vos données personnelles"),
    p("Pour exercer vos droits d'accès, de rectification, d'opposition ou de limitation, écrivez à {{email_donnees}}. Le téléchargement de vos données et la suppression de votre compte se font directement depuis votre espace."),
    h("Un remboursement"),
    p("{{remboursement_demande}}"),
    h("Ce que nous ne faisons pas"),
    p("ImmiPro ne délivre aucun conseil juridique et ne se prononce pas sur la décision de l'administration. Pour un avis sur votre situation, adressez-vous à un avocat ou à un conseil habilité."),
    p("L'éditeur de la plateforme est {{denomination}}, {{siege_social}}."),
  ],
};

export const MODELES: Readonly<Record<PageJuridique, ModeleJuridique>> = {
  "mentions-legales": MENTIONS_LEGALES,
  conditions: CONDITIONS,
  "donnees-personnelles": DONNEES_PERSONNELLES,
  contact: CONTACT,
};
