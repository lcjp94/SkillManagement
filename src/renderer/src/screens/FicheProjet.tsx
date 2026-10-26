import { Archive, Copy, Download, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FicheProjet } from '@shared/contrat'
import type { AssistantId } from '@shared/schemas/catalog'
import { appeler, messageErreur, useDonnees } from '../api'
import { useApp } from '../appContexte'
import { aller, lien, type Onglet } from '../routes'
import { Alerte, Btn, CaseCarte, Champ, Chargement, Dialogue, Donnee, Onglets, Pastille, useNotifs } from '../ui'
import { OngletArborescence } from './OngletArborescence'
import { OngletDeploiements } from './OngletDeploiements'
import { OngletHistorique } from './OngletHistorique'
import { DialogueSuggestions, OngletSkills } from './OngletSkills'

const bascule = <T,>(liste: T[], valeur: T, coche: boolean): T[] => (coche ? [...liste.filter((v) => v !== valeur), valeur] : liste.filter((v) => v !== valeur))

function EtatPastille({ fiche }: { fiche: FicheProjet }) {
  const { etat } = fiche
  if (etat.type === 'jamais') return <Pastille>Jamais appliqué</Pastille>
  if (etat.type === 'a-jour') return <Pastille ton="ok">À jour</Pastille>
  return <Pastille ton="attention">{etat.nombre} à installer</Pastille>
}

function DialogueModifier({ fiche, ouvert, onFermer, onModifie }: { fiche: FicheProjet; ouvert: boolean; onFermer: () => void; onModifie: (besoinsChanges: boolean) => void }) {
  const { ref } = useApp()
  const p = fiche.projet
  const [nom, setNom] = useState(p.nom)
  const [description, setDescription] = useState(p.description ?? '')
  const [besoins, setBesoins] = useState<string[]>(p.besoins)
  const [autre, setAutre] = useState(p.autreBesoin ?? '')
  const [assistants, setAssistants] = useState<AssistantId[]>(p.assistants)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  const enregistrer = async () => {
    setOccupe(true)
    setErreur(null)
    try {
      await appeler('projets.modifier', { id: p.id, nom, description, besoins, autreBesoin: autre, assistants })
      const change = JSON.stringify([...besoins].sort()) !== JSON.stringify([...p.besoins].sort()) || autre.trim() !== (p.autreBesoin ?? '')
      onModifie(change)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <Dialogue
      ouvert={ouvert}
      titre="Modifier le projet"
      onFermer={onFermer}
      pied={
        <>
          <Btn onClick={onFermer}>Annuler</Btn>
          <Btn ton="primaire" onClick={enregistrer} occupe={occupe}>
            Enregistrer
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Champ libelle="Nom du projet">{(c) => <input {...c} className="champ" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} />}</Champ>
        <Champ libelle="Description">{(c) => <textarea {...c} className="champ min-h-20" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />}</Champ>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">Besoins</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ref.besoins.map((b) => (
              <CaseCarte key={b.id} type="checkbox" checked={besoins.includes(b.id)} onChange={(c) => setBesoins(bascule(besoins, b.id, c))} titre={b.libelle} />
            ))}
          </div>
        </fieldset>
        <Champ libelle="Autre besoin">{(c) => <input {...c} className="champ" value={autre} maxLength={300} onChange={(e) => setAutre(e.target.value)} />}</Champ>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">Assistants</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ref.assistants.map((a) => (
              <CaseCarte key={a.id} type="checkbox" checked={assistants.includes(a.id)} onChange={(c) => setAssistants(bascule(assistants, a.id, c))} titre={a.libelle} />
            ))}
          </div>
        </fieldset>
        <p className="text-sm text-doux">Changer les besoins vous propose des ajouts et des retraits de skills ; rien n’est appliqué sans votre accord.</p>
        {erreur && (
          <Alerte ton="erreur" annonce>
            {erreur}
          </Alerte>
        )}
      </div>
    </Dialogue>
  )
}

function DialogueSupprimer({ fiche, ouvert, onFermer }: { fiche: FicheProjet; ouvert: boolean; onFermer: () => void }) {
  const { toast } = useNotifs()
  const [occupe, setOccupe] = useState(false)
  const installes = fiche.deploiements.filter((d) => d.installes.length > 0)

  const supprimer = async (desinstaller: boolean) => {
    setOccupe(true)
    try {
      if (desinstaller) {
        for (const d of installes) await appeler('deploiement.desinstaller', { projetId: fiche.projet.id, assistant: d.assistant, slugs: 'tous' })
      }
      await appeler('projets.supprimer', { id: fiche.projet.id })
      toast(desinstaller ? 'Projet supprimé et skills désinstallés.' : 'Projet supprimé.')
      aller(lien.projets)
    } catch (e) {
      toast(messageErreur(e))
      setOccupe(false)
    }
  }

  return (
    <Dialogue
      ouvert={ouvert}
      titre="Supprimer ce projet ?"
      onFermer={onFermer}
      pied={
        <>
          <Btn onClick={onFermer}>Annuler</Btn>
          {installes.length > 0 && (
            <Btn ton="danger" onClick={() => supprimer(true)} occupe={occupe}>
              Désinstaller puis supprimer
            </Btn>
          )}
          <Btn ton="danger" onClick={() => supprimer(false)} occupe={occupe}>
            {installes.length > 0 ? 'Supprimer seulement le projet' : 'Supprimer'}
          </Btn>
        </>
      }
    >
      <p>
        « <Donnee>{fiche.projet.nom}</Donnee> » sera supprimé de la liste.{' '}
        {installes.length > 0 ? 'Les skills déjà installés restent sur votre disque, sauf si vous choisissez de les désinstaller.' : 'Aucun fichier n’est supprimé de votre disque.'}
      </p>
    </Dialogue>
  )
}

