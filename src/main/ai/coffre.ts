// Clés d'API : chiffrées par le système (safeStorage : DPAPI sous Windows) dans secrets.bin, jamais en clair,
// jamais renvoyées à l'interface, jamais journalisées.
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { ecrireAtomique } from '../fs/atomic'
import { exclusif } from '../fs/verrou'

export interface Chiffrement {
  disponible(): Promise<boolean>
  chiffrer(texte: string): Promise<Buffer>
  dechiffrer(octets: Buffer): Promise<string>
}

export class CoffreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CoffreError'
  }
}

const FichierSchema = z.object({ version: z.literal(1), cles: z.record(z.string(), z.string()) })
const ID = /^[a-z0-9-]{1,32}$/
const CLE_MAX = 4096

export class CoffreCles {
  constructor(
    private readonly fichier: string,
    private readonly chiffrement: Chiffrement
  ) {}

  private async lire(): Promise<Record<string, string>> {
    let brut: string
    try {
      brut = await readFile(this.fichier, 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw e
    }
    try {
      const lu = FichierSchema.safeParse(JSON.parse(brut))
      return lu.success ? lu.data.cles : {}
    } catch {
      return {} // fichier abîmé : traité comme vide, jamais écrasé tant qu'on n'enregistre rien
    }
  }

  private verifierId(id: string): void {
    if (!ID.test(id)) throw new CoffreError('Identifiant de service invalide.')
  }

  /** Une clé est-elle enregistrée (et lisible par cet utilisateur de l'ordinateur) ? */
  async a(id: string): Promise<boolean> {
    return (await this.lireCle(id)) !== null
  }

  async lireCle(id: string): Promise<string | null> {
    this.verifierId(id)
    const octets = (await this.lire())[id]
    if (!octets) return null
    try {
      return await this.chiffrement.dechiffrer(Buffer.from(octets, 'base64'))
    } catch {
      return null // enregistrée par un autre compte ou illisible : la personne la saisira de nouveau
    }
  }

  async enregistrer(id: string, cle: string): Promise<void> {
    this.verifierId(id)
    const propre = cle.trim()
    if (propre === '' || propre.length > CLE_MAX || /[\u0000-\u001f\u007f]/.test(propre)) throw new CoffreError('Cette clé n’est pas valide : collez-la telle que le service vous l’a donnée.')
    if (!(await this.chiffrement.disponible())) throw new CoffreError('Le stockage sécurisé de votre ordinateur n’est pas disponible : la clé ne peut pas être enregistrée.')
    await exclusif(async () => {
      const cles = await this.lire()
      cles[id] = (await this.chiffrement.chiffrer(propre)).toString('base64')
      await ecrireAtomique(this.fichier, JSON.stringify({ version: 1, cles }), { mode: 0o600 })
    })
  }

  async supprimer(id: string): Promise<void> {
    this.verifierId(id)
    await exclusif(async () => {
      const cles = await this.lire()
      if (!(id in cles)) return
      delete cles[id]
      await ecrireAtomique(this.fichier, JSON.stringify({ version: 1, cles }), { mode: 0o600 })
    })
  }
}
