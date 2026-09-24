"use client";

import { Button } from "@/components/ui/Button";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import { MENTION_AUDIT } from "@/domain/backoffice/navigation";
import {
  LIBELLE_RAPPROCHEMENT,
  MENTION_ECARTS,
  MENTION_TOTAL_SUSPENDU,
  agreger,
  nomDuGrandLivre,
  lignesDeTotal,
  libelleEcarts,
  messageIncidentOperateur,
  totalPubliable,
  type EtatOperateur,
  type Totaux,
  type Paiement,
  diagnostiquerLaJournee,
} from "@/domain/backoffice/reconciliation";
import { formatMontant } from "@/lib/utils";
import { LIBELLE_CAUSE } from "@/domain/paiement/echec";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { appeler } from "@/lib/api";
import { telechargerFichier } from "@/lib/telechargement";
import type { EchecCandidat } from "@/server/http/echecs";
import { jourEnFrancais, momentEnFrancais } from "@/domain/format/moment";
import {
  ISSUES_ECART,
  LIBELLE_ISSUE,
  SUITE_DE_L_ISSUE,
  obstacleALaResolution,
  type IssueEcart,
} from "@/domain/backoffice/ecart";
import { FUSEAU_AFFICHAGE } from "@/domain/format/fuseau";

/**
 * B-04 — Paiements et réconciliation. WF-15, INV-7.
 *
 * Deux refus d'empressement. Un silence de l'opérateur n'est pas un refus :
 * les paiements restent en attente de rapprochement, aucun n'est marqué en
 * échec et aucun pack n'est fermé. Et pendant l'incident, le total encaissé
 * disparaît — un chiffre partiel présenté comme un total est une erreur
 * comptable, et elle se propage dans l'export puis dans le rapport.
 *
 * ── L'export nommé par cette règle n'existait pas ───────────────────────
 *
 * « Exporter le grand livre » n'était relié à rien. La règle ci-dessus
 * désignait pourtant l'export comme le lieu où l'erreur devient durable :
 * un total faux à l'écran disparaît au rechargement, le même dans un
 * fichier part au comptable et revient dans un rapport six semaines plus
 * tard, sans l'encadré qui disait pourquoi il était faux. La règle n'était
 * donc tenue qu'à l'endroit où elle coûte le moins cher.
 *
 * Le fichier porte maintenant ses lignes en toutes circonstances — chaque
 * paiement est exactement ce qu'il est — et, pendant un incident, la raison
 * de l'absence des totaux à la place des totaux.
 *
 * ── Le rapprochement manuel, lui, est parti ─────────────────────────────
 *
 * Le second bouton proposait « Lancer le rapprochement » ou « Rapprocher à
 * la main » selon l'état de l'opérateur, et rien derrière : aucune route,
 * et `interrogation` n'est pas branchée. C'est la règle de Q.A — ce qui
 * manque est nommé dans `COMMANDES_ATTENDUES_B04`, et l'écran continue de
 * dire ce qu'il dit déjà : le rapprochement automatique reprendra seul.
 */
const FORMAT_HEURE = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: FUSEAU_AFFICHAGE,
});
const heure = (iso: string) => FORMAT_HEURE.format(new Date(iso)).replace(":", " h ");

/**
 * Le traitement d'un écart — arbitrage du 21/09/2026.
 *
 * Le constat d'abord, l'issue ensuite, la note enfin. L'ordre n'est pas
 * décoratif : choisir une issue sans avoir relu ce que l'écart disait est
 * la façon la plus simple de refermer un désaccord qu'on n'a pas compris.
 *
 * Aucune des quatre issues ne touche à l'argent, et l'écran le dit sous
 * chacune : « remboursement à initier » est une issue de guichet, pas un
 * virement.
 */
