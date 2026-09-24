"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { SourceNote } from "@/components/ui/SourceNote";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import type { Arbitrage, Confirmation, VersionRegle } from "@/domain/notifications/divergence";
import {
  AUCUNE_PIECE,
  MENTION_HISTORIQUE,
  MENTION_SANS_ACCORD,
  MENTION_SANS_MONTANT,
  confirmationDArbitrage,
  ecartMontant,
  libelleDelaiVersion,
  libelleImpact,
  lignesDesPieces,
  mentionArbitrage,
  optionsArbitrage,
} from "@/domain/notifications/divergence";
import type { EvolutionDesPieces } from "@/domain/rules/comparaison";
import type { BlocageDeMigration } from "@/domain/notifications/divergence";
import { formatMontant } from "@/lib/utils";

/**
 * T-02 — Divergence réglementaire. WF-11, INV-3.
 *
 * Un écran d'arbitrage, pas une notification : l'application ne tranche pas
 * seule. Migrer d'office trahirait INV-3, qui fige la version de règle d'un
 * dossier ; se taire trahirait INV-8. Les deux versions sont donc posées
 * côte à côte, avec ce qui les sépare et ce que le choix change.
 *
 * Aucune option n'est présélectionnée : un arbitrage pré-coché n'est pas un
 * arbitrage.
 *
 * ── Un arbitrage qu'on ne recueillait pas ───────────────────────────
 *
 * Le bouton fermait la feuille. Rien ne partait, rien n'était écrit, et
 * l'écran annonçait pourtant « Ta checklist Pays-Bas **sera** mise à
 * jour » — au futur, pour un geste qui n'aurait jamais lieu. Exécuté avant
 * correction, après un choix « Migrer » et un clic :
 *
 *     appels réseau partis    : 0
 *     la feuille s'est fermée : true
 *     ce que l'écran lui dit  : « Ta checklist Pays-Bas sera mise à jour. »
 *     et plus haut            : « Nous ne modifions rien sans ton accord. »
 *
 * La promesse du haut d'écran n'était tenue que parce que rien n'était
 * jamais modifié. `arbitrerLaDivergence` existait, éprouvée par une fumée,
 * et n'avait aucun appelant : les props ne portaient même pas de quoi
 * nommer le dossier ni la divergence.
 */
export interface DivergenceProps {
  ouverte: boolean;
  onFermer: () => void;
  /** Le dossier et la divergence, pour que le choix puisse être écrit. */
  dossierId: string;
  migrationId: string;
  pays: string;
  ancienne: VersionRegle;
  nouvelle: VersionRegle;
  /**
   * Les pièces obligatoires que la nouvelle version ajoute ou retire.
   *
   * L'écran nommait la checklist — « ta checklist passe à la version 5 »
   * — sans nommer une seule de ses lignes. Le candidat tranchait sans
   * savoir ce qu'il devrait fournir en plus, et le découvrait après coup.
   */
  pieces?: EvolutionDesPieces;
  /**
   * RG-14.1. Ce qui empêche de migrer : l'option « migrer » s'affiche
   * alors indisponible, avec la vraie raison — remplacée, ou en relecture.
   */
  blocage?: BlocageDeMigration;
  /**
   * Date de **dépôt** du dossier concerné — la cible moins le délai
   * d'instruction —, si elle est fixée. C'est elle qui décide de la
   * version applicable, pas la date de départ.
   */
  depot?: string;
  detecteeLe: string;
  verifieeLe: string;
  source: string;
}

