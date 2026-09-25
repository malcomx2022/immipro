import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import {
  DELAI_BALAYAGE_MS,
  EICAR,
  MOTIF_INDISPONIBILITE,
  TAILLE_MAXI_BALAYAGE_OCTETS,
  TENTATIVES_AVANT_INCIDENT,
  lireLaReponse,
  seReprendSeule,
  suiteDeLIndisponibilite,
  urlDuMoteurValide,
  type CauseDIndisponibilite,
} from "@/domain/securite/balayage";
import { FRAICHEUR_DU_CONSTAT_MS, sondeDuConstat } from "@/domain/exploitation/constats";

/**
 * Le moteur de balayage — arbitrage du 22/09/2026.
 *
 * **Contre un vrai serveur.** Un serveur HTTP écoute sur un port
 * éphémère de la boucle locale et joue le moteur : on lit ce qui lui est
 * réellement parvenu, et on lui fait donner les réponses qu'un moteur
 * donne quand il va mal. Un faux `fetch` aurait vérifié qu'on appelle
 * `fetch` comme on croit l'appeler ; la question est ailleurs — que
 * produit de notre côté un moteur qui se tait, qui répond 500, ou qui
 * répond quelque chose que le contrat ne prévoit pas.
 *
 * La propriété que tout ce fichier tient : **rien de ce qui n'est pas
 * `{"status":"clean"}` ne devient « saine »**. C'est la seule panne de
 * cette chaîne qui ne se remarquerait pas — tout continuerait de passer.
 */

/* ------------------------------------------------------------------ *
 * Le stockage, remplacé : la quarantaine n'est pas l'objet du test.
 * ------------------------------------------------------------------ */

const quarantaine = new Map<string, Buffer>();
/** Combien de fois un flux a été ouvert — donc combien d'octets sont chargés. */
const fluxOuverts = { compte: 0 };
/** Des métadonnées qui mentent : la taille annoncée n'est pas celle du flux. */
const taillesAnnoncees = new Map<string, number>();

vi.mock("@/lib/storage", () => ({
  lireEnQuarantaine: async (cle: string) => {
    fluxOuverts.compte += 1;
    const octets = quarantaine.get(cle);
    if (!octets) throw new Error("objet absent");
    return Readable.from([octets]);
  },
  tailleEnQuarantaine: async (cle: string) =>
    taillesAnnoncees.get(cle) ?? quarantaine.get(cle)?.length ?? null,
}));

const {
  NON_BRANCHE,
  antivirusConfigure,
  balayerDesOctets,
  balayeurHttp,
  leBalayeur,
  leDernierEssai,
  oublierLesEssais,
  sonderLeBalayage,
  verifierLeMoteur,
} = await import("@/server/securite/antivirus");

/* ------------------------------------------------------------------ *
 * Le moteur d'essai.
 * ------------------------------------------------------------------ */

interface Recu {
  methode: string;
  chemin: string;
  typeDeContenu: string | undefined;
  corps: Buffer;
}

type Reponse =
  | { statut: number; corps: string }
  /** Le moteur accepte la connexion et ne répond jamais. */
  | { muet: true };

