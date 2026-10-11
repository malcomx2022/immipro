/** Environnement du banc local, jamais celui des fournisseurs de production. */
export function environnementDuBanc(
  parent: Readonly<Record<string, string | undefined>>,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  // Exécution, proxy et certificats seulement. NODE_OPTIONS peut charger un
  // fichier d'environnement ou du code : il ne doit pas traverser cette garde.
  for (const cle of [
    "PATH",
    "HOME",
    "USERPROFILE",
    "SystemRoot",
    "SYSTEMROOT",
    "COMSPEC",
    "PATHEXT",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "TZ",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
    "NODE_EXTRA_CA_CERTS",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ]) {
    if (parent[cle] !== undefined) env[cle] = parent[cle];
  }
  // Valeurs explicites : un éventuel .env chargé par Next ne doit pas
  // réintroduire ces identifiants. Le fournisseur par défaut sans clé conserve
  // le parcours réel « absent → revue humaine », sans appel modèle/OAuth.
  return {
    ...env,
    AI_FOURNISSEUR_EXTRACTION: "anthropic",
    AI_FOURNISSEUR_REDACTION: "anthropic",
    ANTHROPIC_API_KEY: "",
    AI_OPENAI_API_KEY: "",
    AI_OPENAI_COMPTE_DE_SERVICE: "",
    AI_OPENAI_AUTH: "cle",
    AI_OPENAI_URL: "",
    AI_OPENAI_MODEL: "",
    AI_OPENAI_PDF: "non",
    AI_PIECES_SOUS_TRAITANT_AUTORISE: "",
    AI_OPENAI_ORIGINE_AUTORISEE: "",
    FEDAPAY_API_KEY: "",
    STRIPE_API_KEY: "",
    FEDAPAY_SECRET_KEY: "",
    STRIPE_SECRET_KEY: "",
    FEDAPAY_WEBHOOK_SECRET: "",
    STRIPE_WEBHOOK_SECRET: "",
    PAIEMENT_FOURNISSEURS: "",
  };
}
