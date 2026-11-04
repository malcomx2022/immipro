-- S.214 : double authentification TOTP. Additive : aucune ligne existante
-- n'est réécrite, un compte sans "SecondFacteur" se connecte comme avant.

CREATE TABLE "SecondFacteur" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretChiffre" TEXT NOT NULL,
    "activeLe" TIMESTAMP(3),
    "dernierPas" BIGINT,
    "derive" INTEGER NOT NULL DEFAULT 0,
    "echecs" INTEGER NOT NULL DEFAULT 0,
    "bloqueJusqua" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SecondFacteur_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SecondFacteur_userId_key" ON "SecondFacteur"("userId");
ALTER TABLE "SecondFacteur" ADD CONSTRAINT "SecondFacteur_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Le secret n'est jamais en clair : seul le format chiffré "v1.<iv>.<tag>.<données>" passe.
ALTER TABLE "SecondFacteur" ADD CONSTRAINT "second_facteur_secret_chiffre" CHECK (
    "secretChiffre" ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
);
-- Le décalage d'horloge retenu ne dépasse jamais un pas de trente secondes.
ALTER TABLE "SecondFacteur" ADD CONSTRAINT "second_facteur_derive_bornee" CHECK (
    "derive" BETWEEN -1 AND 1
);
ALTER TABLE "SecondFacteur" ADD CONSTRAINT "second_facteur_echecs_positifs" CHECK ("echecs" >= 0);

CREATE TABLE "CodeDeSecours" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "utiliseLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CodeDeSecours_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CodeDeSecours_userId_empreinte_key" ON "CodeDeSecours"("userId", "empreinte");
CREATE INDEX "CodeDeSecours_userId_utiliseLe_idx" ON "CodeDeSecours"("userId", "utiliseLe");
ALTER TABLE "CodeDeSecours" ADD CONSTRAINT "CodeDeSecours_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DefiDeConnexion" (
    "id" TEXT NOT NULL,
    "jetonHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memoriser" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "essais" INTEGER NOT NULL DEFAULT 0,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "consommeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DefiDeConnexion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DefiDeConnexion_jetonHash_key" ON "DefiDeConnexion"("jetonHash");
CREATE INDEX "DefiDeConnexion_userId_idx" ON "DefiDeConnexion"("userId");
CREATE INDEX "DefiDeConnexion_expireLe_idx" ON "DefiDeConnexion"("expireLe");
ALTER TABLE "DefiDeConnexion" ADD CONSTRAINT "DefiDeConnexion_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
