import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhotoPublique } from "@/components/ui/PhotoPublique";
import { PHOTOS } from "@/lib/photographies";
import { Rubrique } from "@/components/ui/Rubrique";
import type { EnTete } from "@/domain/editorial/document";

const entete = (slug: string, titre: string): EnTete => ({
  genre: "ARTICLE",
  slug,
  titre,
  chapeau: "Les points à vérifier avant le dépôt.",
  surtitre: "Préparation",
  dureeLecture: "2 min",
  verifieeLe: "2026-10-15",
  publieLe: "2026-10-15",
});

describe("Photographies : lecture accessible et repli", () => {
  it("ne crée aucun cadre vide sans association", () => {
    const { container } = render(<PhotoPublique />);
    expect(container).toBeEmptyDOMElement();
  });
  it("propose un seul média responsive et réserve sa taille sans préchargement mobile", () => {
    const { container } = render(<PhotoPublique photo={PHOTOS.accueil} format="accueil" />);
    const image = screen.getByRole("img", { name: PHOTOS.accueil.alt });
    expect(image).toHaveAttribute("width", "1536");
    expect(image).toHaveAttribute("height", "1024");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(container.querySelector("source")).toHaveAttribute("srcset", PHOTOS.accueil.mobile);
    expect(container.querySelector("source")).toHaveAttribute("media", "(max-width: 767px)");
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector('link[rel="preload"]')).toBeNull();
  });
  it("utilise le petit fichier et un alt vide pour la vignette redondante", () => {
    const { container } = render(
      <PhotoPublique photo={PHOTOS.paysBas} format="vignette" decorative />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", PHOTOS.paysBas.vignette);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(container.querySelector("source")).toBeNull();
  });
  it("une rubrique mêle les sujets associés et sans média sans perdre titre, lien ou date", () => {
    const { container } = render(
      <Rubrique
        genre="ARTICLE"
        entetes={[
          entete("relire-ses-documents", "Relire ses documents"),
          entete("nouvelle-actualite", "Nouvelle actualité"),
        ]}
      />,
    );
    expect(container.querySelectorAll("picture")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Nouvelle actualité/u })).toHaveAttribute(
      "href",
      "/articles/nouvelle-actualite",
    );
    expect(screen.getAllByText(/Publié le/u)).toHaveLength(2);
    expect(container.querySelectorAll("img[alt='']")).toHaveLength(1);
  });
  it("l'état vide d'une rubrique ne charge pas de photo", () => {
    const { container } = render(<Rubrique genre="GUIDE" entetes={[]} />);
    expect(container.querySelector("picture")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
