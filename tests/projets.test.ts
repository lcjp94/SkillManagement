import { describe, expect, it } from 'vitest'
import {
  ProjetError,
  ajouterProjet,
  appliquerChangements,
  archiverProjet,
  creerProjet,
  dupliquerProjet,
  ecarterSkill,
  nomUnique,
  proposerChangements,
  remplacerProjet,
  restaurerProjet,
  retenirSkill,
  selectionnes,
  supprimerProjet
} from '../src/main/core/projets'
import { getCatalogue } from '../src/shared/data'
import { etatInitial, type Project, type State } from '../src/shared/schemas/state'

const { skills, profiles } = getCatalogue()
const T0 = new Date('2026-10-26T10:00:00.000Z')
const T1 = new Date('2026-10-27T08:30:00.000Z')
let compteur = 0
const ctx = (maintenant = T0) => ({ id: `p${++compteur}`, maintenant })

const nouveau = (nom = 'Visibilité du cabinet', plus: Partial<Parameters<typeof creerProjet>[0]> = {}) =>
  creerProjet({ nom, besoins: ['seo', 'reseaux-sociaux'], assistants: ['claude-code'], metier: 'juriste', aisance: 'debutant', ...plus }, ctx(), profiles)
const avec = (...projets: Project[]): State => projets.reduce(ajouterProjet, etatInitial())

describe('création', () => {
  it('crée une recette vide, sans dossier ni skill', () => {
    const p = nouveau()
    expect(p).toMatchObject({ nom: 'Visibilité du cabinet', skills: [], dossiers: {}, creeLe: T0.toISOString(), modifieLe: T0.toISOString() })
    expect(p.arborescence).toEqual({ gabarit: 'aucun', extras: [] })
  })

  it('refuse un besoin inconnu', () => {
    expect(() => nouveau('X', { besoins: ['astrologie'] })).toThrow(ProjetError)
  })

  it.each(['CON', 'nul.txt', 'a/b', 'a:b', 'fin.', '', 'x'.repeat(81)])('refuse le nom %j', (nom) => {
    expect(() => nouveau(nom)).toThrow(/nom/i)
  })

  it('écarte les doublons de besoins et d\'assistants', () => {
    const p = nouveau('X', { besoins: ['seo', 'seo'], assistants: ['cursor', 'cursor'] })
    expect(p.besoins).toEqual(['seo'])
    expect(p.assistants).toEqual(['cursor'])
  })

  it('refuse un nom déjà pris, sans tenir compte de la casse', () => {
    const etat = avec(nouveau('Mon Projet'))
    expect(() => ajouterProjet(etat, nouveau('mon projet'))).toThrow('Un projet porte déjà ce nom.')
  })

  it('refuse deux fois le même identifiant', () => {
    const p = nouveau()
    expect(() => ajouterProjet(avec(p), { ...p, nom: 'Autre' })).toThrow(ProjetError)
  })
})

describe('nomUnique', () => {
  it('numérote les noms pris et reste sous 80 caractères', () => {
    expect(nomUnique('A', ['a'])).toBe('A (2)')
    expect(nomUnique('A', ['A', 'A (2)'])).toBe('A (3)')
    expect(nomUnique('A', [], true)).toBe('A (copie)')
    expect(nomUnique('A', ['A (copie)'], true)).toBe('A (copie 2)')
    const long = 'x'.repeat(80)
    expect(nomUnique(long, [long], true)).toHaveLength(80)
    expect(nomUnique(long, [long], true).endsWith(' (copie)')).toBe(true)
  })
})

describe('cycle de vie', () => {
  it('modifier met à jour la date et ne touche pas aux autres projets', () => {
    const a = nouveau('A')
    const b = nouveau('B')
    const etat = remplacerProjet(avec(a, b), { ...a, description: 'Nouvelle' }, T1)
    expect(etat.projects[0]).toMatchObject({ description: 'Nouvelle', modifieLe: T1.toISOString(), creeLe: T0.toISOString() })
    expect(etat.projects[1]).toEqual(b)
  })

  it('renommer vers un nom déjà pris est refusé et l\'état de départ reste intact', () => {
    const a = nouveau('A')
    const b = nouveau('B')
    const etat = avec(a, b)
    const avant = structuredClone(etat)
    expect(() => remplacerProjet(etat, { ...b, nom: 'a' }, T1)).toThrow('Un projet porte déjà ce nom.')
    expect(etat).toEqual(avant)
  })

  it('archive puis restaure', () => {
    const p = nouveau()
    const archive = archiverProjet(avec(p), p.id, T1)
    expect(archive.projects[0]?.archiveLe).toBe(T1.toISOString())
    expect(restaurerProjet(archive, p.id, T1).projects[0]).not.toHaveProperty('archiveLe')
  })

  it('supprime la recette, un projet inconnu est signalé', () => {
    const p = nouveau()
    expect(supprimerProjet(avec(p), p.id).projects).toEqual([])
    expect(() => supprimerProjet(avec(p), 'inconnu')).toThrow('Ce projet n’existe plus.')
  })

  it('duplique la recette sans les dossiers mémorisés ni l\'archivage', () => {
    const p: Project = { ...nouveau(), dossiers: { 'claude-code': 'C:\\Dossiers\\Cabinet' }, archiveLe: T0.toISOString(),
      skills: [{ slug: 'seo-technique', origine: 'recommande', ecarte: false, pour: ['seo'] }] }
    const etat = dupliquerProjet(avec(p), p.id, ctx(T1))
    const copie = etat.projects[1]!
    expect(copie.nom).toBe('Visibilité du cabinet (copie)')
    expect(copie.dossiers).toEqual({})
    expect(copie).not.toHaveProperty('archiveLe')
    expect(copie.skills).toEqual(p.skills)
    expect(copie.id).not.toBe(p.id)
    // La copie est indépendante de l'original
    copie.skills[0]!.ecarte = true
    expect(p.skills[0]!.ecarte).toBe(false)
    expect(dupliquerProjet(etat, p.id, ctx()).projects[2]?.nom).toBe('Visibilité du cabinet (copie 2)')
  })
})

