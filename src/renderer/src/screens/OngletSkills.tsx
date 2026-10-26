import { Lightbulb, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ChangementsVue, FicheProjet, SkillProjetVue } from '@shared/contrat'
import { appeler, messageErreur, useDonnees } from '../api'
import { useApp } from '../appContexte'
import { Alerte, Analyse, Btn, CaseCarte, Chargement, Dialogue, Donnee, Pastille, Poids, pluriel, useNotifs } from '../ui'

function pourquoi(skill: SkillProjetVue, libelleBesoin: (id: string) => string): string {
  if (skill.introuvable) return 'Ce skill n’est plus dans le catalogue.'
  if (skill.origine === 'manuel') return 'Ajouté par vous.'
  if (skill.origine === 'importe') return 'Venu d’un projet importé.'
  if (skill.origine === 'ia') return 'Rédigé avec une IA.'
  return skill.pour.length > 0 ? `Répond à : ${skill.pour.map(libelleBesoin).join(', ')}.` : 'Proposé pour votre métier.'
}

export function OngletSkills({ fiche, onChange, onSuggestions }: { fiche: FicheProjet; onChange: () => void; onSuggestions: () => void }) {
  const { ref } = useApp()
  const { toast } = useNotifs()
  const [ajouter, setAjouter] = useState(false)
  // La case change tout de suite ; la relecture du projet confirme ensuite
  const [optimiste, setOptimiste] = useState<Record<string, boolean>>({})
  // Une relecture qui n'a pas encore rattrapé le changement ne doit pas le défaire : on n'efface que ce que le projet confirme
  useEffect(() => {
    setOptimiste((o) => {
      const reste = Object.entries(o).filter(([slug, retenu]) => fiche.skills.find((k) => k.slug === slug)?.ecarte === retenu)
      return reste.length === Object.keys(o).length ? o : Object.fromEntries(reste)
    })
  }, [fiche])
  const libelleBesoin = (id: string) => ref.besoins.find((b) => b.id === id)?.libelle ?? id
  const id = fiche.projet.id

  const basculer = async (slug: string, retenu: boolean) => {
    setOptimiste((o) => ({ ...o, [slug]: retenu }))
    try {
      await appeler('projets.skills', { id, retenir: retenu ? [slug] : [], ecarter: retenu ? [] : [slug] })
      onChange()
    } catch (e) {
      setOptimiste((o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== slug)))
      toast(messageErreur(e))
    }
  }

  const retenus = fiche.skills.filter((s) => !(optimiste[s.slug] === undefined ? s.ecarte : !optimiste[s.slug]))

  return (
    <div className="flex flex-col gap-6">
      {fiche.couvertures.length > 0 && (
        <section aria-labelledby="titre-couverture" className="flex flex-col gap-2">
          <h2 id="titre-couverture">Couverture des besoins</h2>
          <ul className="grid gap-2 md:grid-cols-2">
            {fiche.couvertures.map((c) => (
              <li key={c.besoin}>
                <Alerte ton={c.lacune ? 'attention' : 'ok'}>
                  <p className="font-semibold">
                    {c.libelle} : {pluriel(c.retenus.length, 'skill', 'skills')}
                  </p>
                  {c.lacune && (
                    <p className="text-sm">
                      {c.disponibles.length > 0
                        ? `${pluriel(c.disponibles.length, 'autre skill du catalogue y répond', 'autres skills du catalogue y répondent')} : ajoutez-les ci-dessous.`
                        : 'Aucun autre skill du catalogue n’y répond. La recherche en ligne et la rédaction assistée arriveront dans une prochaine version.'}
                    </p>
                  )}
                </Alerte>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="titre-skills" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="titre-skills">{pluriel(retenus.length, 'skill sélectionné', 'skills sélectionnés')}</h2>
          <div className="flex flex-wrap gap-2">
            <Btn petit onClick={() => setAjouter(true)}>
              <Plus size={15} aria-hidden="true" />
              Ajouter un skill
            </Btn>
            <Btn petit onClick={onSuggestions}>
              <Lightbulb size={15} aria-hidden="true" />
              Voir les suggestions
            </Btn>
          </div>
        </div>
        <p className="text-sm text-doux">Un skill sélectionné fait partie du projet ; il n’est écrit sur votre disque que dans l’onglet « Déploiements ».</p>
        {fiche.skills.length === 0 && <Alerte ton="attention">Ce projet n’a encore aucun skill. Ajoutez-en ou consultez les suggestions.</Alerte>}
        <ul className="flex flex-col gap-2.5">
          {fiche.skills.map((s) => (
            <li key={s.slug}>
              <CaseCarte
                type="checkbox"
                checked={optimiste[s.slug] ?? !s.ecarte}
                onChange={(c) => basculer(s.slug, c)}
                titre={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <Donnee>{s.name}</Donnee>
                    <Analyse statut={s.analyse} />
                    {s.ecarte && <Pastille>Écarté</Pastille>}
                  </span>
                }
                description={
                  <>
                    <Donnee>{s.description}</Donnee>
                    <span className="mt-1 block text-xs">{pourquoi(s, libelleBesoin)}</span>
                  </>
                }
              />
              <details className="px-3 pt-1">
                <summary>Voir le détail</summary>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-doux">Catégorie</dt>
                  <dd>
                    <Donnee>{s.category}</Donnee>
                  </dd>
                  <dt className="text-doux">Taille</dt>
                  <dd>
                    <Poids tokens={s.tokenEstimate} /> (environ {s.tokenEstimate} tokens)
                  </dd>
                  <dt className="text-doux">Source</dt>
                  <dd>{s.source === 'integre' ? 'Catalogue de l’application' : s.source === 'importe' ? 'Importé' : 'Rédigé avec une IA'}</dd>
                </dl>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <DialogueAjouter fiche={fiche} ouvert={ajouter} onFermer={() => setAjouter(false)} onChange={onChange} />
    </div>
  )
}

function DialogueAjouter({ fiche, ouvert, onFermer, onChange }: { fiche: FicheProjet; ouvert: boolean; onFermer: () => void; onChange: () => void }) {
  const { donnees, chargement } = useDonnees('catalogue.liste', undefined, ouvert)
  const [recherche, setRecherche] = useState('')
  const { toast } = useNotifs()
  const presents = new Set(fiche.skills.filter((s) => !s.ecarte).map((s) => s.slug))
  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return (donnees ?? []).filter((s) => !presents.has(s.slug) && (q === '' || `${s.name} ${s.description} ${s.category} ${s.tags.join(' ')}`.toLowerCase().includes(q))).slice(0, 40)
  }, [donnees, recherche, fiche.skills])

  const ajouter = async (slug: string, nom: string) => {
    try {
      await appeler('projets.skills', { id: fiche.projet.id, retenir: [slug], ecarter: [] })
      toast(`« ${nom} » est sélectionné.`)
      onChange()
    } catch (e) {
      toast(messageErreur(e))
    }
  }

  return (
    <Dialogue ouvert={ouvert} titre="Ajouter un skill" onFermer={onFermer} pied={<Btn onClick={onFermer}>Terminé</Btn>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="recherche-ajout" className="font-semibold">
            Rechercher un skill
          </label>
          <input id="recherche-ajout" className="champ" type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </div>
        {chargement && !donnees && <Chargement />}
        <p aria-live="polite" className="text-sm text-doux">
          {pluriel(resultats.length, 'skill disponible', 'skills disponibles')}
        </p>
        <ul className="flex flex-col gap-2">
          {resultats.map((s) => (
            <li key={s.slug} className="carte flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  <Donnee>{s.name}</Donnee>
                </p>
                <p className="text-sm text-doux">
                  <Donnee>{s.description}</Donnee>
                </p>
              </div>
              <Btn petit onClick={() => ajouter(s.slug, s.name)}>
                Ajouter
              </Btn>
            </li>
          ))}
        </ul>
      </div>
    </Dialogue>
  )
}

export function DialogueSuggestions({ projetId, ouvert, onFermer, onChange }: { projetId: string; ouvert: boolean; onFermer: () => void; onChange: () => void }) {
  const { donnees, erreur, chargement } = useDonnees('projets.propositionChangements', { id: projetId }, ouvert)
  return (
    <Dialogue ouvert={ouvert} titre="Suggestions pour ce projet" onFermer={onFermer} pied={null}>
      {chargement && !donnees && <Chargement />}
      {erreur && (
        <Alerte ton="erreur" annonce>
          {erreur}
        </Alerte>
      )}
      {donnees && <ContenuSuggestions projetId={projetId} changements={donnees} onFermer={onFermer} onChange={onChange} />}
    </Dialogue>
  )
}

function ContenuSuggestions({ projetId, changements, onFermer, onChange }: { projetId: string; changements: ChangementsVue; onFermer: () => void; onChange: () => void }) {
  const { ref } = useApp()
  const { toast } = useNotifs()
  const [ajouts, setAjouts] = useState<string[]>(changements.ajouts.map((a) => a.skill.slug))
  const [retraits, setRetraits] = useState<string[]>([])
  const [occupe, setOccupe] = useState(false)
  const rien = changements.ajouts.length === 0 && changements.retraits.length === 0

  const appliquer = async () => {
    setOccupe(true)
    try {
      await appeler('projets.accepterChangements', { id: projetId, ajouter: ajouts, retirer: retraits })
      toast('Suggestions appliquées.')
      onChange()
      onFermer()
    } catch (e) {
      toast(messageErreur(e))
      setOccupe(false)
    }
  }
  const bascule = (liste: string[], set: (l: string[]) => void, slug: string, coche: boolean) => set(coche ? [...liste, slug] : liste.filter((s) => s !== slug))

  return (
    <div className="flex flex-col gap-4">
      {rien && <Alerte ton="ok">Rien à ajouter ni à retirer : le projet répond à ses besoins avec les skills actuels.</Alerte>}
      {changements.ajouts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">À ajouter</h3>
          <ul className="flex flex-col gap-2">
            {changements.ajouts.map((a) => (
              <li key={a.skill.slug}>
                <CaseCarte
                  type="checkbox"
                  checked={ajouts.includes(a.skill.slug)}
                  onChange={(c) => bascule(ajouts, setAjouts, a.skill.slug, c)}
                  titre={<Donnee>{a.skill.name}</Donnee>}
                  description={
                    <>
                      <Donnee>{a.skill.description}</Donnee>
                      <span className="mt-1 block text-xs">{a.besoins.length > 0 ? `Répond à : ${a.besoins.map((b) => ref.besoins.find((x) => x.id === b)?.libelle ?? b).join(', ')}.` : a.raisons[0]}</span>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {changements.retraits.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">À retirer</h3>
          <ul className="flex flex-col gap-2">
            {changements.retraits.map((r) => (
              <li key={r.slug}>
                <CaseCarte type="checkbox" checked={retraits.includes(r.slug)} onChange={(c) => bascule(retraits, setRetraits, r.slug, c)} titre={<Donnee>{r.name}</Donnee>} description={r.raison} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm text-doux">Rien n’est appliqué sans votre accord. Retirer un skill du projet ne supprime aucun fichier de votre disque.</p>
      <div className="-mx-6 flex justify-end gap-2 border-t border-separateur px-6 pt-4">
        <Btn onClick={onFermer}>{rien ? 'Fermer' : 'Plus tard'}</Btn>
        {!rien && (
          <Btn ton="primaire" onClick={appliquer} occupe={occupe} disabled={ajouts.length === 0 && retraits.length === 0}>
            Appliquer la sélection
          </Btn>
        )}
      </div>
    </div>
  )
}
