import { BarreAdmin } from "@/components/admin/BarreAdmin";
import { db } from "@/lib/db";
import { exigerVeilleur, initiales } from "@/server/securite/page";

/**
 * Gabarit back-office — section B (DOC-12 §3.7).
 *
 * Le segment `(admin)` est celui que `tests/copy-forbidden.test.ts` exclut :
 * son lecteur agit sur des codes techniques et des ratios d'exploitation.
 * Ce qu'un administrateur écrit *à destination du candidat* reste, lui,
 * soumis au vocabulaire interdit — la validation vit dans B-02.
 *
 * La garde est au gabarit : un écran ajouté demain sous ce groupe de routes
 * est protégé sans que personne y pense. Elle exige le rôle le plus bas du
 * back-office — veilleur — et chaque page resserre ensuite selon ce qu'elle
 * montre (RG-15.3). Un veilleur voit la veille, pas les paiements.
 */
export const dynamic = "force-dynamic";

const LIBELLE_ROLE: Record<string, string> = {
  VEILLEUR: "Analyste réglementaire",
  ADMIN: "Administration",
};

export default async function GabaritAdmin({ children }: { children: React.ReactNode }) {
  const acteur = await exigerVeilleur();
  const compte = await db.user.findUnique({
    where: { id: acteur.id },
    select: { firstName: true, lastName: true },
  });

  return (
    <BarreAdmin
      nom={[compte?.firstName, compte?.lastName].filter(Boolean).join(" ") || acteur.email}
      role={LIBELLE_ROLE[acteur.role] ?? acteur.role}
      initialesAffichees={initiales(acteur, compte?.firstName, compte?.lastName)}
    >
      {children}
    </BarreAdmin>
  );
}
