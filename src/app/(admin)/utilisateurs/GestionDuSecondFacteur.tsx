"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { CHAMP_CONTROLE } from "@/components/ui/champ";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import { confirmationJuste } from "@/domain/comptes/gestion-interne";
import { MOTIF_MIN } from "@/domain/comptes/role";
import { cn } from "@/lib/utils";

/**
 * Réinitialiser la double authentification d'un compte — B-03, S.214.
 * Réservé au super-administrateur, sur le compte d'un autre.
 *
 * Le geste de qui a perdu son téléphone et ses codes de secours : il
 * retire le second facteur et ferme les sessions du compte. Double
 * confirmation, comme le changement de rôle : « Réinitialiser », puis
 * l'adresse du compte ressaisie ; la route la revérifie.
 */
export function GestionDuSecondFacteur({ compte }: { compte: { id: string; email: string } }) {
  const router = useRouter();
  const [motif, setMotif] = useState("");
  const [etape, setEtape] = useState<"choix" | "confirmation">("choix");
  const [adresse, setAdresse] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [fait, setFait] = useState<string | null>(null);

  const manque =
    motif.trim().length < MOTIF_MIN
      ? `Écris pourquoi, en ${MOTIF_MIN} caractères au moins (par exemple la vérification d'identité faite) : le motif part au journal d'audit.`
      : null;
  const adresseJuste = confirmationJuste(adresse, compte.email);

  async function confirmer() {
    if (manque || !adresseJuste) return;
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ reinitialise: boolean; sessionsFermees: number }>(
      "/api/admin/comptes/second-facteur",
      { methode: "POST", corps: { userId: compte.id, motif, confirmation: adresse } },
    );
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    setFait(
      "Double authentification retirée et sessions fermées. La personne se connecte avec son mot de passe, puis peut la réactiver depuis « Sécurité du compte ».",
    );
    setEtape("choix");
    setMotif("");
    setAdresse("");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-ink-300 bg-white p-4">
      <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">Double authentification</h2>
      <p className="text-pretty text-14 text-ink-700">
        Active sur ce compte. À réinitialiser seulement après avoir vérifié l&apos;identité de la personne, qui a
        perdu son téléphone et ses codes de secours.
      </p>
      <label className="flex flex-col gap-1.5 text-14 font-medium text-ink-900">
        Motif de la réinitialisation
        <textarea
          rows={2}
          value={motif}
          disabled={etape === "confirmation"}
          onChange={(e) => setMotif(e.target.value)}
          className={cn(CHAMP_CONTROLE, "h-auto py-2.5")}
        />
      </label>

      {echec ? <BlocEchec echec={echec} annonce /> : null}
      {fait ? (
        <p role="status" className="text-pretty rounded-md border border-ink-300 bg-ink-100 p-3 text-14 text-ink-900">
          {fait}
        </p>
      ) : null}

      {etape === "choix" ? (
        <Button
          variante="secondaire"
          pleineLargeur
          disabled={manque !== null}
          raisonDesactivation={manque ?? undefined}
          onClick={() => {
            setEchec(null);
            setFait(null);
            setEtape("confirmation");
          }}
        >
          Réinitialiser la double authentification
        </Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-100 p-3">
          <p className="text-pretty text-14 text-ink-900">
            Le second facteur et les codes de secours de ce compte vont être supprimés, et ses sessions fermées. Pour
            confirmer, ressaisis l&apos;adresse du compte.
          </p>
          <label className="flex flex-col gap-1.5 text-14 font-medium text-ink-900">
            Adresse du compte
            <input
              type="email"
              autoComplete="off"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              className={CHAMP_CONTROLE}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!adresseJuste || envoi}
              raisonDesactivation={envoi ? "Envoi en cours." : "Ressaisis exactement l'adresse du compte."}
              onClick={() => void confirmer()}
            >
              {envoi ? "Envoi…" : "Confirmer la réinitialisation"}
            </Button>
            <Button
              variante="tertiaire"
              disabled={envoi}
              onClick={() => {
                setEtape("choix");
                setAdresse("");
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
