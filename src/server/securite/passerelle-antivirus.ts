/**
 * Point d'entrée du conteneur `antivirus` — S.96.
 *
 * Compilé en `dist/passerelle-antivirus.js` par `scripts/build-worker.mjs`,
 * lancé par `docker-compose.prod.yml`. Toute la logique vit dans
 * `passerelle-clamd.ts` ; ce fichier ne fait qu'écouter.
 */
import { configurationDepuis, creerPasserelle } from "./passerelle-clamd";

const config = configurationDepuis(process.env);
const portDEcoute = Number.parseInt(process.env.PORT ?? "", 10) || 8080;

const serveur = creerPasserelle(config);
serveur.listen(portDEcoute, () => {
  console.log(
    `[passerelle-antivirus] écoute sur :${portDEcoute}, démon ${config.hote}:${config.port}`,
  );
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => serveur.close(() => process.exit(0)));
}
