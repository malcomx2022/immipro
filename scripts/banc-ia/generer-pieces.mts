/**
 * Génère les trente pièces factices du banc des fournisseurs d'IA (S.99).
 *
 *     NODE_PATH=$(npm root -g) npm run banc:ia:pieces
 *
 * Les pièces sont produites une fois, puis versionnées dans
 * `tests/banc-ia/pieces/` : le banc s'exécute ensuite sans navigateur,
 * sur les mêmes octets pour chaque fournisseur. Les régénérer n'est utile
 * que si `src/domain/banc-ia/jeu-d-essai.ts` change.
 *
 * Il faut Playwright et Chromium, qui ne sont pas des dépendances du
 * projet : un outil de préparation ne justifie pas trois cents mégaoctets
 * dans `node_modules`. Le module est cherché par `NODE_PATH`.
 *
 * Chaque pièce porte en filigrane « SPÉCIMEN — DOCUMENT FICTIF », et
 * aucune n'imite un document officiel réel : ni armoiries, ni photo, ni
 * motif de sécurité. Elles ressemblent assez à leur genre pour qu'un
 * modèle les reconnaisse, et pas davantage.
 */
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CAS_DE_LECTURE, type CasDeLecture, type Contenu } from "../../src/domain/banc-ia/jeu-d-essai";

const DOSSIER = path.resolve("tests/banc-ia/pieces");

/** Ce que le script emploie de Playwright, et rien de plus : le module n'est pas une dépendance. */
interface PageDeRendu {
  setContent(html: string, options: { waitUntil: "load" }): Promise<void>;
  screenshot(options: { type: "jpeg" | "png"; quality?: number }): Promise<Buffer>;
  pdf(options: { width: string; height: string; printBackground: boolean }): Promise<Buffer>;
}
interface Navigateur {
  newContext(options: {
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
  }): Promise<{ newPage(): Promise<PageDeRendu> }>;
  close(): Promise<void>;
}

const exiger = createRequire(import.meta.url);
let playwright: { chromium: { launch(): Promise<Navigateur> } };
try {
  playwright = exiger("playwright") as typeof playwright;
} catch {
  console.error(
    "Playwright est introuvable. Lance la génération avec NODE_PATH=$(npm root -g), sur un poste où Playwright et Chromium sont installés.",
  );
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * La zone de lecture automatique, calculée selon la norme OACI 9303 :
 * un modèle qui la lit doit y trouver les mêmes dates que dans la page.
 * ------------------------------------------------------------------ */

const POIDS = [7, 3, 1];
const valeurDuCaractere = (c: string): number => {
  if (c === "<") return 0;
  if (/\d/u.test(c)) return Number(c);
  return c.charCodeAt(0) - 55;
};
const chiffreDeControle = (texte: string): string =>
  String([...texte].reduce((somme, c, i) => somme + valeurDuCaractere(c) * POIDS[i % 3]!, 0) % 10);

const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/gu, "");
const aaMMjj = (jjmmaaaa: string) => {
  const [j, m, a] = jjmmaaaa.split("/");
  return `${a!.slice(2)}${m}${j}`;
};
const completer = (s: string, n: number) => (s + "<".repeat(n)).slice(0, n);

function zoneDeLecture(c: Extract<Contenu, { genre: "passeport" }>): [string, string] {
  const ligne1 = completer(
    `P<BEN${sansAccent(c.nom).replace(/\s/gu, "<")}<<${sansAccent(c.prenoms).replace(/\s/gu, "<")}`,
    44,
  );
  const numero = completer(c.numero, 9);
  const naissance = aaMMjj(c.dateNaissance);
  const expiration = aaMMjj(c.dateExpiration);
  const optionnel = completer("", 14);
  const corps =
    numero + chiffreDeControle(numero) + "BEN" + naissance + chiffreDeControle(naissance) + c.sexe +
    expiration + chiffreDeControle(expiration) + optionnel + chiffreDeControle(optionnel);
  const composite =
    numero + chiffreDeControle(numero) + naissance + chiffreDeControle(naissance) +
    expiration + chiffreDeControle(expiration) + optionnel + chiffreDeControle(optionnel);
  return [ligne1, corps + chiffreDeControle(composite)];
}

/* ------------------------------------------------------------------ *
 * Les mises en page.
 * ------------------------------------------------------------------ */

const echapper = (s: string) =>
  s.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

const FILIGRANE = `
  <div class="filigrane">SPÉCIMEN — DOCUMENT FICTIF</div>
  <div class="pied">Banc d'essai ImmiPro · pièce entièrement fictive · aucune valeur</div>`;

