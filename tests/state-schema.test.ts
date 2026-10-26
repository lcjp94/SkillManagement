import { describe, expect, it } from 'vitest'
import { ProjectNameSchema, StateSchema, etatInitial, type State } from '../src/shared/schemas/state'

const projet = (nom: string) => ({
  id: nom,
  nom,
  besoins: [],
  assistants: [],
  skills: [],
  arborescence: { gabarit: 'vide', extras: [] },
  dossiers: {},
  creeLe: '2026-10-26T08:00:00.000Z',
  modifieLe: '2026-10-26T08:00:00.000Z'
})

describe('nom de projet', () => {
  it.each(['Visibilité du cabinet', 'Projet 2026', 'a'.repeat(80)])('accepte « %s »', (nom) => {
    expect(ProjectNameSchema.safeParse(nom).success).toBe(true)
  })

  it.each(['', '   ', 'a'.repeat(81), 'CON', 'nul', 'COM1', 'lpt9', 'con.txt', 'a/b', 'a\\b', 'a:b', 'a*b', 'fin.', 'tab\tulation'])(
    'refuse « %s »',
    (nom) => {
      expect(ProjectNameSchema.safeParse(nom).success).toBe(false)
    }
  )
})

describe('état', () => {
  it("l'état initial est valide", () => {
    expect(StateSchema.safeParse(etatInitial()).success).toBe(true)
  })

  it('refuse deux projets dont les noms ne diffèrent que par la casse', () => {
    const etat: State = { ...etatInitial(), projects: [projet('Seo') as never, projet('SEO') as never] }
    expect(StateSchema.safeParse(etat).success).toBe(false)
  })

  it('refuse un skill intégré dans les skills de la personne', () => {
    const etat = {
      ...etatInitial(),
      userSkills: [
        {
          name: 'x', slug: 'x', category: 'c', description: 'd', environments: [], tokenEstimate: 1,
          tags: [], personas: [], levels: [], content: 'c', source: 'integre'
        }
      ]
    }
    expect(StateSchema.safeParse(etat).success).toBe(false)
  })
})
