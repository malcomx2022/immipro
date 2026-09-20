"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import type { DocumentEnEdition } from "@/server/lecture/editorial";
import {
  AIDE_SLUG,
  AIDE_SOURCE,
  MENTION_DERIVES,
  LIBELLE_ETAT,
  LIBELLE_GENRE,
  dureeLecture,
  messageDeRefusEditorial,
  sommaireDe,
  verifierLeDocument,
  type Bloc,
  type Corps,
  type FauteEditoriale,
} from "@/domain/editorial/document";
import { MENTION_AUDIT } from "@/domain/backoffice/navigation";
import { MENTION_HISTORIQUE } from "@/domain/editorial/historique";
import { momentEnFrancais } from "@/domain/format/moment";
import { CHAMP_CONTROLE } from "@/components/ui/champ";
import { cn } from "@/lib/utils";

/**
 * B-08 — Édition d'un guide ou d'un article. J.C.
 *
 * Le refus se calcule **pendant la saisie**, et pas seulement au serveur.
 * Non pour se passer de lui — il refuse la publication, et c'est lui qui
 * compte — mais parce qu'une promesse signalée au moment où on l'écrit se
 * reformule ; signalée dix minutes plus tard, elle se contourne.
 *
 * Le sommaire et la durée de lecture sont affichés en lecture seule, à
 * côté du corps. Les montrer sans les rendre saisissables est le seul moyen
 * de faire comprendre qu'ils suivent le texte : cachés, on les croirait
 * absents, et quelqu'un finirait par demander un champ.
 */
const FORMES: readonly { valeur: Bloc["type"]; libelle: string }[] = [
  { valeur: "paragraphe", libelle: "Paragraphe" },
  { valeur: "intertitre", libelle: "Intertitre (entre au sommaire)" },
  { valeur: "encadre", libelle: "Encadré" },
  { valeur: "citation", libelle: "Citation" },
  { valeur: "liste", libelle: "Liste" },
];

/**
 * Un paragraphe de guide fait quatre ou cinq lignes. Le saisir dans un
 * champ d'une ligne, où l'on ne voit que la fin de ce qu'on écrit, est le
 * genre de détail qui pousse à rédiger dans un traitement de texte et à
 * coller ensuite — c'est-à-dire à écrire hors du garde-fou.
 */
