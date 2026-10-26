import { createContext, useContext } from 'react'
import type { AppInfo, Referentiels } from '@shared/contrat'
import type { Profile } from '@shared/schemas/state'

export interface ContexteApp {
  ref: Referentiels
  profil: Profile | null
  info: AppInfo
  /** À appeler quand le profil vient d'être enregistré : l'interface le prend en compte sans attendre. */
  profilEnregistre: (profil: Profile) => void
}

export const Contexte = createContext<ContexteApp | null>(null)

export function useApp(): ContexteApp {
  const c = useContext(Contexte)
  if (!c) throw new Error('Contexte absent')
  return c
}
