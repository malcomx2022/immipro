"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { CHAMP_CONTROLE } from "@/components/ui/champ";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import { confirmationJuste } from "@/domain/comptes/gestion-interne";
import { LIBELLE_ROLE, ROLES, type RoleDeCompte } from "@/domain/comptes/hierarchie";
import { MOTIF_MIN } from "@/domain/comptes/role";
import { cn } from "@/lib/utils";

/**
 * Changer le rôle d'un compte — B-03, S.210. Réservé au super-administrateur.
 *
 * Double confirmation : « Changer le rôle », puis l'adresse du compte
 * ressaisie avant « Confirmer ». La route revérifie l'adresse ; l'écran
 * ne fait que dire plus tôt ce qu'elle refusera. Le changement ferme les
 * sessions du compte : la personne se reconnecte avec son nouveau rôle.
 */
export interface GestionDuRoleProps {
  compte: { id: string; email: string; role: RoleDeCompte };
}

export function GestionDuRole({ compte }: GestionDuRoleProps) {
  const router = useRouter();
  const [vers, setVers] = useState<RoleDeCompte>(compte.role);
  const [motif, setMotif] = useState("");
  const [etape, setEtape] = useState<"choix" | "confirmation">("choix");
  const [adresse, setAdresse] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [fait, setFait] = useState<string | null>(null);

  const manque =
    vers === compte.role
      ? "Choisis un rôle différent du rôle actuel."
      : motif.trim().length < MOTIF_MIN
        ? `Écris pourquoi, en ${MOTIF_MIN} caractères au moins : le motif part au journal d'audit.`
        : null;
  const adresseJuste = confirmationJuste(adresse, compte.email);

  async function confirmer() {
    if (manque || !adresseJuste) return;
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ de: RoleDeCompte; vers: RoleDeCompte; sessionsFermees: number }>(
      "/api/admin/comptes/role",
      { methode: "POST", corps: { userId: compte.id, role: vers, motif, confirmation: adresse } },
    );
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    const { de, sessionsFermees } = resultat.donnees;
    setFait(
      `Rôle changé : ${LIBELLE_ROLE[de]} → ${LIBELLE_ROLE[resultat.donnees.vers]}. ${
        sessionsFermees > 1
          ? `${sessionsFermees} sessions fermées`
          : sessionsFermees === 1
            ? "Une session fermée"
            : "Aucune session ouverte"
      } : la personne se reconnecte avec son nouveau rôle.`,
    );
    setEtape("choix");
    setMotif("");
    setAdresse("");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-ink-300 bg-white p-4">
      <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">Rôle du compte</h2>
      <p className="text-14 text-ink-900">Actuel : {LIBELLE_ROLE[compte.role]}</p>

      <label className="flex flex-col gap-1.5 text-14 font-medium text-ink-900">
        Nouveau rôle
        <select
          value={vers}
          disabled={etape === "confirmation"}
          onChange={(e) => {
            setVers(e.target.value as RoleDeCompte);
            setFait(null);
          }}
          className={CHAMP_CONTROLE}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {LIBELLE_ROLE[r]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-14 font-medium text-ink-900">
        Motif du changement
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
          Changer le rôle
        </Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-100 p-3">
          <p className="text-pretty text-14 text-ink-900">
            {`${LIBELLE_ROLE[compte.role]} → ${LIBELLE_ROLE[vers]}. Les sessions de ce compte vont se fermer. Pour confirmer, ressaisis l'adresse du compte.`}
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
              {envoi ? "Envoi…" : "Confirmer le changement"}
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