function Texte({
  libelle,
  valeur,
  onChangement,
  aide,
}: {
  libelle: string;
  valeur: string;
  onChangement: (v: string) => void;
  aide?: string;
}) {
  const id = `champ-${libelle.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-14 font-medium text-ink-900">
        {libelle}
      </label>
      <textarea
        id={id}
        rows={3}
        value={valeur}
        onChange={(e) => onChangement(e.target.value)}
        {...(aide ? { "aria-describedby": `${id}-aide` } : {})}
        className={cn(CHAMP_CONTROLE, "h-auto py-2.5")}
      />
      {aide ? (
        <span id={`${id}-aide`} className="text-13 text-ink-500">
          {aide}
        </span>
      ) : null}
    </div>
  );
}

const blocVide = (type: Bloc["type"]): Bloc => {
  if (type === "liste") return { type, items: [""] };
  if (type === "encadre") return { type, titre: "", texte: "" };
  return { type, texte: "" };
};

export function EditionContenu({ document }: { document: DocumentEnEdition }) {
  const router = useRouter();
  const [titre, setTitre] = useState(document.titre);
  const [chapeau, setChapeau] = useState(document.chapeau);
  const [source, setSource] = useState(document.source ?? "");
  const [verifieeLe, setVerifieeLe] = useState(document.verifieeLe ?? "");
  const [pays, setPays] = useState(document.pays ?? "");
  const [rubrique, setRubrique] = useState(document.rubrique ?? "");
  const [auteur, setAuteur] = useState(document.auteur ?? "");
  const [blocs, setBlocs] = useState<Bloc[]>(
    document.corps ? [...document.corps.blocs] : [blocVide("paragraphe")],
  );
  const [appel, setAppel] = useState<Corps["appel"]>(
    document.corps?.appel ?? {
      titre: "",
      texte: "",
      action: "",
      href: "/simulateur",
    },
  );
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const [etat, setEtat] = useState(document.etat);
  /** La version dont on relit le texte, `null` si aucune — P.B. */
  const [relue, setRelue] = useState<number | null>(null);

  const corps: Corps = { blocs, appel };
  const refus: readonly FauteEditoriale[] = verifierLeDocument({ titre, chapeau }, corps);
  const sommaire = sommaireDe(blocs);
  const adresse = `/${document.genre === "GUIDE" ? "guides" : "articles"}/${document.slug}`;

  const majBloc = (i: number, bloc: Bloc) =>
    setBlocs((liste) => liste.map((b, j) => (j === i ? bloc : b)));

  async function enregistrer() {
    setEnvoi(true);
    setEchec(null);
    setFait(null);
    const resultat = await appeler<{ enregistre: boolean }>(
      `/api/admin/contenus/${document.id}`,
      {
        methode: "PUT",
        corps: {
          titre,
          chapeau,
          corps,
          ...(source.trim() ? { source: source.trim() } : {}),
          ...(verifieeLe ? { verifieeLe } : {}),
          ...(document.genre === "GUIDE" ? { pays } : { rubrique, auteur }),
        },
      },
    );
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    setFait("Enregistré.");
    router.refresh();
  }

  async function publier(action: "publier" | "retirer" | "restaurer", version?: number) {
    setEnvoi(true);
    setEchec(null);
    setFait(null);
    const resultat = await appeler<{ etat: string; restauree?: number }>(
      `/api/admin/contenus/${document.id}`,
      { corps: { action, motif, ...(version ? { version } : {}) } },
    );
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    setEtat(resultat.donnees.etat as typeof etat);
    setFait(
      action === "publier"
        ? `Publié — ${adresse}`
        : action === "retirer"
          ? "Retiré de la publication."
          : `Version ${resultat.donnees.restauree} restaurée. Les champs ci-dessus se rechargent.`,
    );
    setMotif("");
    // Les champs du formulaire viennent de l'état local : après une
    // restauration, ils montreraient encore le texte remplacé. Recharger
    // la page est le seul moyen honnête de les remettre d'accord avec la
    // base, et c'est ce que `router.refresh()` ne fait pas seul ici.
    if (action === "restaurer") {
      globalThis.location.reload();
      return;
    }
    router.refresh();
  }

  return (
    <>
      <EnteteAdmin
        titre={titre || "Sans titre"}
        resume={`${LIBELLE_GENRE[document.genre]} · ${LIBELLE_ETAT[etat]} · ${adresse}`}
        actions={
          <div className="flex gap-2">
            <Link
              href="/contenus"
              className="flex min-h-touch items-center px-3 text-14 text-ink-700"
            >
              Retour
            </Link>
            <Button variante="secondaire" chargement={envoi} onClick={() => void enregistrer()}>
              Enregistrer
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-5 p-6">
        {echec ? <BlocEchec echec={echec} annonce /> : null}
        {fait ? (
          <p aria-live="polite" className="text-14 text-ink-700">
            {fait}
          </p>
        ) : null}

        {/* Le refus, en tête et pendant la saisie. Il cite la formulation
            et dit où elle se corrige. */}
        {refus.length > 0 ? (
          <section className="flex flex-col gap-2 rounded-lg border border-echec bg-white p-5">
            <h2 className="text-16 font-semibold text-echec">
              {refus.length === 1
                ? "Une formulation bloque la publication"
                : `${refus.length} formulations bloquent la publication`}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {refus.map((faute) => (
                <li key={`${faute.chemin}-${faute.extrait}`} className="text-pretty text-14 text-ink-700">
                  {messageDeRefusEditorial(faute)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-4 rounded-lg border border-ink-300 bg-white p-5">
          <h2 className="text-16 font-semibold text-ink-900">En-tête</h2>
          <Input libelle="Titre" value={titre} onChange={(e) => setTitre(e.target.value)} />
          <Input
            libelle="Adresse publique"
            value={adresse}
            readOnly
            disabled
            aide={AIDE_SLUG}
            classNameControle="font-mono"
          />
          <Texte
            libelle="Chapeau"
            valeur={chapeau}
            onChangement={setChapeau}
            aide="Les deux phrases sous le titre. Elles servent aussi de description à la page."
          />
          {document.genre === "GUIDE" ? (
            <Input libelle="Pays" value={pays} onChange={(e) => setPays(e.target.value)} />
          ) : (
            <>
              <Input
                libelle="Rubrique"
                value={rubrique}
                onChange={(e) => setRubrique(e.target.value)}
              />
              <Input
                libelle="Auteur"
                value={auteur}
                onChange={(e) => setAuteur(e.target.value)}
              />
            </>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-lg border border-ink-300 bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-16 font-semibold text-ink-900">Corps</h2>
            <p className="text-13 text-ink-500">
              {sommaire.length} entrée{sommaire.length > 1 ? "s" : ""} au sommaire ·{" "}
              {dureeLecture(blocs)} de lecture
            </p>
          </div>
          <p className="text-pretty text-13 text-ink-500">{MENTION_DERIVES}</p>

          {blocs.map((bloc, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md bg-ink-100 p-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <Select
                  libelle={`Bloc ${i + 1}`}
                  value={bloc.type}
                  onChange={(e) => majBloc(i, blocVide(e.target.value as Bloc["type"]))}
                  options={FORMES.map((f) => ({ valeur: f.valeur, libelle: f.libelle }))}
                />
                <Button
                  variante="secondaire"
                  disabled={blocs.length === 1}
                  raisonDesactivation="Un document garde au moins un bloc."
                  onClick={() => setBlocs((l) => l.filter((_, j) => j !== i))}
                >
                  Retirer
                </Button>
              </div>

              {bloc.type === "encadre" ? (
                <Input
                  libelle="Titre de l'encadré"
                  value={bloc.titre}
                  onChange={(e) => majBloc(i, { ...bloc, titre: e.target.value })}
                />
              ) : null}

              {bloc.type === "liste" ? (
                <div className="flex flex-col gap-2">
                  {bloc.items.map((item, j) => (
                    <Input
                      key={j}
                      libelle={`Item ${j + 1}`}
                      value={item}
                      onChange={(e) =>
                        majBloc(i, {
                          ...bloc,
                          items: bloc.items.map((v, k) => (k === j ? e.target.value : v)),
                        })
                      }
                    />
                  ))}
                  <Button
                    variante="secondaire"
                    className="self-start"
                    onClick={() => majBloc(i, { ...bloc, items: [...bloc.items, ""] })}
                  >
                    Ajouter un item
                  </Button>
                </div>
              ) : (
                <Texte
                  libelle="Texte"
                  valeur={bloc.texte}
                  onChangement={(v) => majBloc(i, { ...bloc, texte: v })}
                />
              )}
            </div>
          ))}

          <Button
            variante="secondaire"
            className="self-start"
            onClick={() => setBlocs((l) => [...l, blocVide("paragraphe")])}
          >
            Ajouter un bloc
          </Button>
        </section>

        <section className="flex flex-col gap-4 rounded-lg border border-ink-300 bg-white p-5">
          <h2 className="text-16 font-semibold text-ink-900">Appel à l&apos;action</h2>
          <Input
            libelle="Titre"
            value={appel.titre}
            onChange={(e) => setAppel({ ...appel, titre: e.target.value })}
          />
          <Texte
            libelle="Texte"
            valeur={appel.texte}
            onChangement={(v) => setAppel({ ...appel, texte: v })}
          />
          <Input
            libelle="Libellé du bouton"
            value={appel.action}
            onChange={(e) => setAppel({ ...appel, action: e.target.value })}
          />
          <Input
            libelle="Adresse"
            value={appel.href}
            onChange={(e) => setAppel({ ...appel, href: e.target.value })}
            aide="Une adresse interne du site, comme /simulateur ou /inscription."
            classNameControle="font-mono"
          />
        </section>

        <section className="flex flex-col gap-4 rounded-lg border border-ink-300 bg-white p-5">
          <h2 className="text-16 font-semibold text-ink-900">Source</h2>
          <p className="text-pretty text-13 text-ink-500">{AIDE_SOURCE}</p>
          <Input
            libelle="Source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aide="Les sites d'où vient l'information, séparés par des virgules."
          />
          <Input
            libelle="Vérifiée le"
            type="date"
            value={verifieeLe}
            onChange={(e) => setVerifieeLe(e.target.value)}
          />
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-ink-300 bg-white p-5">
          <h2 className="text-16 font-semibold text-ink-900">Publication</h2>
          <Input
            libelle="Motif"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            aide={MENTION_AUDIT}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              chargement={envoi}
              disabled={refus.length > 0 || motif.trim().length < 3 || !source.trim() || !verifieeLe}
              raisonDesactivation={raisonDePublication(refus.length, motif, source, verifieeLe)}
              onClick={() => void publier("publier")}
            >
              {etat === "PUBLIE" ? "Republier" : "Publier"}
            </Button>
            <Button
              variante="secondaire"
              chargement={envoi}
              disabled={etat !== "PUBLIE" || motif.trim().length < 3}
              raisonDesactivation={
                etat !== "PUBLIE"
                  ? "Ce document n'est pas publié."
                  : "Un motif, consigné au journal d'audit."
              }
              onClick={() => void publier("retirer")}
            >
              Retirer de la publication
            </Button>
            {etat === "PUBLIE" ? (
              <Link
                href={adresse}
                className="flex min-h-touch items-center px-3 text-14 text-accent-600 underline"
              >
                Voir la page publique
              </Link>
            ) : null}
          </div>
        </section>

        {/* P.B — l'historique des publications.
            Il ne se remplit qu'en publiant : un document jamais publié
            n'affiche pas une section vide en promettant qu'elle se
            remplira, il dit ce qu'il faut faire pour qu'elle existe. */}
        <section className="flex flex-col gap-3 rounded-lg border border-ink-300 bg-white p-5">
          <h2 className="text-16 font-semibold text-ink-900">Historique des publications</h2>
          <p className="text-pretty text-13 text-ink-500">{MENTION_HISTORIQUE}</p>
          {document.versions.length === 0 ? (
            <p className="text-pretty text-14 text-ink-700">
              Aucune publication pour l&apos;instant. La première créera la version 1.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {document.versions.map((v) => (
                <li
                  key={v.rang}
                  className="flex flex-col gap-2 border-t border-ink-300 pt-3 first:border-0 first:pt-0"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-14 font-semibold text-ink-900">
                      Version {v.rang}
                    </span>
                    <span className="text-13 text-ink-500">
                      {momentEnFrancais(v.publieLe)} · {v.par}
                    </span>
                  </div>
                  <p className="text-pretty text-14 text-ink-700">{v.motif}</p>
                  <p className="text-pretty text-13 text-ink-500">
                    {v.titre} · source : {v.source}, vérifiée le {v.verifieeLe}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variante="secondaire"
                      onClick={() => setRelue(relue === v.rang ? null : v.rang)}
                    >
                      {relue === v.rang ? "Masquer le texte" : "Relire le texte"}
                    </Button>
                    <Button
                      variante="secondaire"
                      chargement={envoi}
                      disabled={motif.trim().length < 3 || v.corps === null}
                      raisonDesactivation={raisonDeRestauration(motif, v.corps !== null)}
                      onClick={() => void publier("restaurer", v.rang)}
                    >
                      Restaurer cette version
                    </Button>
                  </div>
                  {relue === v.rang ? (
                    <div className="flex flex-col gap-2 rounded-md bg-ink-100 p-4">
                      {v.corps === null ? (
                        <p className="text-pretty text-14 text-ink-700">
                          Le texte de cette version ne se relit plus. La ligne reste :
                          elle prouve qu&apos;une publication a eu lieu ce jour-là.
                        </p>
                      ) : (
                        <>
                          <p className="text-pretty text-14 font-semibold text-ink-900">
                            {v.chapeau}
                          </p>
                          {v.corps.blocs.map((bloc, i) => (
                            <p
                              key={`${v.rang}-${i}`}
                              className={cn(
                                "text-pretty text-14 text-ink-700",
                                bloc.type === "intertitre" && "font-semibold text-ink-900",
                              )}
                            >
                              {bloc.type === "liste" ? bloc.items.join(" · ") : bloc.texte}
                            </p>
                          ))}
                        </>
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * Règle de désactivation 3 : un bouton gris sans explication est un défaut.
 * L'ordre suit le coût de la correction — la formulation d'abord, parce
 * qu'elle demande de réécrire ; le motif en dernier, parce qu'il se tape.
 */
/**
 * Restaurer écrit dans la base et se consigne au journal : c'est une
 * décision, pas une prévisualisation, et elle se motive comme les autres.
 */
function raisonDeRestauration(motif: string, lisible: boolean): string | undefined {
  if (!lisible) return "Le texte de cette version ne se relit plus : il n'y a rien à restaurer.";
  if (motif.trim().length < 3) return "Un motif, consigné au journal d'audit.";
  return undefined;
}

function raisonDePublication(
  refus: number,
  motif: string,
  source: string,
  verifieeLe: string,
): string | undefined {
  if (refus > 0) return "Une formulation est refusée. Corrige-la avant de publier.";
  if (!source.trim() || !verifieeLe) {
    return "Une publication porte sa source et sa date de vérification (INV-8).";
  }
  if (motif.trim().length < 3) return "Un motif, consigné au journal d'audit.";
  return undefined;
}
