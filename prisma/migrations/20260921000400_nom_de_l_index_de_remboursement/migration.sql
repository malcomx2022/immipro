-- L'index posé par `20260921000200_rail_de_remboursement` porte deux
-- colonnes et n'en nomme qu'une. Le nom trompe à la lecture, et il ne
-- correspond pas à celui que `schema.prisma` décrit : la base et le schéma
-- divergeaient sans que rien ne le dise.
--
-- Renommer un index est une opération de catalogue : pas de réécriture, pas
-- de parcours de table.
ALTER INDEX "Transaction_refundRequestedAt_idx"
  RENAME TO "Transaction_refundRequestedAt_refundedAt_idx";
