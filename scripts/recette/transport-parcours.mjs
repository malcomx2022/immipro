/** Préchargeur explicite du banc L6 ; aucune requête externe n'est autorisée. */
const base = new URL(process.env.RECETTE_PARCOURS_URL ?? "");
if (base.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
  throw new Error("Transport de recette réservé à la boucle locale.");
}
const initial = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === "api.stripe.com") {
    return initial(new URL(url.pathname + url.search, base), options);
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("La recette L6 ne contacte aucun fournisseur externe.");
  }
  return initial(input, options);
};
