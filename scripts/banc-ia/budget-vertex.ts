/** Réservation prudente, durable et sans rendu automatique ; aucun quota candidat. */
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CAMPAGNE_VERTEX,
  PLAFOND_VERTEX_MICROS_XOF,
  reservationVertexMicrosXof,
  type CampagneVertex,
} from "@/domain/banc-ia/campagne-vertex";
import { compteurValide } from "@/domain/ia/usage";
import type { MesureDuBanc } from "./resultats";
const entier = z.number().int().nonnegative().max(PLAFOND_VERTEX_MICROS_XOF);
const schemaEtat = z
  .object({
    campagne: z.literal(CAMPAGNE_VERTEX),
    empreinte: z.string(),
    plafondMicrosXof: z.literal(PLAFOND_VERTEX_MICROS_XOF),
    reserveMicrosXof: entier,
    appelsReserves: z.number().int().nonnegative(),
    enCours: z.string().nullable(),
    blocage: z.string().nullable(),
    derniereMesure: z
      .object({
        etat: z.enum(["CONNUE", "PARTIELLE", "INCONNUE", "INVALIDE", "NON_APPELE", "SIMULATION"]),
        jetonsEntree: z.number().int().nonnegative().nullable(),
        jetonsSortie: z.number().int().nonnegative().nullable(),
        fournisseur: z.string().nullable(),
        modele: z.string().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
type Etat = z.infer<typeof schemaEtat>;
export class BudgetVertex {
  private ferme = false;
  private constructor(
    private fichier: string,
    private verrou: string,
    private campagne: CampagneVertex,
    private courant: Etat,
  ) {}
  static async ouvrir(dossier: string, campagne: CampagneVertex): Promise<BudgetVertex> {
    const reserve = reservationVertexMicrosXof(campagne);
    if (reserve < 0) throw new Error("Réservation invalide.");
    await mkdir(dossier, { recursive: true, mode: 0o700 });
    const fichier = path.join(dossier, "budget.json");
    const verrou = path.join(dossier, "campagne.lock");
    const lock = await open(verrou, "wx", 0o600).catch(() => {
      throw new Error(
        "Campagne Vertex déjà verrouillée : vérifier le processus et les usages avant toute reprise.",
      );
    });
    try {
      await lock.writeFile(
        JSON.stringify({ pid: process.pid, ouvertLe: new Date().toISOString() }),
      );
      const empreinte = createHash("sha256").update(JSON.stringify(campagne)).digest("hex");
      let courant: Etat;
      try {
        courant = schemaEtat.parse(JSON.parse(await readFile(fichier, "utf8")));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT")
          throw new Error("Budget Vertex illisible : aucun appel ni remise à zéro.");
        courant = {
          campagne: CAMPAGNE_VERTEX,
          empreinte,
          plafondMicrosXof: PLAFOND_VERTEX_MICROS_XOF,
          reserveMicrosXof: 0,
          appelsReserves: 0,
          enCours: null,
          blocage: null,
          derniereMesure: null,
        };
      }
      if (courant.empreinte !== empreinte)
        throw new Error(
          "La borne de campagne a changé : rapprocher les coûts, ne pas recréer le budget.",
        );
      if (courant.enCours !== null || courant.blocage !== null)
        throw new Error(
          "Campagne Vertex interrompue ou bloquée : rapprochement fournisseur obligatoire.",
        );
      const budget = new BudgetVertex(fichier, verrou, campagne, courant);
      await budget.enregistrer();
      return budget;
    } catch (e) {
      await unlink(verrou);
      throw e;
    } finally {
      await lock.close();
    }
  }
  etat(): Readonly<Etat> {
    return JSON.parse(JSON.stringify(this.courant));
  }
  private async enregistrer() {
    const temporaire = `${this.fichier}.${randomUUID()}.tmp`;
    const h = await open(temporaire, "wx", 0o600);
    try {
      await h.writeFile(JSON.stringify(this.courant, null, 2));
      await h.sync();
    } finally {
      await h.close();
    }
    await rename(temporaire, this.fichier);
    const dir = await open(path.dirname(this.fichier), "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  }
  async reserver(cas: string, fonction: string) {
    this.exigerSuite();
    if (this.courant.enCours) throw new Error("Une invocation Vertex reste en cours.");
    const reserve = reservationVertexMicrosXof(this.campagne);
    if (this.courant.reserveMicrosXof + reserve > PLAFOND_VERTEX_MICROS_XOF) {
      this.courant.blocage = "PLAFOND_AVANT_APPEL";
      await this.enregistrer();
      throw new Error(
        "Arrêt avant réseau : budget total de 5 000 XOF insuffisant pour l'invocation suivante.",
      );
    }
    this.courant.reserveMicrosXof += reserve;
    this.courant.appelsReserves++;
    this.courant.enCours = `${cas}/${fonction}`;
    await this.enregistrer();
  }
  async terminer(mesure: MesureDuBanc) {
    if (this.ferme || !this.courant.enCours)
      throw new Error("Aucune invocation budgétée en cours.");
    this.courant.derniereMesure = mesure;
    this.courant.enCours = null;
    if (mesure.etat === "NON_APPELE") {
      // Réservation conservée : une preuve d'absence d'appel ne rembourse pas une facture.
    } else if (
      mesure.etat !== "CONNUE" ||
      !compteurValide(mesure.jetonsEntree) ||
      !compteurValide(mesure.jetonsSortie)
    ) {
      this.courant.blocage = "MESURE_A_RAPPROCHER";
    } else if (
      mesure.jetonsEntree > this.campagne.jetonsEntreeMax! ||
      mesure.jetonsSortie > this.campagne.jetonsSortieFacturesMax!
    ) {
      this.courant.blocage = "BORNE_FACTUREE_DEPASSEE";
    }
    await this.enregistrer();
  }
  exigerSuite() {
    if (this.ferme || this.courant.blocage)
      throw new Error(
        "Campagne Vertex arrêtée : conserver le budget et rapprocher les coûts avant reprise.",
      );
  }
  async fermer() {
    if (this.ferme) return;
    this.ferme = true;
    await unlink(this.verrou);
  }
}
