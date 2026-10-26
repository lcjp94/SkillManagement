import { describe, expect, it } from 'vitest'
import { COUVERTURE_MIN, couverture, lienAvecBesoin, pistesPourLacune, trouverBesoin } from '../src/main/core/besoins'
import { conseiller } from '../src/main/core/recommend'
import { contientExpression, motsDuTexte } from '../src/main/core/texte'
import { getCatalogue } from '../src/shared/data'
import { SLUG_RE } from '../src/shared/schemas/catalog'

const { skills, profiles } = getCatalogue()
const besoin = (id: string) => trouverBesoin(profiles, id)!

describe('référentiel des besoins', () => {
  it('chaque besoin a un identifiant valide, unique, et des catégories qui existent dans le catalogue', () => {
    const categories = new Set(skills.map((s) => s.category))
    const ids = profiles.besoins.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const b of profiles.besoins) {
      expect(b.id, b.id).toMatch(SLUG_RE)
      for (const c of b.categories) expect(categories.has(c), `${b.id} : catégorie ${c}`).toBe(true)
    }
  })

  it('contient les besoins de CLAUDE.md § 8.2', () => {
    for (const id of ['seo', 'reseaux-sociaux', 'redaction-web', 'newsletter', 'veille', 'analyse-donnees', 'presentations', 'video',
      'gestion-projet', 'qualite-code', 'securite-code', 'deploiement', 'juridique', 'enseignement', 'rh', 'finance']) {
      expect(trouverBesoin(profiles, id), id).toBeDefined()
    }
  })
})

describe('comparaison de textes', () => {
  it('compare des mots entiers, sans accents ni casse, au singulier comme au pluriel', () => {
    const texte = motsDuTexte('Audit SEO : mots-clés et Référencement naturel')
    expect(contientExpression(texte, 'seo')).toBe(true)
    expect(contientExpression(texte, 'mots-clé')).toBe(true)
    expect(contientExpression(texte, 'referencement')).toBe(true)
    expect(contientExpression(texte, 'naturel')).toBe(true)
  })

  it('ne trouve pas un mot au milieu d\'un autre', () => {
    expect(contientExpression(motsDuTexte('diseo et seon'), 'seo')).toBe(false)
    expect(contientExpression(motsDuTexte('texte'), '')).toBe(false)
  })
})

describe('lienAvecBesoin', () => {
  const par = (slug: string) => skills.find((s) => s.slug === slug)!

  it('une catégorie suffit pour un besoin sans mots-clés', () => {
    expect(lienAvecBesoin(besoin('juridique'), par('revue-contrat'))).toBe('categorie')
    expect(lienAvecBesoin(besoin('juridique'), par('seo-technique'))).toBeNull()
  })

  it('pour un besoin à mots-clés, la catégorie seule ne suffit pas', () => {
    // content-marketing est du marketing, mais ne parle pas de référencement
    expect(par('content-marketing').category).toBe('marketing')
    expect(lienAvecBesoin(besoin('seo'), par('content-marketing'))).toBeNull()
  })

  it('un mot-clé hors catégorie donne un lien plus faible', () => {
    expect(lienAvecBesoin(besoin('seo'), par('seo-technique'))).toBe('categorie-et-mot')
    expect(lienAvecBesoin(besoin('seo'), par('youtube-seo-miniatures'))).toBe('mot')
  })
})

