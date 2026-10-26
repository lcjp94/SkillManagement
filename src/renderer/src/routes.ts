// Navigation par adresse (#/…) : le bouton « retour » et le rechargement gardent la personne où elle était.
import { useEffect, useState } from 'react'

export type Onglet = 'skills' | 'arborescence' | 'deploiements' | 'historique'
export const ONGLETS: Onglet[] = ['skills', 'arborescence', 'deploiements', 'historique']

export type Route =
  | { nom: 'demarrage' }
  | { nom: 'projets' }
  | { nom: 'nouveau-projet' }
  | { nom: 'projet'; id: string; onglet: Onglet; installer: boolean }
  | { nom: 'bibliotheque'; enLigne: string | null }
  | { nom: 'reglages' }

export function lireRoute(hash: string): Route {
  const [chemin = '', requete = ''] = hash.replace(/^#\/?/, '').split('?')
  const morceaux = chemin.split('/').filter(Boolean)
  const parametres = new URLSearchParams(requete)
  switch (morceaux[0]) {
    case 'demarrage':
      return { nom: 'demarrage' }
    case 'bibliotheque':
      return { nom: 'bibliotheque', enLigne: parametres.get('en-ligne') }
    case 'reglages':
      return { nom: 'reglages' }
    case 'projets': {
      if (morceaux[1] === 'nouveau') return { nom: 'nouveau-projet' }
      if (morceaux[1]) {
        const onglet = ONGLETS.find((o) => o === morceaux[2]) ?? 'skills'
        return { nom: 'projet', id: decodeURIComponent(morceaux[1]), onglet, installer: parametres.get('installer') !== null }
      }
      return { nom: 'projets' }
    }
    default:
      return { nom: 'projets' }
  }
}

export const lien = {
  projets: '#/projets',
  nouveau: '#/projets/nouveau',
  bibliotheque: '#/bibliotheque',
  /** La bibliothèque, ouverte sur la recherche en ligne avec une requête déjà saisie. */
  enLigne: (requete: string): string => `#/bibliotheque?en-ligne=${encodeURIComponent(requete)}`,
  reglages: '#/reglages',
  demarrage: '#/demarrage',
  projet: (id: string, onglet: Onglet = 'skills', installer = false): string =>
    `#/projets/${encodeURIComponent(id)}/${onglet}${installer ? '?installer' : ''}`
}

export const aller = (cible: string): void => {
  window.location.hash = cible
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => lireRoute(window.location.hash))
  useEffect(() => {
    const surChangement = () => setRoute(lireRoute(window.location.hash))
    window.addEventListener('hashchange', surChangement)
    return () => window.removeEventListener('hashchange', surChangement)
  }, [])
  return route
}
