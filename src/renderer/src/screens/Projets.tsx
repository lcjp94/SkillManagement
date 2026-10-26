import { Archive, Copy, FolderOpen, Plus, Upload } from 'lucide-react'
import { useState } from 'react'
import type { AnalyseImportVue, ProjetCarte } from '@shared/contrat'
import { appeler, messageErreur, useDonnees } from '../api'
import { aller, lien } from '../routes'
import { Alerte, Btn, CaseCarte, Chargement, Dialogue, Donnee, Pastille, dateJour, pluriel, useNotifs } from '../ui'

function EtatPastille({ carte }: { carte: ProjetCarte }) {
  const { etat } = carte
  if (etat.type === 'jamais') return <Pastille>Jamais appliqué</Pastille>
  if (etat.type === 'a-jour') return <Pastille ton="ok">À jour</Pastille>
  return <Pastille ton="attention">{etat.nombre} à installer</Pastille>
}

function CarteProjet({ carte, onChange }: { carte: ProjetCarte; onChange: () => void }) {
  const { toast } = useNotifs()
  const { projet } = carte
  const agir = async (fn: () => Promise<unknown>, message: string) => {
    try {
      await fn()
      toast(message)
      onChange()
    } catch (e) {
      toast(messageErreur(e))
    }
  }
  return (
    <li className="carte flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-lg">
          <a href={lien.projet(projet.id)} className="text-texte no-underline hover:underline">
            <Donnee>{projet.nom}</Donnee>
          </a>
        </h2>
        <EtatPastille carte={carte} />
      </div>
      {projet.description && (
        <p className="text-doux">
          <Donnee>{projet.description}</Donnee>
        </p>
      )}
      {carte.besoinsLibelles.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Besoins du projet">
          {carte.besoinsLibelles.map((b) => (
            <li key={b}>
              <Pastille ton="info">{b}</Pastille>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-doux">
        {pluriel(carte.selectionnes, 'skill sélectionné', 'skills sélectionnés')}
        {carte.installes > 0 && ` · ${pluriel(carte.installes, 'installé', 'installés')}`} · modifié le {dateJour(projet.modifieLe)}
      </p>
      <div className="mt-auto flex flex-wrap gap-2">
        <Btn petit onClick={() => aller(lien.projet(projet.id))}>
          <FolderOpen size={16} aria-hidden="true" />
          Ouvrir
        </Btn>
        <Btn petit onClick={() => agir(() => appeler('projets.dupliquer', { id: projet.id }), 'Projet dupliqué.')}>
          <Copy size={16} aria-hidden="true" />
          Dupliquer
        </Btn>
        <Btn petit onClick={() => agir(() => appeler('projets.archiver', { id: projet.id, archiver: !projet.archiveLe }), projet.archiveLe ? 'Projet restauré.' : 'Projet archivé.')}>
          <Archive size={16} aria-hidden="true" />
          {projet.archiveLe ? 'Restaurer' : 'Archiver'}
        </Btn>
      </div>
    </li>
  )
}

function ImporterDialogue({ analyse, onFermer }: { analyse: AnalyseImportVue | null; onFermer: () => void }) {
  const [confirmes, setConfirmes] = useState<string[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const { toast } = useNotifs()
  const ok = analyse?.ok ? analyse : null

  const importer = async () => {
    if (!ok) return
    setOccupe(true)
    try {
      const r = await appeler('projets.importer.confirmer', { jeton: ok.jeton, confirmes })
      toast(r.laisses.length > 0 ? `Projet importé. ${pluriel(r.laisses.length, 'skill laissé de côté', 'skills laissés de côté')}.` : 'Projet importé.')
      aller(lien.projet(r.id))
    } catch (e) {
      setErreur(messageErreur(e))
      setOccupe(false)
    }
  }

  return (
    <Dialogue
      ouvert={analyse !== null}
      titre="Importer un projet"
      onFermer={onFermer}
      pied={
        <>
          <Btn onClick={onFermer}>Annuler</Btn>
          {ok && (
            <Btn ton="primaire" onClick={importer} occupe={occupe}>
              Importer le projet
            </Btn>
          )}
        </>
      }
    >
      {analyse && !analyse.ok && (
        <Alerte ton="erreur" annonce>
          {analyse.erreur}
        </Alerte>
      )}
      {ok && (
        <div className="flex flex-col gap-4">
          <p>
            Ce fichier contient le projet <strong><Donnee>{ok.nom}</Donnee></strong> ({pluriel(ok.nbSkills, 'skill', 'skills')}). Chaque skill que le fichier apporte a été analysé avant d’entrer dans l’application.
          </p>
          {ok.refuses.length > 0 && (
            <Alerte ton="erreur">
              <p className="font-semibold">Ne seront pas importés :</p>
              <ul className="list-disc pl-5">
                {ok.refuses.map((r) => (
                  <li key={r.slug}>
                    <Donnee>{r.slug}</Donnee> — {r.raison}
                  </li>
                ))}
              </ul>
            </Alerte>
          )}
          {ok.aConfirmer.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-semibold">Ces skills demandent votre accord :</p>
              {ok.aConfirmer.map((a) => (
                <div key={a.slug} className="flex flex-col gap-1">
                  <CaseCarte
                    type="checkbox"
                    checked={confirmes.includes(a.slug)}
                    onChange={(c) => setConfirmes(c ? [...confirmes, a.slug] : confirmes.filter((x) => x !== a.slug))}
                    titre={<Donnee>{a.name}</Donnee>}
                    description="Je l’ai examiné et je veux l’importer."
                  />
                  <details className="px-2">
                    <summary>Voir le détail</summary>
                    <ul className="mt-1 list-disc pl-5 text-sm">
                      {a.problemes.map((p, i) => (
                        <li key={i}>{p.message}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              ))}
            </div>
          )}
          {ok.inconnus.length > 0 && <Alerte ton="attention">{pluriel(ok.inconnus.length, 'skill du fichier est introuvable', 'skills du fichier sont introuvables')} dans le catalogue : ils seront laissés de côté.</Alerte>}
          {ok.besoinsInconnus.length > 0 && <Alerte ton="attention">Certains besoins du fichier n’existent pas dans cette version : ils seront ignorés.</Alerte>}
        </div>
      )}
      {erreur && (
        <div className="mt-3">
          <Alerte ton="erreur" annonce>
            {erreur}
          </Alerte>
        </div>
      )}
    </Dialogue>
  )
}

export function Projets() {
  const [archives, setArchives] = useState(false)
  const { donnees, erreur, chargement, recharger } = useDonnees('projets.liste', { archives })
  const [analyse, setAnalyse] = useState<AnalyseImportVue | null>(null)
  const { toast } = useNotifs()

  const choisirFichier = async () => {
    try {
      const r = await appeler('projets.importer.choisir')
      if (r) setAnalyse(r)
    } catch (e) {
      toast(messageErreur(e))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>{archives ? 'Projets archivés' : 'Projets'}</h1>
          <p className="mt-1 text-doux">Chaque projet décrit un besoin et les skills qui y répondent.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={choisirFichier}>
            <Upload size={16} aria-hidden="true" />
            Importer un projet
          </Btn>
          <a href={lien.nouveau} className="btn btn-primaire">
            <Plus size={16} aria-hidden="true" />
            Nouveau projet
          </a>
        </div>
      </header>

      {erreur && (
        <Alerte ton="erreur" annonce>
          {erreur}
        </Alerte>
      )}
      {chargement && !donnees && <Chargement />}
      {donnees && donnees.length === 0 && (
        <div className="carte text-center">
          <p className="text-lg font-semibold">{archives ? 'Aucun projet archivé.' : 'Aucun projet pour l’instant.'}</p>
          {!archives && <p className="mt-1 text-doux">Créez un projet en décrivant ce que vous voulez faire : nous vous proposons les skills adaptés.</p>}
        </div>
      )}
      {donnees && donnees.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {donnees.map((c) => (
            <CarteProjet key={c.projet.id} carte={c} onChange={recharger} />
          ))}
        </ul>
      )}
      <div>
        <Btn ton="discret" onClick={() => setArchives(!archives)}>
          {archives ? 'Revenir aux projets' : 'Voir les projets archivés'}
        </Btn>
      </div>
      <ImporterDialogue key={analyse?.ok ? analyse.jeton : 'aucun'} analyse={analyse} onFermer={() => setAnalyse(null)} />
    </div>
  )
}
