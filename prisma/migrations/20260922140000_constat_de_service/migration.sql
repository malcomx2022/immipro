-- Le constat d'un service extérieur, partagé entre les processus —
-- I.C, 22/09/2026.
--
-- Deux sondes concluent sur un fait plutôt que sur la forme d'une variable :
-- la messagerie a-t-elle parlé à un serveur, le moteur de balayage a-t-il
-- reconnu le fichier d'essai. Le fait était tenu dans une variable de module,
-- posé par le worker — service séparé en production — et lu par le processus
-- web. Les deux ne partagent aucune mémoire : `/api/health` lisait « aucune
-- sonde n'a tourné » indéfiniment, pour deux dépendances bloquantes.
--
-- Une ligne par service, écrasée à chaque constat. C'est l'état courant qui
-- décide ; un historique de sondes n'apprendrait rien que le journal ne dise.

CREATE TABLE "ServiceProbe" (
  "service"    TEXT NOT NULL,
  "succeeded"  BOOLEAN NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "detail"     TEXT,

  CONSTRAINT "ServiceProbe_pkey" PRIMARY KEY ("service")
);

-- Un constat porte forcément sa date : sans elle, il n'y a pas de fraîcheur,
-- et un succès d'il y a trois semaines déclarerait le service opérationnel
-- devant un serveur éteint depuis. La colonne est `NOT NULL`, et cette
-- contrainte-ci refuse en plus une date future — une horloge déréglée, ou
-- une écriture forgée, rendrait un constat éternellement frais.
ALTER TABLE "ServiceProbe"
  ADD CONSTRAINT "service_probe_constat_date"
  CHECK ("observedAt" <= now() + interval '5 minutes');

-- Le service nommé doit être l'un de ceux que le code connaît. Une clé
-- inventée ne serait lue par personne, et se lirait comme un service
-- surveillé qui ne l'est pas.
ALTER TABLE "ServiceProbe"
  ADD CONSTRAINT "service_probe_service_connu"
  CHECK ("service" IN ('messagerie', 'antivirus'));

-- L'exploitation lit les constats par ancienneté.
CREATE INDEX "ServiceProbe_observedAt_idx" ON "ServiceProbe"("observedAt");
