// Recherche et import de skills depuis des dépôts GitHub. Tout skill est analysé avant d'être proposé à l'import.
import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ApercuImportVue, Sortie } from '@shared/contrat'
import { appeler, messageErreur, useDonnees } from '../api'
import { Alerte, Btn, Chargement, Dialogue, Donnee, Pastille, pluriel, useNotifs } from '../ui'
import { ProblemesAnalyse } from './Analyse'

type Recherche = Sortie<'sources.rechercher'>
interface Reference {
  repo: string
  path: string
}

export function EnLigne({ requeteInitiale = '', onImporte }: { requeteInitiale?: string; onImporte: (slug: string) => void }) {
  const sources = useDonnees('sources.liste')
  const { toast } = useNotifs()
  const [choisies, setChoisies] = useState<string[] | null>(null)
  const [requete, setRequete] = useState(requeteInitiale)
  const [resultats, setResultats] = useState<Recherche | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [nouveau, setNouveau] = useState('')
  const [ouvert, setOuvert] = useState<Reference | null>(null)

  const tous = sources.donnees ? [...sources.donnees.defaut.map((d) => d.repo), ...sources.donnees.perso] : []
  // Par défaut, toutes les sources sont cochées
  const actives = choisies ?? tous

  const chercher = async (texte = requete) => {
    if (actives.length === 0) return setErreur('Cochez au moins une source.')
    setOccupe(true)
    setErreur(null)
    try {
      setResultats(await appeler('sources.rechercher', { requete: texte, repos: actives }))
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  // Une requête venue d'ailleurs (lacune d'un projet) lance la recherche tout de suite
  useEffect(() => {
    if (requeteInitiale && sources.donnees) void chercher(requeteInitiale)
    // La recherche part une seule fois, quand les sources sont connues
  }, [Boolean(sources.donnees)])

  const ajouter = async () => {
    const texte = nouveau.trim()
    if (!texte) return
    setErreur(null)
    try {
      // Une adresse de fichier GitHub s'ouvre directement ; un nom de dépôt s'ajoute à la liste
      const directe = await appeler('sources.adresse', { adresse: texte })
      if (directe) {
        setOuvert(directe)
        setNouveau('')
        return
      }
      await appeler('sources.ajouter', { repo: texte })
      setNouveau('')
      setChoisies(null)
      sources.recharger()
      toast('Dépôt ajouté.')
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  const retirer = async (repo: string) => {
    try {
      await appeler('sources.retirer', { repo })
      setChoisies(null)
      sources.recharger()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-doux">Cherchez des skills publiés par d’autres sur GitHub. Chacun est analysé avant d’être proposé, et vous voyez sa licence avant de l’importer.</p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Où chercher</legend>
        {sources.donnees && (
          <ul className="flex flex-col gap-1.5">
            {[...sources.donnees.defaut.map((d) => ({ repo: d.repo, libelle: d.libelle, perso: false })), ...sources.donnees.perso.map((r) => ({ repo: r, libelle: r, perso: true }))].map((s) => (
              <li key={s.repo} className="flex items-center gap-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-4" checked={actives.includes(s.repo)} onChange={(e) => setChoisies(e.target.checked ? [...actives, s.repo] : actives.filter((r) => r !== s.repo))} />
                  <Donnee>{s.libelle}</Donnee>
                </label>
                {s.perso && (
                  <button type="button" aria-label={`Retirer ${s.repo} de la liste`} className="rounded-full p-1 text-doux hover:text-texte" onClick={() => retirer(s.repo)}>
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex max-w-xl flex-col gap-1.5">
          <label htmlFor="ajout-source" className="text-sm font-semibold">
            Ajouter un dépôt ou un fichier
          </label>
          <div className="flex gap-2">
            <input
              id="ajout-source"
              className="champ"
              value={nouveau}
              placeholder="propriétaire/nom ou adresse GitHub"
              onChange={(e) => setNouveau(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void ajouter()
                }
              }}
            />
            <Btn onClick={ajouter} disabled={nouveau.trim() === ''}>
              Ajouter
            </Btn>
          </div>
        </div>
      </fieldset>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void chercher()
        }}
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="recherche-en-ligne" className="font-semibold">
            Rechercher en ligne
          </label>
          <input id="recherche-en-ligne" type="search" className="champ" value={requete} onChange={(e) => setRequete(e.target.value)} placeholder="Par exemple : newsletter" />
        </div>
        <Btn type="submit" ton="primaire" occupe={occupe}>
          <Search size={16} aria-hidden="true" />
          Chercher
        </Btn>
      </form>

      {erreur && (
        <Alerte ton="erreur" annonce>
          {erreur}
        </Alerte>
      )}
      {occupe && <Chargement texte="Recherche en cours…" />}
      {resultats && !occupe && (
        <section aria-live="polite" className="flex flex-col gap-3">
          <p className="text-sm text-doux">{pluriel(resultats.total, 'skill trouvé', 'skills trouvés')}{resultats.total > resultats.resultats.length ? ` (les ${resultats.resultats.length} premiers sont affichés)` : ''}.</p>
          {resultats.erreurs.map((e) => (
            <Alerte key={e.repo} ton="attention">
              <Donnee>{e.repo}</Donnee> : {e.message}
            </Alerte>
          ))}
          <ul className="grid gap-3 md:grid-cols-2">
            {resultats.resultats.map((r) => (
              <li key={`${r.repo}/${r.path}`} className="carte flex flex-col gap-2">
                <h2 className="text-base">
                  <Donnee>{r.name}</Donnee>
                </h2>
                <p className="text-doux">
                  <Donnee>{r.description}</Donnee>
                </p>
                <p className="text-sm text-doux">
                  <Donnee>{r.repo}</Donnee>
                </p>
                <div>
                  <Btn petit onClick={() => setOuvert({ repo: r.repo, path: r.path })}>
                    Voir et importer
                  </Btn>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ouvert && <DialogueImport key={`${ouvert.repo}/${ouvert.path}`} reference={ouvert} onFermer={() => setOuvert(null)} onImporte={onImporte} />}
    </div>
  )
}

function DialogueImport({ reference, onFermer, onImporte }: { reference: Reference; onFermer: () => void; onImporte: (slug: string) => void }) {
  const [apercu, setApercu] = useState<ApercuImportVue | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [confirme, setConfirme] = useState(false)
  const [occupe, setOccupe] = useState(false)

  useEffect(() => {
    let courant = true
    appeler('sources.apercu', reference).then(
      (a) => courant && setApercu(a),
      (e: unknown) => courant && setErreur(messageErreur(e))
    )
    return () => {
      courant = false
    }
  }, [reference])

  const importer = async (remplacer: boolean) => {
    setOccupe(true)
    setErreur(null)
    try {
      const { slug } = await appeler('sources.importer', { ...reference, confirme, remplacer })
      onImporte(slug)
      onFermer()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  const verdict = apercu?.analyse.analyse
  const dejaIdentique = apercu?.dejaImporte?.identique
  const miseAJour = Boolean(apercu?.dejaImporte && !apercu.dejaImporte.identique)
  return (
    <Dialogue
      ouvert
      titre="Importer un skill"
      onFermer={onFermer}
      pied={
        <>
          <Btn onClick={onFermer}>Fermer</Btn>
          {apercu && !dejaIdentique && (
            <Btn ton="primaire" onClick={() => importer(miseAJour)} occupe={occupe} disabled={verdict === 'danger' || (verdict === 'warning' && !confirme)}>
              {miseAJour ? 'Mettre à jour' : 'Importer'}
            </Btn>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {erreur && (
          <Alerte ton="erreur" annonce>
            {erreur}
          </Alerte>
        )}
        {!apercu && !erreur && <Chargement texte="Lecture et analyse du skill…" />}
        {apercu && (
          <>
            <div>
              <p className="text-lg font-semibold">
                <Donnee>{apercu.name}</Donnee>
              </p>
              <p className="text-doux">
                <Donnee>{apercu.description}</Donnee>
              </p>
            </div>
            <p className="text-sm">
              Dépôt : <Donnee>{reference.repo}</Donnee> ·{' '}
              <a href={apercu.url} target="_blank" rel="noopener noreferrer">
                Voir sur GitHub
              </a>
            </p>
            {apercu.licence ? (
              <p className="text-sm">
                Licence déclarée : <strong>{apercu.licence}</strong>.
              </p>
            ) : (
              <Alerte ton="attention">Ce dépôt ne déclare aucune licence. Vérifiez que son auteur vous autorise à utiliser ce skill avant de l’importer.</Alerte>
            )}
            <p className="flex items-center gap-2 font-semibold">
              Analyse de sécurité : {verdict === 'clean' ? <Pastille ton="ok">Vérifié</Pastille> : verdict === 'warning' ? <Pastille ton="attention">À examiner</Pastille> : <Pastille ton="erreur">Refusé</Pastille>}
            </p>
            <ProblemesAnalyse analyse={apercu.analyse} />
            {verdict === 'warning' && (
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} />
                J’ai lu ces points et je veux importer ce skill.
              </label>
            )}
            {verdict === 'danger' && <Alerte ton="erreur">Ce skill contient un contenu dangereux : il ne peut pas être importé.</Alerte>}
            {dejaIdentique && <Alerte ton="ok">Ce skill est déjà importé et à jour.</Alerte>}
            {miseAJour && <Alerte ton="attention">Vous avez déjà importé ce skill, mais le dépôt en propose une version différente. « Mettre à jour » remplace votre copie ; les projets qui l’utilisent la gardent.</Alerte>}
            <details>
              <summary>Voir le texte du skill</summary>
              <pre className="texte-brut mt-1">{apercu.extrait}</pre>
            </details>
          </>
        )}
      </div>
    </Dialogue>
  )
}

