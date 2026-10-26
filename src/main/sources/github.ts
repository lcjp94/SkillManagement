// Recherche et import de skills depuis des dépôts GitHub publics. Seuls api.github.com et raw.githubusercontent.com
// sont contactés ; aucune adresse saisie par la personne n'est suivie telle quelle (un dépôt « propriétaire/nom » ou une
// adresse GitHub reconnue, convertie en dépôt et chemin validés).
import { createHash } from 'node:crypto'
import { lireSkillMd, type SkillLu } from '../core/skillmd'
import { ReseauError, requeteBornee, type Fetch } from '../ai/http'

export interface SourceDefaut {
  repo: string
  libelle: string
}

// Reprise de la première version. Aucun de ces dépôts n'est redistribué : leurs skills ne sont téléchargés que sur
// demande de la personne, qui voit la licence déclarée avant d'importer.
export const SOURCES_PAR_DEFAUT: SourceDefaut[] = [
  { repo: 'anthropics/skills', libelle: 'Anthropic (officiel)' },
  { repo: 'ComposioHQ/awesome-claude-skills', libelle: 'Composio : awesome-claude-skills' },
  { repo: 'github/awesome-copilot', libelle: 'GitHub : awesome-copilot' }
]

export interface ReferenceSkill {
  repo: string
  path: string
}

export interface SkillDistant extends ReferenceSkill {
  name: string
  description: string
  url: string
}

export interface ConfigSources {
  apiBase: string
  rawBase: string
  fetchImpl?: Fetch
  maintenant?: () => number
}

export const CONFIG_PAR_DEFAUT: ConfigSources = { apiBase: 'https://api.github.com', rawBase: 'https://raw.githubusercontent.com' }

const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/
const CHEMIN = /^[A-Za-z0-9_. @()+,=~-]+(?:\/[A-Za-z0-9_. @()+,=~-]+)*$/
const TAILLE_FICHIER_MAX = 200_000
const DUREE_CACHE_MS = 60 * 60_000
const LIMITE_DEPOT = 400

export const estDepotValide = (repo: string): boolean => REPO.test(repo) && !repo.split('/').some((p) => p === '.' || p === '..')

export function estCheminValide(chemin: string): boolean {
  return chemin.length <= 300 && CHEMIN.test(chemin) && !chemin.split('/').some((p) => p === '.' || p === '..') && /\.md$/i.test(chemin)
}

export const empreinte = (texte: string): string => createHash('sha256').update(texte, 'utf8').digest('hex')

