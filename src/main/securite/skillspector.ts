// Analyse approfondie facultative : NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector), si elle est
// installée. L'application ne l'installe pas et ne l'exige jamais ; la pré-analyse intégrée reste toujours active.
//
// Options relues dans « skillspector scan --help » (version 2.12.0) : `--format json`, `--output`, `--no-llm`.
// `--no-llm` est TOUJOURS passé : sans lui, SkillSpector enverrait le contenu du skill à un service d'IA distant.
import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { z } from 'zod'

export type Recommandation = 'SAFE' | 'CAUTION' | 'DO_NOT_INSTALL'

export interface ProblemeApprofondi {
  severity: 'high' | 'medium' | 'low'
  category: string
  message: string
  excerpt?: string
}

export interface ResultatApprofondi {
  /** « ok » : rien à signaler ; « warning » : à confirmer ; « danger » : refusé. */
  statut: 'clean' | 'warning' | 'danger'
  score: number
  problemes: ProblemeApprofondi[]
}

export type Lancer = (fichier: string, args: string[], options: { timeoutMs: number }) => Promise<{ code: number; stdout: string }>

const lancerReel: Lancer = (fichier, args, { timeoutMs }) =>
  new Promise((resolve, reject) => {
    execFile(
      fichier,
      args,
      { timeout: timeoutMs, maxBuffer: 1_000_000, windowsHide: true, shell: false, env: environnementPropre() },
      (erreur, stdout) => {
        if (!erreur) return resolve({ code: 0, stdout })
        const code = (erreur as NodeJS.ErrnoException & { code?: number | string }).code
        // Code de sortie non nul : SkillSpector sort avec 1 quand il recommande de ne pas installer
        if (typeof code === 'number') return resolve({ code, stdout })
        reject(erreur)
      }
    )
  })

/** Environnement transmis à l'outil : rien qui ressemble à une clé, et aucune de ses propres variables de service. */
export function environnementPropre(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const propre: NodeJS.ProcessEnv = {}
  for (const [nom, valeur] of Object.entries(env)) {
    if (/KEY|TOKEN|SECRET|PASS(WORD|WD)?|MOT_?DE_?PASSE|CREDENTIAL|_CLE$/i.test(nom) || /^SKILLSPECTOR_/i.test(nom) || /^(OPENAI|ANTHROPIC|AZURE|AWS|GOOGLE|NVIDIA)_/i.test(nom)) continue
    propre[nom] = valeur
  }
  return propre
}

/** Cherche l'exécutable dans le PATH, sans passer par un shell. Sous Windows, seuls les .exe sont lancés directement. */
export async function trouverExecutable(pathEnv: string | undefined, plateforme: NodeJS.Platform = process.platform): Promise<string | null> {
  const noms = plateforme === 'win32' ? ['skillspector.exe'] : ['skillspector']
  for (const dossier of (pathEnv ?? '').split(delimiter).filter(Boolean)) {
    for (const nom of noms) {
      const chemin = join(dossier, nom)
      try {
        await access(chemin, plateforme === 'win32' ? constants.F_OK : constants.X_OK)
        return chemin
      } catch {
        // pas ici
      }
    }
  }
  return null
}

const RapportSchema = z.object({
  risk_assessment: z.object({ score: z.number(), recommendation: z.string() }),
  issues: z
    .array(
      z.object({
        severity: z.string(),
        category: z.string().optional(),
        pattern: z.string().optional(),
        explanation: z.string().optional(),
        finding: z.string().optional(),
        location: z.object({ file: z.string().optional(), start_line: z.number().nullable().optional() }).optional()
      })
    )
    .default([])
})

const gravite = (s: string): ProblemeApprofondi['severity'] => (/^(CRITICAL|HIGH)$/i.test(s) ? 'high' : /^MEDIUM$/i.test(s) ? 'medium' : 'low')

