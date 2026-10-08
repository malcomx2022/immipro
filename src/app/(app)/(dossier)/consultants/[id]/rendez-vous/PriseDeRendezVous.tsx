"use client";

import { useEffect, useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { LienBouton } from "@/components/ui/LienBouton";
import { RadioGroup } from "@/components/ui/RadioGroup";
import type { Dossier } from "@/domain/dossiers/dossier";
import type { Piece } from "@/domain/dossiers/piece";
import { libelleAPreparer } from "@/domain/dossiers/piece";
import type { ConsultantHabilite } from "@/domain/consultants/annuaire";
import { libelleDelai } from "@/domain/consultants/annuaire";
import {
  HORS_PORTEE,
  LIBELLE_PORTEE,
  MENTION_DE_LAUTORISATION,
  libelleDeLAutorisation,
  MENTION_REVOCATION,
  PORTEE_CONSULTANT,
} from "@/domain/consultants/access";
import type { Creneau } from "@/domain/consultants/rendez-vous";
import {
  MENTION_TENUE,
  MESSAGE_HORS_LIGNE,
  RESTE_ACCESSIBLE_HORS_LIGNE,
  conditions,
  grouperParJour,
  libelleFormat,
  libelleHeure,
  libelleLimite,
  libelleRendezVous,
  mentionFuseau,
  peutConfirmer,
} from "@/domain/consultants/rendez-vous";
import {
  fichierAgenda,
  nomDuFichierAgenda,
  TYPE_AGENDA,
} from "@/domain/consultants/agenda";
import { MENTION_ACCES_APRES_PAIEMENT } from "@/domain/consultants/tenue";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import { CONSULTATION, deviseParDefaut } from "@/domain/payments/pricing";
import { jourEnFrancais } from "@/domain/format/moment";
import { formatMontant } from "@/lib/utils";
import { FUSEAU_CANDIDAT, FUSEAU_CONSULTANT } from "@/lib/contenu/consultants";
import { cn } from "@/lib/utils";
import { EnteteDossier } from "../../../dossiers/[id]/EnteteDossier";

/**
 * T-05 — Prise de rendez-vous. WF-12.
 *
 * Trois étapes dans l'ordre où elles engagent : l'accord d'accès, le
 * créneau, la confirmation. L'accord vient en premier parce qu'il est la
 * seule décision irréversible du parcours — réserver se défait, ouvrir son
 * dossier se retire mais ne s'oublie pas.
 *
 * Ce que le consultant verra est dérivé du modèle de droits (`access.ts`),
 * pas réécrit ici : l'écran ne peut donc pas promettre autre chose que ce
 * que `peutLire` autorise.
 *
 * **La confirmation réserve pour de bon — I.E.** Le bouton se contentait de
 * passer à l'étape suivante : l'écran annonçait « Rendez-vous confirmé » et
 * rien n'était écrit. Ni créneau retenu, ni accord de partage, alors que
 * les deux étaient annoncés au candidat et que la route qui les écrit
 * existait déjà, sans appelant. Ce qui s'affiche vient maintenant de la
 * réponse du serveur : la référence, l'heure et la limite d'annulation
 * qu'il a stockées, et non celles que l'écran recalculerait.
 */
export interface PriseDeRendezVousProps {
  dossier: Dossier;
  pieces: readonly Piece[];
  consultant: ConsultantHabilite;
  creneaux: readonly Creneau[];
}

type Etape = "ACCORD" | "CRENEAUX" | "CONFIRME";

/** Ce que le serveur a écrit, et qui fait foi sur l'écran de confirmation. */
interface Reservation {
  reference: string;
  debut: string;
  dureeMinutes: number;
  annulationSansFraisJusqua: string;
  consultant: string;
  dossier: string | null;
  /** Jusqu'à quand le créneau est gardé. Nul quand il est déjà payé. */
  tenuJusqua: string | null;
  /** La page hébergée du prestataire. Nulle quand il n'y a plus à payer. */
  url: string | null;
  /** Vrai seulement quand la notification signée est passée. */
  confirme: boolean;
  deja: boolean;
}

export function PriseDeRendezVous({
  dossier,
  pieces,
  consultant,
  creneaux,
}: PriseDeRendezVousProps) {
  const [etape, setEtape] = useState<Etape>("ACCORD");
  const [accord, setAccord] = useState(false);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);

  // Hors ligne, aucune disponibilité n'est montrée : un horaire venu d'un
  // cache est peut-être déjà pris, et l'échec tomberait à la confirmation.
  useEffect(() => {
    const perdu = () => setHorsLigne(true);
    const revenu = () => setHorsLigne(false);
    window.addEventListener("offline", perdu);
    window.addEventListener("online", revenu);
    if (typeof navigator !== "undefined" && navigator.onLine === false) perdu();
    return () => {
      window.removeEventListener("offline", perdu);
      window.removeEventListener("online", revenu);
    };
  }, []);

  async function reserver(quand: Creneau) {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<Reservation>(
      `/api/consultants/${consultant.id}/rendez-vous`,
      {
        corps: {
          dossierId: dossier.id,
          creneau: quand.debut,
          accordDePartage: true,
        },
      },
    );
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    /*
      Le créneau est **tenu**, pas réservé. Le navigateur part payer sur
      la page hébergée du prestataire, et c'est la notification signée
      qui confirmera — ni ce clic, ni le retour de cette page.
      Le bouton reste en cours d'envoi : la page va disparaître, et la
      rendre cliquable pendant la navigation invite au second clic.
    */
    if (resultat.donnees.url) {
      setEnvoi(true);
      window.location.assign(resultat.donnees.url);
      return;
    }

    // Plus rien à payer : ce rendez-vous est déjà confirmé, et le
    // candidat revient simplement le voir.
    setReservation(resultat.donnees);
    setEtape("CONFIRME");
  }

  /**
   * Le fichier est fabriqué ici, dans le navigateur, comme le PDF du reçu :
   * aucune bibliothèque d'agenda n'entre au dépôt pour trente lignes de
   * texte.
   */
  function telechargerLAgenda(faite: Reservation) {
    const contenu = fichierAgenda({
      reference: faite.reference,
      debut: faite.debut,
      dureeMinutes: faite.dureeMinutes,
      consultant: faite.consultant,
      dossier: faite.dossier ?? dossier.destination.pays,
      adresse: `${window.location.origin}/dossiers/${dossier.id}`,
      produitLe: new Date().toISOString(),
    });
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(new Blob([contenu], { type: TYPE_AGENDA }));
    lien.download = nomDuFichierAgenda(faite.reference);
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  const devise = deviseParDefaut("BJ");
  const prix = formatMontant(CONSULTATION.prix[devise], devise);
  const jours = grouperParJour(creneaux);
  const creneau = creneaux.find((c) => c.debut === choisi) ?? null;

  const entete = (
    <EnteteDossier
      dossier={dossier}
      retour={`/consultants?dossier=${dossier.id}`}
      libelleRetour="Annuaire"
    />
  );

  if (etape === "CONFIRME" && reservation) {
    const faite = reservation;
    const retenu: Creneau = { debut: faite.debut, disponible: false };
    return (
      <div className="mx-auto flex w-full max-w-colonne flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
        {entete}

        <div className="flex flex-col gap-2">
          <span className="w-fit rounded-full bg-success/10 px-3 py-1 text-13 font-medium text-success">
            Rendez-vous confirmé
          </span>
          <h1
            id="contenu"
            tabIndex={-1}
            className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
          >
            {libelleRendezVous(retenu)}
          </h1>
          {/* La phrase promettait « le lien arrive par courriel ». Aucune
              visioconférence n'est modélisée : il n'y avait pas de lien à
              envoyer, et aucun courriel ne partait non plus. Elle dit
              maintenant ce qui arrive vraiment (I.E). */}
          <p className="text-pretty text-16 text-ink-700">
            Avec {faite.consultant}, {libelleFormat()}. La confirmation part par
            courriel, et le rendez-vous reste dans ton dossier.
          </p>
        </div>

        {/* La référence et l'heure sont celles que le serveur a écrites, et
            non celles que l'écran recalculerait : deux sources pour une
            pièce opposable finissent par diverger. */}
        <dl className="flex flex-col rounded-lg bg-ink-100 p-4">
          <Ligne intitule="Référence" valeur={faite.reference} />
          <Ligne
            intitule="Dossier"
            valeur={
              faite.dossier ??
              `${dossier.destination.pays} — ${dossier.destination.intitule.split("—")[0]?.trim()}`
            }
          />
          <Ligne intitule="Ton fuseau" valeur={FUSEAU_CANDIDAT} />
        </dl>

        <section className="flex flex-col gap-2">
          <h2 className="text-16 font-semibold text-ink-900">À préparer avant l&apos;appel</h2>
          {/* Le prototype écrivait ici « Ta checklist est à 80 % » : le dernier
              pourcentage de l'interface candidat, et le plus inutile — la
              phrase nommait déjà les pièces, qui sont la seule chose à savoir
              avant un appel de quarante-cinq minutes. */}
          <p className="text-pretty text-16 text-ink-700">{libelleAPreparer(pieces, dossier.completude.compteurs)}</p>
          <p className="text-pretty text-14 text-ink-700">
            Le consultant y aura accès pendant l&apos;appel, avec ton accord, que tu peux
            retirer à tout moment.
          </p>
        </section>

        <div className="flex flex-col gap-2 border-t border-ink-300 pt-4">
          {/* Le bouton ne faisait rien, comme les quatre boutons morts du
              lot L.B. Il rend maintenant un fichier d'agenda. */}
          <Button
            variante="secondaire"
            pleineLargeur
            className="md:w-auto md:self-start"
            onClick={() => telechargerLAgenda(faite)}
          >
            Ajouter à mon agenda
          </Button>
          <p className="text-pretty text-13 text-ink-500">
            Annulation ou report sans frais jusqu&apos;au{" "}
            {libelleLimite(faite.annulationSansFraisJusqua)}. Passé ce délai, la
            consultation est due.
          </p>
          <LienBouton
            href={`/dossiers/${dossier.id}`}
            pleineLargeur
            className="min-h-action md:w-auto md:self-start"
          >
            Revenir à mon dossier
          </LienBouton>
        </div>
      </div>
    );
  }

  if (etape === "CRENEAUX") {
    return (
      <div className="mx-auto flex w-full max-w-dossier flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
        {entete}

        <div className="flex flex-col gap-2">
          <h1
            id="contenu"
            tabIndex={-1}
            className="text-24 font-semibold text-ink-900 outline-none md:text-32"
          >
            Choisis un créneau
          </h1>
          <p className="text-14 text-ink-700">
            {consultant.nom} · {libelleFormat()}
          </p>
        </div>

        {horsLigne ? (
          <section className="flex flex-col items-start gap-2 rounded-lg border-l-6 border-warning bg-white p-4 shadow-e2">
            <h2 className="text-16 font-semibold text-ink-900">
              Les créneaux ne peuvent pas être affichés maintenant
            </h2>
            <p className="max-w-lecture text-pretty text-14 text-ink-700">
              {MESSAGE_HORS_LIGNE}
            </p>
            <Button variante="secondaire" onClick={() => setHorsLigne(!navigator.onLine)}>
              Réessayer
            </Button>
            <p className="text-pretty text-13 text-ink-500">
              {RESTE_ACCESSIBLE_HORS_LIGNE}
            </p>
          </section>
        ) : (
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-5">
              {jours.map((jour) => (
                <section key={jour.cle} className="flex flex-col gap-2">
                  {/* Le libellé du groupe est le titre du jour : le répéter
                      au-dessus le ferait annoncer deux fois. */}
                  <RadioGroup
                    libelle={`${jour.jourCourt} ${jour.dateCourte}`}
                    options={jour.creneaux.map((c) => ({
                      valeur: c.debut,
                      libelle: libelleHeure(c),
                      description: c.disponible ? undefined : "Déjà réservé",
                      desactivee: !c.disponible,
                    }))}
                    valeur={choisi}
                    onChangement={setChoisi}
                  />
                </section>
              ))}
            </div>

            <aside className="flex w-full flex-col gap-2 rounded-lg bg-ink-100 p-4 md:w-aside md:flex-none">
              <h2 className="text-14 font-semibold text-ink-900">{consultant.nom}</h2>
              <p className="text-13 text-ink-700">{consultant.cabinet}</p>
              <dl className="flex flex-col pt-1">
                <Ligne intitule="Durée" valeur={libelleFormat()} />
                <Ligne intitule="Langues" valeur={consultant.langues.join(", ")} />
                <Ligne intitule="Réponse" valeur={libelleDelai(consultant).replace("Répond en ", "")} />
              </dl>
              <p className="text-pretty text-13 text-ink-500">
                {mentionFuseau(FUSEAU_CANDIDAT, FUSEAU_CONSULTANT)}
              </p>
            </aside>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-ink-300 pt-4">
          {echec ? <BlocEchec echec={echec} annonce /> : null}
          <p className="text-pretty text-13 text-ink-500">{conditions(prix)}</p>
          <Button
            pleineLargeur
            className="min-h-action md:w-auto md:self-start"
            chargement={envoi}
            disabled={!peutConfirmer(accord, creneau)}
            raisonDesactivation={
              horsLigne
                ? "Les créneaux ne sont pas disponibles hors ligne."
                : "Choisis d'abord un créneau disponible."
            }
            onClick={() => creneau && void reserver(creneau)}
          >
            {creneau ? `Tenir ${libelleHeure(creneau)} et payer` : "Choisir un créneau"}
          </Button>
          {creneau ? (
            <p aria-live="polite" className="text-13 text-ink-500">
              {MENTION_TENUE} {MENTION_ACCES_APRES_PAIEMENT}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-colonne flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      {entete}

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Ouvrir ton dossier à {consultant.nom}
        </h1>
        <p className="text-13 text-ink-500">
          Habilité {dossier.destination.pays} depuis le{" "}
          {jourEnFrancais(consultant.habiliteLe)}
        </p>
        <p className="text-pretty text-16 text-ink-700">{MENTION_REVOCATION}</p>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <section className="flex flex-1 flex-col gap-2 rounded-lg bg-ink-100 p-4">
          <h2 className="text-16 font-semibold text-ink-900">Ce qu&apos;il verra</h2>
          <ul className="flex flex-col gap-1.5">
            {PORTEE_CONSULTANT.map((portee) => (
              <li key={portee} className="text-pretty text-14 text-ink-700">
                {LIBELLE_PORTEE[portee]}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-1 flex-col gap-2 rounded-lg bg-ink-100 p-4">
          <h2 className="text-16 font-semibold text-ink-900">
            Ce qu&apos;il ne verra jamais
          </h2>
          <ul className="flex flex-col gap-1.5">
            {HORS_PORTEE.map((hors) => (
              <li key={hors} className="text-pretty text-14 text-ink-700">
                {hors}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Les deux phrases viennent du domaine : elles citent la durée que
          la base applique, et l'écran ne la réécrit pas. */}
      <Checkbox
        libelle={libelleDeLAutorisation(consultant.nom, dossier.destination.pays)}
        description={MENTION_DE_LAUTORISATION}
        checked={accord}
        onChangement={setAccord}
      />

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4">
        <Button
          pleineLargeur
          className={cn("min-h-action md:w-auto md:self-start")}
          disabled={!accord}
          raisonDesactivation="Ton accord est nécessaire : sans lui, le consultant ne voit rien de ton dossier."
          onClick={() => setEtape("CRENEAUX")}
        >
          Donner mon accord et choisir un créneau
        </Button>
      </div>
    </div>
  );
}

function Ligne({ intitule, valeur }: { intitule: string; valeur: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-ink-300 py-2 first:border-t-0">
      <dt className="text-13 text-ink-500">{intitule}</dt>
      <dd className="text-right text-14 text-ink-900">{valeur}</dd>
    </div>
  );
}