describe('skills du projet', () => {
  it('retenir, écarter et réintégrer', () => {
    let p = retenirSkill(nouveau(), 'seo-technique')
    expect(selectionnes(p)).toEqual(['seo-technique'])
    p = ecarterSkill(p, 'seo-technique')
    expect(selectionnes(p)).toEqual([])
    expect(p.skills).toHaveLength(1)
    expect(selectionnes(retenirSkill(p, 'seo-technique'))).toEqual(['seo-technique'])
  })

  it('écarter un skill absent le note comme écarté, pour qu\'il ne soit pas reproposé', () => {
    const p = ecarterSkill(nouveau(), 'x-threads')
    expect(p.skills).toEqual([{ slug: 'x-threads', origine: 'manuel', ecarte: true }])
  })

  it('un slug en double dans un projet est refusé par les données', () => {
    const p: Project = { ...nouveau(), skills: [{ slug: 'x-threads', origine: 'manuel', ecarte: false }, { slug: 'x-threads', origine: 'manuel', ecarte: true }] }
    expect(() => ajouterProjet(etatInitial(), p)).toThrow(ProjetError)
  })
})

describe('conseil d\'un projet', () => {
  const profil = { metier: 'juriste', aisance: 'debutant' as const }
  const conseil = (p: Project) => proposerChangements(p, skills, profiles, profil)

  it('propose un premier jeu de skills pour les besoins, sans rien appliquer', () => {
    const p = nouveau()
    const { ajouts, retraits } = conseil(p)
    expect(ajouts.map((a) => a.slug)).toContain('seo-technique')
    expect(retraits).toEqual([])
    expect(p.skills).toEqual([])
  })

  it('accepter la proposition mémorise les besoins à l\'origine de chaque skill', () => {
    const p = nouveau()
    const apres = appliquerChangements(p, { ajouter: conseil(p).ajouts, retirer: [] })
    expect(apres.skills.find((s) => s.slug === 'seo-technique')).toEqual({ slug: 'seo-technique', origine: 'recommande', ecarte: false, pour: ['seo'] })
  })

  it('ne propose que des compléments : une fois le projet complet, plus rien', () => {
    const p = nouveau()
    const complet = appliquerChangements(p, { ajouter: conseil(p).ajouts, retirer: [] })
    expect(conseil(complet).ajouts).toEqual([])
  })

  it('ne repropose pas un skill écarté', () => {
    const p = ecarterSkill(nouveau(), 'seo-technique')
    expect(conseil(p).ajouts.map((a) => a.slug)).not.toContain('seo-technique')
  })

  it('changer les besoins propose des retraits et des ajouts, sans rien appliquer', () => {
    const p = nouveau()
    const complet = appliquerChangements(p, { ajouter: conseil(p).ajouts, retirer: [] })
    const modifie: Project = { ...complet, besoins: ['reseaux-sociaux', 'veille'] }
    const { ajouts, retraits } = conseil(modifie)
    expect(retraits.map((r) => r.slug)).toContain('seo-technique')
    expect(retraits.every((r) => r.raison.length > 0)).toBe(true)
    expect(ajouts.some((a) => a.besoins?.includes('veille'))).toBe(true)
    // Rien n'a bougé dans la recette tant que la personne n'accepte pas
    expect(selectionnes(modifie)).toEqual(selectionnes(complet))
  })

  it('ne propose jamais de retirer un skill ajouté à la main, par l\'IA ou importé', () => {
    for (const origine of ['manuel', 'ia', 'importe'] as const) {
      const p: Project = { ...nouveau(), besoins: ['veille'], skills: [{ slug: 'seo-technique', origine, ecarte: false, pour: ['seo'] }] }
      expect(conseil(p).retraits, origine).toEqual([])
    }
  })

  it('un retrait accepté ne touche que les skills recommandés', () => {
    const p: Project = { ...nouveau(), skills: [
      { slug: 'seo-technique', origine: 'recommande', ecarte: false, pour: ['seo'] },
      { slug: 'x-threads', origine: 'manuel', ecarte: false }
    ] }
    const apres = appliquerChangements(p, { ajouter: [], retirer: ['seo-technique', 'x-threads'] })
    expect(apres.skills.map((s) => s.slug)).toEqual(['x-threads'])
  })

  it('l\'« autre besoin » libre oriente le conseil', () => {
    const p = nouveau('Vidéo', { besoins: [], autreBesoin: 'sous-titres pour mes vidéos' })
    expect(conseil({ ...p, metier: 'autre' }).ajouts.map((a) => a.slug)).toContain('sous-titres-srt')
  })

  it('le métier et l\'aisance du projet l\'emportent sur ceux du profil', () => {
    const p = nouveau('Expert', { aisance: 'expert' })
    expect(conseil(p).ajouts.length).toBeGreaterThan(proposerChangements(nouveau('Débutant'), skills, profiles, profil).ajouts.length)
  })

  it('sans profil ni aisance, retombe sur « débutant »', () => {
    const p = creerProjet({ nom: 'Sans profil', besoins: ['seo'], assistants: [] }, ctx(), profiles)
    expect(proposerChangements(p, skills, profiles, null).ajouts.length).toBeLessThanOrEqual(profiles.levels.debutant.maxSkills)
  })
})
