"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { CodeQr } from "@/components/ui/CodeQr";
import { Input } from "@/components/ui/Input";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import type { EtatDuSecondFacteur } from "@/server/comptes/second-facteur";
import {
  CHIFFRES_TOTP,
  NOMBRE_CODES_DE_SECOURS,
  libelleCodesRestants,
  lireLaSaisie,
  secretEnGroupes,
} from "@/domain/comptes/deux-facteurs";
import { momentEnFrancais } from "@/domain/format/moment";

/**
 * « Sécurité » — la double authentification, S.214.
 *
 * Trois états, et chaque geste qui l'affaiblit demande une preuve :
 *
 * - **inactive** : « Activer » demande le mot de passe, puis montre le
 *   code QR et le secret en clair (pour une saisie à la main), puis attend
 *   un premier code juste. Les dix codes de secours s'affichent alors, une
 *   seule fois : l'écran demande de confirmer qu'ils sont notés ;
 * - **active** : de nouveaux codes de secours contre un code de
 *   l'application ; la désactivation contre le mot de passe **et** un code,
 *   après une première confirmation ;
 * - **indisponible** : le serveur n'a pas de clé de chiffrement. L'écran
 *   le dit, sans interrupteur.
 *
 * Le secret et les codes ne vivent que dans l'état de ce composant : ils
 * ne sont jamais réécrits dans l'adresse, ni dans le stockage du navigateur.
 */
type Etape =
  | { nom: "repos" }
  | { nom: "motDePasse" }
  | { nom: "scan"; secret: string; adresse: string }
  | { nom: "codes"; codes: string[]; apresActivation: boolean }
  | { nom: "nouveauxCodes" }
  | { nom: "desactivation" };

