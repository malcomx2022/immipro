"use client";

import qrcode from "qrcode-generator";
import { useMemo } from "react";

/**
 * Code QR — S.214, enrôlement de la double authentification.
 *
 * Calculé dans le navigateur à partir de l'adresse `otpauth://` : aucune
 * image n'est demandée à un tiers, et le secret ne quitte pas la page qui
 * l'a reçu. Les modules sont un seul tracé SVG, coloré par les jetons de
 * couleur (règle d'architecture 3) ; la marge de quatre modules est celle
 * que demande la norme pour qu'un téléphone le lise.
 */
export function CodeQr({ valeur, libelle }: { valeur: string; libelle: string }) {
  const { taille, trace } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(valeur);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    }
    return { taille: n + 8, trace: d };
  }, [valeur]);

  return (
    <svg
      role="img"
      aria-label={libelle}
      viewBox={`0 0 ${taille} ${taille}`}
      shapeRendering="crispEdges"
      className="h-48 w-48 rounded-md border border-ink-300"
    >
      <rect width={taille} height={taille} className="fill-white" />
      <path d={trace} className="fill-ink-900" />
    </svg>
  );
}
