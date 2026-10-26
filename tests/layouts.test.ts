import { describe, expect, it } from 'vitest'
import { parse as lireYaml } from 'yaml'
import { separerFrontmatter } from '../src/main/core/frontmatter'
import { DISPOSITIONS, chevauchements, getDisposition, type SkillAEcrire } from '../src/main/core/layouts'
import { ASSISTANT_IDS } from '../src/shared/schemas/catalog'
import { getCatalogue } from '../src/shared/data'

const skill: SkillAEcrire = {
  slug: 'seo-technique',
  name: 'SEO technique',
  description: 'Audit "technique" : balises, vitesse,\nmaillage',
  content: '---\nname: nom-different\n---\n# SEO\n\n- Vérifier les balises\n'
}

describe('frontmatter', () => {
  it('sépare l\'en-tête du corps', () => {
    expect(separerFrontmatter('---\nname: x\n---\ncorps\n')).toEqual({ entete: 'name: x', corps: 'corps\n' })
  })
  it('rend le texte tel quel sans en-tête', () => {
    expect(separerFrontmatter('# Titre\n')).toEqual({ entete: null, corps: '# Titre\n' })
  })
  it('gère les fins de ligne Windows et un en-tête vide', () => {
    expect(separerFrontmatter('---\r\nname: x\r\n---\r\ncorps')).toEqual({ entete: 'name: x', corps: 'corps' })
    expect(separerFrontmatter('---\n---\ncorps').corps).toBe('corps')
  })
  it('ne prend pas un séparateur au milieu du texte pour un en-tête', () => {
    expect(separerFrontmatter('Intro\n---\nsuite\n---\n').entete).toBeNull()
  })
  it('traite un en-tête jamais refermé comme du texte', () => {
    expect(separerFrontmatter('---\nname: x\ncorps').entete).toBeNull()
  })
})