export function FicheProjetEcran({ id, onglet, installer }: { id: string; onglet: Onglet; installer: boolean }) {
  const { donnees: fiche, erreur, chargement, recharger } = useDonnees('projets.fiche', { id })
  const { toast } = useNotifs()
  const [modifier, setModifier] = useState(false)
  const [supprimer, setSupprimer] = useState(false)
  const [suggestions, setSuggestions] = useState(false)

  if (erreur && !fiche) {
    return (
      <div className="flex flex-col gap-4">
        <a href={lien.projets}>← Projets</a>
        <h1>Projet introuvable</h1>
        <Alerte ton="erreur" annonce>
          {erreur}
        </Alerte>
      </div>
    )
  }
  if (!fiche) return chargement ? <Chargement /> : null

  const { projet } = fiche
  const agir = async (fn: () => Promise<unknown>, message: string) => {
    try {
      await fn()
      toast(message)
      recharger()
    } catch (e) {
      toast(messageErreur(e))
    }
  }
  const dupliquer = async () => {
    try {
      const { id: copie } = await appeler('projets.dupliquer', { id: projet.id })
      toast('Projet dupliqué.')
      aller(lien.projet(copie))
    } catch (e) {
      toast(messageErreur(e))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <a href={lien.projets} className="text-sm">
          ← Projets
        </a>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words">
              <Donnee>{projet.nom}</Donnee>
            </h1>
            {projet.description && (
              <p className="mt-1 text-doux">
                <Donnee>{projet.description}</Donnee>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {projet.archiveLe && <Pastille>Archivé</Pastille>}
            <EtatPastille fiche={fiche} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn petit onClick={() => setModifier(true)}>
            <Pencil size={15} aria-hidden="true" />
            Modifier
          </Btn>
          <Btn petit onClick={dupliquer}>
            <Copy size={15} aria-hidden="true" />
            Dupliquer
          </Btn>
          <Btn petit onClick={() => agir(async () => {
            const r = await appeler('projets.exporter', { id: projet.id })
            if (!r.enregistre) throw new Error('SM|Export annulé.')
          }, 'Projet exporté.')}>
            <Download size={15} aria-hidden="true" />
            Exporter
          </Btn>
          <Btn petit onClick={() => agir(() => appeler('projets.archiver', { id: projet.id, archiver: !projet.archiveLe }), projet.archiveLe ? 'Projet restauré.' : 'Projet archivé.')}>
            <Archive size={15} aria-hidden="true" />
            {projet.archiveLe ? 'Restaurer' : 'Archiver'}
          </Btn>
          <Btn petit onClick={() => setSupprimer(true)}>
            <Trash2 size={15} aria-hidden="true" />
            Supprimer
          </Btn>
        </div>
      </header>

      <Onglets
        libelle="Sections du projet"
        actif={onglet}
        onChoisir={(o) => aller(lien.projet(projet.id, o))}
        onglets={[
          { id: 'skills', libelle: 'Skills' },
          { id: 'arborescence', libelle: 'Arborescence' },
          { id: 'deploiements', libelle: 'Déploiements' },
          { id: 'historique', libelle: 'Historique' }
        ]}
      >
        {onglet === 'skills' && <OngletSkills fiche={fiche} onChange={recharger} onSuggestions={() => setSuggestions(true)} />}
        {onglet === 'arborescence' && <OngletArborescence fiche={fiche} onChange={recharger} />}
        {onglet === 'deploiements' && <OngletDeploiements fiche={fiche} onChange={recharger} ouvrirAuto={installer} />}
        {onglet === 'historique' && <OngletHistorique projetId={projet.id} />}
      </Onglets>

      <DialogueModifier
        key={`${projet.modifieLe}-${modifier}`}
        fiche={fiche}
        ouvert={modifier}
        onFermer={() => setModifier(false)}
        onModifie={(besoinsChanges) => {
          setModifier(false)
          recharger()
          if (besoinsChanges) {
            aller(lien.projet(projet.id, 'skills'))
            setSuggestions(true)
          } else toast('Projet modifié.')
        }}
      />
      <DialogueSupprimer fiche={fiche} ouvert={supprimer} onFermer={() => setSupprimer(false)} />
      <DialogueSuggestions projetId={projet.id} ouvert={suggestions} onFermer={() => setSuggestions(false)} onChange={recharger} />
    </div>
  )
}