/** Reconnaît une adresse GitHub (page d'un fichier ou fichier brut) et la convertit en dépôt et chemin validés. */
export function lireAdresseGithub(adresse: string): ReferenceSkill | null {
  const m = adresse.trim().match(/^https:\/\/(?:github\.com\/([^/]+\/[^/]+)\/(?:blob|tree)\/[^/]+\/(.+)|raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/[^/]+\/(.+))$/)
  if (!m) return null
  const repo = (m[1] ?? m[3])!
  let chemin: string
  try {
    chemin = decodeURIComponent((m[2] ?? m[4])!.split(/[?#]/)[0]!).replace(/\/$/, '')
  } catch {
    return null
  }
  if (!/\.md$/i.test(chemin)) chemin = `${chemin}/SKILL.md`
  return estDepotValide(repo) && estCheminValide(chemin) ? { repo, path: chemin } : null
}

const dossierDe = (chemin: string): string => {
  const parts = chemin.split('/')
  return parts.length > 1 ? parts[parts.length - 2]! : chemin.replace(/\.md$/i, '')
}

export class Sources {
  private readonly cache = new Map<string, { a: number; valeur: unknown }>()
  private readonly origines: Set<string>

  constructor(private readonly config: ConfigSources = CONFIG_PAR_DEFAUT) {
    this.origines = new Set([new URL(config.apiBase).origin, new URL(config.rawBase).origin])
  }

  private maintenant(): number {
    return (this.config.maintenant ?? Date.now)()
  }

  private enCache<T>(cle: string): T | undefined {
    const c = this.cache.get(cle)
    return c && this.maintenant() - c.a < DUREE_CACHE_MS ? (c.valeur as T) : undefined
  }

  private async demander(adresse: string, accept: string, tailleMax: number): Promise<{ statut: number; corps: string }> {
    const r = await requeteBornee(
      adresse,
      { headers: { Accept: accept, 'User-Agent': 'SkillManagement' } },
      {
        delaiMs: 15_000,
        tailleMax,
        fetchImpl: this.config.fetchImpl,
        // Seules les deux adresses de GitHub sont contactées, redirections comprises
        controler: async (u) => {
          if (!this.origines.has(u.origin)) throw new ReseauError('Adresse non autorisée.')
        }
      }
    )
    if (r.statut === 403 || r.statut === 429) throw new ReseauError('GitHub limite le nombre de demandes sans compte. Réessayez dans une heure.')
    return { statut: r.statut, corps: r.corps }
  }

  private async api<T>(chemin: string, introuvable: string): Promise<T> {
    const { statut, corps } = await this.demander(`${this.config.apiBase}${chemin}`, 'application/vnd.github+json', 5_000_000)
    if (statut === 404) throw new ReseauError(introuvable, 404)
    if (statut !== 200) throw new ReseauError('GitHub a répondu de façon inattendue. Réessayez plus tard.', statut)
    try {
      return JSON.parse(corps) as T
    } catch {
      throw new ReseauError('GitHub a répondu de façon inattendue. Réessayez plus tard.')
    }
  }

  /** Chemins des SKILL.md d'un dépôt (un seul appel, gardé une heure). */
  async lister(repo: string): Promise<{ chemins: string[]; tronque: boolean }> {
    if (!estDepotValide(repo)) throw new ReseauError('Ce nom de dépôt n’est pas valide : écrivez « propriétaire/nom ».')
    const cle = `arbre:${repo}`
    const deja = this.enCache<{ chemins: string[]; tronque: boolean }>(cle)
    if (deja) return deja
    const arbre = await this.api<{ tree?: { path?: string; type?: string }[]; truncated?: boolean }>(
      `/repos/${repo}/git/trees/HEAD?recursive=1`,
      'Dépôt introuvable. Vérifiez le nom, ou le dépôt est privé.'
    )
    const chemins = (arbre.tree ?? [])
      .filter((n) => n.type === 'blob' && typeof n.path === 'string' && /(^|\/)skill\.md$/i.test(n.path) && estCheminValide(n.path))
      .map((n) => n.path!)
      .slice(0, LIMITE_DEPOT)
    const valeur = { chemins, tronque: Boolean(arbre.truncated) || chemins.length >= LIMITE_DEPOT }
    this.cache.set(cle, { a: this.maintenant(), valeur })
    return valeur
  }

  /** Texte d'un fichier du dépôt, limité à 200 Ko. */
  async lireFichier(ref: ReferenceSkill): Promise<string> {
    if (!estDepotValide(ref.repo) || !estCheminValide(ref.path)) throw new ReseauError('Ce fichier n’est pas accepté.')
    const chemin = ref.path.split('/').map(encodeURIComponent).join('/')
    const { statut, corps } = await this.demander(`${this.config.rawBase}/${ref.repo}/HEAD/${chemin}`, 'text/plain', TAILLE_FICHIER_MAX)
    if (statut === 404) throw new ReseauError('Ce fichier est introuvable dans le dépôt.', 404)
    if (statut !== 200) throw new ReseauError('GitHub a répondu de façon inattendue. Réessayez plus tard.', statut)
    return corps
  }

  /** Licence déclarée par le dépôt, ou null s'il n'en déclare pas. */
  async licence(repo: string): Promise<string | null> {
    if (!estDepotValide(repo)) return null
    const cle = `licence:${repo}`
    const deja = this.enCache<string | null>(cle)
    if (deja !== undefined) return deja
    let valeur: string | null = null
    try {
      const r = await this.api<{ license?: { spdx_id?: string; name?: string } }>(`/repos/${repo}/license`, 'Aucune licence déclarée.')
      const spdx = r.license?.spdx_id
      valeur = spdx && spdx !== 'NOASSERTION' ? spdx : (r.license?.name ?? null)
    } catch (e) {
      if (!(e instanceof ReseauError) || e.statut !== 404) throw e
    }
    this.cache.set(cle, { a: this.maintenant(), valeur })
    return valeur
  }

  async decrire(ref: ReferenceSkill): Promise<SkillDistant> {
    const cle = `meta:${ref.repo}:${ref.path}`
    const deja = this.enCache<SkillDistant>(cle)
    if (deja) return deja
    let lu: SkillLu = { name: null, description: null, corps: '' }
    try {
      lu = lireSkillMd(await this.lireFichier(ref))
    } catch {
      // description indisponible : on garde le nom du dossier
    }
    const valeur: SkillDistant = {
      ...ref,
      name: lu.name ?? dossierDe(ref.path),
      description: (lu.description ?? lu.corps.replace(/[#>*`]/g, '').trim()).slice(0, 240),
      url: `https://github.com/${ref.repo}/blob/HEAD/${ref.path}`
    }
    this.cache.set(cle, { a: this.maintenant(), valeur })
    return valeur
  }

  /** Recherche par mots dans les chemins des dépôts choisis, puis décrit les meilleurs résultats. */
  async rechercher(repos: string[], requete: string, limite = 24): Promise<{ resultats: SkillDistant[]; total: number; erreurs: { repo: string; message: string }[] }> {
    const erreurs: { repo: string; message: string }[] = []
    const tous: ReferenceSkill[] = []
    await Promise.all(
      repos.map(async (repo) => {
        try {
          for (const path of (await this.lister(repo)).chemins) tous.push({ repo, path })
        } catch (e) {
          erreurs.push({ repo, message: e instanceof Error ? e.message : 'Dépôt inaccessible.' })
        }
      })
    )
    const mots = requete.toLowerCase().split(/\s+/).filter(Boolean)
    const note = (r: ReferenceSkill): number => {
      const texte = r.path.toLowerCase().replace(/[-_/]/g, ' ')
      return mots.reduce((s, m) => s + (texte.includes(m) ? (dossierDe(r.path).toLowerCase().includes(m) ? 3 : 1) : 0), 0)
    }
    const retenus = mots.length > 0 ? tous.map((r) => ({ r, n: note(r) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).map((x) => x.r) : tous
    const resultats = await Promise.all(retenus.slice(0, limite).map((r) => this.decrire(r)))
    return { resultats, total: retenus.length, erreurs: erreurs.sort((a, b) => a.repo.localeCompare(b.repo)) }
  }
}