describe('couverture et lacunes', () => {
  const retenus = (...slugs: string[]) => slugs.map((slug) => ({ slug, ecarte: false }))

  it('compte les skills retenus par besoin et signale ce qui manque', () => {
    const [seo, social] = couverture(['seo', 'reseaux-sociaux'], retenus('seo-technique', 'x-threads', 'personal-branding'), skills, profiles)
    expect(seo).toMatchObject({ besoin: 'seo', retenus: ['seo-technique'], lacune: true, manque: 1 })
    expect(social).toMatchObject({ besoin: 'reseaux-sociaux', lacune: false, manque: 0 })
    expect(social?.retenus).toHaveLength(2)
  })

  it('un skill écarté ne compte pas, mais reste signalé comme disponible', () => {
    const [seo] = couverture(['seo'], [{ slug: 'seo-technique', ecarte: true }, { slug: 'redaction-contenu-web', ecarte: false }], skills, profiles)
    expect(seo?.retenus).toEqual(['redaction-contenu-web'])
    expect(seo?.disponibles).toContain('seo-technique')
  })

  it('ignore un besoin inconnu et ne compte pas deux fois un besoin répété', () => {
    expect(couverture(['inconnu', 'seo', 'seo'], [], skills, profiles)).toHaveLength(1)
  })

  it('propose d\'abord les bibliothèques existantes, puis l\'IA seulement si elle est configurée', () => {
    expect(pistesPourLacune(besoin('newsletter'), { iaConfiguree: false }).map((p) => p.type)).toEqual(['bibliotheques'])
    expect(pistesPourLacune(besoin('newsletter'), { iaConfiguree: true }).map((p) => p.type)).toEqual(['bibliotheques', 'ia'])
    expect(pistesPourLacune(besoin('seo'), { iaConfiguree: false })[0]).toMatchObject({ requete: expect.stringContaining('seo') })
  })
})

describe('ce que le catalogue couvre vraiment', () => {
  // Constat mesuré, à tenir à jour avec docs/BESOINS.md : ajouter un skill au catalogue doit faire évoluer ce tableau.
  const attendu: Record<string, number> = {
    seo: 3, 'reseaux-sociaux': 8, 'redaction-web': 1, newsletter: 0, veille: 7, 'analyse-donnees': 9, presentations: 1, video: 7,
    'gestion-projet': 5, 'qualite-code': 13, 'securite-code': 5, deploiement: 5, juridique: 4, enseignement: 4, rh: 4, finance: 4
  }

  it('correspond au tableau de docs/BESOINS.md', () => {
    const mesure = Object.fromEntries(profiles.besoins.map((b) => [b.id, skills.filter((s) => lienAvecBesoin(b, s)).length]))
    expect(mesure).toEqual(attendu)
  })

  it('les lacunes du catalogue sont le blog, la newsletter et les présentations', () => {
    const lacunes = profiles.besoins.filter((b) => (attendu[b.id] ?? 0) < COUVERTURE_MIN).map((b) => b.id)
    expect(lacunes).toEqual(['redaction-web', 'newsletter', 'presentations'])
  })
})

