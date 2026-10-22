/** Réponses scriptées sur la boucle locale, pas une qualification fournisseur. */
import { createServer } from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
export async function fournisseursDuParcours(
  app: string,
  stockage?: { refuserLesSuppressions: (refus: boolean) => void },
) {
  const origine = new URL(app);
  if (
    origine.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(origine.hostname)
  )
    throw Error("Application locale requise.");
  const secret = `whsec_recette_${randomBytes(12).toString("hex")}`;
  // `lente` : mêmes réponses que `lue`, après un délai — réponse tardive et
  // double onglet de la recette L6. Jamais un fournisseur réel.
  let mode = "lue";
  let delai = 3_000;
  const stats = { lectures: 0, redactions: 0, critiques: 0, paiements: 0, notifications: 0 };
  const sessions = new Map<
    string,
    {
      id: string;
      url: string;
      amount_total: number;
      currency: string;
      metadata: { reference: string };
      retour: string;
      payment_status: string;
    }
  >();
  const cles = new Map<string, string>();
  const serveur = createServer(async (req, res) => {
    try {
      let texte = "";
      for await (const bloc of req) texte += String(bloc);
      const u = new URL(req.url!, "http://localhost");
      const json = (charge: unknown, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(charge));
      };
      if (u.pathname === "/stats") {
        json(stats);
        return;
      }
      if (u.pathname === "/controle" && req.method === "POST") {
        const c = JSON.parse(texte);
        if (!["lue", "illisible", "sans_usage", "indisponible", "lente"].includes(c.mode)) {
          json({ erreur: "mode inconnu" }, 400);
          return;
        }
        mode = c.mode;
        if (Number.isInteger(c.delai) && c.delai >= 0 && c.delai <= 30_000) delai = c.delai;
        json({ mode, delai });
        return;
      }
      // R-O05 : un stockage qui refuse les suppressions, puis qui répond.
      if (u.pathname === "/stockage" && req.method === "POST" && stockage) {
        const c = JSON.parse(texte);
        if (!["refusees", "acceptees"].includes(c.suppressions)) {
          json({ erreur: "état inconnu" }, 400);
          return;
        }
        stockage.refuserLesSuppressions(c.suppressions === "refusees");
        json({ suppressions: c.suppressions });
        return;
      }
      if (u.pathname === "/v1/chat/completions") {
        const c = JSON.parse(texte);
        if (mode === "lente") await new Promise((ok) => setTimeout(ok, delai));
        const nom = c.response_format?.json_schema?.name;
        let contenu: string;
        if (nom === "lecture") {
          stats.lectures++;
          if (mode === "indisponible") {
            json({}, 503);
            return;
          }
          const instructions = c.messages[0].content.find(
            (p: { type: string }) => p.type === "text",
          ).text;
          const code = /\(code ([^)]+)\)/u.exec(instructions)?.[1] ?? null;
          const schema = c.response_format.json_schema.schema.properties.champs.properties;
          const champs = Object.fromEntries(
            Object.entries(schema).map(([cle, desc]) => [
              cle,
              mode === "illisible"
                ? null
                : JSON.stringify(desc).includes('"number"')
                  ? 100000
                  : /date|validite/iu.test(cle)
                    ? "2035-01-01"
                    : "Mention synthétique présente",
            ]),
          );
          contenu = JSON.stringify({
            piece_identifiee: mode === "illisible" ? null : code,
            obstacle: mode === "illisible" ? "scan_illisible" : null,
            champs,
          });
        } else if (nom === "critique") {
          stats.critiques++;
          contenu = '{"remarques":[]}';
        } else {
          stats.redactions++;
          contenu =
            "Madame, Monsieur, je présente ma candidature au programme décrit dans mon entretien. Mon parcours et mon projet sont repris dans mes réponses. Je poursuis cette préparation avec les informations que j'ai fournies. Salutations respectueuses.";
        }
        json({
          choices: [{ message: { content: contenu }, finish_reason: "stop" }],
          ...(mode === "sans_usage"
            ? {}
            : { usage: { prompt_tokens: 120, completion_tokens: 30 } }),
        });
        return;
      }
      if (u.pathname === "/v1/checkout/sessions" && req.method === "POST") {
        const body = new URLSearchParams(texte);
        const cle = String(req.headers["idempotency-key"] ?? "");
        if (cles.has(cle)) {
          json(sessions.get(cles.get(cle)!));
          return;
        }
        const id = `cs_recette_${sessions.size + 1}`;
        const session = {
          id,
          url: `https://checkout.stripe.com/c/pay/${id}`,
          amount_total: Number(body.get("line_items[0][price_data][unit_amount]")),
          currency: body.get("line_items[0][price_data][currency]")!,
          metadata: { reference: body.get("metadata[reference]")! },
          retour: body.get("success_url")!,
          payment_status: "unpaid",
        };
        sessions.set(id, session);
        cles.set(cle, id);
        stats.paiements++;
        json(session);
        return;
      }
      if (u.pathname.startsWith("/v1/checkout/sessions/")) {
        const s = sessions.get(u.pathname.split("/").at(-1)!);
        json(s ?? {}, s ? 200 : 404);
        return;
      }
      if (u.pathname.startsWith("/payer/")) {
        const s = sessions.get(u.pathname.split("/").at(-1)!);
        if (!s) {
          json({}, 404);
          return;
        }
        s.payment_status = "paid";
        const evt = JSON.stringify({
          id: `evt_${s.id}`,
          type: "checkout.session.completed",
          data: { object: s },
        });
        const t = String(Math.floor(Date.now() / 1000));
        const signature = createHmac("sha256", secret).update(`${t}.${evt}`).digest("hex");
        const r = await fetch(new URL("/api/webhooks/stripe", origine), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Stripe-Signature": `t=${t},v1=${signature}`,
          },
          body: evt,
        });
        if (!r.ok) {
          json({ erreur: "notification refusée", statut: r.status }, 502);
          return;
        }
        stats.notifications++;
        res.writeHead(303, { Location: s.retour });
        res.end();
        return;
      }
      json({ erreur: "chemin de recette inconnu" }, 404);
    } catch {
      res.writeHead(500);
      res.end("Erreur du fournisseur synthétique.");
    }
  });
  await new Promise<void>((ok, non) => {
    serveur.once("error", non);
    serveur.listen(0, "127.0.0.1", ok);
  });
  const port = (serveur.address() as AddressInfo).port;
  return {
    port,
    secret,
    arreter: async () => {
      serveur.closeAllConnections();
      await new Promise<void>((ok) => serveur.close(() => ok()));
    },
  };
}
