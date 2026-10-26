import { mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join, parse } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  LONGUEUR_MAX_CHEMIN,
  PerimetreError,
  environnementReel,
  estDans,
  resoudreDansRacine,
  verifierCheminRelatif,
  verifierCollisions,
  verifierRacine
} from '../src/main/fs/perimetre'
import { creerBanc, ecrireFichier, type Banc } from './helpers/disque'

let banc: Banc
beforeEach(async () => {
  banc = await creerBanc()
})
afterEach(() => banc.nettoyer())

describe('chemins relatifs du plan', () => {
  it.each([
    '',
    '../evasion.md',
    'a/../../evasion.md',
    'a/./b',
    '/absolu.md',
    '\\absolu.md',
    'C:\\Windows\\x.md',
    'C:x.md',
    'a//b.md',
    'a\\b.md',
    'fichier\0.md',
    'a:flux.md',
    'a.md:flux',
    'a<b.md',
    'a|b.md',
    'a?b.md',
    'a*b.md',
    'a"b.md',
    'con',
    'CON.md',
    'a/nul/b',
    'COM1.txt',
    'lpt9',
    'aux.tar.gz',
    'fin.',
    'fin ',
    'PROGRA~1/x',
    'a\u0001b',
    `${'x'.repeat(256)}.md`
  ])('refuse %j', (rel) => {
    expect(() => verifierCheminRelatif(rel)).toThrow(PerimetreError)
  })

  it('accepte les chemins ordinaires des dispositions', () => {
    expect(verifierCheminRelatif('.claude/skills/seo-technique/SKILL.md')).toEqual(['.claude', 'skills', 'seo-technique', 'SKILL.md'])
    expect(verifierCheminRelatif('.github/copilot-instructions.md')).toHaveLength(2)
    expect(verifierCheminRelatif('seo/mots-cles')).toHaveLength(2)
  })

  it('les messages disent quoi faire et ne montrent pas de code système', () => {
    for (const rel of ['con', 'a:b', '../x', 'fin.']) {
      try {
        verifierCheminRelatif(rel)
      } catch (erreur) {
        expect((erreur as Error).message).not.toMatch(/bE[A-Z]{3,}b|errno|stack/i)
        expect((erreur as Error).message.length).toBeGreaterThan(20)
      }
    }
  })
})

describe('collisions', () => {
  it('refuse deux chemins qui ne diffèrent que par la casse', () => {
    expect(() => verifierCollisions(['seo/a.md', 'Seo/a.md'])).toThrow(/casse/)
  })
  it('refuse un chemin répété', () => {
    expect(() => verifierCollisions(['a.md', 'a.md'])).toThrow(/deux fois/)
  })
  it('accepte des chemins distincts', () => {
    expect(() => verifierCollisions(['a.md', 'b.md', 'a/b.md'])).not.toThrow()
  })
})

describe('dossier choisi', () => {
  const refuse = (dossier: string, motif: RegExp, portee: 'projet' | 'global' = 'projet') =>
    expect(verifierRacine(dossier, banc.ctx.env, portee)).rejects.toThrow(motif)

  it('accepte un dossier ordinaire et le rend résolu', async () => {
    await expect(verifierRacine(banc.projet, banc.ctx.env)).resolves.toBe(banc.projet)
  })

  it('refuse un chemin vide, relatif, avec un octet nul ou de type périphérique', async () => {
    await refuse('', /valide/)
    await refuse('   ', /valide/)
    await refuse('projet', /complète/)
    await refuse(`${banc.projet}\0x`, /valide/)
    await refuse('\\\\?\\C:\\Windows', /adresse/)
    await refuse('\\\\.\\C:', /adresse/)
  })

  it('refuse un dossier inexistant et un fichier', async () => {
    await refuse(join(banc.projet, 'nexistepas'), /n’existe pas/)
    await ecrireFichier(banc.projet, 'fichier.txt', 'x')
    await refuse(join(banc.projet, 'fichier.txt'), /pas un fichier/)
  })

  it('refuse la racine d\'un disque', async () => {
    await refuse(parse(banc.projet).root, /racine/)
  })

  it('refuse les dossiers système et ce qu\'ils contiennent', async () => {
    const [systeme] = banc.ctx.env.systeme
    await refuse(systeme!, /système/)
    await mkdir(join(systeme!, 'sous'), { recursive: true })
    await refuse(join(systeme!, 'sous'), /système/)
  })

  it('refuse les dossiers système réels de Windows', async () => {
    if (process.platform !== 'win32') return
    const env = environnementReel(banc.home, banc.donnees)
    for (const variable of ['SystemRoot', 'ProgramFiles', 'ProgramData']) {
      const dossier = process.env[variable]
      expect(dossier, variable).toBeTruthy()
      await expect(verifierRacine(dossier!, env)).rejects.toThrow(/système/)
    }
  })

  it('refuse les données de l\'application, ce qu\'elles contiennent, et ce qui les contient', async () => {
    await refuse(banc.donnees, /données/)
    await mkdir(join(banc.donnees, 'applications'), { recursive: true })
    await refuse(join(banc.donnees, 'applications'), /données/)
    await refuse(banc.base, /données/)
  })

  it('refuse le dossier personnel entier en portée projet, pas en portée globale', async () => {
    await refuse(banc.home, /personnel/)
    await expect(verifierRacine(banc.home, banc.ctx.env, 'global')).resolves.toBe(banc.home)
  })

  it('accepte un sous-dossier du dossier personnel', async () => {
    const sous = join(banc.home, 'Documents', 'Cabinet')
    await mkdir(sous, { recursive: true })
    await expect(verifierRacine(sous, banc.ctx.env)).resolves.toBe(sous)
  })

  it('suit une jonction et juge la destination : une jonction vers un dossier système est refusée', async () => {
    const [systeme] = banc.ctx.env.systeme
    const lien = join(banc.projet, 'raccourci')
    await symlink(systeme!, lien, 'junction')
    await refuse(lien, /système/)
  })
})