/** Convertit le rapport JSON de l'outil. Une recommandation inconnue est traitée avec prudence (« à confirmer »). */
export function lireRapport(json: unknown): ResultatApprofondi {
  const r = RapportSchema.parse(json)
  const recommandation = r.risk_assessment.recommendation.toUpperCase()
  const statut = recommandation === 'SAFE' ? 'clean' : recommandation === 'DO_NOT_INSTALL' ? 'danger' : 'warning'
  return {
    statut,
    score: r.risk_assessment.score,
    problemes: r.issues.slice(0, 50).map((i) => ({
      severity: gravite(i.severity),
      category: i.category ?? 'Analyse approfondie',
      message: [i.pattern, i.explanation].filter(Boolean).join(' : ').slice(0, 400) || 'Problème signalé par l’analyse approfondie.',
      ...(i.finding ? { excerpt: i.finding.slice(0, 160) } : {})
    }))
  }
}

export interface SkillAAnalyser {
  slug: string
  /** Texte tel qu'il sera écrit (SKILL.md complet). */
  markdown: string
}

export type ResultatLot = { ok: true; resultat: ResultatApprofondi } | { ok: false; erreur: string }

export interface InfoSkillSpector {
  disponible: boolean
  version?: string
}

export interface OptionsSkillSpector {
  /** Remplace la recherche dans le PATH (tests). */
  executable?: string | null
  pathEnv?: string
  lancer?: Lancer
  dossierTemp?: string
  delaiMs?: number
  parallele?: number
}

export class SkillSpector {
  private exe: string | null | undefined
  private version: string | undefined
  constructor(private readonly options: OptionsSkillSpector = {}) {}

  private async executable(): Promise<string | null> {
    if (this.exe === undefined) this.exe = this.options.executable !== undefined ? this.options.executable : await trouverExecutable(this.options.pathEnv ?? process.env['PATH'])
    return this.exe
  }

  /** Disponibilité et version, recherchées une fois (au démarrage). */
  async info(): Promise<InfoSkillSpector> {
    const exe = await this.executable()
    if (!exe) return { disponible: false }
    if (this.version === undefined) {
      try {
        const lancer = this.options.lancer ?? lancerReel
        const { stdout } = await lancer(exe, ['--version'], { timeoutMs: 15_000 })
        this.version = stdout.trim().slice(0, 40)
      } catch {
        this.version = ''
      }
    }
    return { disponible: true, ...(this.version ? { version: this.version } : {}) }
  }

  /** Analyse chaque skill dans un dossier temporaire, quelques-uns à la fois. Un échec n'arrête pas les autres. */
  async analyser(skills: SkillAAnalyser[]): Promise<Map<string, ResultatLot>> {
    const exe = await this.executable()
    const resultats = new Map<string, ResultatLot>()
    if (!exe) return resultats
    const lancer = this.options.lancer ?? lancerReel
    const delai = this.options.delaiMs ?? 90_000
    const file = [...skills]
    const travailleurs = Array.from({ length: Math.min(this.options.parallele ?? 3, file.length) }, async () => {
      for (let s = file.shift(); s; s = file.shift()) resultats.set(s.slug, await this.un(exe, lancer, s, delai))
    })
    await Promise.all(travailleurs)
    return resultats
  }

  private async un(exe: string, lancer: Lancer, skill: SkillAAnalyser, delaiMs: number): Promise<ResultatLot> {
    const racine = await mkdtemp(join(this.options.dossierTemp ?? tmpdir(), 'sm-analyse-'))
    try {
      const dossier = join(racine, 'skill')
      await mkdir(dossier)
      await writeFile(join(dossier, 'SKILL.md'), skill.markdown, 'utf8')
      const sortie = join(racine, 'rapport.json')
      // Sans « --no-llm », l'outil enverrait le contenu à un service distant : l'option est obligatoire ici
      await lancer(exe, ['scan', dossier, '--format', 'json', '--no-llm', '--output', sortie], { timeoutMs: delaiMs })
      const texte = await readFile(sortie, 'utf8')
      if (texte.length > 5_000_000) return { ok: false, erreur: 'Le rapport de l’analyse approfondie est trop volumineux.' }
      return { ok: true, resultat: lireRapport(JSON.parse(texte)) }
    } catch {
      return { ok: false, erreur: 'L’analyse approfondie n’a pas pu se terminer pour ce skill.' }
    } finally {
      await rm(racine, { recursive: true, force: true })
    }
  }
}