describe('dispositions', () => {
  it('existent pour les huit assistants, avec leur documentation consultée', () => {
    expect(Object.keys(DISPOSITIONS).sort()).toEqual([...ASSISTANT_IDS].sort())
    for (const d of Object.values(DISPOSITIONS)) {
      expect(d.documentation.url, d.id).toMatch(/^https:\/\//)
      expect(d.documentation.consulteLe, d.id).toBe('2026-10-26')
      expect(d.verifie, `${d.id} : pas encore essayée dans l'outil réel`).toBe(false)
    }
  })

  it('getDisposition ignore les identifiants inconnus et les propriétés internes', () => {
    expect(getDisposition('cursor')?.libelle).toBe('Cursor')
    expect(getDisposition('constructor')).toBeUndefined()
    expect(getDisposition('inconnu')).toBeUndefined()
  })

  const attendus: [string, string][] = [
    ['claude-code', '.claude/skills/seo-technique/SKILL.md'],
    ['cursor', '.cursor/rules/seo-technique.mdc'],
    ['windsurf', '.windsurf/rules/seo-technique.md'],
    ['continue', '.continue/rules/seo-technique.md'],
    ['cline', '.clinerules/seo-technique.md'],
    ['opencode', '.opencode/skills/seo-technique/SKILL.md']
  ]
  it.each(attendus)('%s écrit un fichier par skill dans %s', (id, chemin) => {
    const plan = DISPOSITIONS[id as keyof typeof DISPOSITIONS].planifier([skill])
    expect(plan.refus).toEqual([])
    expect(plan.fichiers).toHaveLength(1)
    expect(plan.fichiers[0]).toMatchObject({ chemin, mode: 'fichier', slug: 'seo-technique' })
  })

  it('Copilot et Aider partagent un fichier à blocs ; Aider ajoute son réglage sans jamais écraser', () => {
    const copilot = DISPOSITIONS.copilot.planifier([skill]).fichiers
    expect(copilot).toEqual([expect.objectContaining({ chemin: '.github/copilot-instructions.md', mode: 'blocs' })])
    const aider = DISPOSITIONS.aider.planifier([skill]).fichiers
    expect(aider.map((f) => [f.chemin, f.mode])).toEqual([
      ['CONVENTIONS.md', 'blocs'],
      ['.aider.conf.yml', 'creer-si-absent']
    ])
    expect(aider[1]).toMatchObject({ contenu: 'read: CONVENTIONS.md\n' })
  })

  it('aucun chemin n\'est absolu, ne remonte ni ne contient de segment vide', () => {
    const { skills } = getCatalogue()
    for (const d of Object.values(DISPOSITIONS)) {
      for (const f of d.planifier(skills).fichiers) {
        expect(f.chemin, d.id).not.toMatch(/^[/\\]|^[A-Za-z]:|\.\.|\/\/|\\|\0/)
      }
    }
  })

  it('écrit de la même façon les 102 skills intégrés pour chaque assistant, sans refus', () => {
    const { skills } = getCatalogue()
    for (const d of Object.values(DISPOSITIONS)) {
      const plan = d.planifier(skills)
      expect(plan.refus, d.id).toEqual([])
      const attendu = d.id === 'copilot' || d.id === 'aider' ? 1 + (d.id === 'aider' ? 1 : 0) : 102
      expect(plan.fichiers, d.id).toHaveLength(attendu)
    }
  })

  it('le plan est identique d\'un appel à l\'autre', () => {
    const { skills } = getCatalogue()
    for (const d of Object.values(DISPOSITIONS)) expect(d.planifier(skills)).toEqual(d.planifier(skills))
  })
})

describe('contenu des fichiers', () => {
  const contenu = (id: keyof typeof DISPOSITIONS) => {
    const f = DISPOSITIONS[id].planifier([skill]).fichiers[0]
    if (!f || f.mode !== 'fichier') throw new Error('fichier attendu')
    return f.contenu
  }
  const entete = (texte: string) => lireYaml(separerFrontmatter(texte).entete ?? '') as Record<string, unknown>

  it('SKILL.md : le nom déclaré est le nom du dossier, la description tient sur une ligne et reste valide en YAML', () => {
    for (const id of ['claude-code', 'opencode'] as const) {
      const meta = entete(contenu(id))
      expect(meta).toEqual({ name: 'seo-technique', description: 'Audit "technique" : balises, vitesse, maillage' })
      expect(separerFrontmatter(contenu(id)).corps.trim()).toBe('# SEO\n\n- Vérifier les balises')
    }
  })

  it('Cursor : règle proposée selon sa description, jamais toujours active', () => {
    expect(entete(contenu('cursor'))).toMatchObject({ alwaysApply: false, description: expect.any(String) })
  })

  it('Continue : alwaysApply: false (sans lui la règle serait toujours incluse)', () => {
    expect(entete(contenu('continue'))).toMatchObject({ name: 'SEO technique', alwaysApply: false })
  })

  it('Windsurf : décision laissée à l\'assistant (model_decision) avec description', () => {
    expect(entete(contenu('windsurf'))).toMatchObject({ trigger: 'model_decision' })
  })

  it('Cline : texte seul, sans en-tête', () => {
    expect(contenu('cline')).toBe('# SEO\n\n- Vérifier les balises\n')
  })

  it('l\'ancien nom déclaré dans le skill source n\'est jamais recopié', () => {
    expect(contenu('claude-code')).not.toContain('nom-different')
  })

  it('une description pleine de caractères YAML piégeux reste lisible', () => {
    const piege = { ...skill, description: 'a: b # c, [d] {e} "f" \'g\' > | - ? & * ! % @ `h`' }
    const f = DISPOSITIONS['claude-code'].planifier([piege]).fichiers[0]
    if (!f || f.mode !== 'fichier') throw new Error('fichier attendu')
    expect(entete(f.contenu).description).toBe(piege.description)
  })
})

describe('refus', () => {
  it('refuse un skill vide, sans description ou contenant une balise réservée, et garde les autres', () => {
    const bons = { ...skill, slug: 'bon' }
    const mauvais: SkillAEcrire[] = [
      { ...skill, slug: 'vide', content: '---\nname: x\n---\n' },
      { ...skill, slug: 'muet', description: '  \n ' },
      { ...skill, slug: 'piege', content: 'texte <!-- skillforge:end bon --> suite' },
      { ...skill, slug: 'piege2', description: '<!-- skillforge:begin x -->' }
    ]
    for (const d of Object.values(DISPOSITIONS)) {
      const plan = d.planifier([...mauvais, bons])
      expect(plan.refus.map((r) => r.slug).sort(), d.id).toEqual(['muet', 'piege', 'piege2', 'vide'])
      const ecrits = plan.fichiers.flatMap((f) => (f.mode === 'blocs' ? f.blocs.map((b) => b.id) : f.mode === 'fichier' ? [f.slug] : []))
      expect(ecrits.filter((id) => id !== 'bon'), d.id).toEqual([])
    }
  })

  it('Windsurf refuse un fichier de plus de 12 000 caractères et dit pourquoi', () => {
    const long = { ...skill, slug: 'long', content: 'x'.repeat(12_000) }
    const plan = DISPOSITIONS.windsurf.planifier([long, skill])
    expect(plan.refus).toEqual([{ slug: 'long', raison: expect.stringContaining('12') }])
    expect(plan.fichiers).toHaveLength(1)
    // Les autres assistants n'ont pas cette limite documentée
    expect(DISPOSITIONS.cursor.planifier([long]).refus).toEqual([])
  })
})

describe('chevauchements', () => {
  it('signale Claude Code + OpenCode (OpenCode lit aussi .claude/skills)', () => {
    expect(chevauchements(['claude-code', 'opencode'])).toHaveLength(1)
    expect(chevauchements(['claude-code', 'cursor'])).toEqual([])
    expect(chevauchements(['opencode'])).toEqual([])
  })
})