function TraitementDeLEcart({ paiement }: { paiement: Paiement }) {
  const router = useRouter();
  const [issue, setIssue] = useState<IssueEcart | "">("");
  const [note, setNote] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);

  const resolution = paiement.ecart?.resolution;
  const obstacle = obstacleALaResolution(
    { ...(issue ? { issue } : {}), note },
    !resolution,
  );

  async function refermer() {
    if (!issue) return;
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ resolu: boolean }>(
      `/api/admin/paiements/${paiement.reference}/ecart`,
      { corps: { issue, note } },
    );
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ink-300 bg-white p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-14 text-ink-900">{paiement.reference}</span>
        <span className="text-13 text-ink-500">
          {formatMontant(paiement.montant, paiement.devise)} · {paiement.compte}
        </span>
      </div>
      <p className="text-pretty text-14 text-ink-700">{paiement.ecart?.constat}</p>

      {resolution ? (
        <p className="text-pretty text-13 text-ink-500">
          Refermé le {jourEnFrancais(resolution.le)} par {resolution.par} —{" "}
          {LIBELLE_ISSUE[resolution.issue]}. {resolution.note}
        </p>
      ) : (
        <>
          {echec ? <BlocEchec echec={echec} annonce /> : null}
          <Select
            libelle="Issue"
            value={issue}
            onChange={(e) => setIssue(e.target.value as IssueEcart)}
            options={[
              { valeur: "", libelle: "Choisir une issue" },
              ...ISSUES_ECART.map((i) => ({ valeur: i, libelle: LIBELLE_ISSUE[i] })),
            ]}
          />
          {issue ? (
            <p className="text-pretty text-13 text-ink-500">{SUITE_DE_L_ISSUE[issue]}</p>
          ) : null}
          <Input
            libelle="Ce que tu as constaté"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aide={MENTION_AUDIT}
          />
          <Button
            chargement={envoi}
            disabled={obstacle !== null}
            raisonDesactivation={obstacle ?? undefined}
            onClick={() => void refermer()}
            className="self-start"
          >
            Refermer l&apos;écart
          </Button>
        </>
      )}
    </div>
  );
}