async function moteur(
  reponses: Reponse[],
  recus: Recu[] = [],
): Promise<{ url: string; recus: Recu[]; fermer: () => Promise<void>; srv: Server }> {
  let rang = 0;
  const srv = createServer((requete: IncomingMessage, reponse: ServerResponse) => {
    const morceaux: Buffer[] = [];
    requete.on("data", (bloc: Buffer) => morceaux.push(bloc));
    requete.on("end", () => {
      recus.push({
        methode: requete.method ?? "",
        chemin: requete.url ?? "",
        typeDeContenu: requete.headers["content-type"],
        corps: Buffer.concat(morceaux),
      });
      const suivante = reponses[Math.min(rang++, reponses.length - 1)]!;
      if ("muet" in suivante) return; // on ne répond pas, jamais.
      reponse.writeHead(suivante.statut, { "Content-Type": "application/json" });
      reponse.end(suivante.corps);
    });
  });
  await new Promise<void>((resoudre) => srv.listen(0, "127.0.0.1", resoudre));
  const { port } = srv.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/scan`,
    recus,
    srv,
    fermer: () =>
      new Promise<void>((resoudre) => {
        srv.closeAllConnections();
        srv.close(() => resoudre());
      }),
  };
}

const CLE = "dossiers/a1b2/passeport.pdf";
const OCTETS = Buffer.from("%PDF-1.4 un passeport tout à fait ordinaire");

afterEach(() => {
  quarantaine.clear();
  taillesAnnoncees.clear();
  fluxOuverts.compte = 0;
  oublierLesEssais();
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ *
 * Le domaine : la table de décision, sans serveur.
 * ------------------------------------------------------------------ */

describe("ce que le moteur dit, et ce qu'on a le droit d'en conclure", () => {
  it("« clean » est la seule réponse qui vaut saine", () => {
    expect(lireLaReponse({ status: "clean" })).toEqual({ etat: "SAINE" });
  });

  /**
   * La liste de ce qui ne doit **jamais** produire « saine ». Chacune de
   * ces formes est une réponse qu'un moteur réel peut donner un mauvais
   * jour, et chacune passerait pour un fichier propre si la lecture était
   * permissive d'un cran.
   */
  it("tout le reste rend l'indisponibilité, jamais l'acceptation", () => {
    const refusees: unknown[] = [
      null,
      undefined,
      {},
      "clean",
      { status: "unknown" },
      { status: "error" },
      { status: "CLEAN" },
      { status: true },
      { statut: "clean" },
      { status: ["clean"] },
      { result: { status: "clean" } },
    ];
    for (const charge of refusees) {
      const vu = lireLaReponse(charge);
      expect(vu.etat, JSON.stringify(charge)).toBe("INDISPONIBLE");
      expect(vu.etat, JSON.stringify(charge)).not.toBe("SAINE");
    }
  });

  /** Un moteur avare de détails reste un moteur qui a trouvé quelque chose. */
  it("une infection sans signature reste une infection", () => {
    expect(lireLaReponse({ status: "infected" })).toEqual({
      etat: "INFECTEE",
      menace: "menace non nommée par le moteur",
    });
    expect(lireLaReponse({ status: "infected", signature: "  " })).toMatchObject({
      etat: "INFECTEE",
    });
    expect(lireLaReponse({ status: "infected", signature: "Eicar-Test-Signature" })).toEqual({
      etat: "INFECTEE",
      menace: "Eicar-Test-Signature",
    });
  });

  it("une adresse de moteur doit être http(s), et non vide", () => {
    expect(urlDuMoteurValide("https://av.interne/scan")).toBe(true);
    expect(urlDuMoteurValide("http://av:3310/scan")).toBe(true);
    expect(urlDuMoteurValide("")).toBe(false);
    expect(urlDuMoteurValide("   ")).toBe(false);
    expect(urlDuMoteurValide("à définir")).toBe(false);
    expect(urlDuMoteurValide("file:///etc/passwd")).toBe(false);
    expect(urlDuMoteurValide(undefined)).toBe(false);
  });
});

describe("rejouer, signaler — et jamais accepter", () => {
  const CAUSES: CauseDIndisponibilite[] = [
    "non_configure",
    "injoignable",
    "delai_depasse",
    "reponse_illisible",
    "trop_volumineux",
    "objet_absent",
  ];

  it("chaque cause porte un motif qui dit s'il faut attendre ou intervenir", () => {
    for (const cause of CAUSES) {
      const motif = MOTIF_INDISPONIBILITE[cause];
      expect(motif, cause).toBeTruthy();
      // RG-06.3 appliqué à l'exploitation : un message d'échec est
      // actionnable. Celui-ci dit ce qui se passe et ce qu'il faut faire.
      expect(motif, cause).toMatch(/quarantaine|balay|main|configur/iu);
    }
  });

  /** Ce qui se rejouerait à l'identique ne se rejoue pas. */
  it("seules les pannes passagères demandent une reprise", () => {
    expect(seReprendSeule("injoignable")).toBe(true);
    expect(seReprendSeule("delai_depasse")).toBe(true);
    for (const cause of ["non_configure", "reponse_illisible", "trop_volumineux", "objet_absent"] as const) {
      expect(seReprendSeule(cause), cause).toBe(false);
    }
  });

  /**
   * Le seuil est là pour être franchi **avant** que les reprises soient
   * épuisées : être prévenu pendant qu'on peut encore agir.
   */
  it("une panne passagère ne se signale qu'au bout du seuil", () => {
    for (let n = 1; n < TENTATIVES_AVANT_INCIDENT; n += 1) {
      expect(suiteDeLIndisponibilite("injoignable", n), String(n)).toEqual({
        rejouer: true,
        signaler: false,
      });
    }
    expect(suiteDeLIndisponibilite("injoignable", TENTATIVES_AVANT_INCIDENT)).toEqual({
      rejouer: true,
      signaler: true,
    });
  });

  /** Ce qui ne se rejouera pas se signale tout de suite : attendre n'apporte rien. */
  it("une cause définitive se signale dès la première tentative", () => {
    expect(suiteDeLIndisponibilite("trop_volumineux", 1)).toEqual({
      rejouer: false,
      signaler: true,
    });
    expect(suiteDeLIndisponibilite("reponse_illisible", 1)).toEqual({
      rejouer: false,
      signaler: true,
    });
  });
});

/* ------------------------------------------------------------------ *
 * L'adaptateur, contre un vrai serveur.
 * ------------------------------------------------------------------ */

describe("l'adaptateur devant un moteur qui répond", () => {
  it("transmet les octets, et rend « saine »", async () => {
    const m = await moteur([{ statut: 200, corps: '{"status":"clean"}' }]);
    quarantaine.set(CLE, OCTETS);
    try {
      expect(await balayeurHttp(m.url)(CLE)).toEqual({ etat: "SAINE" });

      const recu = m.recus[0]!;
      expect(recu.methode).toBe("POST");
      expect(recu.typeDeContenu).toBe("application/octet-stream");
      // Les octets eux-mêmes, une fois, dans le corps.
      expect(recu.corps.equals(OCTETS)).toBe(true);
    } finally {
      await m.fermer();
    }
  });

  /**
   * Le moteur est joint en direct, jamais par le proxy de sortie.
   *
   * L'adaptateur passait par le `fetch` global, que Node fait suivre
   * `HTTP_PROXY` / `HTTPS_PROXY` quand l'environnement l'y autorise. Avec
   * un `NO_PROXY` qui ne nommait pas l'hôte du moteur, les octets de
   * quarantaine partaient au proxy, et le balayage rendait `injoignable`
   * devant un moteur qui répondait. L'essai pose ces variables vers un
   * proxy mort et rend le `fetch` global inutilisable : le verdict doit
   * rester celui du moteur, et les octets lui parvenir.
   */
  it("joint le moteur en direct, quelles que soient les variables de proxy", async () => {
    const m = await moteur([{ statut: 200, corps: '{"status":"clean"}' }]);
    quarantaine.set(CLE, OCTETS);
    const fetchGlobal = vi.fn(() => Promise.reject(new Error("proxy de sortie")));
    vi.stubGlobal("fetch", fetchGlobal);
    for (const nom of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) {
      vi.stubEnv(nom, "http://127.0.0.1:9");
    }
    vi.stubEnv("NO_PROXY", "");
    vi.stubEnv("no_proxy", "");
    try {
      expect(await balayeurHttp(m.url)(CLE)).toEqual({ etat: "SAINE" });
      expect(fetchGlobal).not.toHaveBeenCalled();
      expect(m.recus).toHaveLength(1);
      expect(m.recus[0]!.typeDeContenu).toBe("application/octet-stream");
      expect(m.recus[0]!.corps.equals(OCTETS)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await m.fermer();
    }
  });

  /**
   * **Aucune URL ne part.** La quarantaine existe pour qu'il n'y ait
   * aucune adresse de lecture sur ces octets ; en confier une à un tiers
   * — même de courte durée — rouvrirait exactement ce qu'elle ferme, et
   * pour une durée qu'on ne contrôlerait plus.
   */
  it("ne transmet ni URL présignée, ni clé d'objet, ni nom de seau", async () => {
    const m = await moteur([{ statut: 200, corps: '{"status":"clean"}' }]);
    quarantaine.set(CLE, OCTETS);
    try {
      await balayeurHttp(m.url)(CLE);
      const recu = m.recus[0]!;
      const tout = `${recu.chemin} ${recu.corps.toString("utf8")}`;
      expect(tout).not.toContain(CLE);
      expect(tout).not.toMatch(/X-Amz-Signature|X-Amz-Credential|presigned/iu);
      expect(tout).not.toMatch(/quarantaine|bucket/iu);
      // Le chemin est celui du moteur, et rien n'y a été ajouté.
      expect(recu.chemin).toBe("/scan");
    } finally {
      await m.fermer();
    }
  });

  it("rend l'infection et le nom de la menace", async () => {
    const m = await moteur([
      { statut: 200, corps: '{"status":"infected","signature":"Eicar-Test-Signature"}' },
    ]);
    quarantaine.set(CLE, OCTETS);
    try {
      expect(await balayeurHttp(m.url)(CLE)).toEqual({
        etat: "INFECTEE",
        menace: "Eicar-Test-Signature",
      });
    } finally {
      await m.fermer();
    }
  });

  it("un 500 ne conclut rien, et surtout pas la propreté", async () => {
    const m = await moteur([{ statut: 500, corps: '{"status":"clean"}' }]);
    quarantaine.set(CLE, OCTETS);
    try {
      const vu = await balayeurHttp(m.url)(CLE);
      // Le corps dit « clean ». Le code de retour dit la panne, et c'est
      // lui qui décide : un moteur en erreur n'a rien balayé.
      expect(vu).toMatchObject({ etat: "INDISPONIBLE", cause: "injoignable" });
    } finally {
      await m.fermer();
    }
  });

  it("un corps qui n'est pas du JSON ne conclut rien non plus", async () => {
    const m = await moteur([{ statut: 200, corps: "<html>passerelle</html>" }]);
    quarantaine.set(CLE, OCTETS);
    try {
      expect(await balayeurHttp(m.url)(CLE)).toMatchObject({
        etat: "INDISPONIBLE",
        cause: "reponse_illisible",
      });
    } finally {
      await m.fermer();
    }
  });

  it("un « status » hors contrat ne se traduit pas au plus proche", async () => {
    const m = await moteur([{ statut: 200, corps: '{"status":"unknown"}' }]);
    quarantaine.set(CLE, OCTETS);
    try {
      expect(await balayeurHttp(m.url)(CLE)).toMatchObject({
        etat: "INDISPONIBLE",
        cause: "reponse_illisible",
      });
    } finally {
      await m.fermer();
    }
  });

  it("un moteur injoignable se distingue, et ne conclut rien", async () => {
    // Un port fermé : la connexion est refusée tout de suite.
    const m = await moteur([{ statut: 200, corps: '{"status":"clean"}' }]);
    const mort = m.url;
    await m.fermer();
    quarantaine.set(CLE, OCTETS);
    expect(await balayeurHttp(mort)(CLE)).toMatchObject({
      etat: "INDISPONIBLE",
      cause: "injoignable",
    });
  });

  /**
   * Le moteur accepte la connexion et ne répond jamais — le cas le plus
   * coûteux, parce qu'il immobilise un ouvrier de la file. Le délai le
   * borne, et la cause le distingue d'une coupure : un moteur lent
   * n'appelle pas le même geste qu'un moteur absent.
   */
  it("un moteur muet est borné par le délai", async () => {
    const m = await moteur([{ muet: true }]);
    quarantaine.set(CLE, OCTETS);
    try {
      const attendu = balayeurHttp(m.url)(CLE);
      // Le délai réel est de trente secondes : on ne l'attend pas.
      vi.useFakeTimers();
      await vi.advanceTimersByTimeAsync(DELAI_BALAYAGE_MS + 1_000);
      expect(await attendu).toMatchObject({
        etat: "INDISPONIBLE",
        cause: "delai_depasse",
      });
    } finally {
      vi.useRealTimers();
      await m.fermer();
    }
  });

  /** Une reprise de file après une promotion déjà faite : l'objet n'y est plus. */
  it("un objet absent de la quarantaine ne fait partir aucun appel", async () => {
    const m = await moteur([{ statut: 200, corps: '{"status":"clean"}' }]);
    try {
      expect(await balayeurHttp(m.url)("dossiers/a1b2/deja-promu.pdf")).toMatchObject({
        etat: "INDISPONIBLE",
        cause: "objet_absent",
      });
      expect(m.recus).toHaveLength(0);
    } finally {
      await m.fermer();
    }
  });

  /**
   * Deux plafonds, et ils ne font pas le même travail.
   *
   * La **taille annoncée** épargne le téléchargement : elle est lue
   * d'abord, et rien n'est chargé en mémoire. La lecture **sous
   * plafond** est la garantie — un objet dont les métadonnées mentent,
   * ou qui grandit entre la mesure et la lecture, ne doit pas pouvoir
   * remplir la mémoire du worker. Les deux sont éprouvés séparément,
   * sans quoi retirer le premier passerait inaperçu : le second rattrape
   * le verdict, mais après avoir tout chargé.
   */
  it("un objet trop volumineux est refusé sans qu'un flux soit ouvert", async () => {
    const m = await moteur([{ statut: 200, corps: '{"status":"clean"}' }]);
    quarantaine.set(CLE, Buffer.alloc(TAILLE_MAXI_BALAYAGE_OCTETS + 1));
    try {
      expect(await balayeurHttp(m.url)(CLE)).toMatchObject({
        etat: "INDISPONIBLE",
        cause: "trop_volumineux",
      });
      expect(m.recus).toHaveLength(0);
      // Le plafond annoncé a suffi : aucun octet n'a été chargé.
      expect(fluxOuverts.compte).toBe(0);
    } finally {
      await m.fermer();
    }
  });

  /** Et si les métadonnées mentent, la lecture s'arrête d'elle-même. */
  it("un flux qui dépasse la taille annoncée est coupé", async () => {
    const m = await moteur([{ statut: 200, corps: '{"status":"clean"}' }]);
    quarantaine.set(CLE, Buffer.alloc(TAILLE_MAXI_BALAYAGE_OCTETS + 1));
    // Les métadonnées disent « dix octets ». Le flux en rend trente-deux
    // mégaoctets et un — le cas d'un objet remplacé entre la mesure et la
    // lecture, ou d'un seau dont les métadonnées sont fausses.
    taillesAnnoncees.set(CLE, 10);
    try {
      const vu = await balayeurHttp(m.url)(CLE);
      expect(vu).toMatchObject({ etat: "INDISPONIBLE", cause: "trop_volumineux" });
      // Le flux a bien été ouvert, et coupé en route : rien n'est parti.
      expect(fluxOuverts.compte).toBe(1);
      expect(m.recus).toHaveLength(0);
    } finally {
      await m.fermer();
    }
  });

  /** Le rejeu : deux passes sur la même clé produisent le même verdict. */
  it("rejouer le même objet donne le même verdict, et un second appel", async () => {
    const m = await moteur([{ statut: 200, corps: '{"status":"clean"}' }]);
    quarantaine.set(CLE, OCTETS);
    try {
      const balayer = balayeurHttp(m.url);
      expect(await balayer(CLE)).toEqual({ etat: "SAINE" });
      expect(await balayer(CLE)).toEqual({ etat: "SAINE" });
      // Aucun cache : l'adaptateur ne décide rien de lui-même sur la foi
      // d'une réponse précédente. C'est le job qui ne rebalaie pas une
      // version déjà décidée.
      expect(m.recus).toHaveLength(2);
    } finally {
      await m.fermer();
    }
  });

  it("une adresse illisible ne fait partir aucun appel", async () => {
    quarantaine.set(CLE, OCTETS);
    expect(await balayeurHttp("à définir")(CLE)).toMatchObject({
      etat: "INDISPONIBLE",
      cause: "non_configure",
    });
  });

  /** Le détail atteint un journal : il ne doit rien porter de secret. */
  it("le détail rendu ne cite jamais l'adresse du moteur", async () => {
    quarantaine.set(CLE, OCTETS);
    const secrete = "http://av.interne/scan?token=tres-secret";
    const vu = await balayeurHttp(secrete)(CLE);
    expect(JSON.stringify(vu)).not.toContain("tres-secret");
    expect(JSON.stringify(vu)).not.toContain("av.interne");
  });
});

/* ------------------------------------------------------------------ *
 * La sonde : ce qui autorise à dire « opérationnel ».
 * ------------------------------------------------------------------ */

describe("la sonde ne conclut que sur un fait", () => {
  it("le balayeur non branché rend l'indisponibilité, jamais la propreté", async () => {
    const vu = await NON_BRANCHE(CLE);
    expect(vu).toMatchObject({ etat: "INDISPONIBLE", cause: "non_configure" });
    expect(vu.etat).not.toBe("SAINE");
  });

  it("une variable renseignée mais illisible ne vaut pas un moteur", () => {
    expect(antivirusConfigure({ ANTIVIRUS_URL: "http://av" })).toBe(true);
    expect(antivirusConfigure({ ANTIVIRUS_URL: "à définir" })).toBe(false);
    expect(antivirusConfigure({ ANTIVIRUS_URL: "   " })).toBe(false);
    expect(antivirusConfigure({})).toBe(false);
    expect(leBalayeur({ ANTIVIRUS_URL: "à définir" })).toBe(NON_BRANCHE);
  });

  /**
   * Le cœur de la sonde. Une `ANTIVIRUS_URL` bien formée devant un
   * service qui répond poliment `clean` à tout passerait pour
   * opérationnelle **en laissant entrer chaque fichier**. C'est la seule
   * panne de cette chaîne qui ne se remarquerait jamais.
   */
  it("un moteur qui déclare EICAR sain est une panne, pas un succès", async () => {
    const m = await moteur([{ statut: 200, corps: '{"status":"clean"}' }]);
    try {
      const vu = await verifierLeMoteur({ ANTIVIRUS_URL: m.url });
      expect(vu).toMatchObject({ issue: "muet" });
      expect(vu!.detail).toMatch(/répond sans détecter/u);
      expect(leDernierEssai()).toMatchObject({ reconnu: false });
      expect(sonderLeBalayage({ ANTIVIRUS_URL: m.url })).toBe("ECHOUEE");
    } finally {
      await m.fermer();
    }
  });

  it("un moteur qui signale EICAR conclut, et c'est la seule preuve", async () => {
    const m = await moteur([
      { statut: 200, corps: '{"status":"infected","signature":"Eicar-Test-Signature"}' },
    ]);
    try {
      expect(await verifierLeMoteur({ ANTIVIRUS_URL: m.url })).toMatchObject({ issue: "reconnu" });
      expect(leDernierEssai()).toMatchObject({ reconnu: true });
      expect(sonderLeBalayage({ ANTIVIRUS_URL: m.url })).toBe("CONCLUANTE");

      // C'est bien EICAR qui est parti, et rien d'autre : aucun fichier de
      // candidat ne sert de sonde.
      expect(m.recus[0]!.corps.toString("ascii")).toBe(EICAR);
    } finally {
      await m.fermer();
    }
  });

  it("un moteur en panne ne conclut pas, et le dit", async () => {
    const m = await moteur([{ statut: 503, corps: "" }]);
    try {
      const vu = await verifierLeMoteur({ ANTIVIRUS_URL: m.url });
      expect(vu).toMatchObject({ issue: "muet" });
      expect(vu!.detail).toContain("injoignable");
      expect(sonderLeBalayage({ ANTIVIRUS_URL: m.url })).toBe("ECHOUEE");
    } finally {
      await m.fermer();
    }
  });

  it("sans adresse, rien n'est reproché à personne", async () => {
    expect(await verifierLeMoteur({})).toMatchObject({ issue: "non_configure" });
    // Pas de fait noté : la capacité se lira « adaptateur absent », ce qui
    // est la vérité, et non « en panne ».
    expect(leDernierEssai()).toBeNull();
  });

  /** Avant tout essai, la sonde s'abstient — elle ne suppose pas le succès. */
  it("une adresse qui n'a jamais été essayée reste sans conclusion", () => {
    expect(sondeDuConstat(true, undefined)).toBe("ABSENTE");
    expect(sondeDuConstat(false, undefined)).toBe("ECHOUEE");
    expect(sondeDuConstat(false, { reussi: true, quand: new Date() })).toBe("ECHOUEE");
    expect(sondeDuConstat(true, { reussi: true, quand: new Date() })).toBe("CONCLUANTE");
  });

  /**
   * **Le constat traverse la frontière des processus, ou il ne sert à
   * rien.** L'essai est fait par le worker ; `/api/health` vit dans le
   * processus web. Le constat lui est donc passé, et la sonde conclut
   * dessus — c'est ce que l'ancienne variable de module rendait
   * impossible.
   */
  it("conclut sur un constat venu d'ailleurs, sans avoir rien essayé elle-même", () => {
    const avec = { ANTIVIRUS_URL: "http://av.interne/scan" };
    // Rien n'a été essayé dans ce processus-ci.
    expect(leDernierEssai()).toBeNull();
    expect(sonderLeBalayage(avec)).toBe("ABSENTE");

    // Le worker, lui, a présenté EICAR et l'a noté en base.
    expect(sonderLeBalayage(avec, { reussi: true, quand: new Date() })).toBe("CONCLUANTE");
    expect(sonderLeBalayage(avec, { reussi: false, quand: new Date() })).toBe("ECHOUEE");
  });

  /** Et un constat périmé cesse de parler pour aujourd'hui. */
  it("un constat trop vieux ne déclare plus rien d'opérationnel", () => {
    const avec = { ANTIVIRUS_URL: "http://av.interne/scan" };
    const vieux = { reussi: true, quand: new Date(Date.now() - FRAICHEUR_DU_CONSTAT_MS - 1) };
    expect(sonderLeBalayage(avec, vieux)).toBe("ABSENTE");
  });

  /** La sonde et le balayage empruntent le même chemin réseau. */
  it("la sonde éprouve le code que le balayage exécute", async () => {
    const m = await moteur([{ statut: 200, corps: '{"status":"infected"}' }]);
    quarantaine.set(CLE, OCTETS);
    try {
      await verifierLeMoteur({ ANTIVIRUS_URL: m.url });
      await balayeurHttp(m.url)(CLE);
      const [sonde, balayage] = m.recus;
      expect(sonde!.methode).toBe(balayage!.methode);
      expect(sonde!.chemin).toBe(balayage!.chemin);
      expect(sonde!.typeDeContenu).toBe(balayage!.typeDeContenu);
    } finally {
      await m.fermer();
    }
  });

  it("l'appel sur octets rend un verdict sans jamais lever", async () => {
    // Un port fermé, donc une exception réseau, donc un verdict.
    const m = await moteur([{ statut: 200, corps: "{}" }]);
    const mort = m.url;
    await m.fermer();
    await expect(balayerDesOctets(mort, Buffer.from("x"))).resolves.toMatchObject({
      etat: "INDISPONIBLE",
    });
  });
});
