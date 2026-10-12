// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";
import { fournisseursDuParcours } from "../scripts/recette/fournisseurs-parcours";

describe("Banc fonctionnel local L6", () => {
  it("refuse de notifier une application distante", async () => {
    await expect(fournisseursDuParcours("https://immipro.test")).rejects.toThrow("locale");
  });
  it("réutilise le paiement et signe la notification avec le montant payé", async () => {
    let charge = "";
    let signature = "";
    const app = createServer(async (req, res) => {
      for await (const bloc of req) charge += String(bloc);
      signature = String(req.headers["stripe-signature"]);
      res.end("{}");
    });
    await new Promise<void>((ok) => app.listen(0, "127.0.0.1", ok));
    const origine = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    const faux = await fournisseursDuParcours(origine);
    const base = `http://127.0.0.1:${faux.port}`;
    try {
      const body = new URLSearchParams({
        "line_items[0][price_data][unit_amount]": "7900",
        "line_items[0][price_data][currency]": "EUR",
        "metadata[reference]": "achat-local",
        success_url: origine + "/retour",
      });
      const creer = () =>
        fetch(base + "/v1/checkout/sessions", {
          method: "POST",
          headers: { "idempotency-key": "meme-achat" },
          body,
        }).then((r) => r.json());
      const premier = await creer();
      expect((await creer()).id).toBe(premier.id);
      const paiement = await fetch(base + "/payer/" + premier.id, { redirect: "manual" });
      expect(paiement.status).toBe(303);
      expect(paiement.headers.get("location")).toBe(origine + "/retour");
      const t = /t=(\d+)/.exec(signature)![1];
      expect(signature).toContain(
        createHmac("sha256", faux.secret)
          .update(t + "." + charge)
          .digest("hex"),
      );
      expect(JSON.parse(charge).data.object).toMatchObject({
        payment_status: "paid",
        amount_total: 7900,
        currency: "EUR",
        metadata: { reference: "achat-local" },
      });
      expect(await fetch(base + "/stats").then((r) => r.json())).toMatchObject({
        paiements: 1,
        notifications: 1,
      });
    } finally {
      await faux.arreter();
      app.closeAllConnections();
      await new Promise<void>((ok) => app.close(() => ok()));
    }
  });
  it("rend une panne puis une réponse sans usage mesuré sur commande explicite", async () => {
    const faux = await fournisseursDuParcours("http://localhost:3100");
    const base = `http://127.0.0.1:${faux.port}`;
    try {
      const mode = (mode: string) =>
        fetch(base + "/controle", { method: "POST", body: JSON.stringify({ mode }) });
      const lire = () =>
        fetch(base + "/v1/chat/completions", {
          method: "POST",
          body: JSON.stringify({
            response_format: {
              json_schema: {
                name: "lecture",
                schema: {
                  properties: { champs: { properties: { identite: { type: "string" } } } },
                },
              },
            },
            messages: [{ content: [{ type: "text", text: "Pièce attendue (code passeport)" }] }],
          }),
        });
      await mode("indisponible");
      expect((await lire()).status).toBe(503);
      await mode("sans_usage");
      const r = await (await lire()).json();
      expect(r.usage).toBeUndefined();
      expect(JSON.parse(r.choices[0].message.content).piece_identifiee).toBe("passeport");
      expect((await mode("inconnu")).status).toBe(400);
    } finally {
      await faux.arreter();
    }
  });
});

describe("Transport isolé du banc", () => {
  it("détourne Stripe vers loopback et refuse Google avant toute requête", () => {
    const fichier = resolve("scripts/recette/transport-parcours.mjs");
    const r = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
   const appels=[];globalThis.fetch=async(url,options)=>{appels.push({url:String(url),body:options?.body});return new Response('{}');};
   await import(${JSON.stringify("file://" + fichier)});
   await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',body:'montant=2900'});
   let refuse=false;try{await fetch('https://oauth2.googleapis.com/token')}catch{refuse=true}
   console.log(JSON.stringify({appels,refuse}));
  `,
      ],
      { encoding: "utf8", env: { ...process.env, RECETTE_PARCOURS_URL: "http://127.0.0.1:3101" } },
    );
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      appels: [{ url: "http://127.0.0.1:3101/v1/checkout/sessions", body: "montant=2900" }],
      refuse: true,
    });
  });
  it("refuse une destination de substitution distante au démarrage", () => {
    const r = spawnSync(
      process.execPath,
      ["--import", resolve("scripts/recette/transport-parcours.mjs"), "-e", "process.exit(0)"],
      {
        encoding: "utf8",
        env: { ...process.env, RECETTE_PARCOURS_URL: "https://prestataire.test" },
      },
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("boucle locale");
  });
});