export function Paiements({
  paiements,
  operateur,
  journee,
  jourIso,
  aujourdhuiIso,
}: {
  paiements: readonly Paiement[];
  /**
   * État de l'opérateur. Nul tant qu'aucun rapprochement n'a abouti — ni
   * webhook signé confirmant un paiement, ni consultation aboutie du job de
   * réconciliation. Une absence de rapprochement récente ne devient un
   * incident que si quelque chose attendait l'opérateur : une nuit sans
   * achat n'est pas une panne.
   */
  operateur: EtatOperateur | null;
  /** Libellé de la journée traitée. */
  journee: string;
  /** La même journée en ISO court : elle borne l'export et nomme le fichier. */
  jourIso: string;
  /**
   * Le jour courant, en ISO court, tel que le serveur le voit.
   *
   * Il sépare une journée creuse d'une journée à venir, et il vient du
   * serveur : le calculer ici le ferait dépendre du fuseau du navigateur,
   * qui n'est pas celui du livre.
   */
  aujourdhuiIso: string;
}) {
  const agregats = agreger(paiements);
  // La file se déplie sur demande : B-04 est d'abord un tableau de bord,
  // et le traitement d'un écart est une tâche, pas une lecture.
  const [fileOuverte, setFileOuverte] = useState(false);
  /**
   * Une somme par monnaie. Les deux rails n'encaissent pas dans la même,
   * et les additionner produisait un total en francs qui contenait des
   * euros — l'erreur comptable que ce tableau est censé prévenir.
   */
  const sommes = (totaux: Totaux) =>
    lignesDeTotal(totaux)
      .map((l) => formatMontant(l.montant, l.devise))
      .join(" · ");
  /*
    Le moment du dernier rapprochement porte son jour. Il était rendu par
    `heure` seul : un rapprochement de l'avant-veille s'affichait « 23 h 04 »
    à côté de la journée consultée, et se lisait comme s'il en faisait
    partie. Les lignes du tableau, elles, restent en heure seule — leur jour
    est celui du tableau.
  */
  const incident = operateur ? messageIncidentOperateur(operateur, momentEnFrancais) : null;
  const journeeVide = diagnostiquerLaJournee(paiements, jourIso, aujourdhuiIso);
  const publiable = operateur ? totalPubliable(operateur) : false;
  const [envoiExport, setEnvoiExport] = useState(false);
  const [echecExport, setEchecExport] = useState<EchecCandidat | null>(null);

  /**
   * L'export part même pendant un incident : ce sont ses totaux que le
   * serveur retient, pas ses lignes. Retenir le fichier entier ferait
   * croire que la journée n'existe pas.
   */
  async function exporter() {
    setEnvoiExport(true);
    setEchecExport(null);
    const resultat = await telechargerFichier(
      `/api/admin/paiements/export?jour=${jourIso}`,
      nomDuGrandLivre(jourIso),
    );
    setEnvoiExport(false);
    if (!resultat.ok) setEchecExport(resultat.echec);
  }

  return (
    <div className="flex flex-col">
      <EnteteAdmin
        titre="Paiements et réconciliation"
        resume={
          !operateur
            ? `${journee} · aucun rapprochement automatique enregistré`
            : publiable
              ? `${journee} · dernier rapprochement le ${momentEnFrancais(operateur.dernierRapprochement)}`
              : `${journee} · dernier rapprochement automatique le ${momentEnFrancais(operateur.dernierRapprochement)}`
        }
        actions={
          <Button
            variante="secondaire"
            disabled={envoiExport}
            raisonDesactivation="Préparation du fichier en cours."
            onClick={exporter}
          >
            {envoiExport ? "Préparation…" : "Exporter le grand livre"}
          </Button>
        }
      />

      <div className="flex flex-col gap-4 p-6">
        {echecExport ? <BlocEchec echec={echecExport} annonce /> : null}

        {incident ? (
          <section className="flex flex-col gap-2 rounded-lg border-l-6 border-warning bg-white p-4 shadow-e2">
            <h2 className="text-16 font-semibold text-ink-900">
              L&apos;API {operateur?.operateur} ne répond plus
            </h2>
            <p className="max-w-[80ch] text-pretty text-14 text-ink-700">{incident}</p>
          </section>
        ) : null}

        <div className="grid grid-cols-6 gap-3">
          <Carte
            intitule="Encaissé aujourd'hui"
            valeur={publiable ? sommes(agregats.encaisse) : "—"}
            detail={
              publiable
                ? `${agregats.confirmes} paiements confirmés`
                : "non affiché pendant l'incident"
            }
          />
          <Carte
            intitule="En attente de confirmation"
            valeur={sommes(agregats.enAttente)}
            detail={`${agregats.transactionsEnAttente} transactions`}
          />
          <Carte
            intitule="Échecs du jour"
            valeur={String(agregats.echecs)}
            // Le détail nommait une cause — « solde insuffisant » — pour
            // tous les échecs, ce que N.B a retiré de la colonne d'état
            // juste à côté. Il la nommait encore ici.
            detail="délai dépassé ou paiement refusé"
          />
          {/*
            Un remboursement sort de l'encaissé, ce qui est juste, et
            n'entrait dans aucun compteur — une somme rendue disparaissait
            de la journée (M.B).
          */}
          <Carte
            intitule="Remboursé aujourd'hui"
            valeur={sommes(agregats.rembourse)}
            detail={`${agregats.rembourses} ${agregats.rembourses > 1 ? "paiements rendus" : "paiement rendu"}`}
          />
          {/*
            K.C — décidé n'est pas versé. La somme est encore sur le compte,
            et elle est due : sans ce compteur, un remboursement ouvert par
            une suppression de compte vieillit sans que personne le voie.
          */}
          <Carte
            intitule="Remboursements à verser"
            valeur={sommes(agregats.remboursementDu)}
            detail={`${agregats.remboursementsDus} ${agregats.remboursementsDus > 1 ? "décidés, non versés" : "décidé, non versé"}`}
          />
          <Carte
            intitule="Écarts à traiter"
            valeur={String(agregats.ecarts)}
            detail="débit opérateur sans dossier ouvert"
          />
        </div>

        {publiable ? null : (
          <p className="text-pretty text-13 text-ink-500">{MENTION_TOTAL_SUSPENDU}</p>
        )}

        {/*
          L'état vide de la journée — `CLAUDE.md`, et la doctrine du journal
          d'audit : « s'il n'affiche rien, il ne s'est rien passé ». Quatre
          compteurs à zéro au-dessus d'un tableau sans ligne ne disent pas si
          la lecture a échoué ; cette phrase le dit, et distingue une journée
          creuse d'une journée qui n'est pas encore venue.
        */}
        {journeeVide ? (
          <div className="flex flex-col gap-1 rounded-lg border border-ink-300 bg-white p-6">
            <p className="text-16 font-semibold text-ink-900">{journeeVide.message}</p>
            <p className="max-w-[70ch] text-pretty text-14 text-ink-700">
              {journeeVide.precision}
            </p>
          </div>
        ) : (
        <div className="overflow-hidden rounded-lg border border-ink-300 bg-white">
          <table className="w-full text-14">
            <caption className="sr-only">Paiements de la journée</caption>
            <thead>
              <tr className="bg-ink-100 text-13 font-medium text-ink-700">
                <th scope="col" className="px-3 py-2 text-left">Référence</th>
                <th scope="col" className="px-3 py-2 text-left">Compte</th>
                <th scope="col" className="px-3 py-2 text-right">Montant</th>
                <th scope="col" className="px-3 py-2 text-left">Moyen</th>
                <th scope="col" className="px-3 py-2 text-left">Transaction</th>
                <th scope="col" className="px-3 py-2 text-left">Heure</th>
                <th scope="col" className="px-3 py-2 text-left">Rapprochement</th>
              </tr>
            </thead>
            <tbody>
              {paiements.map((p) => (
                <tr key={p.reference} className="border-t border-ink-300">
                  <td className="px-3 py-2 font-mono text-13 text-ink-900">{p.reference}</td>
                  <td className="px-3 py-2 text-ink-700">{p.compte}</td>
                  <td className="px-3 py-2 text-right text-ink-900">
                    {formatMontant(p.montant, p.devise)}
                  </td>
                  <td className="px-3 py-2 text-ink-700">{p.moyen}</td>
                  <td className="px-3 py-2 font-mono text-13 text-ink-700">
                    {p.transaction ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-ink-700">{heure(p.recuLe)}</td>
                  <td className="px-3 py-2 text-ink-700">
                    <span className="flex flex-col">
                      {LIBELLE_RAPPROCHEMENT[p.etat]}
                      {/* La cause sous l'état, et seulement quand l'émetteur
                          l'a donnée. L'état disait « Solde insuffisant » pour
                          tout refus, panne comprise (N.B). */}
                      {p.motifDuRemboursement ? (
                        <span className="text-13 text-ink-500">{p.motifDuRemboursement}</span>
                      ) : null}
                      {p.cause ? (
                        <span className="text-13 text-ink-500">{LIBELLE_CAUSE[p.cause]}</span>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        {/* Le traitement des écarts — arbitrage du 21/09/2026.
            Ce bouton n'avait pas d'action derrière lui : le compteur
            montait et rien ne pouvait le faire redescendre. Il ouvre
            maintenant la file, chaque écart avec son constat sous les
            yeux — refermer sans relire reviendrait à signer un texte
            qu'on n'a pas lu. */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-pretty text-13 text-ink-500">{MENTION_ECARTS}</p>
            <Button
              disabled={agregats.ecarts === 0}
              raisonDesactivation="Aucun écart en attente."
              onClick={() => setFileOuverte((o) => !o)}
            >
              {fileOuverte ? "Masquer la file" : libelleEcarts(agregats)}
            </Button>
          </div>
          {fileOuverte
            ? paiements
                .filter((p) => p.etat === "ECART" && p.ecart)
                .map((p) => (
                  <TraitementDeLEcart key={p.reference} paiement={p} />
                ))
            : null}
        </div>

        <p className="text-13 text-ink-500">{MENTION_AUDIT}</p>
      </div>
    </div>
  );
}

function Carte({
  intitule,
  valeur,
  detail,
}: {
  intitule: string;
  valeur: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-ink-300 bg-white p-4">
      <span className="text-13 text-ink-500">{intitule}</span>
      <span className="text-24 font-semibold text-ink-900">{valeur}</span>
      <span className="text-pretty text-13 text-ink-500">{detail}</span>
    </div>
  );
}
