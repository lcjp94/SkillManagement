import { access, mkdir, readFile, readdir, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { z } from 'zod'
import { ecrireAtomique, type Ecriture } from '../fs/atomic'
import { exclusif } from '../fs/verrou'
import { journalMuet, type Logger } from '../log'

export type Avis = 'neuf' | 'migre' | 'restaure-depuis-copie' | 'reinitialise-apres-corruption'

// Des données écrites par une version plus récente ne sont jamais lues à moitié ni écrasées.
export class VersionFutureError extends Error {
  constructor(
    readonly versionTrouvee: number,
    readonly versionConnue: number
  ) {
    super(
      `Ces données ont été créées par une version plus récente de SkillManagement (version ${versionTrouvee}, cette version comprend jusqu'à la ${versionConnue}). Mettez l'application à jour pour les ouvrir ; rien n'a été modifié.`
    )
    this.name = 'VersionFutureError'
  }
}

export interface OptionsStore<T> {
  fichier: string
  versionCourante: number
  schema: z.ZodType<T>
  // migrations[n] transforme une donnée de version n en version n + 1
  migrations?: Record<number, (ancien: unknown) => unknown>
  creer: () => T
  journal?: Logger
  ecrire?: Ecriture
  mode?: number
}

type Lecture<T> =
  | { statut: 'absent' }
  | { statut: 'illisible' }
  | { statut: 'future'; version: number }
  | { statut: 'ok'; etat: T; versionOrigine: number; texte: string }

export class JsonStore<T> {
  private etat: T | undefined
  private readonly journal: Logger

  constructor(private readonly options: OptionsStore<T>) {
    this.journal = options.journal ?? journalMuet
  }

  get(): T {
    if (this.etat === undefined) throw new Error('Les données ne sont pas encore chargées.')
    return structuredClone(this.etat)
  }

  // Charge le fichier, ou le répare en conservant tout ce qui est illisible à côté (jamais d'écrasement).
  load(): Promise<{ avis?: Avis }> {
    return exclusif(() => this.charger())
  }

  // La mutation travaille sur une copie ; l'état en mémoire ne change que si l'écriture réussit.
  update(mutation: (brouillon: T) => T | void): Promise<T> {
    return exclusif(async () => {
      if (this.etat === undefined) throw new Error('Les données ne sont pas encore chargées.')
      const brouillon = structuredClone(this.etat)
      const resultat = mutation(brouillon) ?? brouillon
      const valide = this.options.schema.safeParse(resultat)
      if (!valide.success) {
        throw new Error("Enregistrement refusé : les données ne sont pas valides.", { cause: valide.error })
      }
      await this.persister(valide.data)
      this.etat = valide.data
      return structuredClone(valide.data)
    })
  }

  private async charger(): Promise<{ avis?: Avis }> {
    const { fichier } = this.options
    await mkdir(dirname(fichier), { recursive: true })
    await this.nettoyerTemporaires()

    const principal = await this.lire(fichier)
    if (principal.statut === 'future') throw new VersionFutureError(principal.version, this.options.versionCourante)

    if (principal.statut === 'ok') {
      if (principal.versionOrigine === this.options.versionCourante) {
        this.etat = principal.etat
        return {}
      }
      // Migration : copie du fichier d'origine, une seule fois par version, avant toute réécriture
      await this.conserverAvantMigration(principal.versionOrigine, principal.texte)
      await this.persister(principal.etat)
      this.etat = principal.etat
      this.journal.info('Données migrées', { de: principal.versionOrigine, vers: this.options.versionCourante })
      return { avis: 'migre' }
    }

    if (principal.statut === 'illisible') {
      const garde = await this.mettreDeCote(fichier)
      this.journal.warn('Fichier de données illisible, mis de côté', { fichier: basename(garde) })
    }

    const copie = await this.lire(`${fichier}.bak`)
    if (copie.statut === 'future') throw new VersionFutureError(copie.version, this.options.versionCourante)
    if (copie.statut === 'ok') {
      await this.persister(copie.etat, { sansCopie: true })
      this.etat = copie.etat
      this.journal.warn('Données restaurées depuis la copie de sauvegarde')
      return { avis: 'restaure-depuis-copie' }
    }
    if (copie.statut === 'illisible') await this.mettreDeCote(`${fichier}.bak`)

    const neuf = this.options.creer()
    await this.persister(neuf, { sansCopie: true })
    this.etat = neuf
    if (principal.statut === 'absent' && copie.statut === 'absent') {
      this.journal.info('Nouveau fichier de données créé')
      return { avis: 'neuf' }
    }
    this.journal.error('Données illisibles et aucune copie valide : nouveau fichier créé, ancien conservé à côté')
    return { avis: 'reinitialise-apres-corruption' }
  }

  private async lire(chemin: string): Promise<Lecture<T>> {
    let texte: string
    try {
      texte = await readFile(chemin, 'utf8')
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code === 'ENOENT') return { statut: 'absent' }
      throw erreur
    }
    let brut: unknown
    try {
      brut = JSON.parse(texte)
    } catch {
      return { statut: 'illisible' }
    }
    const version = typeof brut === 'object' && brut !== null ? (brut as { version?: unknown }).version : undefined
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { statut: 'illisible' }
    if (version > this.options.versionCourante) return { statut: 'future', version }

    let courant: unknown = brut
    for (let v = version; v < this.options.versionCourante; v++) {
      const migrer = this.options.migrations?.[v]
      if (!migrer) return { statut: 'illisible' }
      try {
        courant = migrer(courant)
      } catch {
        return { statut: 'illisible' }
      }
    }
    const valide = this.options.schema.safeParse(courant)
    if (!valide.success) return { statut: 'illisible' }
    return { statut: 'ok', etat: valide.data, versionOrigine: version, texte }
  }

  private async persister(etat: T, options: { sansCopie?: boolean } = {}): Promise<void> {
    const { fichier, mode, ecrire } = this.options
    const reglages = { mode, ecrire }
    if (!options.sansCopie) {
      // La copie ne reçoit que du contenu valide : un fichier abîmé n'écrase jamais une bonne copie
      const actuel = await this.lire(fichier)
      if (actuel.statut === 'ok') await ecrireAtomique(`${fichier}.bak`, actuel.texte, reglages)
    }
    await ecrireAtomique(fichier, `${JSON.stringify(etat, null, 2)}\n`, reglages)
  }

  private async conserverAvantMigration(version: number, texte: string): Promise<void> {
    const cible = `${this.options.fichier}.v${version}.bak`
    // Écriture atomique : une copie tronquée par une coupure ne doit pas passer pour la copie d'origine
    const existe = await access(cible).then(() => true, () => false)
    if (!existe) await ecrireAtomique(cible, texte, { mode: this.options.mode, ecrire: this.options.ecrire })
  }

  private async mettreDeCote(chemin: string): Promise<string> {
    const horodatage = new Date().toISOString().replace(/[-:.]/g, '')
    const cible = `${chemin}.corrompu-${horodatage}`
    await rename(chemin, cible)
    return cible
  }

  // Un arrêt brutal peut laisser le fichier temporaire de write-file-atomic (« nom.json.123456789 »,
  // ou « nom.json.bak.123456789 » pour la copie).
  // L'instance unique garantit qu'aucune écriture de ce fichier n'est en cours au chargement.
  private async nettoyerTemporaires(): Promise<void> {
    const dossier = dirname(this.options.fichier)
    const nomEchappe = basename(this.options.fichier).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const temporaire = new RegExp(`^${nomEchappe}(\\.v\\d+\\.bak|\\.bak)?\\.\\d{1,10}$`)
    for (const nom of await readdir(dossier)) {
      if (temporaire.test(nom)) await unlink(join(dossier, nom)).catch(() => {})
    }
  }
}
