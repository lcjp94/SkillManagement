// Appels vers le processus principal, avec chargement, erreurs lisibles et rechargement au retour sur la fenêtre.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Canal, Entree, Sortie } from '@shared/contrat'

const MARQUE = 'SM|'
const MESSAGE_PAR_DEFAUT = 'Une erreur est survenue. Réessayez ; si elle revient, fermez puis rouvrez l’application.'

/** Message à montrer : celui que le processus principal a écrit pour la personne, sinon un message générique. */
export function messageErreur(erreur: unknown): string {
  const texte = erreur instanceof Error ? erreur.message : ''
  const i = texte.indexOf(MARQUE)
  return i >= 0 ? texte.slice(i + MARQUE.length) : MESSAGE_PAR_DEFAUT
}

export function appeler<C extends Canal>(canal: C, entree?: Entree<C>): Promise<Sortie<C>> {
  return window.skillmanagement.invoke(canal, entree)
}

export interface Donnees<T> {
  donnees: T | null
  erreur: string | null
  chargement: boolean
  recharger: () => void
}

const DELAI_RECHARGEMENT_MS = 250

/**
 * Charge des données et les relit à chaque retour sur la fenêtre : un écran ne reste jamais périmé après une action
 * faite ailleurs (CLAUDE.md § 13.5). Les rechargements rapprochés sont regroupés.
 */
export function useDonnees<C extends Canal>(canal: C, entree?: Entree<C>, actif = true): Donnees<Sortie<C>> {
  const [donnees, setDonnees] = useState<Sortie<C> | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(actif)
  const rang = useRef(0)
  const cle = JSON.stringify(entree ?? null)
  const entreeRef = useRef(entree)
  entreeRef.current = entree

  const charger = useCallback(() => {
    const mon = ++rang.current
    appeler(canal, entreeRef.current).then(
      (d) => {
        if (mon !== rang.current) return // une réponse plus récente est déjà arrivée
        setDonnees(d)
        setErreur(null)
        setChargement(false)
      },
      (e: unknown) => {
        if (mon !== rang.current) return
        setErreur(messageErreur(e))
        setChargement(false)
      }
    )
  }, [canal])

  useEffect(() => {
    if (!actif) return
    setChargement(true)
    charger()
  }, [charger, cle, actif])

  useEffect(() => {
    if (!actif) return
    let minuterie: ReturnType<typeof setTimeout> | undefined
    const planifier = () => {
      clearTimeout(minuterie)
      minuterie = setTimeout(charger, DELAI_RECHARGEMENT_MS)
    }
    const surVisibilite = () => {
      if (document.visibilityState === 'visible') planifier()
    }
    window.addEventListener('focus', planifier)
    document.addEventListener('visibilitychange', surVisibilite)
    return () => {
      clearTimeout(minuterie)
      window.removeEventListener('focus', planifier)
      document.removeEventListener('visibilitychange', surVisibilite)
    }
  }, [charger, actif])

  return { donnees, erreur, chargement, recharger: charger }
}
