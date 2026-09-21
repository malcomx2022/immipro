import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Pied de page du gabarit acquisition.
 *
 * La dernière ligne n'est pas une mention légale de politesse : elle dit ce
 * que la plateforme ne fait pas (INV-1, INV-2), et elle est présente sur tous
 * les écrans publics.
 *
 * Il n'énumère plus de destinations. Il en nommait trois, tirées du
 * registre éditorial : celui-ci connaît les slugs mais pas ce qui est
 * **publié**, et « Émirats arabes unis » menait donc à une fiche en 404,
 * sur chaque écran public. Les lire en base aurait rendu dynamiques toutes
 * les pages du gabarit, y compris celles qui n'ont aucune raison de l'être.
 *
 * Le catalogue `/destinations` répond à la question que la colonne posait,
 * et il la lit en base — une seule page dynamique au lieu de toutes.
 *
 * **Q.B ferme la question pour la V1.** Les trois destinations du moment
 * ne reviendront que si des mesures montrent un gain de navigation ou de
 * référencement qui justifie le coût. « Les plus demandées » demanderait
 * d'ailleurs de définir une période, une mesure, et ce qu'on fait d'une
 * fiche qui cesse d'être publiée — trois décisions pour trois liens. Les
 * liens profonds sont assurés ailleurs : par le catalogue, par les pages
 * éditoriales, et par le plan du site.
 *
 * Ce composant reste donc **sans données**. Il n'est pas asynchrone et ne
 * lit rien : c'est ce qui garde statiques toutes les pages du gabarit, et
 * un test le vérifie plutôt que de compter sur la relecture.
 *
 * ── Ce que le pied de page promet, et que le site tient ──────────────
 *
 * Il portait neuf adresses qui répondaient 404 — « Comment ça marche »,
 * « À propos », « Contact », et les trois pages légales — sur **toutes** les
 * pages publiques. Le test des liens morts ne les voyait pas : il lisait
 * les attributs `href="…"` et pas les tables de liens, c'est-à-dire tout
 * sauf l'endroit où les liens se rassemblent.
 *
 * Elles sont retirées plutôt qu'écrites. Des mentions légales demandent un
 * siège, un numéro RCCM et un hébergeur ; des conditions d'utilisation sont
 * un contrat. Les inventer produirait un document juridique faux, ce qui
 * est pire qu'une colonne absente — et le lien, lui, promettait déjà ce
 * document sans l'avoir. Ce qui manque est consigné en annexe Q.
 *
 * « Consultants partenaires » est parti pour une autre raison : l'écran
 * existe, mais derrière la garde candidat. Un lien public qui mène à un
 * mur de connexion n'est pas un lien mort, c'est une porte close — et le
 * pied de page ne dit pas laquelle.
 */
const COLONNES = [
  {
    titre: "Destinations",
    liens: [
      { href: "/destinations", libelle: "Destinations couvertes" },
      { href: "/simulateur", libelle: "Trouver la mienne" },
    ],
  },
  {
    titre: "Produit",
    liens: [
      { href: "/tarifs", libelle: "Tarifs" },
      { href: "/guides", libelle: "Guides pays" },
      { href: "/articles", libelle: "Articles" },
    ],
  },
] as const;

export interface FooterProps {
  className?: string;
}

export function Footer({ className }: FooterProps) {
  return (
    <footer className={cn("flex flex-col gap-6 bg-ink-100 px-4 py-8 md:px-12", className)}>
      <Image
        src="/brand/immipro-logo-primary.svg"
        alt="ImmiPro"
        width={110}
        height={27}
        unoptimized
      />

      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {COLONNES.map((colonne) => (
          <nav key={colonne.titre} aria-label={colonne.titre} className="flex flex-col gap-2.5">
            <span className="text-13 font-semibold uppercase tracking-wider text-ink-900">
              {colonne.titre}
            </span>
            {colonne.liens.map((l) => (
              <Link key={l.href} href={l.href} className="text-14 text-accent-600">
                {l.libelle}
              </Link>
            ))}
          </nav>
        ))}
      </div>

      <p className="border-t border-ink-300 pt-4 text-13 text-ink-500">
        ImmiPro n&apos;est pas un cabinet de conseil en immigration et ne dépose aucun
        dossier à votre place.
      </p>
    </footer>
  );
}
