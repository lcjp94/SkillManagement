import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calculerFichiers, choisirSkills, dessinerArbre, octetsAEcrire } from '../src/main/core/deploiement'
import { DISPOSITIONS } from '../src/main/core/layouts'
import { DOSSIERS_BESOIN, GABARITS, planArborescence } from '../src/main/core/tree'
import { lireManifestes } from '../src/main/fs/manifestes'
import { getCatalogue } from '../src/shared/data'
import { creerBanc, skills, type Banc } from './helpers/disque'

const { profiles } = getCatalogue()

describe('choisirSkills : installer seulement ce qui manque', () => {
  it('12 installés + 3 nouveaux → « Installer 3 nouveaux skills », 12 décochés et marqués déjà installés', () => {
    const installes = Array.from({ length: 12 }, (_, i) => `deja-${i}`)
    const nouveaux = ['neuf-a', 'neuf-b', 'neuf-c']
    const r = choisirSkills([...installes, ...nouveaux], installes)
    expect(r.aEcrire).toEqual(nouveaux)
    expect(r.dejaInstalles).toEqual(installes)
    expect(r.libelle).toBe('Installer 3 nouveaux skills')
  })

  it('un seul nouveau skill, puis plus aucun', () => {
    expect(choisirSkills(['a', 'b'], ['a']).libelle).toBe('Installer 1 nouveau skill')
    expect(choisirSkills(['a', 'b'], ['a', 'b']).libelle).toBe('Tout est déjà installé')
    expect(choisirSkills(['a', 'b'], ['a', 'b']).aEcrire).toEqual([])
    expect(choisirSkills([], []).libelle).toBe('Aucun skill sélectionné')
  })

  it('cocher un skill déjà installé le réinstalle et passe en mode explicite', () => {
    const r = choisirSkills(['a', 'b', 'c'], ['a', 'b'], { reinstaller: ['a'] })
    expect(r.aEcrire).toEqual(['a', 'c'])
    expect(r.libelle).toBe('Installer 2 skills')
  })

  it('« tout » réécrit toute la sélection', () => {
    const r = choisirSkills(['a', 'b', 'c'], ['a', 'b'], { tout: true })
    expect(r.aEcrire).toEqual(['a', 'b', 'c'])
    expect(r.libelle).toBe('Installer 3 skills')
  })

  it('ignore les doublons et ne réinstalle pas un skill non sélectionné', () => {
    expect(choisirSkills(['a', 'a', 'b'], [], {}).aEcrire).toEqual(['a', 'b'])
    expect(choisirSkills(['a'], ['a'], { reinstaller: ['zzz'] }).aEcrire).toEqual([])
  })
})

describe('calculerFichiers', () => {
  const plan = DISPOSITIONS['claude-code'].planifier(skills('a-un', 'b-deux')).fichiers

  it('crée, laisse inchangé ou modifie selon le contenu existant', () => {
    const existants: Record<string, string> = {
      '.claude/skills/a-un/SKILL.md': (plan[0] as { contenu: string }).contenu,
      '.claude/skills/b-deux/SKILL.md': 'autre chose'
    }
    const r = calculerFichiers(plan, (c) => existants[c] ?? null)
    expect(r.map((f) => f.action)).toEqual(['unchanged', 'modify'])
    expect(r[0]?.skills).toEqual([])
    expect(r[1]?.skills).toHaveLength(1)
  })

  it('un fichier à blocs sans bloc n\'est pas créé, et le réglage Aider n\'est prévu que si on écrit autre chose', () => {
    expect(calculerFichiers(DISPOSITIONS.copilot.planifier([]).fichiers, () => null)).toEqual([])
    expect(calculerFichiers(DISPOSITIONS.aider.planifier([]).fichiers, () => null)).toEqual([])
    const r = calculerFichiers(DISPOSITIONS.aider.planifier(skills('a-un')).fichiers, () => null)
    expect(r.map((f) => [f.chemin, f.action])).toEqual([['CONVENTIONS.md', 'create'], ['.aider.conf.yml', 'create']])
  })

  it('seuls les blocs réellement changés sont attribués à l\'application', () => {
    const premier = calculerFichiers(DISPOSITIONS.copilot.planifier(skills('a-un')).fichiers, () => null)[0]!
    const suite = calculerFichiers(DISPOSITIONS.copilot.planifier(skills('a-un', 'b-deux')).fichiers, () => premier.contenuApres)[0]!
    expect(suite.action).toBe('modify')
    expect(suite.skills.map((s) => s.slug)).toEqual(['b-deux'])
    const encore = calculerFichiers(DISPOSITIONS.copilot.planifier(skills('a-un', 'b-deux')).fichiers, () => suite.contenuApres)[0]!
    expect(encore.action).toBe('unchanged')
    expect(encore.skills).toEqual([])
  })

  it('compte les octets écrits, hors fichiers inchangés', () => {
    const r = calculerFichiers(plan, () => null)
    expect(octetsAEcrire(r)).toBe(r.reduce((n, f) => n + Buffer.byteLength(f.contenuApres), 0))
    expect(octetsAEcrire(calculerFichiers(plan, (c) => (plan.find((p) => p.chemin === c) as { contenu: string }).contenu))).toBe(0)
  })
})

