/** Une destination approuvée ne délègue pas l'envoi des pièces ou des secrets. */
export const estUneRedirection = (statut: number): boolean => statut >= 300 && statut < 400;

/**
 * S.172 / complément REV11-L1 : aucun second envoi, même sur la même origine.
 * La réponse 3xx est vidée avant de la remettre au SDK : un service peut
 * renvoyer la demande ou des secrets dans son corps ou son en-tête Location.
 * Les réponses directes et les délais propres aux appelants sont conservés.
 */
export const fetchSansRedirection: typeof fetch = async (entree, options) => {
  const reponse = await fetch(entree, { ...options, redirect: "manual" });
  if (!estUneRedirection(reponse.status)) return reponse;
  await reponse.body?.cancel().catch(() => undefined);
  return new Response(null, { status: reponse.status });
};
