"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { MENTION_AUDIT } from "@/domain/backoffice/navigation";
import {
  CONSEQUENCE_ETAT,
  LIBELLE_ETAT,
  RAPPEL_VERIFICATION,
  destinationsCouvertes,
  etatDuConsultant,
  resumeCouverture,
  type ConsultantAdministre,
} from "@/domain/backoffice/consultants";
import { jourEnFrancais } from "@/domain/format/moment";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";

/**
 * B-09 — Consultants, présentation. WF-15 et RG-12.1.
 *
 * ── Ce que l'écran met en tête ────────────────────────────────────────
 *
 * Pas un décompte de consultants : la couverture. Trois consultants tous
 * habilités au Canada laissent les dossiers néerlandais sans personne, et
 * c'est la destination découverte qui appelle une action.
 *
 * ── Ce qu'il n'a pas à décider ────────────────────────────────────────
 *
 * RG-12.1 exige la vérification du titre d'exercice ; elle ne dit pas ce
 * qui en constitue la preuve, et c'est normal — un RCIC se vérifie au
 * registre canadien, un avocat à son barreau. L'écran enregistre donc la
 * vérification et sa trace : quel titre, quelle juridiction, quand, et
 * par qui. L'identifiant de l'opérateur vient de la session, jamais d'un
 * champ : un nom saisi peut être celui de n'importe qui.
 */
export interface ConsultantsProps {
  consultants: readonly ConsultantAdministre[];
  /** Destinations sur lesquelles un dossier peut s'ouvrir aujourd'hui. */
  destinations: readonly { code: string; pays: string }[];
}

