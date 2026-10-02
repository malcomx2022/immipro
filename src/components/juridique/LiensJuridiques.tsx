"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Les liens vers les pages juridiques publiées — S.101.
 *
 * Le pied de page reste sans données : c'est ce qui garde statiques
 * toutes les pages du gabarit (Q.B), et un test le vérifie. Ce composant,
 * lui, demande au navigateur quelles pages sont publiées, et n'affiche
 * rien d'autre. Une page jamais validée n'est donc promise nulle part,
 * et une page validée apparaît sans redéploiement.
 *
 * Les adresses viennent de la réponse, jamais d'une chaîne écrite ici :
 * le registre Q.A interdit de nommer une page qui pourrait ne pas exister.
 */
interface PagePubliee {
  adresse: string;
  titre: string;
}

export function LiensJuridiques() {
  const [pages, setPages] = useState<readonly PagePubliee[]>([]);

  useEffect(() => {
    const controle = new AbortController();
    fetch("/api/juridique/pages", { signal: controle.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((charge: { pages?: PagePubliee[] } | null) => setPages(charge?.pages ?? []))
      .catch(() => undefined);
    return () => controle.abort();
  }, []);

  if (pages.length === 0) return null;
  return (
    <nav aria-label="Informations légales" className="flex flex-col gap-2.5">
      <span className="text-13 font-semibold uppercase tracking-wider text-ink-900">Informations légales</span>
      {pages.map((p) => (
        <Link key={p.adresse} href={p.adresse} className="text-14 text-accent-600">
          {p.titre}
        </Link>
      ))}
    </nav>
  );
}
