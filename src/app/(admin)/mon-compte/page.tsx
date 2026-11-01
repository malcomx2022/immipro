import type { Metadata } from "next";
import Link from "next/link";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import { db } from "@/lib/db";
import { exigerVeilleur } from "@/server/securite/page";
import { etatDeSecurite } from "@/server/acces/profil";
import { LIBELLE_ROLE, type RoleDeCompte } from "@/domain/comptes/hierarchie";
import { SUPPRESSION_INTERNE_REFUSEE } from "@/domain/comptes/gestion-interne";
import { MENTION_AUDIT } from "@/domain/backoffice/navigation";
import { momentEnFrancais } from "@/domain/format/moment";

/**
 * Mon compte interne — S.210.
 *
 * `/mon-compte` et non `/compte` : le groupe `(admin)` partage l'espace
 * d'adresses de l'espace candidat, où `/compte` est déjà « Mon compte ».
 *
 * Une carte — nom, adresse, rôle, dernière ouverture de session —, l'accès
 * à l'identité et à la sécurité partagées avec l'espace candidat, et pas
 * de suppression autonome : un compte interne se retire depuis B-03, par
 * un super-administrateur (RG-10.4). Le rôle ne se change pas ici :
 * personne ne s'élève lui-même.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mon compte interne",
  description: "Nom, adresse, rôle et dernière connexion.",
};

export default async function PageMonCompteInterne() {
  const acteur = await exigerVeilleur("/mon-compte");
  const [compte, securite] = await Promise.all([
    db.user.findUnique({
      where: { id: acteur.id },
      select: { firstName: true, lastName: true, displayName: true },
    }),
    etatDeSecurite(acteur.id),
  ]);
  const nom =
    compte?.displayName ||
    [compte?.firstName, compte?.lastName].filter(Boolean).join(" ") ||
    acteur.email;
  const role = acteur.role as RoleDeCompte;

  return (
    <div className="flex flex-col">
      <EnteteAdmin titre="Mon compte" resume={LIBELLE_ROLE[role]} />
      <div className="flex max-w-lecture flex-col gap-4 p-6">
        <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
          <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">Compte</h2>
          <p className="text-16 font-semibold text-ink-900">{nom}</p>
          <dl className="flex flex-col pt-1">
            <Ligne intitule="Adresse" valeur={acteur.email} />
            <Ligne intitule="Rôle" valeur={LIBELLE_ROLE[role]} />
            <Ligne
              intitule="Dernière connexion"
              valeur={securite.plusRecente ? momentEnFrancais(securite.plusRecente.ouverteLe) : "Aucune session ouverte"}
            />
            <Ligne intitule="Sessions ouvertes" valeur={String(securite.sessions)} />
          </dl>
        </section>

        <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
          <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">Réglages</h2>
          <Link href="/compte" className="flex min-h-touch items-center text-14 font-semibold text-ink-900">
            Modifier mon identité
          </Link>
          <Link href="/compte/securite" className="flex min-h-touch items-center text-14 font-semibold text-ink-900">
            Sécurité et sessions
          </Link>
        </section>

        <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
          <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">Retrait du compte</h2>
          <p className="text-pretty text-14 text-ink-700">{SUPPRESSION_INTERNE_REFUSEE}</p>
          {role === "SUPER_ADMIN" ? (
            <Link href="/utilisateurs" className="text-14 font-semibold text-ink-900">
              Ouvrir Utilisateurs
            </Link>
          ) : null}
        </section>

        <p className="text-pretty text-13 text-ink-500">{MENTION_AUDIT}</p>
      </div>
    </div>
  );
}

function Ligne({ intitule, valeur }: { intitule: string; valeur: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-ink-300 py-2">
      <dt className="text-13 text-ink-500">{intitule}</dt>
      <dd className="break-all text-14 text-ink-900">{valeur}</dd>
    </div>
  );
}
