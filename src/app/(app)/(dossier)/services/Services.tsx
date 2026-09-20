"use client";

import Link from "next/link";
import { useState } from "react";
import { LienBouton } from "@/components/ui/LienBouton";
import { Card } from "@/components/ui/Card";
import type { Dossier } from "@/domain/dossiers/dossier";
import type { Offre } from "@/server/lecture/partenaires";
import { ENGAGEMENTS, MENTION_INDEPENDANCE } from "@/domain/consultants/proposition";
import { FORMULATION } from "@/domain/partenaires/affiliation";
import { appeler } from "@/lib/api";
import { EnteteDossier } from "../dossiers/[id]/EnteteDossier";

/**
 * T-06 — Services partenaires. WF-13, K.A tranché le 20/09/2026.
 *
 * L'écran existe parce que la décision déplace les offres plutôt que de
 * les supprimer : elles quittent la checklist, où elles se lisaient comme
 * un péage posé au moment d'un manque, pour une surface où le candidat
 * vient les chercher. Le renversement est tout l'objet de l'arbitrage — une
 * même phrase ne pèse pas pareil selon qu'on la reçoit ou qu'on va la lire.
 *
 * Ce que le déplacement ne change pas : la commission est annoncée ici et
 * non dans les conditions générales, le motif est rattaché à une pièce que
 * le dossier demande, et la nature commerciale du lien est signalée
 * jusque dans l'attribut `rel` du lien sortant (RG-13.3).
 *
 * Ce qu'il change : il n'y a plus de « ne plus me proposer ». Rien n'est
 * proposé — il n'y a donc rien à arrêter, et l'interrupteur qui commande
 * l'affichage de cette page vit là où vivent les autres, dans les
 * consentements. Une seule vérité, une seule entrée.
 */
export interface ServicesProps {
  dossier: Dossier;
  offres: readonly Offre[];
  /** Faux quand l'autorisation de recevoir des offres a été retirée. */
  autorise: boolean;
}

export function Services({ dossier, offres, autorise }: ServicesProps) {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <EnteteDossier
        dossier={dossier}
        retour={`/dossiers/${dossier.id}`}
        libelleRetour="Checklist"
      />

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Services partenaires
        </h1>
        <p className="text-pretty text-14 text-ink-700">
          Des prestataires indépendants fournissent certaines pièces que ton dossier
          demande et que nous ne produisons pas. Rien ici n&apos;est obligatoire : ta
          checklist et ton pack ne changent pas si tu n&apos;y donnes pas suite.
        </p>
      </div>

      {!autorise ? (
        <Card>
          <h2 className="text-16 font-semibold text-ink-900">
            Tu as coupé les offres de partenaire
          </h2>
          <p className="text-pretty text-14 text-ink-700">
            Cette page reste vide tant que l&apos;autorisation n&apos;est pas rétablie.
            Elle se règle depuis tes consentements, avec les autres.
          </p>
          <Link
            href="/consentements"
            className="flex min-h-touch items-center text-14 text-accent-600"
          >
            Ouvrir mes consentements
          </Link>
        </Card>
      ) : offres.length === 0 ? (
        <Card>
          <h2 className="text-16 font-semibold text-ink-900">
            Aucun partenaire n&apos;est référencé pour {dossier.destination.pays}
          </h2>
          <p className="text-pretty text-14 text-ink-700">
            Un partenaire n&apos;est proposé qu&apos;après vérification destination par
            destination. Tant que cette vérification n&apos;a pas eu lieu, cette page
            reste vide — et c&apos;est l&apos;état normal, pas une panne.
          </p>
        </Card>
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {offres.map((offre) => (
              <li key={offre.id}>
                <OffrePartenaire offre={offre} dossierId={dossier.id} />
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1.5 border-t border-ink-300 pt-4">
            {ENGAGEMENTS.map((engagement) => (
              <p key={engagement} className="text-pretty text-13 text-ink-500">
                {engagement}
              </p>
            ))}
            <p className="text-pretty text-13 text-ink-500">{MENTION_INDEPENDANCE}</p>
            <Link
              href="/consentements"
              className="flex min-h-touch items-center text-14 text-accent-600"
            >
              Ne plus voir d&apos;offres de partenaire
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Une offre. La redirection est tracée avant le départ (WF-13, étape 2), et
 * l'écran attend la réponse : ici, contrairement à un refus, faire patienter
 * une seconde est le prix d'un lien qu'on sait avoir enregistré.
 */
function OffrePartenaire({ offre, dossierId }: { offre: Offre; dossierId: string }) {
  const [enCours, setEnCours] = useState(false);
  const mots = FORMULATION[offre.genre];

  async function ouvrir(evenement: React.MouseEvent<HTMLAnchorElement>) {
    evenement.preventDefault();
    setEnCours(true);
    await appeler(`/api/dossiers/${dossierId}/partenaires/${offre.id}`, {
      corps: { suite: "CRENEAUX" },
    });
    setEnCours(false);
    // La fenêtre s'ouvre après l'enregistrement : une redirection non
    // tracée est une commission qu'on ne saurait pas rattacher, et le
    // partenaire n'a aucune raison de nous croire sur parole.
    window.open(offre.url, "_blank", "noopener,noreferrer");
  }

  return (
    <Card>
      <h2 className="text-16 font-semibold text-ink-900">{mots.titre}</h2>
      <p className="text-pretty text-14 text-ink-700">
        {offre.motif.constat} {offre.motif.raison}
      </p>

      <div className="flex flex-col gap-1 rounded-md border border-ink-300 p-3.5">
        <span className="text-16 font-semibold text-ink-900">{offre.partenaire.nom}</span>
        <span className="text-14 text-ink-700">
          {offre.partenaire.ville} · {offre.partenaire.qualification}
        </span>
      </div>

      {/* La mention de commission est écrite ici, en toutes lettres et au
          taux exact : c'est une obligation de transparence (RG-13.3), et
          l'écrire autrement pour contourner le garde-fou du vocabulaire
          l'affaiblirait. Elle est donc déclarée dans copy-exceptions.json,
          où la dérogation se voit et se justifie. Le taux lui-même vit dans
          la grille tarifaire (COMMISSION_PARTENAIRE), et un test vérifie
          que cette phrase le reprend. */}
      <p className="text-pretty text-14 text-ink-700">
        ImmiPro perçoit une commission de 15 % sur cette prestation.
      </p>
      <p className="text-pretty text-13 text-ink-500">{mots.responsabilite}</p>

      <LienBouton
        href={offre.url}
        pleineLargeur
        className="min-h-action"
        target="_blank"
        rel="noopener noreferrer nofollow sponsored"
        aria-busy={enCours}
        onClick={ouvrir}
      >
        {mots.action}
      </LienBouton>
    </Card>
  );
}