describe('dessinerArbre', () => {
  it('range les fichiers sous leurs dossiers', () => {
    expect(dessinerArbre(['seo/', 'seo/audits/', 'seo/README.md', 'a.md'])).toBe('a.md\nseo/\n  audits/\n  README.md')
  })
})

describe('arborescence', () => {
  it('chaque besoin du référentiel a ses dossiers, et chaque gabarit est valide', () => {
    for (const b of profiles.besoins) expect(DOSSIERS_BESOIN[b.id]?.length, b.id).toBeGreaterThan(0)
    expect(Object.keys(DOSSIERS_BESOIN).sort()).toEqual(profiles.besoins.map((b) => b.id).sort())
    for (const g of Object.values(GABARITS)) for (const d of g.dossiers) expect(d).toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)*$/)
    for (const liste of Object.values(DOSSIERS_BESOIN)) for (const d of liste) expect(d).toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)*$/)
  })

  it('combine gabarit et besoins sans doublon, avec un README par dossier de premier niveau si demandé', () => {
    const p = planArborescence({ gabarit: 'juridique', extras: ['Seo/audits', 'mes-notes'], besoins: ['seo', 'seo'], readme: true }, profiles)
    expect(p.dossiers).toEqual(expect.arrayContaining(['dossiers', 'modeles', 'veille', 'seo/mots-cles', 'seo/audits', 'mes-notes']))
    expect(p.dossiers.filter((d) => d.toLowerCase() === 'seo/audits')).toHaveLength(1)
    expect(p.readmes.map((r) => r.chemin).sort()).toEqual(['dossiers/README.md', 'mes-notes/README.md', 'modeles/README.md', 'seo/README.md', 'veille/README.md'])
    expect(planArborescence({ gabarit: 'juridique', extras: [], besoins: [], readme: false }, profiles).readmes).toEqual([])
  })

  it('un gabarit inconnu ou une propriété interne retombe sur « aucune arborescence »', () => {
    for (const g of ['inconnu', 'constructor', '__proto__']) {
      expect(planArborescence({ gabarit: g, extras: [], besoins: [], readme: false }, profiles).dossiers).toEqual([])
    }
  })
})

describe('manifestes illisibles', () => {
  let banc: Banc
  beforeEach(async () => {
    banc = await creerBanc()
  })
  afterEach(() => banc.nettoyer())

  it('un fichier abîmé est signalé sans arrêter la lecture des autres', async () => {
    const dossier = join(banc.donnees, 'applications')
    await mkdir(dossier, { recursive: true })
    await writeFile(join(dossier, 'abime-0001.json'), '{ pas du json')
    await writeFile(join(dossier, 'faux-0002.json'), JSON.stringify({ version: 1, id: 'faux-0002' }))
    await writeFile(join(dossier, 'notes.txt'), 'étranger')
    const r = await lireManifestes(banc.donnees)
    expect(r.manifestes).toEqual([])
    expect(r.illisibles.sort()).toEqual(['abime-0001.json', 'faux-0002.json'])
  })

  it('un dossier d\'applications absent n\'est pas une erreur', async () => {
    expect(await lireManifestes(join(banc.base, 'rien'))).toEqual({ manifestes: [], illisibles: [] })
  })
})
