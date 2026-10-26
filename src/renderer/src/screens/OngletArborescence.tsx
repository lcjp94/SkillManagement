import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FicheProjet, Sortie } from '@shared/contrat'
import { appeler, messageErreur } from '../api'
import { useApp } from '../appContexte'
import { Alerte, Btn, Champ, Chargement, Dialogue, Donnee, Pastille, formaterOctets, useNotifs } from '../ui'

export function OngletArborescence({ fiche, onChange }: { fiche: FicheProjet; onChange: () => void }) {
  const { ref } = useApp()
  const { toast } = useNotifs()
  const p = fiche.projet
  const [gabarit, setGabarit] = useState(p.arborescence.gabarit)
  const [extras, setExtras] = useState<string[]>(p.arborescence.extras)
  const [nouveau, setNouveau] = useState('')
  const [readme, setReadme] = useState(true)
  const [apercu, setApercu] = useState<{ racine?: string } | null>(null)
  const [retirer, setRetirer] = useState(false)

  const ajouter = () => {
    const nom = nouveau.trim()
    if (nom && !extras.includes(nom)) setExtras([...extras, nom])
    setNouveau('')
  }
  const ouvrir = async () => {
    const premier = p.assistants.map((a) => p.dossiers[a]).find(Boolean)
    if (premier) return setApercu({})
    try {
      const racine = await appeler('dossier.choisir')
      if (racine) setApercu({ racine })
    } catch (e) {
      toast(messageErreur(e))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-doux">
        L’arborescence range les fichiers de votre projet : un dossier de départ selon votre activité, et des dossiers pour chaque besoin. Rien n’est créé sans que vous ayez vu la liste.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Champ libelle="Dossiers de départ">
          {(c) => (
            <select {...c} className="champ" value={gabarit} onChange={(e) => setGabarit(e.target.value)}>
              {ref.gabarits.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.libelle}
                </option>
              ))}
            </select>
          )}
        </Champ>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="extra" className="font-semibold">
            Ajouter un dossier
          </label>
          <div className="flex gap-2">
            <input
              id="extra"
              className="champ"
              value={nouveau}
              maxLength={64}
              onChange={(e) => setNouveau(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ajouter()
                }
              }}
            />
            <Btn onClick={ajouter} disabled={nouveau.trim() === ''}>
              Ajouter
            </Btn>
          </div>
        </div>
      </div>
      {extras.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Dossiers ajoutés">
          {extras.map((e) => (
            <li key={e} className="pastille">
              <Donnee>{e}</Donnee>
              <button type="button" className="rounded-full" aria-label={`Retirer le dossier ${e}`} onClick={() => setExtras(extras.filter((x) => x !== e))}>
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={readme} onChange={(e) => setReadme(e.target.checked)} className="size-4" />
        Ajouter un petit fichier d’orientation (README) dans chaque dossier de premier niveau
      </label>

      <section aria-labelledby="titre-dossiers" className="flex flex-col gap-2">
        <h2 id="titre-dossiers">Dossiers prévus pour ce projet</h2>
        {fiche.arborescence.dossiers.length === 0 ? (
          <p className="text-doux">Aucun dossier.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {fiche.arborescence.dossiers.map((d) => (
              <li key={d}>
                <Pastille>{d}/</Pastille>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-doux">Cette liste suit les réglages enregistrés du projet ; l’aperçu ci-dessous tient compte de vos changements.</p>
      </section>

      {fiche.arborescence.installee && <Alerte ton="ok">Une arborescence a été créée par l’application le {new Date(fiche.arborescence.installee.creeLe).toLocaleDateString('fr-FR')}.</Alerte>}

      <div className="flex flex-wrap gap-2">
        <Btn ton="primaire" onClick={ouvrir}>
          Aperçu et création
        </Btn>
        {fiche.arborescence.installee && <Btn onClick={() => setRetirer(true)}>Retirer l’arborescence</Btn>}
      </div>

      {apercu && <DialogueArborescence key={apercu.racine ?? 'memorise'} fiche={fiche} gabarit={gabarit} extras={extras} readme={readme} racineInitiale={apercu.racine} onFermer={() => setApercu(null)} onChange={onChange} />}
      <DialogueRetirer projetId={p.id} ouvert={retirer} onFermer={() => setRetirer(false)} onChange={onChange} />
    </div>
  )
}

type Apercu = Sortie<'arborescence.apercu'>

function DialogueArborescence({ fiche, gabarit, extras, readme, racineInitiale, onFermer, onChange }: { fiche: FicheProjet; gabarit: string; extras: string[]; readme: boolean; racineInitiale?: string; onFermer: () => void; onChange: () => void }) {
  const { toast } = useNotifs()
  const [racine, setRacine] = useState(racineInitiale)
  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const demande = { projetId: fiche.projet.id, racine, gabarit, extras, readme }

  // L'aperçu se recalcule si la personne change de dossier
  useEffect(() => {
    let courant = true
    setApercu(null)
    appeler('arborescence.apercu', { projetId: fiche.projet.id, racine, gabarit, extras, readme }).then(
      (a) => courant && setApercu(a),
      (e: unknown) => courant && setErreur(messageErreur(e))
    )
    return () => {
      courant = false
    }
  }, [fiche.projet.id, racine, gabarit, extras, readme])

  const changerDossier = async () => {
    try {
      const nouveau = await appeler('dossier.choisir')
      if (nouveau) setRacine(nouveau)
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  const creer = async () => {
    setOccupe(true)
    try {
      const r = await appeler('arborescence.appliquer', demande)
      toast(r.statut === 'applique' ? 'Arborescence créée.' : 'Tous les dossiers existaient déjà.')
      onChange()
      onFermer()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <Dialogue
      ouvert
      titre="Créer l’arborescence"
      onFermer={onFermer}
      pied={
        <>
          <Btn onClick={onFermer}>Annuler</Btn>
          <Btn ton="primaire" onClick={creer} occupe={occupe} disabled={!apercu || (apercu.apercu.dossiersACreer.length === 0 && apercu.apercu.lignes.every((l) => l.action === 'unchanged'))}>
            Créer {apercu ? `${apercu.apercu.dossiersACreer.length} dossiers` : ''}
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {erreur && (
          <Alerte ton="erreur" annonce>
            {erreur}
          </Alerte>
        )}
        {!apercu && !erreur && <Chargement />}
        {apercu && (
          <>
            <p>
              Dossier : <Donnee>{apercu.dossier}</Donnee>{' '}
              <Btn petit ton="discret" onClick={changerDossier}>
                Changer
              </Btn>
            </p>
            <p className="font-semibold">Rien n’est créé tant que vous n’avez pas cliqué sur « Créer ».</p>
            <p>
              Espace nécessaire : {formaterOctets(apercu.apercu.octets)}.
              {apercu.apercu.dossiersACreer.length === 0 && ' Tous les dossiers existent déjà.'}
            </p>
            {apercu.apercu.arbre && <pre className="texte-brut">{apercu.apercu.arbre}</pre>}
          </>
        )}
      </div>
    </Dialogue>
  )
}

function DialogueRetirer({ projetId, ouvert, onFermer, onChange }: { projetId: string; ouvert: boolean; onFermer: () => void; onChange: () => void }) {
  const { toast } = useNotifs()
  const [erreur, setErreur] = useState<string | null>(null)
  const retirer = async () => {
    try {
      const r = await appeler('arborescence.retirer', { projetId })
      toast(r.conserves.length > 0 ? `Arborescence retirée ; ${r.conserves.length} élément(s) conservé(s) car modifié(s).` : 'Arborescence retirée.')
      onChange()
      onFermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }
  return (
    <Dialogue
      ouvert={ouvert}
      titre="Retirer l’arborescence"
      onFermer={onFermer}
      pied={
        <>
          <Btn onClick={onFermer}>Annuler</Btn>
          <Btn ton="danger" onClick={retirer}>
            Retirer
          </Btn>
        </>
      }
    >
      <p>Seuls les petits fichiers d’orientation que vous n’avez pas modifiés et les dossiers vides créés par l’application sont retirés. Vos fichiers ne sont jamais touchés.</p>
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
