"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import type { ConsultationPayee, PaiementEnCours } from "@/server/lecture/paiements";
import {
  AUPRES_DE,
  CONSIGNE_ATTENTE,
  etatDeLEtape,
  ETAPES_ATTENTE,
  LIBELLES_ETAPES,
  PERIODE_RELEVE_SECONDES,
  RIEN_RECU,
  GARDER_LA_PAGE,
  TITRE_ATTENTE,
  attenteExpiree,
  rebours,
  reessaiPropose,
  secondesDepuisReleve,
  suiteDeLAttente,
} from "@/domain/paiement/attente";
import { railDe } from "@/domain/payments/rail";
import { achatDepuisLeCode } from "@/domain/payments/achat";
import { corpsDeLEtat, TITRE_ETAT } from "@/domain/consultants/tenue";
import { libelleLimite, libelleRendezVous } from "@/domain/consultants/rendez-vous";
import { cn, formatMontant } from "@/lib/utils";

/**
 * $-03 — Attente de confirmation.
 *
 * Trois règles d'accessibilité que l'écran tient et que rien d'autre ne peut
 * tenir à sa place :
 *
 * - `aria-live="polite"` sur le seul texte de statut. Le rebours et la
 *   relève en sont exclus : sinon le lecteur d'écran énonce une valeur par
 *   seconde et l'écran devient inutilisable (règle clavier 10).
 * - Le focus ne se déplace pas pendant l'attente (règle 6). L'utilisateur
 *   l'a laissé quelque part, il l'y retrouve.
 * - La page ne piège pas le focus : trois arrêts au plus, et « Réessayer »
 *   n'apparaît qu'au bout de quatre-vingt-dix secondes.
 *
 * La relève interroge la base toutes les trois secondes, et la base seule :
 * la route lit le statut que le webhook signé fait avancer, et ne confirme
 * rien elle-même (RG-05.1). L'écran ne décide donc jamais qu'un paiement a
 * abouti — il lit qu'il a abouti.
 *
 * Ce que la relève vaut est décidé dans le domaine, pas ici : naviguer vers
 * « paiement confirmé » sur autre chose qu'un `CONFIRMEE` annoncerait un
 * débit que l'opérateur n'a pas fait, et c'est la seule erreur de cet écran
 * qui coûte de l'argent.
 *
 * ── Trois achats passent ici, et l'écran n'en connaissait qu'un ──────
 *
 * La dernière étape du fil annonçait « ton pack s'ouvre » à qui venait de
 * payer quarante-cinq minutes d'entretien. La contrepartie vient
 * maintenant du domaine (`ceQuiSOuvre`), exhaustive par catégorie.
 *
 * Et pour une consultation, l'écran dit de plus **ce qui est en jeu** :
 * le créneau, l'heure jusqu'à laquelle il est tenu, et le nom du
 * consultant. C'était l'information la plus utile de l'écran, et elle n'y
 * était pas — le candidat attendait sans savoir ce qu'il attendait.
 *
 * Le décompte de cinq minutes est celui de la confirmation, pas celui de
 * la tenue, qui dure vingt minutes. Les deux sont montrés séparément :
 * confondre l'un avec l'autre ferait croire qu'un délai dépassé a rendu
 * le créneau, alors qu'il est encore tenu un quart d'heure.
 */
const TEINTES: Record<ReturnType<typeof etatDeLEtape>, string> = {
  faite: "bg-success",
  en_cours: "bg-accent-500",
  a_venir: "bg-ink-300",
};

export interface AttenteProps {
  attente: PaiementEnCours;
  /**
   * Le rendez-vous que ce paiement paie, quand c'en est un. La page le
   * lit ; le composant ne va rien chercher lui-même.
   */
  consultation?: ConsultationPayee | null;
}

