import Image from "next/image";
import type { PhotoPublique as Photo } from "@/lib/photographies";
import { cn } from "@/lib/utils";

/** Fichiers WebP locaux déjà optimisés : aucune requête à une banque d'images. */
export function PhotoPublique({
  photo,
  format = "principale",
  decorative = false,
  className,
}: {
  photo?: Photo;
  format?: "principale" | "vignette" | "accueil";
  decorative?: boolean;
  className?: string;
}) {
  if (!photo) return null;
  const vignette = format === "vignette";
  return (
    <picture
      data-photo={photo.code}
      className={cn(
        "block overflow-hidden bg-ink-100",
        vignette
          ? "h-24 w-24 flex-none rounded-md md:h-28 md:w-40"
          : format === "accueil"
            ? "aspect-photo-mobile w-full rounded-lg md:aspect-photo-accueil"
            : "aspect-photo-mobile w-full rounded-lg md:aspect-photo",
        className,
      )}
    >
      {!vignette ? (
        <source media="(max-width: 767px)" srcSet={photo.mobile} width={780} height={520} />
      ) : null}
      <Image
        src={vignette ? photo.vignette : photo.bureau}
        width={vignette ? 320 : 1536}
        height={vignette ? 213 : 1024}
        alt={decorative ? "" : photo.alt}
        loading="lazy"
        unoptimized
        className={cn("h-full w-full object-cover", photo.cadrage)}
      />
    </picture>
  );
}
