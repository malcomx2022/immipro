import Link from "next/link";
import type { Metadata } from "next";
import { PACKS } from "@/domain/payments/pricing";
import { ANALYSES_AJOUTEES } from "@/domain/payments/montee";
import { DELAIS_D_ALERTE } from "@/domain/dossiers/preferences-rappels";
import { JALONS_DE_SUIVI } from "@/domain/dossiers/suivi-depot";
import { CONSERVATION_SOUMIS_MOIS, PROLONGATION_MOIS } from "@/domain/dossiers/conservation";
import { PURGE_JOURS } from "@/domain/dossiers/cloture";

/**
 * Comment ça marche — Q.A, page « Produit et contenu », périmètre V1.
 *
 * Le parcours tel qu'il est **implémenté**, et rien au-delà : chaque étape
 * décrit un écran qui existe. Les nombres ne sont pas recopiés, ils sont
 * lus là où le produit les applique — la grille des packs, les délais de
 * rappel, les jalons de suivi, les durées de conservation. Une phrase qui
 * dirait « trente jours » pendant que le code en applique quarante serait
 * le défaut que ce dépôt corrige depuis le début.
 *
 * Ce qui est hors V1 n'y figure pas : ni connexion Google, ni SMS, ni
 * passage d'Essentiel à Dossier Pro, ni offres de partenaires.
 */
export const metadata: Metadata = {
  title: "Comment ça marche",
  description:
    "Du simulateur au dépôt de ta demande : ce qu'ImmiPro fait à chaque étape, et ce qui reste entre tes mains.",
};

const pack = (code: string) => PACKS.find((p) => p.code === code)!;
const liste = (nombres: readonly number[]) =>
  `${nombres.slice(0, -1).join(", ")} ou ${nombres.at(-1)}`;

const ETAPES: readonly { titre: string; texte: string }[] = [
  {
    titre: "Trouver ta destination",
    texte:
      "Le simulateur pose quelques questions sur ton objectif, ton parcours et ton budget, sans compte à créer. Il classe des destinations et montre, pour chacune, le coût de la première année et ce qu'il faut prouver.",
  },
  {
    titre: "Ouvrir ton dossier",
    texte:
      "Tu crées ton compte avec ton adresse électronique et un mot de passe, tu confirmes ton adresse, puis tu ouvres un dossier pour une procédure. Le dossier garde la version de la règle en vigueur ce jour-là : une évolution réglementaire ne change pas ta liste de pièces en cours de route.",
  },
  {
    titre: "Choisir ton pack",
    texte: `${pack("essentiel").libelle} ouvre ${pack("essentiel").analyses} analyses de pièces. ${pack("dossier").libelle} en ouvre ${pack("dossier").analyses} et ajoute la rédaction assistée. ${pack("pro").libelle} couvre ${pack("pro").destinations} destinations. Tu paies en francs CFA par Mobile Money, ou en euros par carte. Depuis Essentiel, le passage à ${pack("dossier").libelle} se paie la différence et ajoute ${ANALYSES_AJOUTEES} analyses.`,
  },
  {
    titre: "Déposer tes pièces",
    texte:
      "Chaque pièce de la checklist se dépose dans ton dossier. Le fichier est contrôlé, puis lu : ce qui manque ou ne convient pas t'est dit précisément, avec ce qu'il faut corriger. Une pièce illisible part en relecture humaine, et l'analyse t'est rendue.",
  },
  {
    titre: "Rédiger tes lettres",
    texte: `Un entretien guidé t'aide à rassembler ce que ta lettre doit dire. Avec ${pack("dossier").libelle} et ${pack("pro").libelle}, une proposition de texte part de tes réponses, et une relecture signale ce qui ne tient pas. Avec ${pack("essentiel").libelle}, tu gardes l'entretien et tu écris toi-même.`,
  },
  {
    titre: "Suivre ton calendrier",
    texte: `L'échéancier se construit à rebours depuis ta date cible. Tu choisis de recevoir des rappels ${liste(DELAIS_D_ALERTE)} jours avant une échéance, dans l'application et, si tu le souhaites, par courriel, à l'heure du fuseau que tu as choisi.`,
  },
  {
    titre: "Déposer ta demande",
    texte: `Quand tu as déposé ta demande auprès de l'autorité, tu indiques la date réelle de ce dépôt. ${JALONS_DE_SUIVI[0]} puis ${JALONS_DE_SUIVI[1]} jours après, nous te demandons si tu as reçu une réponse. Si la date déclarée est fausse, tu signales la bonne depuis ton dossier, et un membre de l'équipe la vérifie.`,
  },
  {
    titre: "Clore ton dossier",
    texte: `Tes pièces sont conservées ${CONSERVATION_SOUMIS_MOIS} mois après la date de ton dépôt. Avant l'échéance, nous te demandons si l'instruction continue : une confirmation les garde ${PROLONGATION_MOIS} mois de plus. Quand tu clos ton dossier, elles sont supprimées ${PURGE_JOURS} jours après la clôture.`,
  },
];

export default function CommentCaMarche() {
  return (
    <div className="mx-auto flex w-full max-w-texte flex-col gap-8 px-4 py-8 md:px-12 md:py-12">
      <header className="flex flex-col gap-3">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-28 font-semibold text-ink-900 outline-none md:text-32"
        >
          Comment ça marche
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          ImmiPro t&apos;aide à préparer ton dossier, pièce par pièce. Tu déposes ta
          demande toi-même, et la décision appartient aux autorités du pays de
          destination.
        </p>
      </header>

      <ol className="flex flex-col gap-6">
        {ETAPES.map((etape, rang) => (
          <li key={etape.titre} className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent-50 text-14 font-semibold text-accent-700"
            >
              {rang + 1}
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-19 font-semibold text-ink-900">{etape.titre}</h2>
              <p className="text-pretty text-14 text-ink-700">{etape.texte}</p>
            </div>
          </li>
        ))}
      </ol>

      <nav aria-label="Pour commencer" className="flex flex-wrap gap-x-6 gap-y-2">
        <Link href="/simulateur" className="text-14 font-medium text-accent-600">
          Essayer le simulateur
        </Link>
        <Link href="/tarifs" className="text-14 font-medium text-accent-600">
          Voir les tarifs
        </Link>
      </nav>
    </div>
  );
}
