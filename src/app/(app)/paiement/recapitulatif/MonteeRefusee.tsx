import { LienBouton } from "@/components/ui/LienBouton";

/**
 * Le passage à Dossier refusé — S.88.
 *
 * Un écran et non une page introuvable : l'adresse est légitime, c'est le
 * dossier qui ne s'y prête pas, et le candidat doit savoir pourquoi. La
 * raison vient du domaine (`MESSAGE_DU_REFUS`) et dit ce qui reste possible.
 */
export function MonteeRefusee({ dossierId, message }: { dossierId: string; message: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 py-6 md:px-8 md:py-10">
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        Le passage à Dossier n&apos;est pas possible ici
      </h1>
      <p className="text-pretty text-16 text-ink-700">{message}</p>
      <p className="text-pretty text-14 text-ink-500">Rien n&apos;a été débité.</p>
      <LienBouton href={`/dossiers/${dossierId}`} pleineLargeur className="md:w-auto md:self-start">
        Revenir à mon dossier
      </LienBouton>
    </div>
  );
}
