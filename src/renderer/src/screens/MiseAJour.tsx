import { useEffect, useState } from 'react'
import type { MiseAJourVue } from '@shared/contrat'
import { appeler, messageErreur } from '../api'
import { Alerte, Btn } from '../ui'

/** Mises à jour de l'application : la personne vérifie, télécharge, puis choisit de redémarrer. Rien n'est automatique. */
export function SectionMiseAJour() {
  const [etat, setEtat] = useState<MiseAJourVue | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  useEffect(() => {
    appeler('maj.etat').then(setEtat, (e: unknown) => setErreur(messageErreur(e)))
  }, [])

  // Pendant le téléchargement, l'état est relu chaque seconde
  useEffect(() => {
    if (etat?.statut !== 'telechargement') return
    const minuterie = setInterval(() => {
      appeler('maj.etat').then(setEtat, () => undefined)
    }, 1000)
    return () => clearInterval(minuterie)
  }, [etat?.statut])

  const agir = async (fn: () => Promise<unknown>) => {
    setOccupe(true)
    setErreur(null)
    try {
      await fn()
      setEtat(await appeler('maj.etat'))
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  const verifier = () => agir(async () => setEtat(await appeler('maj.verifier')))
  const peutVerifier = etat && etat.statut !== 'inactive' && etat.statut !== 'aucune-source' && etat.statut !== 'telechargement' && etat.statut !== 'pret'

  return (
    <div className="flex flex-col gap-3">
      {etat && (etat.statut === 'inactive' || etat.statut === 'aucune-source') && <p className="text-doux">{etat.message}</p>}
      {etat?.statut === 'a-verifier' && <p className="text-doux">Aucune vérification n’a été faite depuis l’ouverture de l’application.</p>}
      {etat?.statut === 'a-jour' && <Alerte ton="ok">Vous avez la dernière version{etat.version ? ` (${etat.version})` : ''}.</Alerte>}
      {etat?.statut === 'disponible' && <Alerte ton="attention">La version {etat.version} est disponible. Vos projets et vos réglages sont conservés.</Alerte>}
      {etat?.statut === 'telechargement' && (
        <p role="status" aria-live="polite">
          Téléchargement de la version {etat.version} : {etat.progression ?? 0} %
        </p>
      )}
      {etat?.statut === 'pret' && <Alerte ton="ok">La version {etat.version} est téléchargée. L’application va se fermer, s’installer, puis se rouvrir toute seule.</Alerte>}
      {etat?.statut === 'erreur' && (
        <Alerte ton="erreur" annonce>
          {etat.message}
        </Alerte>
      )}
      {erreur && (
        <Alerte ton="erreur" annonce>
          {erreur}
        </Alerte>
      )}
      <div className="flex flex-wrap gap-2">
        {etat && (peutVerifier || etat.statut === 'disponible') && etat.statut !== 'disponible' && (
          <Btn onClick={verifier} occupe={occupe}>
            Vérifier maintenant
          </Btn>
        )}
        {etat?.statut === 'disponible' && (
          <Btn ton="primaire" onClick={() => agir(() => appeler('maj.telecharger'))} occupe={occupe}>
            Télécharger la mise à jour
          </Btn>
        )}
        {etat?.statut === 'pret' && (
          <Btn ton="primaire" onClick={() => agir(() => appeler('maj.installer'))} occupe={occupe}>
            Redémarrer et installer
          </Btn>
        )}
      </div>
      <p className="text-sm text-doux">La vérification n’a lieu que lorsque vous la demandez. Rien n’est téléchargé ni installé sans votre accord.</p>
    </div>
  )
}
