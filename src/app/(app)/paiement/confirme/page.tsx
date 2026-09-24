import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LienBouton } from "@/components/ui/LienBouton";
import {
  consultationDuPaiement,
  couvertureDuPaiement,
  recuDuPaiement,
} from "@/server/lecture/paiements";
import { exigerCandidat } from "@/server/securite/page";
import { momentEnFrancais } from "@/domain/format/moment";
import { libelleLimiteAnnulation, libelleRendezVous } from "@/domain/consultants/rendez-vous";
import { MENTION_REVOCATION } from "@/domain/consultants/access";
import { achatDepuisLeCode } from "@/domain/payments/achat";
import {
  actionApresLAchat,
  mentionDeLaCouverture,
  phraseDeConfirmation,
} from "@/domain/paiement/contrepartie";
import { formatMontant } from "@/lib/utils";

/**
 * $-04 — Paiement confirmé. WF-05.
 *
 * Le titre porte le résultat et reçoit le focus à l'arrivée (règle clavier 6
 * — le focus se déplace au changement d'écran, et seulement là). Les trois
 * prochaines étapes sont ordonnées par ce qui est le plus long à corriger,
 * pas par ce qui est le plus facile à faire.
 *
 * L'écran vit d'une référence, et n'en invente pas. Il en affichait une
 * écrite en dur, qui menait à un reçu tout aussi inventé ; il lit
 * maintenant la transaction que le retour du fournisseur désigne, et
 * partage cette lecture avec le reçu lui-même — deux écrans qui annoncent
 * deux montants pour un même paiement sont un litige.
 *
 * Une transaction qui n'est pas confirmée n'a rien à faire ici : l'écran du
 * reçu dit déjà, et dit seul, ce qu'il en est d'un paiement en attente ou
 * sans suite.
 *
 * ── La consultation, coordonnée le 22/09/2026 ───────────────────────
 *
 * C'est $-03 qui amène ici, et $-03 est traversé par trois achats. Après
 * une consultation payée, cet écran annonçait « Ton dossier est ouvert »
 * et proposait trois étapes de démarrage de pack — téléverser un
 * passeport, fixer une date de dépôt, rédiger une lettre. Rien de tout
 * cela n'est ce que le candidat vient d'acheter, et le rendez-vous qu'il
 * vient de réserver n'était nommé nulle part.
 *
 * Corriger $-03 sans corriger cet écran-ci aurait réparé l'attente pour
 * la rendre à une confirmation qui se trompe d'achat.
 */
export const dynamic = "force-dynamic";

/**
 * La description ne nomme pas de contrepartie : trois achats aboutissent
 * ici, et une métadonnée statique ne sait pas lequel.
 */
export const metadata: Metadata = {
  title: "Paiement confirmé",
  description: "Le paiement est confirmé.",
};

const ETAPES_SUIVANTES = [
  "Téléverse ton passeport et ton diplôme, les deux pièces les plus longues à corriger.",
  "Fixe ta date de dépôt visée pour recevoir l'échéancier des pièces qui périment.",
  "Rédige ta lettre de motivation avec l'entretien guidé, quand le reste est en place.",
];