export function Consultants({ consultants, destinations }: ConsultantsProps) {
  const router = useRouter();
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  async function agir(cle: string, corps: Record<string, unknown>) {
    setEnCours(cle);
    setEchec(null);
    const resultat = await appeler("/api/admin/consultants", { methode: "PUT", corps });
    setEnCours(null);
    if (resultat.ok) router.refresh();
    else setEchec(resultat.echec);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none"
        >
          Habilitations des consultants
        </h1>
        <p className="text-14 text-ink-700">
          {resumeCouverture(
            consultants,
            destinations.map((d) => d.code),
          )}
        </p>
        <p className="text-13 text-ink-500">{MENTION_AUDIT}</p>
      </div>

      {echec ? <BlocEchec echec={echec} /> : null}

      <p className="max-w-[80ch] text-pretty text-13 text-ink-700">
        {RAPPEL_VERIFICATION}
      </p>

      {consultants.length === 0 ? (
        <p className="rounded-lg bg-white p-4 text-14 text-ink-700">
          Aucun consultant enregistré. L&apos;annuaire candidat reste vide tant
          qu&apos;aucune habilitation n&apos;est vérifiée — c&apos;est ce
          qu&apos;exige RG-12.1, pas une panne.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {consultants.map((consultant) => (
          <li key={consultant.id} className="flex">
            <FicheConsultant
              consultant={consultant}
              destinations={destinations}
              enCours={enCours}
              agir={agir}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FicheConsultant({
  consultant,
  destinations,
  enCours,
  agir,
}: {
  consultant: ConsultantAdministre;
  destinations: readonly { code: string; pays: string }[];
  enCours: string | null;
  agir: (cle: string, corps: Record<string, unknown>) => Promise<void>;
}) {
  const etat = etatDuConsultant(consultant);
  const couvertes = destinationsCouvertes(consultant);
  const [destination, setDestination] = useState(destinations[0]?.code ?? "");
  const [titre, setTitre] = useState("");
  const [motif, setMotif] = useState("");

  return (
    <article className="flex w-full flex-col gap-3 rounded-lg bg-white p-4 shadow-e2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex flex-col">
          <span className="text-16 font-semibold text-ink-900">{consultant.nom}</span>
          <span className="text-13 text-ink-500">
            {consultant.cabinet} · {consultant.ville} · {consultant.qualification}
          </span>
        </span>
        <span className="rounded-full bg-ink-100 px-2.5 py-1 text-13 text-ink-700">
          {LIBELLE_ETAT[etat]}
        </span>
      </div>

      <p className="text-13 text-ink-700">{CONSEQUENCE_ETAT[etat]}</p>

      {consultant.habilitations.length > 0 ? (
        <ul className="flex flex-col gap-1.5 rounded-md bg-ink-100 p-3">
          {consultant.habilitations.map((h) => (
            <li key={h.code} className="flex flex-wrap items-baseline gap-2 text-13">
              <span className="font-medium text-ink-900">{h.pays}</span>
              <span className="text-ink-700">{h.titre}</span>
              <span className="text-ink-500">
                vérifié le {jourEnFrancais(h.verifieeLe)} par {h.verifiePar.libelle}
              </span>
              {/*
                L'identifiant durable, en second et discret : c'est lui
                qu'on cherche quand on enquête, et le libellé qu'on lit
                quand on parcourt (arbitrage du 21/09/2026).
              */}
              <span className="font-mono text-ink-500">{h.verifiePar.identifiant}</span>
              {h.retireeLe ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-ink-700">
                  retiré le {jourEnFrancais(h.retireeLe)}
                </span>
              ) : (
                <Button
                  variante="tertiaire"
                  className="ml-auto"
                  chargement={enCours === `retirer:${consultant.id}:${h.code}`}
                  disabled={motif.trim().length < 3}
                  raisonDesactivation={
                    motif.trim().length < 3 ? "Indique le motif du retrait." : undefined
                  }
                  onClick={() =>
                    void agir(`retirer:${consultant.id}:${h.code}`, {
                      geste: "retirer",
                      consultantId: consultant.id,
                      countryCode: h.code,
                      motif,
                    })
                  }
                >
                  Retirer
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {couvertes.length === 0 && consultant.habilitations.length > 0 ? (
        <p className="text-13 text-ink-700">
          Toutes ses habilitations ont été retirées : les lignes restent, datées.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-3 md:flex-row md:items-end">
        <Select
          libelle="Juridiction"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          classNameChamp="md:w-[200px]"
          options={destinations.map((d) => ({ valeur: d.code, libelle: d.pays }))}
        />
        <Input
          libelle="Titre vérifié"
          placeholder="RCIC, avocat au barreau d'Amsterdam…"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          classNameChamp="md:flex-1"
        />
        <Input
          libelle="Motif"
          aide="Ce que tu as consulté pour vérifier."
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          classNameChamp="md:flex-1"
        />
        <Button
          variante="secondaire"
          className="md:w-auto"
          chargement={enCours === `habiliter:${consultant.id}`}
          disabled={titre.trim().length < 2 || motif.trim().length < 3 || !destination}
          raisonDesactivation={
            titre.trim().length < 2
              ? "Indique le titre vérifié."
              : motif.trim().length < 3
                ? "Indique ce que tu as consulté."
                : undefined
          }
          onClick={() =>
            void agir(`habiliter:${consultant.id}`, {
              geste: "habiliter",
              consultantId: consultant.id,
              countryCode: destination,
              titre,
              motif,
            })
          }
        >
          Habiliter
        </Button>
      </div>

      <div className="flex justify-end">
        <Button
          variante="tertiaire"
          chargement={enCours === `etat:${consultant.id}`}
          disabled={motif.trim().length < 3}
          raisonDesactivation={
            motif.trim().length < 3 ? "Indique le motif de la suspension." : undefined
          }
          onClick={() =>
            void agir(`etat:${consultant.id}`, {
              geste: consultant.actif ? "suspendre" : "retablir",
              consultantId: consultant.id,
              motif,
            })
          }
        >
          {consultant.actif ? "Suspendre" : "Rétablir"}
        </Button>
      </div>
    </article>
  );
}
