-- INV-8 : une source affichée porte sa date de vérification.
--
-- L'écran d'alertes citait « source : ind.nl » sans elle, sur l'écran qui
-- annonce précisément qu'une règle a changé. La date est écrite avec la
-- source, depuis la même règle, par le même écrivain.
ALTER TABLE "Notification" ADD COLUMN "sourceVerifiedAt" DATE;