const STYLE = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Liberation Sans", "DejaVu Sans", sans-serif; color: #1d1d1f; }
  .page { position: relative; width: 794px; height: 1123px; padding: 64px 72px; overflow: hidden; background: #fff; }
  .filigrane { position: absolute; top: 46%; left: -10%; width: 120%; text-align: center; transform: rotate(-28deg);
    font-size: 64px; font-weight: 700; color: rgba(200, 30, 30, 0.13); letter-spacing: 4px; pointer-events: none; }
  .pied { position: absolute; bottom: 28px; left: 72px; right: 72px; font-size: 11px; color: #8a8a8a; border-top: 1px solid #ddd; padding-top: 6px; }
  .emetteur { font-size: 20px; font-weight: 700; }
  .adresse { font-size: 12px; color: #555; margin-top: 2px; }
  .date { text-align: right; font-size: 13px; margin-top: 18px; }
  h1 { font-size: 22px; margin: 36px 0 22px; border-bottom: 2px solid #1d1d1f; padding-bottom: 8px; }
  dl { display: grid; grid-template-columns: 260px 1fr; gap: 10px 18px; font-size: 15px; margin: 0 0 22px; }
  dt { color: #555; }
  dd { margin: 0; font-weight: 600; }
  .stylo { font-family: "FreeSerif", serif; font-style: italic; font-weight: 400; font-size: 24px; color: #1b3a8a; display: inline-block; transform: rotate(-3deg); }
  p { font-size: 14px; line-height: 1.55; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 14px 0 22px; }
  th, td { border-bottom: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f1f1f1; }
  .signature { margin-top: 40px; font-size: 13px; font-style: italic; color: #444; }
  .livret { margin: 140px auto 0; width: 640px; height: 450px; border: 2px solid #3d4a5c; border-radius: 14px; background: #eef1f5;
    padding: 22px 26px; position: relative; overflow: hidden; }
  .livret .entete { display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; color: #3d4a5c; letter-spacing: 1px; }
  .livret .corps { display: flex; gap: 22px; margin-top: 18px; }
  .livret .portrait { width: 130px; height: 165px; background: #c9ced6; border: 1px solid #9aa3b1; display: flex; align-items: center;
    justify-content: center; text-align: center; font-size: 11px; color: #5b6472; }
  .livret dl { grid-template-columns: 150px 1fr; gap: 5px 10px; font-size: 12px; }
  .livret dt { font-size: 10px; text-transform: uppercase; }
  .livret dd { font-size: 13px; }
  .mrz { position: absolute; left: 26px; right: 26px; bottom: 18px; font-family: "Liberation Mono", "DejaVu Sans Mono", monospace;
    font-size: 17px; letter-spacing: 1.5px; line-height: 1.35; white-space: pre; }
`;

function htmlDe(contenu: Contenu): string {
  if (contenu.genre === "passeport") {
    const [l1, l2] = zoneDeLecture(contenu);
    const champs: [string, string][] = [
      ["Nom / Surname", contenu.nom],
      ["Prénoms / Given names", contenu.prenoms],
      ["Nationalité / Nationality", contenu.nationalite],
      ["Sexe / Sex", contenu.sexe],
      ["Date de naissance / Date of birth", contenu.dateNaissance],
      ["Lieu de naissance / Place of birth", contenu.lieuNaissance],
      ["Date de délivrance / Date of issue", contenu.dateDelivrance],
      ["Date d'expiration / Date of expiry", contenu.dateExpiration],
      ["Autorité / Authority", contenu.autorite],
    ];
    return `
      <div class="page">
        <div class="livret">
          <div class="entete"><span>PASSEPORT · PASSPORT</span><span>N° ${echapper(contenu.numero)}</span></div>
          <div class="corps">
            <div class="portrait">Emplacement<br/>de la photo<br/>(spécimen)</div>
            <dl>${champs.map(([l, v]) => `<dt>${echapper(l)}</dt><dd>${echapper(v)}</dd>`).join("")}</dl>
          </div>
          <div class="mrz">${echapper(l1)}\n${echapper(l2)}</div>
        </div>
        ${FILIGRANE}
      </div>`;
  }

  const lignes = contenu.lignes
    .map(
      (l) =>
        `<dt>${echapper(l.libelle)}</dt><dd>${
          l.manuscrite ? `<span class="stylo">${echapper(l.valeur)}</span>` : echapper(l.valeur)
        }</dd>`,
    )
    .join("");
  const tableau = contenu.tableau
    ? `<table><thead><tr>${contenu.tableau.entetes.map((e) => `<th>${echapper(e)}</th>`).join("")}</tr></thead>
       <tbody>${contenu.tableau.rangees
         .map((r) => `<tr>${r.map((c) => `<td>${echapper(c)}</td>`).join("")}</tr>`)
         .join("")}</tbody></table>`
    : "";
  return `
    <div class="page" lang="${contenu.langue}">
      <div class="emetteur">${echapper(contenu.emetteur)}</div>
      <div class="adresse">${echapper(contenu.adresseEmetteur)}</div>
      <div class="date">${echapper(contenu.date)}</div>
      <h1>${echapper(contenu.titre)}</h1>
      <dl>${lignes}</dl>
      ${tableau}
      ${(contenu.paragraphes ?? []).map((p) => `<p>${echapper(p)}</p>`).join("")}
      ${contenu.signature ? `<div class="signature">${echapper(contenu.signature)}</div>` : ""}
      ${FILIGRANE}
    </div>`;
}

/* ------------------------------------------------------------------ *
 * Les dégradations : ce que la photo d'un téléphone fait à une page.
 * ------------------------------------------------------------------ */

function cadre(cas: CasDeLecture, page: string): string {
  const d = cas.rendu.degradation;
  const filtres: Record<string, string> = {
    pale: "contrast(0.42) brightness(1.22)",
    flou_fort: "blur(7px)",
    sombre: "brightness(0.07) contrast(0.6)",
  };
  const photo = d === "de_travers" || d === "ombre" || d === "flou_fort" || d === "sombre";
  const rotation = d === "de_travers" ? "rotate(-8deg) scale(0.86)" : photo ? "rotate(-1.5deg) scale(0.93)" : "none";
  const ombre =
    d === "ombre"
      ? '<div style="position:absolute;inset:0;background:linear-gradient(115deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 38%, rgba(0,0,0,0) 62%);"></div>'
      : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}
    .scene { position: relative; width: 794px; height: 1123px; overflow: hidden; background: ${photo ? "#6b5a48" : "#fff"}; }
    .scene > .page { transform: ${rotation}; transform-origin: center; filter: ${filtres[d] ?? "none"};
      box-shadow: ${photo ? "0 10px 30px rgba(0,0,0,0.45)" : "none"}; }
  </style></head><body><div class="scene">${page}${ombre}</div></body></html>`;
}

/* ------------------------------------------------------------------ *
 * La production.
 * ------------------------------------------------------------------ */

export const nomDuFichier = (cas: CasDeLecture): string => {
  switch (cas.rendu.format) {
    case "jpeg":
      return `${cas.id}.jpg`;
    case "png":
      return `${cas.id}.png`;
    case "pdf_natif":
    case "pdf_scanne":
      return `${cas.id}.pdf`;
  }
};

async function main() {
  await mkdir(DOSSIER, { recursive: true });
  const navigateur = await playwright.chromium.launch();
  const contexte = await navigateur.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.5 });
  const page = await contexte.newPage();

  for (const cas of CAS_DE_LECTURE) {
    const html = cadre(cas, htmlDe(cas.contenu));
    await page.setContent(html, { waitUntil: "load" });
    const cible = path.join(DOSSIER, nomDuFichier(cas));

    switch (cas.rendu.format) {
      case "jpeg":
        await writeFile(cible, await page.screenshot({ type: "jpeg", quality: 78 }));
        break;
      case "png":
        await writeFile(cible, await page.screenshot({ type: "png" }));
        break;
      case "pdf_natif":
        await writeFile(cible, await page.pdf({ width: "794px", height: "1123px", printBackground: true }));
        break;
      case "pdf_scanne": {
        // Un scan est une image dans un PDF : aucune couche de texte à lire.
        const image = await page.screenshot({ type: "jpeg", quality: 72 });
        await page.setContent(
          `<!doctype html><html><head><style>html,body{margin:0}img{width:794px;height:1123px;display:block}</style></head>
           <body><img src="data:image/jpeg;base64,${image.toString("base64")}"></body></html>`,
          { waitUntil: "load" },
        );
        await writeFile(cible, await page.pdf({ width: "794px", height: "1123px", printBackground: true }));
        break;
      }
    }
    console.log(`  ${cas.id} → ${path.relative(process.cwd(), cible)}`);
  }

  await navigateur.close();
  console.log(`\n${CAS_DE_LECTURE.length} pièces générées dans ${path.relative(process.cwd(), DOSSIER)}.`);
}

await main();