export function Attente({ attente, consultation = null }: AttenteProps) {
  const router = useRouter();
  const [ecoulees, setEcoulees] = useState(0);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  /**
   * La navigation n'a lieu qu'une fois.
   *
   * Le minuteur et la relève tournent en parallèle ; sans ce verrou, deux
   * relèves qui se croisent au moment de la confirmation poussent deux fois
   * la même adresse dans l'historique, et le retour arrière ne ramène plus
   * au dossier.
   */
  const partie = useRef(false);

  const expiree = attenteExpiree(ecoulees);

  useEffect(() => {
    const minuteur = setInterval(() => setEcoulees((s) => s + 1), 1000);
    return () => clearInterval(minuteur);
  }, []);

  useEffect(() => {
    if (partie.current || expiree) return;
    let vivant = true;

    async function relever() {
      const resultat = await appeler<{ statut: string }>(
        `/api/paiements/statut?tx=${encodeURIComponent(attente.reference)}`,
      );
      if (!vivant || partie.current) return;
      if (!resultat.ok) {
        // Une relève manquée n'est pas un paiement manqué : l'écran le dit
        // et continue de relever, plutôt que de renvoyer vers un échec que
        // l'opérateur n'a pas prononcé.
        setEchec(resultat.echec);
        return;
      }
      setEchec(null);

      const suite = suiteDeLAttente(resultat.donnees.statut, ecoulees);
      if (suite.suite === "confirme") {
        partie.current = true;
        router.replace(`/paiement/confirme?tx=${encodeURIComponent(attente.reference)}`);
      } else if (suite.suite === "echec") {
        partie.current = true;
        const motif = suite.motif ? `&motif=${suite.motif}` : "";
        router.replace(
          `/paiement/echec?tx=${encodeURIComponent(attente.reference)}${motif}`,
        );
      }
    }

    void relever();
    const cadence = setInterval(() => void relever(), PERIODE_RELEVE_SECONDES * 1000);
    return () => {
      vivant = false;
      clearInterval(cadence);
    };
    // `ecoulees` n'est pas une dépendance : la relève se replanifierait à
    // chaque seconde. Le rebours n'entre dans la décision qu'à son terme,
    // et `expiree` suffit à la porter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attente.reference, expiree, router]);

  const montant = formatMontant(attente.montant, attente.devise);
  /*
    La catégorie de l'achat vient du code enregistré, relu par le domaine
    (`achatDepuisLeCode`) et non comparé à des chaînes ici. Un code que la
    grille ne reconnaît plus retombe sur le pack : c'est le cas de tous
    les paiements antérieurs à la recharge, et l'étape reste juste.
  */
  const achat = achatDepuisLeCode(attente.achatCode);
  const estUneConsultation = achat.type === "consultation";
  // La devise décide du rail, et le rail de la voix de l'écran : le même
  // fil d'étapes se lit différemment selon qu'un opérateur ou une banque
  // est au bout.
  const rail = railDe(attente.devise);

  return (
    <div className="mx-auto flex w-full max-w-etroit flex-col gap-6 px-4 pb-8 md:py-8">
      <p className="font-mono text-13 uppercase tracking-wider text-ink-500">
        Paiement {attente.moyen} · {montant}
      </p>

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          {TITRE_ATTENTE[rail]}
        </h1>
        <p className="text-pretty text-16 text-ink-700">{CONSIGNE_ATTENTE[rail]}</p>
      </div>

      {/* Le statut seul est dans la région vivante. */}
      <p role="status" aria-live="polite" className="text-16 font-semibold text-ink-900">
        {expiree ? "Le délai de confirmation est dépassé" : "En attente de ta confirmation"}
      </p>

      {echec ? <BlocEchec echec={echec} annonce={false} /> : null}

      <div aria-hidden="true" className="flex flex-col items-center gap-1">
        <span className="font-mono text-32 text-ink-900">{rebours(ecoulees)}</span>
        <span className="text-13 text-ink-500">temps restant pour confirmer</span>
        {expiree ? null : (
          <span className="font-mono text-13 text-ink-700">
            {AUPRES_DE[rail]} il y a {secondesDepuisReleve(ecoulees)} s
          </span>
        )}
      </div>

      <ol className="flex flex-col gap-3 rounded-lg bg-ink-100 p-5">
        {ETAPES_ATTENTE.map((etape) => {
          const etat = etatDeLEtape(etape);
          return (
            <li key={etape} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={cn("mt-2 h-2 w-2 flex-none rounded-full", TEINTES[etat])}
              />
              <span
                className={cn(
                  "text-14",
                  etat === "en_cours" ? "font-medium text-ink-900" : "text-ink-700",
                  etat === "a_venir" && "text-ink-500",
                )}
              >
                {LIBELLES_ETAPES[etape](attente.telephone, rail, achat)}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Ce qui est en jeu, quand c'est un créneau. La phrase de l'état
          vient du domaine de la tenue : elle dit que le créneau reste
          tenu, et que le retour de la page de paiement ne confirme rien —
          ce qui est la règle de WF-12 et non une formule d'attente. */}
      {estUneConsultation && consultation ? (
        <section className="flex flex-col gap-2 rounded-lg border border-ink-300 p-5">
          <h2 className="text-16 font-semibold text-ink-900">
            {TITRE_ETAT.EN_ATTENTE}
          </h2>
          <p className="text-14 font-medium text-ink-900">
            {libelleRendezVous({ debut: consultation.debut, disponible: false })} ·{" "}
            {consultation.consultant}
          </p>
          <p className="text-pretty text-14 text-ink-700">
            {corpsDeLEtat("EN_ATTENTE")}
          </p>
          {consultation.tenuJusqua ? (
            <p className="text-pretty text-13 text-ink-500">
              Ce créneau t&apos;est gardé jusqu&apos;à{" "}
              {libelleLimite(consultation.tenuJusqua)}, ce qui laisse plus de
              temps que le décompte ci-dessus : celui-ci porte sur la
              confirmation du paiement, pas sur le créneau.
            </p>
          ) : null}
        </section>
      ) : null}

      <p className="text-pretty text-14 text-ink-700">{GARDER_LA_PAGE}</p>

      <div className="flex flex-col gap-2">
        {reessaiPropose(ecoulees) ? (
          <Button
            pleineLargeur
            className="min-h-action"
            onClick={() =>
              router.push(`/paiement/echec?tx=${encodeURIComponent(attente.reference)}`)
            }
          >
            Réessayer le paiement
          </Button>
        ) : null}
        <Link
          href={`/paiement/echec?tx=${encodeURIComponent(attente.reference)}`}
          className="flex min-h-touch items-center justify-center text-14 font-semibold text-accent-600"
        >
          {RIEN_RECU[rail]}
        </Link>
        {/* Abandonner un paiement de consultation n'a pas la même suite
            qu'abandonner un pack : le créneau redevient libre, et le dire
            évite de revenir une heure plus tard en le croyant gardé. Le
            lien ramène là où un créneau se reprend, et non au tableau de
            bord, qui n'en montre aucun. */}
        <Link
          href={
            estUneConsultation && attente.dossierId
              ? `/consultants?dossier=${attente.dossierId}`
              : "/tableau-de-bord"
          }
          className="flex min-h-touch items-center justify-center text-14 text-ink-700"
        >
          {estUneConsultation ? "Abandonner et libérer le créneau" : "Annuler le paiement"}
        </Link>
      </div>

      <p className="text-center text-13 text-ink-500">
        Aucun montant n&apos;est débité avant ta confirmation.
      </p>
    </div>
  );
}