describe('trajet d\'un fichier dans le dossier', () => {
  const resoudre = (rel: string, attendu: 'fichier' | 'dossier' = 'fichier') => resoudreDansRacine(banc.projet, rel, banc.ctx.env, attendu)

  it('résout un chemin ordinaire, même dans des dossiers qui n\'existent pas encore', async () => {
    await expect(resoudre('.claude/skills/x/SKILL.md')).resolves.toBe(join(banc.projet, '.claude', 'skills', 'x', 'SKILL.md'))
  })

  it('refuse de passer par une jonction, même vers un dossier voisin sans danger', async () => {
    const dehors = join(banc.base, 'dehors')
    await mkdir(dehors)
    await symlink(dehors, join(banc.projet, '.claude'), 'junction')
    await expect(resoudre('.claude/skills/x/SKILL.md')).rejects.toThrow(/raccourci/)
  })

  it('refuse une jonction posée en bout de trajet', async () => {
    const dehors = join(banc.base, 'dehors')
    await mkdir(dehors)
    await mkdir(join(banc.projet, '.claude'))
    await symlink(dehors, join(banc.projet, '.claude', 'skills'), 'junction')
    await expect(resoudre('.claude/skills')).rejects.toThrow(/raccourci/)
  })

  it('un lien cassé sur le trajet bloque l\'opération', async () => {
    const cible = join(banc.base, 'disparu')
    await mkdir(cible)
    await symlink(cible, join(banc.projet, '.claude'), 'junction')
    await rm(cible, { recursive: true })
    await expect(resoudre('.claude/skills/x/SKILL.md')).rejects.toThrow(/raccourci/)
  })

  it('un lien symbolique de fichier est refusé quand le système le permet', async () => {
    const cible = join(banc.base, 'secret.txt')
    await writeFile(cible, 'secret')
    try {
      await symlink(cible, join(banc.projet, 'lien.md'), 'file')
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code === 'EPERM') return // création de liens non autorisée sur ce poste
      throw erreur
    }
    await expect(resoudre('lien.md')).rejects.toThrow(/raccourci/)
  })

  it('refuse un dossier existant dont la casse diffère', async () => {
    await mkdir(join(banc.projet, 'Skills'))
    await expect(resoudre('skills/x.md')).rejects.toThrow(/casse différente/)
  })

  it('refuse un fichier là où un dossier est attendu, et l\'inverse', async () => {
    await ecrireFichier(banc.projet, 'seo', 'je suis un fichier')
    await expect(resoudre('seo/a.md')).rejects.toThrow(/est un fichier/)
    await expect(resoudre('seo', 'dossier')).rejects.toThrow(/est un fichier/)
    await mkdir(join(banc.projet, 'dossier'))
    await expect(resoudre('dossier')).rejects.toThrow(/est un dossier/)
  })

  it('refuse un chemin trop long pour Windows', async () => {
    const long = Array.from({ length: Math.ceil(LONGUEUR_MAX_CHEMIN / 20) + 1 }, () => 'a'.repeat(19)).join('/')
    await expect(resoudre(`${long}/f.md`)).rejects.toThrow(/trop long/)
  })

  it('refuse un fichier du plan qui retomberait dans les données de l\'application', async () => {
    // Dossier choisi valide, mais un lien de jonction vers les données est déjà refusé ; ici on vérifie la garde finale
    expect(estDans(banc.donnees, join(banc.donnees, 'applications', 'x.json'))).toBe(true)
    expect(estDans(banc.donnees, banc.projet)).toBe(false)
  })
})