describe('scénario : juriste qui veut du SEO et publier sur les réseaux sociaux', () => {
  const demande = { nature: 'juriste', objectives: [], environments: ['claude-code'], besoins: ['seo', 'reseaux-sociaux'] }
  const slugsDe = (level: string) => conseiller({ ...demande, level }, skills, profiles).items.map((i) => i.slug)

  it.each(['debutant', 'intermediaire', 'expert'])('couvre les deux besoins par au moins deux skills chacun (%s)', (level) => {
    const retenus = slugsDe(level).map((slug) => ({ slug, ecarte: false }))
    for (const c of couverture(demande.besoins, retenus, skills, profiles)) {
      expect(c.retenus.length, `${level} / ${c.besoin}`).toBeGreaterThanOrEqual(COUVERTURE_MIN)
      expect(c.lacune).toBe(false)
    }
  })

  it('garde aussi le métier : au moins un skill juridique', () => {
    for (const level of ['debutant', 'intermediaire', 'expert']) {
      const juridiques = slugsDe(level).filter((slug) => skills.find((s) => s.slug === slug)?.category === 'juridique')
      expect(juridiques.length, level).toBeGreaterThanOrEqual(1)
    }
  })

  it('respecte les plafonds du niveau débutant (6 skills, 2 par catégorie, 2 500 tokens)', () => {
    const r = conseiller({ ...demande, level: 'debutant' }, skills, profiles)
    expect(r.items.length).toBeLessThanOrEqual(6)
    expect(r.totalTokens).toBeLessThanOrEqual(2500)
  })

  it('explique chaque skill de besoin par une raison qui nomme le besoin', () => {
    const r = conseiller({ ...demande, level: 'debutant' }, skills, profiles)
    const seo = r.items.find((i) => i.slug === 'seo-technique')
    expect(seo?.reasons).toContain('Répond à votre besoin « Référencement (SEO) »')
    expect(seo?.besoins).toEqual(['seo'])
  })

  it('un skill destiné à d\'autres métiers n\'est pas pénalisé quand il répond à un besoin exprimé', () => {
    // seo-technique vise marketeur et développeur : sans cette règle, −15 le ferait disparaître pour une juriste
    expect(slugsDe('debutant')).toContain('seo-technique')
  })

  it('score exact d\'un skill de besoin : besoin 50 + niveau 10 + assistant 10, sans pénalité de métier', () => {
    const r = conseiller({ ...demande, level: 'debutant' }, skills, profiles)
    expect(r.items.find((i) => i.slug === 'seo-technique')?.score).toBe(70)
  })

  it('trois besoins au niveau débutant : chacun reste couvert deux fois, quitte à laisser le métier de côté', () => {
    // 6 places : sans réservation par besoin, le classement général laisserait un besoin à 1 skill, voire 0
    const besoins = ['seo', 'reseaux-sociaux', 'veille']
    const r = conseiller({ ...demande, besoins, level: 'debutant' }, skills, profiles)
    const retenus = r.items.map((i) => ({ slug: i.slug, ecarte: false }))
    for (const c of couverture(besoins, retenus, skills, profiles)) expect(c.retenus.length, c.besoin).toBeGreaterThanOrEqual(COUVERTURE_MIN)
    expect(r.items).toHaveLength(6)
  })

  it('n\'est pas affecté par les besoins : sans besoin, le résultat est celui du moteur de la première version', () => {
    const sans = conseiller({ ...demande, besoins: [], level: 'debutant' }, skills, profiles)
    const absent = conseiller({ nature: 'juriste', objectives: [], environments: ['claude-code'], level: 'debutant' }, skills, profiles)
    expect(sans).toEqual(absent)
  })

  it('les besoins pèsent plus que le métier : le SEO est proposé même à un métier très éloigné', () => {
    const r = conseiller({ ...demande, nature: 'enseignant', level: 'debutant' }, skills, profiles)
    expect(r.items.map((i) => i.slug)).toContain('seo-technique')
  })

  it('un besoin sans skill (newsletter) ne fait rien proposer de faux', () => {
    const r = conseiller({ ...demande, besoins: ['newsletter'], level: 'debutant' }, skills, profiles)
    expect(r.items.every((i) => !i.besoins)).toBe(true)
  })
})

describe('compléments', () => {
  const base = { nature: 'juriste', level: 'intermediaire', objectives: [], environments: ['claude-code'], besoins: ['seo', 'reseaux-sociaux'] }

  it('ne propose jamais un skill déjà retenu ni un skill écarté', () => {
    const complet = conseiller(base, skills, profiles).items.map((i) => i.slug)
    const dejaPresents = complet.slice(0, 3)
    const ecartes = complet.slice(3, 5)
    const complement = conseiller({ ...base, dejaPresents, ecartes }, skills, profiles).items.map((i) => i.slug)
    for (const slug of [...dejaPresents, ...ecartes]) expect(complement).not.toContain(slug)
  })

  it('respecte ce qui reste des plafonds : les skills déjà retenus occupent leur place', () => {
    const plein = conseiller({ ...base, level: 'debutant' }, skills, profiles).items.map((i) => i.slug)
    const reste = conseiller({ ...base, level: 'debutant', dejaPresents: plein.slice(0, 5) }, skills, profiles)
    expect(reste.items.length).toBeLessThanOrEqual(1)
    expect(reste.totalTokens).toBeLessThanOrEqual(2500)
  })

  it('un projet complet ne se voit rien proposer de plus', () => {
    const plein = conseiller({ ...base, level: 'debutant' }, skills, profiles).items.map((i) => i.slug)
    expect(conseiller({ ...base, level: 'debutant', dejaPresents: plein }, skills, profiles).items).toEqual([])
  })

  it('tient compte de la couverture déjà acquise : un besoin couvert n\'est pas renforcé en priorité', () => {
    const sociaux = skills.filter((s) => s.category === 'réseaux sociaux').slice(0, 2).map((s) => s.slug)
    const r = conseiller({ ...base, level: 'debutant', dejaPresents: sociaux }, skills, profiles).items.map((i) => i.slug)
    expect(r).toContain('seo-technique')
  })

  it('ignore un slug inconnu parmi les skills déjà retenus', () => {
    expect(() => conseiller({ ...base, dejaPresents: ['n-existe-pas'] }, skills, profiles)).not.toThrow()
  })
})
