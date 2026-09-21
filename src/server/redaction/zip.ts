import { deflateRawSync } from "node:zlib";
import type { PieceDuPaquet } from "@/domain/redaction/docx";

/**
 * L'archive ZIP d'un DOCX — WF-08 étape 6.
 *
 * Écrite ici et non dans le domaine : elle emploie le `zlib` de la
 * plateforme, et la règle d'architecture veut un domaine qui ne connaît que
 * des chaînes. Le XML est pur, le scellement l'est moins.
 *
 * ── Ce que ce module fait, et ce qu'il ne fait pas ─────────────────────
 *
 * Il écrit un ZIP **sans dépendance**, parce qu'un DOCX n'est rien d'autre
 * que cela et qu'une bibliothèque d'archivage pèserait plus que le besoin
 * (le raisonnement de L.2 et L.3). Il ne lit aucune archive, ne gère ni
 * répertoire, ni chiffrement, ni Zip64 : trois petits fichiers XML, et
 * c'est tout ce qu'il verra jamais.
 *
 * Le format est celui de l'APPNOTE de PKWARE, dans sa forme la plus
 * simple : pour chaque pièce, un en-tête local suivi des octets
 * compressés ; puis un répertoire central qui les répertorie ; puis un
 * enregistrement de fin qui dit où commence ce répertoire. Un lecteur
 * ouvre l'archive par la fin.
 */

/**
 * CRC-32, table calculée une fois.
 *
 * Le ZIP le stocke pour chaque pièce et les lecteurs le vérifient : un
 * mauvais CRC donne une archive que le traitement de texte déclare
 * corrompue, sans dire laquelle des pièces est en cause. C'est le seul
 * endroit de ce module où une erreur ne se voit pas à l'inspection.
 */
const TABLE_CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

export function crc32(octets: Buffer): number {
  let c = -1;
  for (const octet of octets) c = TABLE_CRC[(c ^ octet) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * Horodatage MS-DOS : deux mots de seize bits, secondes divisées par deux,
 * année comptée depuis 1980. Un format d'époque, et le seul que les
 * en-têtes portent.
 */
function horodatageDos(date: Date): { heure: number; jour: number } {
  return {
    heure:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      (date.getUTCSeconds() >> 1),
    jour:
      ((date.getUTCFullYear() - 1980) << 9) |
      ((date.getUTCMonth() + 1) << 5) |
      date.getUTCDate(),
  };
}

interface Entree {
  nom: Buffer;
  crc: number;
  compresse: Buffer;
  taille: number;
  decalage: number;
}

/**
 * Scelle les pièces en une archive.
 *
 * `date` est un paramètre et non `new Date()` : deux appels successifs sur
 * le même texte doivent rendre les mêmes octets, sinon rien ne se teste.
 * L'appelant passe l'horodatage de la version, ce qui a le mérite de dater
 * le fichier de ce qu'il contient plutôt que du moment où on l'a demandé.
 */
export function archiver(pieces: readonly PieceDuPaquet[], date: Date): Buffer {
  const { heure, jour } = horodatageDos(date);
  const morceaux: Buffer[] = [];
  const entrees: Entree[] = [];
  let decalage = 0;

  for (const piece of pieces) {
    const nom = Buffer.from(piece.chemin, "utf8");
    const brut = Buffer.from(piece.contenu, "utf8");
    const compresse = deflateRawSync(brut);
    const crc = crc32(brut);

    const entete = Buffer.alloc(30);
    entete.writeUInt32LE(0x04034b50, 0); // signature d'en-tête local
    entete.writeUInt16LE(20, 4); // version minimale : 2.0, deflate
    entete.writeUInt16LE(0x0800, 6); // drapeau : noms de fichiers en UTF-8
    entete.writeUInt16LE(8, 8); // méthode : deflate
    entete.writeUInt16LE(heure, 10);
    entete.writeUInt16LE(jour, 12);
    entete.writeUInt32LE(crc, 14);
    entete.writeUInt32LE(compresse.length, 18);
    entete.writeUInt32LE(brut.length, 22);
    entete.writeUInt16LE(nom.length, 26);
    entete.writeUInt16LE(0, 28); // aucun champ supplémentaire

    morceaux.push(entete, nom, compresse);
    entrees.push({ nom, crc, compresse, taille: brut.length, decalage });
    decalage += entete.length + nom.length + compresse.length;
  }

  const central: Buffer[] = [];
  for (const e of entrees) {
    const fiche = Buffer.alloc(46);
    fiche.writeUInt32LE(0x02014b50, 0); // signature de fiche centrale
    fiche.writeUInt16LE(20, 4); // version d'écriture
    fiche.writeUInt16LE(20, 6); // version minimale de lecture
    fiche.writeUInt16LE(0x0800, 8);
    fiche.writeUInt16LE(8, 10);
    fiche.writeUInt16LE(heure, 12);
    fiche.writeUInt16LE(jour, 14);
    fiche.writeUInt32LE(e.crc, 16);
    fiche.writeUInt32LE(e.compresse.length, 20);
    fiche.writeUInt32LE(e.taille, 24);
    fiche.writeUInt16LE(e.nom.length, 28);
    fiche.writeUInt16LE(0, 30); // extra
    fiche.writeUInt16LE(0, 32); // commentaire
    fiche.writeUInt16LE(0, 34); // disque
    fiche.writeUInt16LE(0, 36); // attributs internes
    fiche.writeUInt32LE(0, 38); // attributs externes
    fiche.writeUInt32LE(e.decalage, 42);
    central.push(fiche, e.nom);
  }

  const tailleCentral = central.reduce((n, b) => n + b.length, 0);

  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); // signature de fin de répertoire
  fin.writeUInt16LE(0, 4); // numéro de ce disque
  fin.writeUInt16LE(0, 6); // disque du répertoire
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(tailleCentral, 12);
  fin.writeUInt32LE(decalage, 16);
  fin.writeUInt16LE(0, 20); // aucun commentaire

  return Buffer.concat([...morceaux, ...central, fin]);
}
