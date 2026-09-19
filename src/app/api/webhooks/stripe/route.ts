import { route } from "@/server/http/route";
import { signatureStripe } from "@/server/paiement/signature";
import { lireStripe } from "@/server/paiement/notifications";
import { traiterLaNotification } from "@/server/paiement/reception";
import { z } from "zod";

/** Webhook Stripe — rail carte. Mêmes règles que FedaPay. */
export const POST = route({
  nom: "webhooks.stripe",
  acces: "public",
  limite: "webhook",
  signature: signatureStripe,
  corps: z.unknown(),
  async traiter({ corps }) {
    return traiterLaNotification(lireStripe(corps), "stripe");
  },
});
