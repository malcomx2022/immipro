import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as patienter } from "node:timers/promises";

/** Refuser le port avant de supprimer une base ou d'ouvrir des services. */
export async function verifierPortDisponible(port: number): Promise<void> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("--port doit être un entier entre 1 et 65535.");
  }
  const serveur = createServer();
  await new Promise<void>((ok, non) => {
    serveur.once("error", () =>
      non(
        new Error(`Le port ${port} est indisponible : arrêter l'autre instance ou choisir --port.`),
      ),
    );
    serveur.listen(port, "127.0.0.1", () => serveur.close((e) => (e ? non(e) : ok())));
  });
}

/** Supervise les deux processus réels pendant le démarrage et la recette. */
export class ProcessusDuBanc {
  private enfants: ChildProcess[] = [];
  private enArret = false;
  private arret?: Promise<void>;
  private signaler!: (erreur: Error) => void;
  private echec: Promise<Error> = new Promise((ok) => {
    this.signaler = ok;
  });

  constructor(private surEchec: (erreur: Error) => void = () => undefined) {}

  lancer(nom: string, commande: string, args: string[], options: SpawnOptions): ChildProcess {
    if (this.enArret) throw new Error("Le banc est en cours d'arrêt.");
    const enfant = spawn(commande, args, options);
    this.enfants.push(enfant);
    const echouer = (detail: string) => {
      if (this.enArret) return;
      const erreur = new Error(
        `${nom} s'est arrêté (${detail}) : consulter son journal puis relancer le banc.`,
      );
      this.signaler(erreur);
      this.surEchec(erreur);
    };
    enfant.once("error", (erreur) => echouer(erreur.message));
    enfant.once("exit", (code, signal) => echouer(signal ?? `code ${code}`));
    return enfant;
  }

  async attendrePret(options: {
    url: string;
    jeton: string;
    delaiMs?: number;
    intervalleMs?: number;
    bloquantesPermises?: readonly string[];
  }): Promise<void> {
    const fin = Date.now() + (options.delaiMs ?? 60_000);
    const controle = async () => {
      while (!this.enArret && Date.now() < fin) {
        try {
          const reponse = await fetch(options.url, {
            headers: { Authorization: `Bearer ${options.jeton}` },
            signal: AbortSignal.timeout(Math.max(1, Math.min(2_000, fin - Date.now()))),
            redirect: "error",
          });
          const corps: unknown = await reponse.json();
          // Le banc n'a volontairement aucun rail de paiement. Une santé
          // 503 n'y est tolérée que pour ces dépendances explicitement coupées,
          // jamais pour la base, le courrier, l'antivirus ou le worker.
          const absenceAttendue =
            reponse.status === 503 &&
            corps !== null &&
            typeof corps === "object" &&
            "bloquantes" in corps &&
            Array.isArray(corps.bloquantes) &&
            corps.bloquantes.length > 0 &&
            corps.bloquantes.every(
              (cle: unknown) =>
                typeof cle === "string" && options.bloquantesPermises?.includes(cle),
            );
          // Une santé publique ne porte pas « dependances ». Ce détail exige
          // le jeton aléatoire de cette passe ; une ancienne instance ne peut
          // donc pas valider le nouveau banc avec son seul 200 public.
          if (
            (reponse.ok || absenceAttendue) &&
            corps !== null &&
            typeof corps === "object" &&
            "db" in corps &&
            corps.db === "up" &&
            "dependances" in corps &&
            corps.dependances !== null &&
            typeof corps.dependances === "object" &&
            !Array.isArray(corps.dependances)
          )
            return;
        } catch {
          // Connexion refusée, réponse lente ou invalide : attendre dans la borne.
        }
        await patienter(Math.max(1, Math.min(options.intervalleMs ?? 500, fin - Date.now())));
      }
      throw new Error(
        "Le banc n'est pas prêt dans le délai prévu : vérifier les journaux app/worker et le port avant de relancer.",
      );
    };
    const resultat = await Promise.race([controle(), this.echec]);
    if (resultat instanceof Error) throw resultat;
  }

  arreter(delaiMs = 3_000): Promise<void> {
    if (this.arret) return this.arret;
    this.enArret = true;
    this.arret = Promise.all(
      this.enfants.map(
        (enfant) =>
          new Promise<void>((ok) => {
            if (!enfant.pid || enfant.exitCode !== null || enfant.signalCode !== null) return ok();
            const borne = setTimeout(() => enfant.kill("SIGKILL"), delaiMs);
            enfant.once("exit", () => {
              clearTimeout(borne);
              ok();
            });
            enfant.kill("SIGTERM");
          }),
      ),
    ).then(() => undefined);
    return this.arret;
  }
}
