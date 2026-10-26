import { describe, expect, it } from 'vitest'
import { extraireSkill } from '../src/main/ai/prompt'
import { lireSkillMd, sansEnveloppeCode, slugLibre, slugifier } from '../src/main/core/skillmd'
import { SLUG_RE } from '../src/shared/schemas/catalog'

describe('lireSkillMd', () => {
  it('lit le nom et la description d’un en-tête ordinaire', () => {
    expect(lireSkillMd('---\nname: seo-local\ndescription: Améliorer le référencement local\n---\n\n# Titre\n\nCorps\n')).toEqual({
      name: 'seo-local',
      description: 'Améliorer le référencement local',
      corps: '\n# Titre\n\nCorps\n'
    })
  })

  it('gère une description multiligne et des guillemets', () => {
    const lu = lireSkillMd('---\nname: "a"\ndescription: >\n  Première ligne\n  seconde ligne\n---\ncorps')
    expect(lu.description).toBe('Première ligne seconde ligne')
  })

  it('un fichier sans en-tête rend le texte entier comme corps', () => {
    expect(lireSkillMd('# Juste un titre\n')).toEqual({ name: null, description: null, corps: '# Juste un titre\n' })
  })

  it('refuse les alias YAML (expansion exponentielle) sans planter ni geler', () => {
    const bombe = ['a: &a ["x","x","x","x","x","x","x","x","x"]', ...'bcdefghij'.split('').map((c, i) => `${c}: &${c} [${'*' + 'abcdefghi'[i]},'.repeat(9)}]`), 'name: *j'].join('\n')
    const debut = Date.now()
    const lu = lireSkillMd(`---\n${bombe}\n---\ncorps`)
    expect(Date.now() - debut).toBeLessThan(1000)
    expect(lu.name).toBeNull()
  })

  it('un alias YAML, même simple, est refusé : l’en-tête n’est pas lu', () => {
    expect(lireSkillMd('---\nbase: &n seo-local\nname: *n\n---\ncorps').name).toBeNull()
  })

  it('ignore les valeurs qui ne sont pas du texte et un en-tête illisible ou démesuré', () => {
    expect(lireSkillMd('---\nname: [1, 2]\ndescription: 42\n---\ncorps')).toMatchObject({ name: null, description: null })
    expect(lireSkillMd('---\nname: : : [\n---\ncorps')).toMatchObject({ name: null })
    expect(lireSkillMd(`---\nname: ${'x'.repeat(9000)}\n---\ncorps`).name).toBeNull()
  })

  it('ne se laisse pas piéger par des clés spéciales', () => {
    const lu = lireSkillMd('---\n__proto__: {x: 1}\nname: ok\n---\ncorps')
    expect(lu.name).toBe('ok')
    expect(({} as Record<string, unknown>)['x']).toBeUndefined()
  })
})

describe('slugifier et slugLibre', () => {
  it.each([
    ['Référencement local', 'referencement-local'],
    ['  Mon  Skill !! ', 'mon-skill'],
    ['ÉCRIRE un e-mail', 'ecrire-un-e-mail'],
    ['../../etc/passwd', 'etc-passwd'],
    ['💥', 'skill'],
    ['', 'skill'],
    ['con', 'con']
  ])('%j → %j', (entree, attendu) => {
    expect(slugifier(entree)).toBe(attendu)
    expect(SLUG_RE.test(slugifier(entree))).toBe(true)
  })

  it('reste sous 64 caractères et ne finit pas par un tiret', () => {
    const slug = slugifier(`${'a'.repeat(63)} bbb`)
    expect(slug.length).toBeLessThanOrEqual(64)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('rend un identifiant libre', () => {
    expect(slugLibre('seo', ['a', 'b'])).toBe('seo')
    expect(slugLibre('seo', ['seo'])).toBe('seo-2')
    expect(slugLibre('seo', ['seo', 'seo-2'])).toBe('seo-3')
    const long = 'x'.repeat(64)
    expect(slugLibre(long, [long]).length).toBeLessThanOrEqual(64)
  })
})

describe('réponse d’une IA', () => {
  it('retire l’enveloppe de code', () => {
    expect(sansEnveloppeCode('```markdown\n---\nname: a\n---\ncorps\n```')).toBe('---\nname: a\n---\ncorps')
    expect(sansEnveloppeCode('pas de code')).toBe('pas de code')
  })

  it('extrait nom, description et corps ; complète avec le sujet quand il manque quelque chose', () => {
    const r = extraireSkill('```md\n---\nname: relire-un-contrat\ndescription: Relire un contrat clause par clause.\n---\n\n# Relire un contrat\n\n1. Lire\n```', 'relire un contrat')
    expect(r).toMatchObject({ slug: 'relire-un-contrat', name: 'Relire un contrat', description: 'Relire un contrat clause par clause.' })
    expect(r.corps).toContain('1. Lire')
    const brut = extraireSkill('Voici des consignes sans en-tête.', 'faire un devis')
    expect(brut).toMatchObject({ slug: 'faire-un-devis', description: 'faire un devis' })
  })
})
