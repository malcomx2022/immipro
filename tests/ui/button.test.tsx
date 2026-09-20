import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

describe("Button", () => {
  it("rend son libellé et déclenche l'action", () => {
    const clic = vi.fn();
    render(<Button onClick={clic}>Continuer</Button>);
    const bouton = screen.getByRole("button", { name: "Continuer" });
    bouton.click();
    expect(clic).toHaveBeenCalledOnce();
  });

  it("désactive réellement le bouton, pas seulement à l'œil", () => {
    const clic = vi.fn();
    render(
      <Button disabled onClick={clic}>
        Continuer
      </Button>,
    );
    const bouton = screen.getByRole("button", { name: "Continuer" });
    expect(bouton).toBeDisabled();
    bouton.click();
    expect(clic).not.toHaveBeenCalled();
  });

  it("accompagne le désactivé de sa raison, reliée au bouton", () => {
    render(
      <Button disabled raisonDesactivation="Choisis une destination d'abord.">
        Continuer
      </Button>,
    );
    const bouton = screen.getByRole("button", { name: "Continuer" });
    const idRaison = bouton.getAttribute("aria-describedby");
    expect(idRaison).toBeTruthy();
    expect(document.getElementById(idRaison as string)?.textContent).toBe(
      "Choisis une destination d'abord.",
    );
  });

  it("garde le libellé écrit pendant le chargement", () => {
    render(<Button chargement>Continuer</Button>);
    const bouton = screen.getByRole("button", { name: "Continuer" });
    expect(bouton).toHaveAttribute("aria-busy", "true");
    expect(bouton).toBeDisabled();
  });

  it("prend le focus au clavier", () => {
    render(<Button>Continuer</Button>);
    const bouton = screen.getByRole("button", { name: "Continuer" });
    bouton.focus();
    expect(document.activeElement).toBe(bouton);
  });
});

describe("cn et l'échelle de tailles fermée", () => {
  it("garde la taille du bouton quand une couleur de texte suit", () => {
    // `tailwind-merge` prenait `text-16` pour une couleur et le supprimait :
    // le bouton primaire perdait sa taille au profit de `text-white`.
    expect(cn("text-16", "text-white")).toContain("text-16");
    expect(cn("text-16", "text-white")).toContain("text-white");
  });

  it("remplace bien une taille par une autre", () => {
    expect(cn("text-16", "text-14")).toBe("text-14");
  });

  it("le bouton primaire rendu porte sa taille et sa couleur", () => {
    render(<Button>Continuer</Button>);
    const classes = screen.getByRole("button", { name: "Continuer" }).className;
    expect(classes).toContain("text-16");
    expect(classes).toContain("text-white");
  });
});

/**
 * La phrase d'un contrôle désactivé s'adresse au candidat en pleine
 * tâche : elle lui dit quoi faire pour débloquer le bouton. Elle tutoie,
 * comme tout ce qu'il lit (DOC-12 §16, règle 5).
 *
 * Quatre d'entre elles vouvoyaient — « Choisissez un pack », « Choisissez
 * une date », « Choisissez une réponse » — et rien ne les cherchait. Elles
 * sont sorties au jour en lisant l'écran des packs pendant N.A.
 *
 * Le test se limite à ce registre. Le vouvoiement subsiste ailleurs, dans
 * les descriptions de page et quelques titres publics, et trancher s'il
 * doit y disparaître est un choix éditorial, pas une correction.
 */
describe("la raison d'un bouton désactivé tutoie", () => {
  function fichiers(dir: string, filtre: RegExp, acc: string[] = []): string[] {
    for (const nom of readdirSync(dir)) {
      const p = join(dir, nom);
      if (statSync(p).isDirectory()) fichiers(p, filtre, acc);
      else if (filtre.test(nom)) acc.push(p.replace(/\\/gu, "/"));
    }
    return acc;
  }

  /** Les littéraux d'une expression JSX. */
  const chaines = (expression: string): string[] =>
    [...expression.matchAll(/"([^"]+)"/gu)].map((m) => m[1]!);

  /**
   * Et ceux que l'expression ne porte pas elle-même.
   *
   * `raisonDesactivation={complet ? undefined : raison}` ne contient
   * aucune chaîne : la phrase vit dans un `const raison = …` plus haut
   * dans le même fichier. Lire l'expression seule laissait donc passer la
   * troisième branche de l'inscription, qui vouvoyait encore.
   *
   * Deux formes de déclaration, les deux présentes : un `const`, et une
   * fonction qui rend la phrase — l'édition de contenu procède ainsi.
   *
   * La résolution s'arrête au fichier — un garde-fou qui suivrait les
   * imports serait un compilateur. Ce qui vient d'ailleurs est une
   * constante de domaine, et le balayage la lira dans son propre fichier.
   */
  const declaration = (source: string, nom: string): string => {
    const constante = new RegExp(`\\bconst ${nom}\\s*(?::[^=]+)?=([\\s\\S]*?);\\n`, "u").exec(source);
    const fonction = new RegExp(`\\bfunction ${nom}\\s*\\(([\\s\\S]*?)\\n\\}`, "u").exec(source);
    return `${constante?.[1] ?? ""}\n${fonction?.[1] ?? ""}`;
  };

  const MOTS_CLES = new Set(["undefined", "null", "true", "false"]);
  const litteraux = (source: string, expression: string): string[] => {
    const textes = chaines(expression);
    const sansChaines = expression.replace(/"[^"]*"/gu, "");
    for (const id of sansChaines.matchAll(/\b[A-Za-z_$][\w$]*\b/gu)) {
      if (MOTS_CLES.has(id[0])) continue;
      textes.push(...chaines(declaration(source, id[0])));
    }
    return textes;
  };

  it("aucune ne vouvoie", () => {
    const vouvoiement = /\b(vous|votre|vos|[A-ZÉÈ][a-zéèêàç]+ez)\b/u;
    const fautives: string[] = [];
    for (const f of fichiers("src", /\.tsx?$/u)) {
      const source = readFileSync(f, "utf8");
      // Toutes les formes : littérale, expression JSX, et constante
      // déclarée dans le même fichier. La première version ne lisait que
      // `raisonDesactivation="…"` et laissait passer l'écran de paiement ;
      // la deuxième lisait l'expression et laissait passer l'inscription,
      // qui range sa phrase dans un `const`. Chaque élargissement a sorti
      // un vouvoiement de plus — le registre est petit, mais il se cache
      // derrière une indirection à chaque fois.
      for (const m of source.matchAll(/raisonDesactivation[=:]\s*(?:"([^"]+)"|\{([^}]*)\})/gu)) {
        for (const texte of [...(m[1] ? [m[1]] : []), ...litteraux(source, m[2] ?? "")]) {
          if (vouvoiement.test(texte)) fautives.push(`${f} — ${texte}`);
        }
      }
      // Et les obstacles du domaine, qui alimentent ces mêmes boutons.
      for (const m of source.matchAll(/return "([^"]*pour continuer\.)"/gu)) {
        if (vouvoiement.test(m[1]!)) fautives.push(`${f} — ${m[1]!}`);
      }
    }
    expect(fautives).toEqual([]);
  });
});
