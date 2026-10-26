// Calcul pur de ce qu'un déploiement écrirait : aucune lecture ni écriture ici, le contenu existant est fourni.
import { createHash } from 'node:crypto'
import { extraireBloc, fusionnerBlocs } from './blocks'
import type { FichierPlanifie } from './layouts'

const sha = (texte: string): string => createHash('sha256').update(texte, 'utf8').digest('hex')

export type ActionFichier = 'create' | 'modify' | 'unchanged'

export interface SkillCalcule {
  slug: string
  sha256: string
  avant?: string
}

export interface FichierCalcule {
  chemin: string
  mode: FichierPlanifie['mode']
  action: ActionFichier
  existant: string | null
  contenuApres: string
  sha256Apres: string
  /** Ce que l'application écrit réellement dans ce fichier (rien si « unchanged »). */
  skills: SkillCalcule[]
  entete?: string
  avertissement?: string
}

/**
 * Compare le plan au contenu actuel de chaque fichier. `lire` renvoie le texte existant, ou null si le fichier est absent.
 * Un fichier à blocs sans aucun bloc à écrire n'est pas créé ; le fichier de réglage (« creer-si-absent »)
 * n'est prévu que si le plan écrit quelque chose d'autre (sauf `reglagesAutonomes` : les README d'une arborescence).
 */
export function calculerFichiers(
  plan: FichierPlanifie[],
  lire: (chemin: string) => string | null,
  options: { reglagesAutonomes?: boolean } = {}
): FichierCalcule[] {
  const resultat: FichierCalcule[] = []
  const reglages: Extract<FichierPlanifie, { mode: 'creer-si-absent' }>[] = []
  for (const fichier of plan) {
    const existant = lire(fichier.chemin)
    if (fichier.mode === 'creer-si-absent') {
      reglages.push(fichier)
      continue
    }
    if (fichier.mode === 'fichier') {
      const apres = fichier.contenu
      const identique = existant === apres
      resultat.push({
        chemin: fichier.chemin,
        mode: 'fichier',
        action: existant === null ? 'create' : identique ? 'unchanged' : 'modify',
        existant,
        contenuApres: apres,
        sha256Apres: sha(apres),
        skills: identique ? [] : [{ slug: fichier.slug, sha256: sha(apres) }]
      })
      continue
    }
    if (fichier.blocs.length === 0) continue
    const apres = fusionnerBlocs(existant, fichier.entete, fichier.blocs)
    const skills: SkillCalcule[] = []
    for (const bloc of fichier.blocs) {
      const nouveau = extraireBloc(apres, bloc.id)!
      const ancien = existant === null ? null : extraireBloc(existant, bloc.id)
      if (ancien === nouveau) continue
      skills.push({ slug: bloc.id, sha256: sha(nouveau), ...(ancien === null ? {} : { avant: sha(ancien) }) })
    }
    resultat.push({
      chemin: fichier.chemin,
      mode: 'blocs',
      action: existant === null ? 'create' : apres === existant ? 'unchanged' : 'modify',
      existant,
      contenuApres: apres,
      sha256Apres: sha(apres),
      skills,
      ...(existant === null ? { entete: fichier.entete } : {})
    })
  }
  if (resultat.length > 0 || options.reglagesAutonomes) {
    for (const reglage of reglages) {
      const existant = lire(reglage.chemin)
      const avertissement = existant !== null && reglage.controle && !reglage.controle.motif.test(existant) ? reglage.controle.message : undefined
      resultat.push({
        chemin: reglage.chemin,
        mode: 'creer-si-absent',
        action: existant === null ? 'create' : 'unchanged',
        existant,
        contenuApres: existant ?? reglage.contenu,
        sha256Apres: sha(existant ?? reglage.contenu),
        skills: [],
        ...(avertissement ? { avertissement } : {})
      })
    }
  }
  return resultat
}

/** Octets que le déploiement ajoute sur le disque (contenu écrit, hors taille de cluster). */
export function octetsAEcrire(fichiers: FichierCalcule[]): number {
  let total = 0
  for (const f of fichiers) {
    if (f.action === 'unchanged') continue
    total += Buffer.byteLength(f.contenuApres, 'utf8')
  }
  return total
}

export interface ChoixSkills {
  /** Skills à écrire. */
  aEcrire: string[]
  /** Sélectionnés et déjà installés dans ce dossier : décochés par défaut. */
  dejaInstalles: string[]
  libelle: string
}

/**
 * Par défaut, seulement ce qui manque dans ce dossier. `reinstaller` coche explicitement des skills déjà installés ;
 * `tout` écrit toute la sélection.
 */
export function choisirSkills(selectionnes: string[], installes: string[], options: { reinstaller?: string[]; tout?: boolean } = {}): ChoixSkills {
  const uniques = Array.from(new Set(selectionnes))
  const presents = new Set(installes)
  const dejaInstalles = uniques.filter((s) => presents.has(s))
  const reinstaller = new Set(options.reinstaller ?? [])
  const explicite = options.tout === true || [...reinstaller].some((s) => presents.has(s))
  const aEcrire = options.tout
    ? uniques
    : uniques.filter((slug) => !presents.has(slug) || reinstaller.has(slug))
  let libelle: string
  if (uniques.length === 0) libelle = 'Aucun skill sélectionné'
  else if (aEcrire.length === 0) libelle = 'Tout est déjà installé'
  else if (explicite) libelle = `Installer ${aEcrire.length} skill${aEcrire.length > 1 ? 's' : ''}`
  else libelle = `Installer ${aEcrire.length} ${aEcrire.length > 1 ? 'nouveaux skills' : 'nouveau skill'}`
  return { aEcrire, dejaInstalles, libelle }
}

/** Arborescence lisible des chemins relatifs (un « / » final désigne un dossier) : un dossier par ligne, ses fichiers en dessous. */
export function dessinerArbre(chemins: string[]): string {
  const vus = new Set<string>()
  const lignes: string[] = []
  for (const chemin of [...chemins].sort((a, b) => a.localeCompare(b))) {
    const segments = chemin.split('/').filter(Boolean)
    const dossierFinal = chemin.endsWith('/')
    for (let i = 0; i < segments.length; i++) {
      const cle = segments.slice(0, i + 1).join('/')
      if (vus.has(cle)) continue
      vus.add(cle)
      const dossier = i < segments.length - 1 || dossierFinal
      lignes.push(`${'  '.repeat(i)}${segments[i]}${dossier ? '/' : ''}`)
    }
  }
  return lignes.join('\n')
}