export function DoubleAuthentification({ etat }: { etat: EtatDuSecondFacteur }) {
  const router = useRouter();
  const [etape, setEtape] = useState<Etape>({ nom: "repos" });
  const [motDePasse, setMotDePasse] = useState("");
  const [code, setCode] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [fait, setFait] = useState<string | null>(null);

  const totpComplet = lireLaSaisie(code).genre === "totp";
  const codeOuSecours = lireLaSaisie(code).genre !== "illisible";

  function aller(suivante: Etape) {
    setEtape(suivante);
    setMotDePasse("");
    setCode("");
    setEchec(null);
  }

  async function envoyer<T>(corps: Record<string, string>): Promise<T | null> {
    setEnvoi(true);
    setEchec(null);
    setFait(null);
    const resultat = await appeler<T>("/api/comptes/second-facteur", { corps });
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return null;
    }
    return resultat.donnees;
  }

  async function preparer() {
    const r = await envoyer<{ secret: string; adresse: string }>({ action: "preparer", motDePasse });
    if (r) aller({ nom: "scan", secret: r.secret, adresse: r.adresse });
  }

  async function activer() {
    const r = await envoyer<{ codesDeSecours: string[]; sessionsFermees: number }>({ action: "activer", code });
    if (r) aller({ nom: "codes", codes: r.codesDeSecours, apresActivation: true });
  }

  async function renouveler() {
    const r = await envoyer<{ codesDeSecours: string[] }>({ action: "codes", code });
    if (r) aller({ nom: "codes", codes: r.codesDeSecours, apresActivation: false });
  }

  async function desactiver() {
    const r = await envoyer<{ sessionsFermees: number }>({ action: "desactiver", motDePasse, code });
    if (r) {
      aller({ nom: "repos" });
      setFait("Double authentification désactivée. Tes autres sessions sont fermées ; la connexion ne demande plus que ton mot de passe.");
      router.refresh();
    }
  }

  const erreurDuChamp = (cle: string) => echec?.champs?.[cle];
  const echecGeneral = echec && !echec.champs ? echec : null;

  return (
    <section className="flex flex-col gap-3 border-t border-ink-300 pt-5" aria-labelledby="titre-deux-facteurs">
      <h2 id="titre-deux-facteurs" className="text-16 font-semibold text-ink-900">
        Double authentification
      </h2>

      {fait ? (
        <p role="status" className="text-pretty rounded-md border border-ink-300 bg-ink-100 p-3 text-14 text-ink-900">
          {fait}
        </p>
      ) : null}
      {echecGeneral ? <BlocEchec echec={echecGeneral} annonce /> : null}

      {!etat.disponible && !etat.active ? (
        <p className="text-pretty text-14 text-ink-700">
          Pas encore disponible sur ce serveur. Ton compte reste protégé par ton mot de passe, le
          blocage après cinq essais faux et la fermeture des sessions à chaque changement de mot de passe.
        </p>
      ) : null}

      {etat.disponible && !etat.active && etape.nom === "repos" ? (
        <>
          <p className="text-pretty text-14 text-ink-700">
            {`À chaque connexion, en plus du mot de passe, un code à ${CHIFFRES_TOTP} chiffres affiché par une application d'authentification (Google Authenticator, Aegis, FreeOTP…). Un mot de passe deviné ou volé ne suffit plus à ouvrir ton compte.`}
          </p>
          <Button variante="secondaire" onClick={() => aller({ nom: "motDePasse" })}>
            Activer la double authentification
          </Button>
        </>
      ) : null}

      {etape.nom === "motDePasse" ? (
        <form
          noValidate
          className="flex flex-col gap-3 rounded-md border border-ink-300 bg-ink-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (motDePasse && !envoi) void preparer();
          }}
        >
          <p className="text-pretty text-14 text-ink-900">Pour commencer, ressaisis ton mot de passe.</p>
          <Input
            libelle="Mot de passe"
            type="password"
            autoComplete="current-password"
            value={motDePasse}
            erreur={erreurDuChamp("motDePasse")}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!motDePasse} chargement={envoi} raisonDesactivation="Saisis ton mot de passe.">
              Continuer
            </Button>
            <Button variante="tertiaire" disabled={envoi} onClick={() => aller({ nom: "repos" })}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}

      {etape.nom === "scan" ? (
        <form
          noValidate
          className="flex flex-col gap-3 rounded-md border border-ink-300 bg-ink-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (totpComplet && !envoi) void activer();
          }}
        >
          <p className="text-pretty text-14 text-ink-900">
            1. Dans ton application d&apos;authentification, ajoute un compte en scannant ce code.
          </p>
          <CodeQr valeur={etape.adresse} libelle="Code QR à scanner avec ton application d'authentification" />
          <p className="text-pretty text-14 text-ink-700">
            Impossible de scanner ? Saisis cette clé à la main, type « basée sur le temps » :
          </p>
          <p data-testid="secret-totp" className="break-all font-mono text-14 text-ink-900">
            {secretEnGroupes(etape.secret)}
          </p>
          <p className="text-pretty text-14 text-ink-900">2. Saisis le code affiché pour confirmer.</p>
          <Input
            libelle="Code à six chiffres"
            autoComplete="one-time-code"
            inputMode="numeric"
            value={code}
            erreur={erreurDuChamp("code")}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={!totpComplet}
              chargement={envoi}
              raisonDesactivation={`Saisis les ${CHIFFRES_TOTP} chiffres affichés par ton application.`}
            >
              Confirmer l&apos;activation
            </Button>
            <Button variante="tertiaire" disabled={envoi} onClick={() => aller({ nom: "repos" })}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}

      {etape.nom === "codes" ? (
        <div className="flex flex-col gap-3 rounded-md border border-ink-500 bg-white p-3">
          <p role="status" className="text-pretty text-14 font-semibold text-ink-900">
            {etape.apresActivation
              ? "Double authentification activée. Tes autres sessions sont fermées."
              : "Nouveaux codes de secours générés. Les anciens ne servent plus."}
          </p>
          <p className="text-pretty text-14 text-ink-700">
            {`Note ces ${NOMBRE_CODES_DE_SECOURS} codes de secours et garde-les hors de ton téléphone. Chacun ouvre ton compte une fois si tu perds ton téléphone. Ils ne s'afficheront plus.`}
          </p>
          <ul data-testid="codes-de-secours" className="grid grid-cols-2 gap-2 font-mono text-14 text-ink-900">
            {etape.codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Button
            onClick={() => {
              aller({ nom: "repos" });
              router.refresh();
            }}
          >
            J&apos;ai noté mes codes
          </Button>
        </div>
      ) : null}

      {etat.active && etape.nom !== "codes" ? (
        <>
          <p className="text-pretty text-14 text-ink-700">
            {etat.activeLe ? `Activée le ${momentEnFrancais(etat.activeLe)}. ` : "Activée. "}
            Chaque connexion demande un code de ton application.
          </p>
          <p className="text-pretty text-14 text-ink-700">{libelleCodesRestants(etat.codesRestants)}</p>
        </>
      ) : null}

      {etat.active && etape.nom === "repos" ? (
        <div className="flex flex-wrap gap-2">
          <Button variante="secondaire" onClick={() => aller({ nom: "nouveauxCodes" })}>
            Générer de nouveaux codes de secours
          </Button>
          <Button variante="tertiaire" onClick={() => aller({ nom: "desactivation" })}>
            Désactiver
          </Button>
        </div>
      ) : null}

      {etape.nom === "nouveauxCodes" ? (
        <form
          noValidate
          className="flex flex-col gap-3 rounded-md border border-ink-300 bg-ink-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (totpComplet && !envoi) void renouveler();
          }}
        >
          <p className="text-pretty text-14 text-ink-900">
            Les codes de secours actuels cesseront de fonctionner. Saisis le code de ton application pour confirmer.
          </p>
          <Input
            libelle="Code à six chiffres"
            autoComplete="one-time-code"
            inputMode="numeric"
            value={code}
            erreur={erreurDuChamp("code")}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!totpComplet} chargement={envoi} raisonDesactivation={`Saisis les ${CHIFFRES_TOTP} chiffres affichés par ton application.`}>
              Générer les codes
            </Button>
            <Button variante="tertiaire" disabled={envoi} onClick={() => aller({ nom: "repos" })}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}

      {etape.nom === "desactivation" ? (
        <form
          noValidate
          className="flex flex-col gap-3 rounded-md border border-ink-500 bg-ink-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (motDePasse && codeOuSecours && !envoi) void desactiver();
          }}
        >
          <p className="text-pretty text-14 text-ink-900">
            Sans double authentification, ton mot de passe seul ouvrira ton compte. Tes autres sessions vont se
            fermer. Pour confirmer, saisis ton mot de passe et un code de ton application (ou un code de secours).
          </p>
          <Input
            libelle="Mot de passe"
            type="password"
            autoComplete="current-password"
            value={motDePasse}
            erreur={erreurDuChamp("motDePasse")}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
          <Input
            libelle="Code de l'application ou code de secours"
            autoComplete="one-time-code"
            value={code}
            erreur={erreurDuChamp("code")}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variante="secondaire"
              disabled={!motDePasse || !codeOuSecours}
              chargement={envoi}
              raisonDesactivation="Saisis ton mot de passe et un code."
            >
              Confirmer la désactivation
            </Button>
            <Button variante="tertiaire" disabled={envoi} onClick={() => aller({ nom: "repos" })}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
