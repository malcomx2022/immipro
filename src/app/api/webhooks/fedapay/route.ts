import { route } from "@/server/http/route";
import { signatureFedaPay } from "@/server/paiement/signature";
import { lireFedaPay } from "@/server/paiement/notifications";
import { traiterLaNotification } from "@/server/paiement/reception";
import { z } from "zod";

/**
 * Webhook FedaPay — rail Mobile Money, RG-05.1 à RG-05.3.
 *
 * Exclu de la limitation de débit, et c'est ce qui rend la vérification de
 * signature non négociable : rien d'autre ne ralentit un appelant sur cette
 * adresse. La dispense passe par `limite: "webhook"`, qui oblige à fournir
 * `signature` — le type le refuse autrement, et un test relit les fichiers
 * pour qu'aucune route ne prenne la dispense sans la contrepartie.
 */
export const POST = route({
  nom: "webhooks.fedapay",
  acces: "public",
  limite: "webhook",
  signature: signatureFedaPay,
  corps: z.unknown(),
  async traiter({ corps }) {
    return traiterLaNotification(lireFedaPay(corps), "fedapay");
  },
});
