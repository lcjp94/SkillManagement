import { useState } from 'react'
import type { Reglages as ReglagesVue } from '@shared/contrat'
import type { AssistantId, LevelId } from '@shared/schemas/catalog'
import { appeler, messageErreur, useDonnees } from '../api'
import { useApp } from '../appContexte'
import { Alerte, Btn, CaseCarte, Champ, useNotifs } from '../ui'
import { SectionIa } from './Ia'

const THEMES: { id: ReglagesVue['theme']; libelle: string }[] = [
  { id: 'auto', libelle: 'Automatique (comme votre ordinateur)' },
  { id: 'clair', libelle: 'Clair' },
  { id: 'sombre', libelle: 'Sombre' }
]

const bascule = <T,>(liste: T[], valeur: T, coche: boolean): T[] => (coche ? [...liste.filter((v) => v !== valeur), valeur] : liste.filter((v) => v !== valeur))

function Profil() {
  const { ref, profil, profilEnregistre } = useApp()
  const { toast } = useNotifs()
  const [prenom, setPrenom] = useState(profil?.prenom ?? '')
  const [metier, setMetier] = useState(profil?.metier ?? '')
  const [aisance, setAisance] = useState<LevelId>(profil?.aisance ?? 'debutant')
  const [assistants, setAssistants] = useState<AssistantId[]>(profil?.assistants ?? [])
  const [erreur, setErreur] = useState<string | null>(null)

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault()
    setErreur(null)
    if (assistants.length === 0) return setErreur('Choisissez au moins un assistant.')
    try {
      const suivant = { prenom: prenom.trim() || undefined, metier, aisance, assistants, objectifs: profil?.objectifs ?? [] }
      await appeler('profil.set', suivant)
      profilEnregistre(suivant)
      toast('Profil enregistré.')
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  return (
    <section aria-labelledby="titre-profil" className="carte">
      <form onSubmit={enregistrer} className="flex flex-col gap-4">
        <h2 id="titre-profil">Votre profil</h2>
        <Champ libelle="Prénom">{(c) => <input {...c} className="champ max-w-sm" value={prenom} maxLength={80} onChange={(e) => setPrenom(e.target.value)} />}</Champ>
        <Champ libelle="Métier">
          {(c) => (
            <select {...c} className="champ max-w-sm" value={metier} onChange={(e) => setMetier(e.target.value)}>
              {ref.natures.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          )}
        </Champ>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">Aisance avec les assistants IA</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {ref.niveaux.map((n) => (
              <CaseCarte key={n.id} type="radio" name="reglage-aisance" checked={aisance === n.id} onChange={() => setAisance(n.id)} titre={n.libelle} />
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">Assistants utilisés</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ref.assistants.map((a) => (
              <CaseCarte key={a.id} type="checkbox" checked={assistants.includes(a.id)} onChange={(c) => setAssistants(bascule(assistants, a.id, c))} titre={a.libelle} />
            ))}
          </div>
        </fieldset>
        {erreur && (
          <Alerte ton="erreur" annonce>
            {erreur}
          </Alerte>
        )}
        <div>
          <Btn type="submit" ton="primaire">
            Enregistrer le profil
          </Btn>
        </div>
      </form>
    </section>
  )
}

function Apparence() {
  const { donnees, recharger } = useDonnees('reglages.get')
  const { toast } = useNotifs()
  const [choisi, setChoisi] = useState<ReglagesVue['theme'] | null>(null)
  const actuel = choisi ?? donnees?.theme

  const changer = async (theme: ReglagesVue['theme']) => {
    // Le thème s'applique tout de suite ; l'enregistrement suit
    setChoisi(theme)
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
    try {
      await appeler('reglages.set', { theme })
      recharger()
    } catch (e) {
      toast(messageErreur(e))
    }
  }
  return (
    <section aria-labelledby="titre-apparence" className="carte">
      <fieldset className="flex flex-col gap-3">
        <legend id="titre-apparence" className="mb-2 text-lg font-semibold">
          Apparence
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {THEMES.map((t) => (
            <CaseCarte key={t.id} type="radio" name="theme" checked={actuel === t.id} onChange={() => changer(t.id)} titre={t.libelle} />
          ))}
        </div>
      </fieldset>
    </section>
  )
}

export function Reglages() {
  const { info } = useApp()
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1>Réglages</h1>
      </header>
      <Profil />
      <Apparence />
      <section aria-labelledby="titre-redaction" className="carte flex flex-col gap-3">
        <h2 id="titre-redaction">Rédaction de skills avec une IA</h2>
        <SectionIa />
      </section>
      <section aria-labelledby="titre-approfondie" className="carte flex flex-col gap-2">
        <h2 id="titre-approfondie">Analyse approfondie</h2>
        {info.analyseApprofondie.disponible ? (
          <p>Une analyse approfondie est disponible sur cet ordinateur : elle complète l’analyse de sécurité habituelle, et vous pouvez la lancer avant chaque installation. Elle fonctionne sans internet et n’envoie rien.</p>
        ) : (
          <p className="text-doux">L’analyse de sécurité habituelle est toujours active. Une analyse approfondie facultative devient disponible si l’outil qui la fait est installé sur cet ordinateur.</p>
        )}
        <details>
          <summary>Voir le détail</summary>
          <p className="mt-1 text-sm text-doux">
            {info.analyseApprofondie.disponible
              ? `Outil détecté : SkillSpector${info.analyseApprofondie.version ? ` (${info.analyseApprofondie.version})` : ''}. Il est lancé sans service d'IA distant (option --no-llm), dans un dossier temporaire supprimé ensuite.`
              : "Outil non détecté : SkillSpector (NVIDIA), à installer par vous-même."}{' '}
            <a href="https://github.com/NVIDIA/SkillSpector" target="_blank" rel="noopener noreferrer">
              Page du projet
            </a>
          </p>
        </details>
      </section>
      <section aria-labelledby="titre-apropos" className="carte flex flex-col gap-2">
        <h2 id="titre-apropos">À propos</h2>
        <p>
          {info.nom} version {info.version}. Licence MIT.
        </p>
        <p className="text-doux">Vos projets, votre profil et vos réglages restent sur cet ordinateur. L’application ne se connecte à internet que si vous le demandez : pour une rédaction avec le service d’IA que vous avez choisi, ou pour chercher des skills sur GitHub.</p>
      </section>
    </div>
  )
}