export default async function PageConfirme({
  searchParams,
}: {
  searchParams: Promise<{ tx?: string }>;
}) {
  const { tx } = await searchParams;
  const acteur = await exigerCandidat(
    tx ? `/paiement/confirme?tx=${encodeURIComponent(tx)}` : "/paiement/confirme",
  );
  if (!tx) notFound();

  const recu = await recuDuPaiement(tx, acteur.id).catch(() => null);
  if (!recu) notFound();
  if (recu.etat !== "paye") redirect(`/paiement/recu/${encodeURIComponent(tx)}`);

  const montant = formatMontant(recu.montant, recu.devise);
  const consultation = await consultationDuPaiement(tx, acteur.id).catch(() => null);
  /*
    Ce qu'un pack multi-destinations a payé et que le candidat n'a pas
    encore pris. Sondé sur PostgreSQL avant correction : après un Pro,
    l'écran annonçait « Ton dossier est ouvert. » sur 3 destinations
    payées et 1 servie, 90 analyses payées et 30 ouvertes. Les deux tiers
    lui étaient réservés et n'étaient nommés nulle part.
  */
  const couverture = await couvertureDuPaiement(tx, acteur.id).catch(() => null);
  const mentionCouverture = couverture
    ? mentionDeLaCouverture(couverture.destinations, couverture.servies)
    : null;
  /*
    La contrepartie vient du domaine, exhaustive par catégorie, et non
    d'un ternaire ici : les deux écrans du bout du tunnel avaient déjà
    divergé sur le même achat — $-03 disait « pack », $-04 « dossier ».
  */
  const achat = achatDepuisLeCode(recu.achatCode) ?? { type: "pack" as const, code: recu.achatCode };
  /*
    Après une consultation, la suite utile est le rendez-vous, pas la
    checklist : le candidat vient de payer un horaire, et c'est lui qu'il
    voudra retrouver, ajouter à son agenda et préparer.
  */
  const suite = recu.dossier ? `/dossiers/${recu.dossier.id}` : "/tableau-de-bord";

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-4 pb-8 md:py-8">
      <div className="flex flex-col items-center gap-5 text-center">
        <Image
          src="/illustrations/paiement-confirme.svg"
          alt=""
          width={260}
          height={163}
          unoptimized
        />
        <div className="flex flex-col gap-2">
          <h1
            id="contenu"
            tabIndex={-1}
            className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
          >
            Paiement confirmé
          </h1>
          <p className="text-pretty text-16 text-ink-700">
            {phraseDeConfirmation(achat)} {montant} débités par {recu.moyen}.
          </p>
        </div>
      </div>

      <dl className="flex flex-col gap-2.5 rounded-lg bg-ink-100 p-5">
        {[
          { intitule: "Référence", valeur: recu.reference, mono: true },
          // « Achat » et non « Pack » : une recharge d'analyses aboutit
          // ici aussi, et ce n'est pas un pack.
          { intitule: "Achat", valeur: recu.achat, mono: false },
          { intitule: "Date", valeur: momentEnFrancais(recu.le), mono: false },
        ].map((ligne) => (
          <div key={ligne.intitule} className="flex justify-between gap-4 text-14">
            <dt className="text-ink-500">{ligne.intitule}</dt>
            <dd
              className={ligne.mono ? "font-mono font-medium text-ink-900" : "font-medium text-ink-900"}
            >
              {ligne.valeur}
            </dd>
          </div>
        ))}
      </dl>

      {/* Le rendez-vous réservé, quand c'en est un. L'heure et la limite
          d'annulation viennent de ce que la base a écrit, comme dans le
          courrier de confirmation : deux sources pour une pièce
          opposable finissent par diverger. */}
      {consultation ? (
        <section className="flex flex-col gap-2 rounded-lg bg-ink-100 p-5">
          <h2 className="text-16 font-semibold text-ink-900">Ton rendez-vous</h2>
          <p className="text-14 font-medium text-ink-900">
            {libelleRendezVous({ debut: consultation.debut, disponible: false })} ·{" "}
            {consultation.consultant}
          </p>
          <p className="text-pretty text-14 text-ink-700">
            Référence {consultation.reference}. Annulation sans frais jusqu&apos;au{" "}
            {libelleLimiteAnnulation({ debut: consultation.debut, disponible: false })},
            depuis{" "}
            <Link href="/consentements" className="text-accent-600 underline">
              tes autorisations
            </Link>
            . Passé ce délai, la consultation est due.
          </p>
          <p className="text-pretty text-13 text-ink-500">{MENTION_REVOCATION}</p>
        </section>
      ) : null}

      {/* Ce qui reste du pack, et le geste qui le débloque. Sous le reçu,
          parce que c'est une suite et non une ligne comptable ; au-dessus
          des trois étapes, parce qu'ouvrir une autre destination change
          lesquelles on suivra. Rien ne s'affiche quand il n'y a rien à
          prendre : la mention est nulle. */}
      {mentionCouverture ? (
        <section className="flex flex-col gap-2 rounded-lg border border-ink-300 p-5">
          <h2 className="text-16 font-semibold text-ink-900">
            Ton pack couvre d&apos;autres destinations
          </h2>
          <p className="text-pretty text-14 text-ink-700">{mentionCouverture}</p>
          <LienBouton
            href="/dossiers/nouveau"
            variante="secondaire"
            pleineLargeur
            className="md:w-auto md:self-start"
          >
            Ouvrir un autre dossier
          </LienBouton>
        </section>
      ) : null}

      {/* Les trois étapes de démarrage ne s'affichent que pour ce qui
          ouvre un dossier. Téléverser un passeport et fixer une date de
          dépôt ne sont pas la suite d'un rendez-vous payé — et une
          section masquée par une classe resterait dans le balisage. */}
      {achat.type === "consultation" ? null : (
        <section className="flex flex-col gap-3">
          <h2 className="text-19 font-semibold text-ink-900">Tes trois prochaines étapes</h2>
          <ol className="flex flex-col gap-3">
            {ETAPES_SUIVANTES.map((etape, i) => (
              <li key={etape} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent-50 font-mono text-13 font-medium text-accent-700"
                >
                  {i + 1}
                </span>
                <span className="text-pretty text-16 text-ink-700">{etape}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-pretty text-13 text-ink-500">
        Un reçu a été envoyé à ton adresse email. Il reste disponible dans ton
        espace à tout moment.
      </p>

      <div className="flex flex-col gap-2">
        {/* `/dossiers` n'existe pas : la liste est le tableau de bord, et
            les checklists vivent sous `/dossiers/[id]`. Le bouton
            renvoyait donc en 404 juste après un paiement — le pire moment
            du parcours pour une page introuvable. */}
        <LienBouton href={suite} pleineLargeur className="min-h-action">
          {actionApresLAchat(achat)}
        </LienBouton>
        <Link
          href={`/paiement/recu/${encodeURIComponent(recu.reference)}`}
          className="flex min-h-touch items-center justify-center text-14 font-semibold text-ink-900"
        >
          Voir le reçu
        </Link>
      </div>
    </div>
  );
}
