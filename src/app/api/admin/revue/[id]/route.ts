import { z } from "zod";
import { route } from "@/server/http/route";
import { trancherLaRevue } from "@/server/revue/decision";
import type { Decision } from "@/domain/backoffice/revue";

/**
 * Décision de revue — B-05.
 *
 * Le message au candidat passe par la même validation que tout le reste :
 * un constat nu — « non conforme » — est refusé, et une promesse aussi. RG-06.3
 * s'applique à un humain comme à la machine, et c'est même ici qu'il compte
 * le plus : le candidat lit ce message comme la parole d'une personne.
 *
 * Encore faut-il qu'il le reçoive. Il était validé, écrit en base et recopié
 * sur la pièce, et aucun avis n'en partait — alors que les trois verdicts de
 * la machine en produisent un chacun. La décision, l'avis et le recrédit
 * vivent désormais dans `server/revue/decision.ts`, hors de `next/headers`,
 * là où une fumée peut les exécuter et compter ce qui a été écrit.
 *
 * Une analyse rendue recrédite le quota (INV-6) : la lecture automatique n'a
 * rien rendu, elle n'a donc rien à coûter. Le recrédit est idempotent, une
 * décision rejouée ne rend pas deux analyses.
 */
export const POST = route({
  nom: "admin.revue.decision",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    decision: z.enum(["CONFORME", "A_CORRIGER", "ILLISIBLE", "HORS_SUJET"]),
    message: z.string().trim().min(1),
    motif: z.string().trim().min(3).max(500),
  }),
  traiter: ({ corps, params, acteur }) =>
    trancherLaRevue(
      params.id!,
      { id: acteur!.id },
      {
        decision: corps.decision as Decision,
        message: corps.message,
        motif: corps.motif,
      },
    ),
});
