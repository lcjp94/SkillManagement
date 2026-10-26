// Périmètre sûr : où l'application a le droit d'écrire. Tout chemin passe ici avant toute écriture.
// Les messages disent quoi faire ; ils ne citent jamais un code d'erreur du système.
import { lstat, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, parse, relative, resolve } from 'node:path'
import { existe } from './lecture'

export class PerimetreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PerimetreError'
  }
}

export interface Environnement {
  /** Dossier personnel de la personne. */
  dossierPersonnel: string
  /** Dossier de données de l'application (état, manifestes, sauvegardes). */
  donneesApp: string
  /** Dossiers système où l'application n'écrit jamais. */
  systeme: string[]
}

const SYSTEME_UNIX = ['/bin', '/boot', '/dev', '/etc', '/lib', '/lib64', '/proc', '/run', '/sbin', '/sys', '/usr', '/var', '/System', '/Library']
const VARIABLES_WINDOWS = ['SystemRoot', 'windir', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'ProgramData']

export function environnementReel(dossierPersonnel: string, donneesApp: string, env: NodeJS.ProcessEnv = process.env): Environnement {
  const windows = VARIABLES_WINDOWS.map((nom) => env[nom]).filter((v): v is string => Boolean(v))
  return { dossierPersonnel, donneesApp, systeme: process.platform === 'win32' ? windows : SYSTEME_UNIX }
}

// Windows et macOS ignorent la casse : « Seo » et « seo » sont le même dossier
const SANS_CASSE = process.platform === 'win32' || process.platform === 'darwin'
export const plie = (texte: string): string => (SANS_CASSE ? texte.normalize('NFC').toLocaleLowerCase('fr') : texte.normalize('NFC'))

export const memeChemin = (a: string, b: string): boolean => plie(resolve(a)) === plie(resolve(b))

