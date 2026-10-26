import { useEffect, useState } from 'react'
import type { Sortie } from '@shared/contrat'
import type { AssistantId } from '@shared/schemas/catalog'
import { appeler, messageErreur } from '../api'
import { useApp } from '../appContexte'
import { aller, lien } from '../routes'
import { Alerte, Analyse, Btn, CaseCarte, Champ, Chargement, Donnee, Pastille, formaterOctets, pluriel, useNotifs } from '../ui'

const ETAPES = ['Nom du projet', 'Besoins', 'Assistants et dossier', 'Proposition'] as const
type Proposition = Sortie<'projets.proposition'>

const bascule = <T,>(liste: T[], valeur: T, coche: boolean): T[] => (coche ? [...liste.filter((v) => v !== valeur), valeur] : liste.filter((v) => v !== valeur))

export function CreerProjet() {
  const { ref, profil } = useApp()
  const { annoncer } = useNotifs()
  const [etape, setEtape] = useState(0)
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')
  const [besoins, setBesoins] = useState<string[]>([])
  const [autre, setAutre] = useState('')
  const [assistants, setAssistants] = useState<AssistantId[]>(profil?.assistants ?? [])
  const [dossiers, setDossiers] = useState<Partial<Record<AssistantId, string>>>({})
  const [proposition, setProposition] = useState<Proposition | null>(null)
  const [retenus, setRetenus] = useState<string[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  const total = ETAPES.length
  const brouillon = { besoins, autreBesoin: autre.trim() || undefined, assistants, metier: profil?.metier, aisance: profil?.aisance }

  useEffect(() => {
    annoncer(`Étape ${etape + 1} sur ${total} : ${ETAPES[etape]}`)
  }, [etape, total, annoncer])

  useEffect(() => {
    if (etape !== total - 1) return
    setProposition(null)
    appeler('projets.proposition', brouillon).then(
      (p) => {
        setProposition(p)
        setRetenus(p.conseil.items.map((i) => i.skill.slug))
      },
      (e: unknown) => setErreur(messageErreur(e))
    )
    // La proposition se refait seulement en arrivant sur l'étape
  }, [etape])

  const suivant = () => {
    if (etape === 0 && nom.trim() === '') return setErreur('Donnez un nom à votre projet.')
    if (etape === 1 && besoins.length === 0 && autre.trim() === '') return setErreur('Choisissez au moins un besoin, ou décrivez-le avec « Autre besoin ».')
    if (etape === 2 && assistants.length === 0) return setErreur('Choisissez au moins un assistant.')
    setErreur(null)
    setEtape(etape + 1)
  }

  const choisirDossier = async (assistant: AssistantId) => {
    try {
      const chemin = await appeler('dossier.choisir')
      if (chemin) setDossiers({ ...dossiers, [assistant]: chemin })
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  const enregistrer = async (appliquer: boolean) => {
    setOccupe(true)
    setErreur(null)
    try {
      const gardes = Object.fromEntries(Object.entries(dossiers).filter(([a]) => assistants.includes(a as AssistantId)))
      const { id } = await appeler('projets.creer', { nom, description: description.trim() || undefined, brouillon, slugs: retenus, dossiers: gardes })
      aller(lien.projet(id, appliquer ? 'deploiements' : 'skills', appliquer))
    } catch (e) {
      setErreur(messageErreur(e))
      setOccupe(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <a href={lien.projets} className="text-sm">
          ← Projets
        </a>
        <p className="text-sm font-semibold text-doux">
          Nouveau projet · étape {etape + 1} sur {total}
        </p>
        <div className="flex gap-1.5" aria-hidden="true">
          {ETAPES.map((n, i) => (
            <span key={n} className={`h-1.5 flex-1 rounded-full ${i <= etape ? 'bg-bouton' : 'bg-surface-2'}`} />
          ))}
        </div>
      </header>

      {etape === 0 && (
        <section className="flex flex-col gap-4">
          <h1>Comment s’appelle votre projet ?</h1>
          <Champ libelle="Nom du projet" aide="Par exemple « Visibilité du cabinet ».">
            {(p) => <input {...p} className="champ" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} />}
          </Champ>
          <Champ libelle="Description (facultatif)" aide="Par exemple « Publier chaque semaine et améliorer mon référencement ».">
            {(p) => <textarea {...p} className="champ min-h-24" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />}
          </Champ>
        </section>
      )}

      {etape === 1 && (
        <section className="flex flex-col gap-4">
          <div>
            <h1>Que voulez-vous faire ?</h1>
            <p className="mt-2 text-doux">Choisissez un ou plusieurs besoins. Ils comptent plus que votre métier dans les propositions.</p>
          </div>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only-sm">Besoins</legend>
            {ref.besoins.map((b) => (
              <CaseCarte key={b.id} type="checkbox" checked={besoins.includes(b.id)} onChange={(c) => setBesoins(bascule(besoins, b.id, c))} titre={b.libelle} description={b.description} />
            ))}
          </fieldset>
          <Champ libelle="Autre besoin (facultatif)" aide="Quelques mots pour un besoin qui n’est pas dans la liste.">
            {(p) => <input {...p} className="champ" value={autre} maxLength={300} onChange={(e) => setAutre(e.target.value)} />}
          </Champ>
        </section>
      )}

      {etape === 2 && (
        <section className="flex flex-col gap-4">
          <div>
            <h1>Où installer les skills ?</h1>
            <p className="mt-2 text-doux">Choisissez vos assistants et, si vous le souhaitez, le dossier de chacun. Vous pourrez aussi le choisir plus tard.</p>
          </div>
          <ul className="flex flex-col gap-3">
            {ref.assistants.map((a) => {
              const coche = assistants.includes(a.id)
              return (
                <li key={a.id} className="flex flex-col gap-2">
                  <CaseCarte type="checkbox" checked={coche} onChange={(c) => setAssistants(bascule(assistants, a.id, c))} titre={a.libelle} />
                  {coche && (
                    <div className="ml-9 flex flex-wrap items-center gap-3">
                      <span className="text-sm text-doux">{dossiers[a.id] ? <Donnee>{dossiers[a.id]}</Donnee> : 'Aucun dossier choisi'}</span>
                      <Btn petit onClick={() => choisirDossier(a.id)}>
                        {dossiers[a.id] ? 'Changer de dossier' : 'Choisir un dossier'}
                      </Btn>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {assistants.includes('claude-code') && assistants.includes('opencode') && (
            <Alerte ton="attention">OpenCode lit aussi les skills installés pour Claude Code : choisir les deux dans le même dossier les ferait apparaître en double.</Alerte>
          )}
        </section>
      )}

      {etape === 3 && (
        <section className="flex flex-col gap-5">
          <div>
            <h1>Voici notre proposition</h1>
            <p className="mt-2 text-doux">
              Ces skills sont <strong>sélectionnés</strong>, pas encore installés. Décochez ceux qui ne vous conviennent pas.
            </p>
          </div>
          {proposition === null && !erreur && <Chargement texte="Préparation de la proposition…" />}
          {proposition && (
            <>
              <div className="flex flex-col gap-2">
                <h2>Couverture de vos besoins</h2>
                {proposition.couvertures.length === 0 && <p className="text-doux">Aucun besoin du catalogue n’a été choisi : la proposition suit votre métier.</p>}
                {proposition.couvertures.map((c) => (
                  <Alerte key={c.besoin} ton={c.lacune ? 'attention' : 'ok'}>
                    <p className="font-semibold">
                      {c.libelle} : {pluriel(c.retenus.length, 'skill', 'skills')}
                    </p>
                    {c.lacune && (
                      <p>
                        {c.retenus.length === 0 ? 'Aucun skill du catalogue ne répond vraiment à ce besoin.' : 'Ce besoin est peu couvert par le catalogue.'} La recherche dans des bibliothèques en ligne et la rédaction assistée arriveront dans une prochaine version.
                      </p>
                    )}
                  </Alerte>
                ))}
              </div>

              <div className="flex flex-col gap-2.5">
                <h2>Skills proposés</h2>
                {proposition.conseil.items.length === 0 && <Alerte ton="attention">Aucune proposition pour ces réponses. Vous pourrez ajouter des skills depuis la bibliothèque.</Alerte>}
                <ul className="flex flex-col gap-2.5">
                  {proposition.conseil.items.map((i) => (
                    <li key={i.skill.slug}>
                      <CaseCarte
                        type="checkbox"
                        checked={retenus.includes(i.skill.slug)}
                        onChange={(c) => setRetenus(bascule(retenus, i.skill.slug, c))}
                        titre={
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <Donnee>{i.skill.name}</Donnee>
                            <Analyse statut={i.skill.analyse} />
                            {i.besoins.map((b) => (
                              <Pastille key={b} ton="info">
                                {ref.besoins.find((x) => x.id === b)?.libelle ?? b}
                              </Pastille>
                            ))}
                          </span>
                        }
                        description={
                          <>
                            <Donnee>{i.skill.description}</Donnee>
                            <span className="mt-1 block text-xs">{i.raisons.join(' · ')}</span>
                          </>
                        }
                      />
                    </li>
                  ))}
                </ul>
                <p className="font-semibold" aria-live="polite">
                  {pluriel(retenus.length, 'skill sélectionné', 'skills sélectionnés')}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <h2>Arborescence proposée</h2>
                {proposition.arborescence.dossiers.length === 0 ? (
                  <p className="text-doux">Aucun dossier à créer.</p>
                ) : (
                  <>
                    <ul className="flex flex-wrap gap-1.5">
                      {proposition.arborescence.dossiers.map((d) => (
                        <li key={d}>
                          <Pastille>{d}/</Pastille>
                        </li>
                      ))}
                    </ul>
                    <p className="text-sm text-doux">Espace nécessaire : {formaterOctets(proposition.arborescence.octets)}. Rien n’est créé tant que vous ne l’avez pas demandé.</p>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {erreur && (
        <Alerte ton="erreur" annonce>
          {erreur}
        </Alerte>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <Btn
          ton="discret"
          onClick={() => {
            setErreur(null)
            if (etape === 0) aller(lien.projets)
            else setEtape(etape - 1)
          }}
        >
          {etape === 0 ? 'Annuler' : 'Retour'}
        </Btn>
        {etape < total - 1 ? (
          <Btn ton="primaire" onClick={suivant}>
            Continuer
          </Btn>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => enregistrer(false)} occupe={occupe} disabled={proposition === null}>
              Enregistrer
            </Btn>
            <Btn ton="primaire" onClick={() => enregistrer(true)} occupe={occupe} disabled={proposition === null}>
              Enregistrer et appliquer
            </Btn>
          </div>
        )}
      </footer>
    </div>
  )
}
