import { useEffect, useState } from 'react'
import type { ElementConseilVue } from '@shared/contrat'
import type { AssistantId, LevelId } from '@shared/schemas/catalog'
import { appeler, messageErreur } from '../api'
import { useApp } from '../appContexte'
import { aller, lien } from '../routes'
import { Alerte, Analyse, Btn, CaseCarte, Champ, Chargement, Donnee, useNotifs } from '../ui'

const ETAPES = ['Vos assistants', 'Votre prénom', 'Votre métier', 'Votre aisance', 'Vos objectifs', 'Votre sélection'] as const

const bascule = <T,>(liste: T[], valeur: T, coche: boolean): T[] => (coche ? [...liste.filter((v) => v !== valeur), valeur] : liste.filter((v) => v !== valeur))

export function Demarrage() {
  const { ref, profilEnregistre } = useApp()
  const { annoncer } = useNotifs()
  const [etape, setEtape] = useState(0)
  const [assistants, setAssistants] = useState<AssistantId[]>([])
  const [prenom, setPrenom] = useState('')
  const [metier, setMetier] = useState('')
  const [aisance, setAisance] = useState<LevelId | ''>('')
  const [objectifs, setObjectifs] = useState<string[]>([])
  const [libre, setLibre] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [propositions, setPropositions] = useState<ElementConseilVue[] | null>(null)
  const [retenus, setRetenus] = useState<string[]>([])
  const [occupe, setOccupe] = useState(false)

  const total = ETAPES.length
  useEffect(() => {
    annoncer(`Étape ${etape + 1} sur ${total} : ${ETAPES[etape]}`)
  }, [etape, total, annoncer])

  // La sélection est calculée en arrivant sur la dernière étape, et refaite si les réponses changent
  useEffect(() => {
    if (etape !== total - 1 || !metier || !aisance) return
    setPropositions(null)
    appeler('onboarding.conseil', { metier, aisance, objectifs, assistants, objectifLibre: libre.trim() || undefined }).then(
      (c) => {
        setPropositions(c.items)
        setRetenus(c.items.map((i) => i.skill.slug))
      },
      (e: unknown) => setErreur(messageErreur(e))
    )
  }, [etape, total, metier, aisance, objectifs, assistants, libre])

  const suivant = () => {
    if (etape === 0 && assistants.length === 0) return setErreur('Choisissez au moins un assistant pour continuer.')
    if (etape === 2 && !metier) return setErreur('Choisissez le métier qui vous ressemble le plus.')
    if (etape === 3 && !aisance) return setErreur('Choisissez votre niveau d’aisance.')
    setErreur(null)
    setEtape(etape + 1)
  }

  const terminer = async () => {
    if (!metier || !aisance) return
    setOccupe(true)
    try {
      const profil = { prenom: prenom.trim() || undefined, metier, aisance, assistants, objectifs }
      const { projetId } = await appeler('onboarding.terminer', { profil, slugs: retenus })
      profilEnregistre(profil)
      aller(lien.projet(projetId, 'deploiements'))
    } catch (e) {
      setErreur(messageErreur(e))
      setOccupe(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-doux">
          Étape {etape + 1} sur {total}
        </p>
        <div className="flex gap-1.5" aria-hidden="true">
          {ETAPES.map((nom, i) => (
            <span key={nom} className={`h-1.5 flex-1 rounded-full ${i <= etape ? 'bg-bouton' : 'bg-surface-2'}`} />
          ))}
        </div>
      </header>

      {etape === 0 && (
        <section className="flex flex-col gap-4" aria-labelledby="titre-etape">
          <div>
            <h1 id="titre-etape">Quels assistants IA utilisez-vous ?</h1>
            <p className="mt-2 text-doux">C’est ce qui décide où vos skills seront écrits. Aucune clé ni compte n’est nécessaire.</p>
          </div>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only-sm">Assistants IA</legend>
            {ref.assistants.map((a) => (
              <CaseCarte key={a.id} type="checkbox" checked={assistants.includes(a.id)} onChange={(c) => setAssistants(bascule(assistants, a.id, c))} titre={a.libelle} />
            ))}
          </fieldset>
        </section>
      )}

      {etape === 1 && (
        <section className="flex flex-col gap-4" aria-labelledby="titre-etape">
          <div>
            <h1 id="titre-etape">Comment vous appelez-vous ?</h1>
            <p className="mt-2 text-doux">Facultatif. Votre prénom reste sur cet ordinateur.</p>
          </div>
          <Champ libelle="Prénom">{(p) => <input {...p} className="champ max-w-sm" value={prenom} maxLength={80} autoComplete="given-name" onChange={(e) => setPrenom(e.target.value)} />}</Champ>
        </section>
      )}

      {etape === 2 && (
        <section className="flex flex-col gap-4" aria-labelledby="titre-etape">
          <div>
            <h1 id="titre-etape">Quel est votre métier ?</h1>
            <p className="mt-2 text-doux">Nous vous proposerons les skills les plus utiles pour ce métier.</p>
          </div>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only-sm">Métier</legend>
            {ref.natures.map((n) => (
              <CaseCarte key={n.id} type="radio" name="metier" checked={metier === n.id} onChange={() => setMetier(n.id)} titre={n.name} description={n.description} icone={n.icon} />
            ))}
          </fieldset>
        </section>
      )}

      {etape === 3 && (
        <section className="flex flex-col gap-4" aria-labelledby="titre-etape">
          <div>
            <h1 id="titre-etape">Quelle est votre aisance avec les assistants IA ?</h1>
            <p className="mt-2 text-doux">Cela règle le nombre de propositions. Vous pourrez le changer plus tard.</p>
          </div>
          <fieldset className="grid gap-3">
            <legend className="sr-only-sm">Aisance</legend>
            {ref.niveaux.map((n) => (
              <CaseCarte key={n.id} type="radio" name="aisance" checked={aisance === n.id} onChange={() => setAisance(n.id)} titre={n.libelle} description={n.description} />
            ))}
          </fieldset>
        </section>
      )}

      {etape === 4 && (
        <section className="flex flex-col gap-4" aria-labelledby="titre-etape">
          <div>
            <h1 id="titre-etape">Qu’aimeriez-vous faire ?</h1>
            <p className="mt-2 text-doux">Cochez ce qui vous intéresse, ou passez cette étape.</p>
          </div>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only-sm">Objectifs</legend>
            {ref.objectifs.map((o) => (
              <CaseCarte key={o.id} type="checkbox" checked={objectifs.includes(o.id)} onChange={(c) => setObjectifs(bascule(objectifs, o.id, c))} titre={o.libelle} />
            ))}
          </fieldset>
          <Champ libelle="Autre objectif (facultatif)" aide="Quelques mots suffisent, par exemple « préparer des sous-titres ».">
            {(p) => <input {...p} className="champ" value={libre} maxLength={300} onChange={(e) => setLibre(e.target.value)} />}
          </Champ>
        </section>
      )}

      {etape === 5 && (
        <section className="flex flex-col gap-4" aria-labelledby="titre-etape">
          <div>
            <h1 id="titre-etape">Voici ce que nous vous proposons</h1>
            <p className="mt-2 text-doux">
              Ces skills sont <strong>sélectionnés</strong>, pas encore installés. Décochez ce qui ne vous convient pas ; vous choisirez le dossier d’installation juste après.
            </p>
          </div>
          {propositions === null && !erreur && <Chargement texte="Préparation de votre sélection…" />}
          {propositions?.length === 0 && <Alerte ton="attention">Aucune proposition pour ces réponses. Revenez en arrière pour en changer, ou continuez : vous pourrez ajouter des skills depuis la bibliothèque.</Alerte>}
          {propositions && propositions.length > 0 && (
            <>
              <ul className="flex flex-col gap-2.5">
                {propositions.map((p) => (
                  <li key={p.skill.slug}>
                    <CaseCarte
                      type="checkbox"
                      checked={retenus.includes(p.skill.slug)}
                      onChange={(c) => setRetenus(bascule(retenus, p.skill.slug, c))}
                      titre={
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <Donnee>{p.skill.name}</Donnee>
                          <Analyse statut={p.skill.analyse} />
                        </span>
                      }
                      description={
                        <>
                          <Donnee>{p.skill.description}</Donnee>
                          {p.raisons[0] && <span className="mt-1 block text-xs">{p.raisons[0]}</span>}
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
              <p aria-live="polite" className="font-semibold">
                {retenus.length} {retenus.length > 1 ? 'skills sélectionnés' : 'skill sélectionné'}
              </p>
            </>
          )}
        </section>
      )}

      {erreur && (
        <Alerte ton="erreur" annonce>
          {erreur}
        </Alerte>
      )}

      <footer className="flex items-center justify-between gap-3">
        <Btn
          ton="discret"
          onClick={() => {
            setErreur(null)
            setEtape(Math.max(0, etape - 1))
          }}
          disabled={etape === 0}
        >
          Retour
        </Btn>
        {etape < total - 1 ? (
          <Btn ton="primaire" onClick={suivant}>
            Continuer
          </Btn>
        ) : (
          <Btn ton="primaire" onClick={terminer} occupe={occupe} disabled={propositions === null}>
            Créer « Mon premier projet »
          </Btn>
        )}
      </footer>
    </div>
  )
}