/** Vrai si `enfant` est `parent` ou se trouve dedans. */
export function estDans(parent: string, enfant: string): boolean {
  const rel = relative(plie(resolve(parent)), plie(resolve(enfant)))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

const RESERVES_WINDOWS = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i
const CARACTERES_INTERDITS = /[<>:"/\\|?*\u0000-\u001f]/
// Nom court 8.3 (« PROGRA~1 ») : peut désigner un autre dossier que celui qu'il semble nommer
const NOM_COURT = /~\d/
/** Marge pour le fichier temporaire de l'écriture atomique et la limite de 260 caractères de Windows. */
export const LONGUEUR_MAX_CHEMIN = 240

/** Vérifie un chemin relatif du plan (séparateur « / ») sans toucher au disque. */
export function verifierCheminRelatif(rel: string): string[] {
  if (typeof rel !== 'string' || rel === '') throw new PerimetreError('Un fichier du plan n’a pas de nom.')
  if (rel.includes('\0')) throw new PerimetreError('Un nom de fichier contient un caractère interdit.')
  if (isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.startsWith('/') || rel.startsWith('\\')) {
    throw new PerimetreError('Un chemin du plan n’est pas relatif au dossier choisi : rien n’a été écrit.')
  }
  const segments = rel.split('/')
  for (const segment of segments) {
    if (segment === '') throw new PerimetreError(`Le chemin « ${rel} » contient un segment vide.`)
    if (segment === '.' || segment === '..') throw new PerimetreError(`Le chemin « ${rel} » remonte dans les dossiers : il est refusé.`)
    if (CARACTERES_INTERDITS.test(segment)) {
      throw new PerimetreError(`« ${segment} » contient un caractère que Windows interdit dans un nom. Renommez le skill ou le projet.`)
    }
    if (RESERVES_WINDOWS.test(segment)) throw new PerimetreError(`« ${segment} » est un nom réservé par Windows. Choisissez un autre nom.`)
    if (/[. ]$/.test(segment)) throw new PerimetreError(`« ${segment} » finit par un point ou un espace, ce que Windows n’accepte pas.`)
    if (NOM_COURT.test(segment)) throw new PerimetreError(`« ${segment} » ressemble à un nom court Windows. Choisissez un autre nom.`)
    if (segment.length > 255) throw new PerimetreError(`Un nom de dossier ou de fichier est trop long (${segment.length} caractères).`)
  }
  return segments
}

/** Détecte les doublons et les collisions de casse dans un plan (« Seo » et « seo »). */
export function verifierCollisions(chemins: string[]): void {
  const vus = new Map<string, string>()
  for (const chemin of chemins) {
    const cle = plie(chemin)
    const deja = vus.get(cle)
    if (deja !== undefined) {
      throw new PerimetreError(
        deja === chemin
          ? `Le fichier « ${chemin} » apparaît deux fois dans le plan.`
          : `« ${deja} » et « ${chemin} » ne diffèrent que par la casse : ils seraient le même fichier sous Windows.`
      )
    }
    vus.set(cle, chemin)
  }
}

/**
 * Dossier choisi par la personne : résolu par realpath, puis comparé aux dossiers interdits.
 * `portee: 'global'` autorise le dossier personnel (la disposition n'y écrira que son sous-dossier dédié).
 */
export async function verifierRacine(dossier: string, env: Environnement, portee: 'projet' | 'global' = 'projet'): Promise<string> {
  if (typeof dossier !== 'string' || dossier.trim() === '' || dossier.includes('\0')) {
    throw new PerimetreError('Choisissez un dossier de votre disque : ce chemin n’est pas valide.')
  }
  // Chemins de périphérique Windows (\\?\ et \\.\) : ils contournent les contrôles de nom
  if (/^[\\/]{2}[.?][\\/]/.test(dossier)) throw new PerimetreError('Ce type d’adresse n’est pas accepté. Choisissez le dossier avec le sélecteur.')
  if (!isAbsolute(dossier)) throw new PerimetreError('Choisissez le dossier avec le sélecteur : l’adresse doit être complète.')

  let reel: string
  try {
    reel = await realpath(dossier)
  } catch {
    throw new PerimetreError('Ce dossier n’existe pas ou n’est pas accessible. Choisissez-en un autre.')
  }
  const infos = await stat(reel)
  if (!infos.isDirectory()) throw new PerimetreError('Choisissez un dossier, pas un fichier.')

  if (memeChemin(parse(reel).root, reel)) {
    throw new PerimetreError('Ce dossier est la racine d’un disque : choisissez un dossier plus précis.')
  }
  for (const systeme of env.systeme) {
    if (estDans(systeme, reel)) throw new PerimetreError('Ce dossier appartient au système : choisissez un dossier de projet.')
  }
  if (estDans(env.donneesApp, reel) || estDans(reel, env.donneesApp)) {
    throw new PerimetreError('Ce dossier contient ou fait partie des données de SkillManagement : choisissez-en un autre.')
  }
  if (portee === 'projet' && memeChemin(reel, env.dossierPersonnel)) {
    throw new PerimetreError('Ce dossier est votre dossier personnel entier : choisissez un sous-dossier propre au projet.')
  }
  return reel
}

/**
 * Chemin absolu d'un fichier ou dossier du plan, après vérification du trajet sur le disque :
 * aucun lien symbolique ni jonction, aucun lien cassé, aucune différence de casse avec un nom existant.
 * À rappeler juste avant chaque écriture : le disque a pu changer depuis l'aperçu.
 */
export async function resoudreDansRacine(racine: string, rel: string, env: Environnement, attendu: 'fichier' | 'dossier'): Promise<string> {
  const segments = verifierCheminRelatif(rel)
  let courant = racine
  for (const [i, segment] of segments.entries()) {
    const dernier = i === segments.length - 1
    // Les noms existants du dossier parent : détecte « Skills » quand le plan dit « skills »
    let freres: string[] = []
    try {
      freres = await readdir(courant)
    } catch (erreur) {
      const code = (erreur as NodeJS.ErrnoException).code
      if (code === 'ENOENT') break // le reste du trajet n'existe pas encore
      if (code === 'ENOTDIR') throw new PerimetreError(`« ${relative(racine, courant)} » est un fichier : il empêche de créer « ${rel} ».`)
      throw erreur
    }
    const pareil = freres.find((nom) => plie(nom) === plie(segment))
    if (pareil === undefined) break
    if (pareil !== segment) {
      throw new PerimetreError(`« ${pareil} » existe déjà avec une casse différente de « ${segment} ». Renommez-le ou choisissez un autre dossier.`)
    }
    courant = join(courant, segment)
    const infos = await lstat(courant)
    if (infos.isSymbolicLink()) {
      throw new PerimetreError(`« ${relative(racine, courant)} » est un raccourci (lien) : l’application n’écrit jamais à travers un lien. Remplacez-le par un vrai dossier.`)
    }
    if (!dernier && !infos.isDirectory()) throw new PerimetreError(`« ${relative(racine, courant)} » est un fichier : il empêche de créer « ${rel} ».`)
    if (dernier && attendu === 'fichier' && infos.isDirectory()) {
      throw new PerimetreError(`« ${rel} » est un dossier : il ne peut pas être remplacé par un fichier.`)
    }
    if (dernier && attendu === 'dossier' && !infos.isDirectory()) {
      throw new PerimetreError(`« ${rel} » est un fichier : il ne peut pas devenir un dossier.`)
    }
  }
  const complet = join(racine, ...segments)
  if (complet.length > LONGUEUR_MAX_CHEMIN) {
    throw new PerimetreError('Le chemin est trop long pour Windows. Choisissez un dossier moins profond ou raccourcissez les noms.')
  }
  if (!estDans(racine, complet) || estDans(env.donneesApp, complet)) {
    throw new PerimetreError('Un fichier du plan sortirait du dossier choisi : rien n’a été écrit.')
  }
  // Filet de sécurité : le plus profond dossier existant doit, une fois résolu, rester dans la racine
  let profond = complet
  while (!(await existe(profond))) {
    const parent = join(profond, '..')
    if (parent === profond) break
    profond = parent
  }
  const reel = await realpath(profond)
  if (!estDans(racine, reel)) throw new PerimetreError('Un fichier du plan sortirait du dossier choisi : rien n’a été écrit.')
  return complet
}