export function DivergenceReglementaire({
  ouverte,
  onFermer,
  dossierId,
  migrationId,
  pays,
  ancienne,
  nouvelle,
  pieces = AUCUNE_PIECE,
  blocage = "AUCUN",
  depot,
  detecteeLe,
  verifieeLe,
  source,
}: DivergenceProps) {
  const router = useRouter();
  const [choix, setChoix] = useState<Arbitrage | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [fait, setFait] = useState<Confirmation | null>(null);

  /* `null` quand l'autorité ne publie rien : la formule le dira en toutes
     lettres plutôt que d'afficher « 0 € ». */
  const montant = (v: VersionRegle) =>
    v.montant === null ? null : formatMontant(v.montant.valeur, v.montant.devise);
  const options = optionsArbitrage(
    ancienne,
    nouvelle,
    montant(ancienne),
    montant(nouvelle),
    pieces,
    blocage,
  );
  const lignes = lignesDesPieces(pieces);
  const retenue = options.find((o) => o.cle === choix);

  /**
   * L'arbitrage part, et la feuille ne se ferme qu'une fois écrit — ni sur
   * un échec, ni sur une réussite.
   *
   * Fermer sur l'échec ferait disparaître le seul endroit où il peut se
   * lire, et sur une décision qui déplace un échéancier entier, « ça n'a
   * pas marché » doit se voir là où le geste a été fait.
   *
   * Fermer sur la réussite jetait la réponse du serveur, qui nomme les
   * pièces ajoutées et celles qui ne sont plus demandées. L'écran
   * promettait au futur — « ta checklist sera mise à jour » — et ne rendait
   * jamais le passé. La confirmation se lit donc ici, et c'est le candidat
   * qui ferme.
   *
   * `router.refresh()` parce que la page est rendue côté serveur : sans
   * lui, la liste garderait l'alerte que l'on vient de trancher. Il part
   * tout de suite, pendant que la confirmation se lit.
   */
  async function appliquer() {
    if (!choix) return;
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{
      mention?: string;
      piecesAjoutees?: readonly string[];
      piecesLiberees?: readonly string[];
    }>(`/api/dossiers/${dossierId}/migrations/${migrationId}`, { corps: { decision: choix } });
    setEnvoi(false);
    if (resultat.ok) {
      setFait(
        confirmationDArbitrage(
          choix,
          pays,
          resultat.donnees?.mention ?? mentionArbitrage(choix, pays),
          resultat.donnees?.piecesAjoutees ?? [],
          resultat.donnees?.piecesLiberees ?? [],
        ),
      );
      router.refresh();
      return;
    }
    setEchec(resultat.echec);
  }

  /*
    Une fois l'arbitrage écrit, la feuille ne montre plus les deux versions
    ni les options : elles décrivent un choix qui n'est plus à faire, et le
    bouton ne pourrait que refuser un second envoi — l'arbitrage n'est pas
    reprenable côté serveur.
  */
  if (fait) {
    return (
      <BottomSheet ouverte={ouverte} onFermer={onFermer} ancrage="adaptatif" titre={fait.titre}>
        <ul aria-live="polite" className="flex flex-col gap-2">
          {fait.lignes.map((ligne) => (
            <li key={ligne} className="text-pretty text-14 text-ink-700">
              {ligne}
            </li>
          ))}
        </ul>
        <div className="border-t border-ink-300 pt-3">
          <Button pleineLargeur className="min-h-action" onClick={onFermer}>
            Voir ma checklist
          </Button>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      ouverte={ouverte}
      onFermer={onFermer}
      ancrage="adaptatif"
      titre={`Une exigence a changé pour l'${pays}`}
    >
      <p className="text-pretty text-14 text-ink-700">
        Tu décides si ton dossier suit la nouvelle règle ou reste sur
        l&apos;ancienne. {MENTION_SANS_ACCORD}
      </p>

      <div className="flex flex-col gap-2 md:flex-row">
        <CarteVersion version={ancienne} statut="En vigueur dans ton dossier" />
        <CarteVersion version={nouvelle} statut="Nouvelle" />
      </div>

      <section className="flex flex-col gap-1.5 rounded-md bg-ink-100 p-3.5">
        <h3 className="text-14 font-semibold text-ink-900">
          Ce que ça change pour ton dossier
        </h3>
        <p className="text-pretty text-14 text-ink-700">
          {libelleImpact(
            ancienne,
            nouvelle,
            /* En valeur absolue : le sens — « de plus », « de moins » —
               est une affaire de phrase, et `libelleImpact` le tranche. */
            ecartFormate(ancienne, nouvelle),
            depot,
          )}
        </p>
      </section>

      {lignes.length > 0 ? (
        <section className="flex flex-col gap-1.5 rounded-md border border-ink-300 p-3.5">
          <h3 className="text-14 font-semibold text-ink-900">
            Ce que ta checklist gagne et perd
          </h3>
          <ul className="flex flex-col gap-1">
            {lignes.map((ligne) => (
              <li key={ligne.cle} className="flex items-start gap-2">
                {/* Le signe ne porte pas l'information seul : chaque ligne
                    dit en toutes lettres ce qu'elle devient. */}
                <span aria-hidden="true" className="pt-1.5 text-ink-500">
                  •
                </span>
                <span className="text-pretty text-14 text-ink-700">{ligne.texte}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RadioGroup
        libelle="Ton arbitrage"
        options={options.map((o) => ({
          valeur: o.cle,
          libelle: o.titre,
          description: o.detail,
          ...(o.desactivee ? { desactivee: true } : {}),
        }))}
        valeur={choix}
        onChangement={(v) => setChoix(v as Arbitrage)}
      />

      <SourceNote source={source} verifieeLe={verifieeLe}>
        Changement détecté le{" "}
        {new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC" }).format(
          new Date(`${detecteeLe}T00:00:00Z`),
        )}
        . {MENTION_HISTORIQUE}
      </SourceNote>

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-3">
        {echec ? <BlocEchec echec={echec} /> : null}
        <Button
          pleineLargeur
          className="min-h-action"
          disabled={!retenue}
          chargement={envoi}
          raisonDesactivation="Choisis d'abord la version à appliquer : nous ne modifions rien sans ton accord."
          onClick={() => void appliquer()}
        >
          {retenue ? retenue.titre : "Appliquer mon choix"}
        </Button>
        {choix ? (
          <p aria-live="polite" className="text-center text-13 text-ink-500">
            {mentionArbitrage(choix, pays)}
          </p>
        ) : null}
      </div>
    </BottomSheet>
  );
}

/**
 * L'écart mis en forme, en valeur absolue, ou `null` s'il n'est pas
 * chiffrable. Le signe ne se met pas en forme : « -3 000 € de plus » est
 * la phrase qu'on lisait quand l'autorité abaissait son exigence.
 */
function ecartFormate(ancienne: VersionRegle, nouvelle: VersionRegle): string | null {
  const ecart = ecartMontant(ancienne, nouvelle);
  return ecart === null ? null : formatMontant(Math.abs(ecart.valeur), ecart.devise);
}

function CarteVersion({ version, statut }: { version: VersionRegle; statut: string }) {
  const FORMAT = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC" });
  const jour = (iso: string) => FORMAT.format(new Date(`${iso}T00:00:00Z`));

  return (
    <div className="flex flex-1 flex-col gap-1 rounded-md border border-ink-300 p-3.5">
      <span className="text-13 font-medium uppercase tracking-wide text-ink-500">
        Version {version.numero} · {statut}
      </span>
      <span className="text-24 font-semibold text-ink-900">
        {version.montant === null
          ? MENTION_SANS_MONTANT
          : formatMontant(version.montant.valeur, version.montant.devise)}
      </span>
      <span className="text-14 text-ink-700">{version.intitule}</span>
      {/* Le délai décide de la date de dépôt : une carte de version qui
          ne le porte pas laisse croire que seul le montant sépare les
          deux. */}
      <span className="text-14 text-ink-700">{libelleDelaiVersion(version)}</span>
      <span className="text-pretty text-13 text-ink-500">
        Publiée le {jour(version.publieeLe)}
        {version.applicableJusquau
          ? ` · applicable aux dépôts jusqu'au ${jour(version.applicableJusquau)}`
          : ""}
        {version.applicableDepuis
          ? ` · applicable aux dépôts à partir du ${jour(version.applicableDepuis)}`
          : ""}
      </span>
    </div>
  );
}
