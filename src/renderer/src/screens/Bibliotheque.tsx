import { useMemo, useState } from 'react'
import type { BibliothequeSkill } from '@shared/contrat'
import { appeler, messageErreur, useDonnees } from '../api'
import { useApp } from '../appContexte'
import { aller, lien } from '../routes'
import { Alerte, Analyse, Btn, Chargement, Dialogue, Donnee, Pastille, Poids, pluriel, useNotifs } from '../ui'

function Detail({ slug }: { slug: string }) {
  const { donnees } = useDonnees('catalogue.detail', { slug })
  if (!donnees) return <p className="text-sm text-doux">Chargement…</p>
  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-sm text-doux">
        Taille : <Poids tokens={donnees.tokenEstimate} /> (environ {donnees.tokenEstimate} tokens)
      </p>
      <pre className="texte-brut">{donnees.content}</pre>
    </div>
  )
}

function LigneSkill({ skill, onAjouter }: { skill: BibliothequeSkill; onAjouter: (s: BibliothequeSkill) => void }) {
  const [detail, setDetail] = useState(false)
  return (
    <li className="carte flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 text-base">
          <Donnee>{skill.name}</Donnee>
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {skill.installe && <Pastille ton="ok">Installé</Pastille>}
          {skill.selectionneDans.length > 0 && <Pastille ton="info">Sélectionné</Pastille>}
          <Analyse statut={skill.analyse} />
        </div>
      </div>
      <p className="text-doux">
        <Donnee>{skill.description}</Donnee>
      </p>
      <p className="text-sm text-doux">
        <Donnee>{skill.category}</Donnee>
        {skill.selectionneDans.length > 0 && (
          <>
            {' '}
            · dans{' '}
            {skill.selectionneDans.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ', '}
                <a href={lien.projet(p.id)}>
                  <Donnee>{p.nom}</Donnee>
                </a>
              </span>
            ))}
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Btn petit onClick={() => onAjouter(skill)}>
          Ajouter à un projet
        </Btn>
        <Btn petit ton="discret" aria-expanded={detail} onClick={() => setDetail(!detail)}>
          {detail ? 'Masquer le détail' : 'Voir le détail'}
        </Btn>
      </div>
      {detail && <Detail slug={skill.slug} />}
    </li>
  )
}

export function Bibliotheque() {
  const { ref } = useApp()
  const { toast } = useNotifs()
  const { donnees, erreur, chargement } = useDonnees('catalogue.liste')
  const projets = useDonnees('projets.liste', {})
  const [recherche, setRecherche] = useState('')
  const [categorie, setCategorie] = useState('')
  const [ajout, setAjout] = useState<BibliothequeSkill | null>(null)

  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return (donnees ?? []).filter((s) => (categorie === '' || s.category === categorie) && (q === '' || `${s.name} ${s.description} ${s.tags.join(' ')}`.toLowerCase().includes(q)))
  }, [donnees, recherche, categorie])

  const ajouterA = async (projetId: string, nomProjet: string) => {
    if (!ajout) return
    try {
      await appeler('projets.skills', { id: projetId, retenir: [ajout.slug], ecarter: [] })
      const nom = ajout.name
      setAjout(null)
      // Un skill sélectionné mène toujours à un moyen de l'installer
      toast(`« ${nom} » est sélectionné dans « ${nomProjet} ».`, { libelle: 'Installer', onClick: () => aller(lien.projet(projetId, 'deploiements', true)) })
    } catch (e) {
      toast(messageErreur(e))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1>Bibliothèque</h1>
        <p className="mt-1 text-doux">Tous les skills disponibles. « Sélectionné » veut dire retenu dans un projet ; « Installé » veut dire écrit sur votre disque.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="recherche" className="font-semibold">
            Rechercher un skill
          </label>
          <input id="recherche" type="search" className="champ" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="categorie" className="font-semibold">
            Catégorie
          </label>
          <select id="categorie" className="champ" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            <option value="">Toutes</option>
            {ref.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      {erreur && (
        <Alerte ton="erreur" annonce>
          {erreur}
        </Alerte>
      )}
      {chargement && !donnees && <Chargement />}
      {donnees && (
        <p aria-live="polite" className="text-sm text-doux">
          {pluriel(resultats.length, 'skill', 'skills')}
        </p>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {resultats.map((s) => (
          <LigneSkill key={s.slug} skill={s} onAjouter={setAjout} />
        ))}
      </ul>

      <Dialogue ouvert={ajout !== null} titre="Ajouter à un projet" onFermer={() => setAjout(null)} pied={<Btn onClick={() => setAjout(null)}>Annuler</Btn>}>
        {ajout && (
          <div className="flex flex-col gap-3">
            <p>
              Dans quel projet voulez-vous sélectionner « <Donnee>{ajout.name}</Donnee> » ?
            </p>
            {projets.donnees && projets.donnees.length === 0 && (
              <Alerte ton="attention">
                Vous n’avez pas encore de projet. <a href={lien.nouveau}>Créer un projet</a>
              </Alerte>
            )}
            <ul className="flex flex-col gap-2">
              {projets.donnees?.map((c) => {
                const deja = c.projet.skills.some((s) => s.slug === ajout.slug && !s.ecarte)
                return (
                  <li key={c.projet.id}>
                    <Btn className="w-full justify-between" onClick={() => ajouterA(c.projet.id, c.projet.nom)} disabled={deja}>
                      <Donnee>{c.projet.nom}</Donnee>
                      {deja && <span className="text-sm font-normal">déjà sélectionné</span>}
                    </Btn>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </Dialogue>
    </div>
  )
}
