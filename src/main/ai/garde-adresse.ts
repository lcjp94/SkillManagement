// Garde d'adresse : avant tout appel réseau d'IA, l'adresse est contrôlée (CLAUDE.md § 12).
// « https » partout ; « http » seulement vers cet ordinateur ; jamais d'adresse link-local ni de service de métadonnées cloud.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export class AdresseRefuseeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdresseRefuseeError'
  }
}

export type Resolveur = (hote: string) => Promise<string[]>
const resolveurReel: Resolveur = async (hote) => (await lookup(hote, { all: true })).map((r) => r.address)

const HOTES_LOCAUX = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const HOTES_METADONNEES = new Set(['metadata.google.internal', 'metadata', 'instance-data', 'instance-data.ec2.internal'])

/** Vrai pour les adresses que l'application ne contacte jamais : link-local, métadonnées, « 0.0.0.0 ». */
export function estAdresseInterdite(ip: string): boolean {
  const v = ip.replace(/^\[|\]$/g, '').toLowerCase()
  const mappee = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)
  if (mappee) return estAdresseInterdite(mappee[1]!)
  // L'analyseur d'adresses écrit « ::ffff:169.254.169.254 » en « ::ffff:a9fe:a9fe » (et NAT64 en « 64:ff9b:: ») :
  // on lit les deux derniers groupes comme une adresse IPv4
  const hexa = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v)
  if (hexa) {
    const haut = parseInt(hexa[1]!, 16)
    const bas = parseInt(hexa[2]!, 16)
    return estAdresseInterdite(`${haut >> 8}.${haut & 255}.${bas >> 8}.${bas & 255}`)
  }
  if (isIP(v) === 4) {
    const [a, b] = v.split('.').map(Number) as [number, number]
    return a === 169 && b === 254 ? true : a === 0 || v === '100.100.100.200'
  }
  if (isIP(v) === 6) return v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v === '::' || v.startsWith('fd00:ec2')
  return false
}

const estBoucle = (ip: string): boolean => {
  const v = ip.replace(/^\[|\]$/g, '')
  return v === '::1' || /^127\./.test(v)
}

/**
 * Contrôle une adresse de service d'IA : « http » n'est accepté que vers la boucle locale de cet ordinateur.
 * Le nom d'hôte est résolu : un nom qui pointerait vers une
 * adresse interdite (rebond DNS) est refusé.
 */
export async function verifierAdresse(adresse: string, options: { resolveur?: Resolveur } = {}): Promise<URL> {
  let url: URL
  try {
    url = new URL(adresse.trim())
  } catch {
    throw new AdresseRefuseeError('Cette adresse n’est pas valide. Elle doit commencer par https://.')
  }
  if (url.username || url.password) throw new AdresseRefuseeError('L’adresse ne doit contenir ni identifiant ni mot de passe.')
  const hote = url.hostname.toLowerCase()
  if (HOTES_METADONNEES.has(hote) || estAdresseInterdite(hote)) throw new AdresseRefuseeError('Cette adresse est réservée au système : elle n’est pas acceptée.')

  if (url.protocol === 'http:') {
    if (!HOTES_LOCAUX.has(hote)) throw new AdresseRefuseeError('Une adresse en http:// n’est acceptée que pour un service sur cet ordinateur (localhost). Utilisez https://.')
  } else if (url.protocol !== 'https:') {
    throw new AdresseRefuseeError('Seules les adresses https:// sont acceptées.')
  }

  // Résolution : aucune des adresses obtenues ne doit être interdite ; « localhost » doit rester sur la boucle locale
  const resolveur = options.resolveur ?? resolveurReel
  if (isIP(hote.replace(/^\[|\]$/g, '')) === 0) {
    let adresses: string[]
    try {
      adresses = await resolveur(hote)
    } catch {
      throw new AdresseRefuseeError('Cette adresse est introuvable. Vérifiez-la et votre connexion internet.')
    }
    if (adresses.some(estAdresseInterdite)) throw new AdresseRefuseeError('Cette adresse mène vers une destination réservée au système : elle n’est pas acceptée.')
    if (url.protocol === 'http:' && !adresses.every(estBoucle)) throw new AdresseRefuseeError('« localhost » ne mène pas vers cet ordinateur : l’adresse est refusée.')
  }
  return url
}
