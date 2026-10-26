// Requêtes réseau bornées : délai, taille de réponse, aucune redirection suivie sans nouveau contrôle.
import { verifierAdresse, type Resolveur } from './garde-adresse'

export class ReseauError extends Error {
  constructor(
    message: string,
    readonly statut?: number
  ) {
    super(message)
    this.name = 'ReseauError'
  }
}

export type Fetch = typeof fetch

export interface OptionsRequete {
  delaiMs?: number
  /** Taille maximale de la réponse, en octets. */
  tailleMax?: number
  resolveur?: Resolveur
  fetchImpl?: Fetch
  /** Nombre maximal de redirections suivies (chacune est recontrôlée). */
  redirections?: number
  signal?: AbortSignal
  /** Contrôle d'adresse propre à l'appelant (par défaut : garde d'adresse des services d'IA). */
  controler?: (url: URL) => Promise<void>
}

export interface Reponse {
  statut: number
  corps: string
  entetes: Headers
}

const MESSAGE_RESEAU = 'Pas de connexion au service. Vérifiez votre connexion internet et l’adresse.'

/** Lit un corps de réponse en s'arrêtant à `tailleMax` : une réponse démesurée est refusée, pas chargée. */
export async function lireCorps(reponse: globalThis.Response, tailleMax: number): Promise<string> {
  const flux = reponse.body
  if (!flux) return ''
  const lecteur = flux.getReader()
  const morceaux: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    total += value.byteLength
    if (total > tailleMax) {
      await lecteur.cancel()
      throw new ReseauError('La réponse du service est trop volumineuse : elle a été refusée.')
    }
    morceaux.push(value)
  }
  return Buffer.concat(morceaux).toString('utf8')
}

function combinerSignaux(delaiMs: number, externe?: AbortSignal): { signal: AbortSignal; fin: () => void } {
  const controle = new AbortController()
  const minuterie = setTimeout(() => controle.abort(new ReseauError('Le service met trop de temps à répondre.')), delaiMs)
  const surAnnulation = () => controle.abort(externe?.reason)
  externe?.addEventListener('abort', surAnnulation)
  return {
    signal: controle.signal,
    fin: () => {
      clearTimeout(minuterie)
      externe?.removeEventListener('abort', surAnnulation)
    }
  }
}

export interface Ouverture {
  reponse: globalThis.Response
  signal: AbortSignal
  /** À appeler quand la réponse a été lue : arrête le délai. */
  fin: () => void
}

/**
 * Ouvre une requête, avec contrôle de l'adresse avant chaque saut. Les redirections ne sont suivies que si elles
 * passent de nouveau le contrôle ; la clé ne suit jamais une redirection vers un autre site.
 */
export async function ouvrir(adresse: string, init: RequestInit = {}, options: OptionsRequete = {}): Promise<Ouverture> {
  const { delaiMs = 30_000, fetchImpl = fetch, redirections = 3 } = options
  const controler = options.controler ?? (async (u: URL) => void (await verifierAdresse(u.href, { resolveur: options.resolveur })))
  let courante = adresse
  const origine = new URL(adresse).origin
  const entetes = new Headers(init.headers)
  const { signal, fin } = combinerSignaux(delaiMs, options.signal)
  try {
    for (let saut = 0; ; saut++) {
      await controler(new URL(courante))
      if (new URL(courante).origin !== origine) entetes.delete('authorization')
      let reponse: globalThis.Response
      try {
        // La course avec le signal garantit l'abandon même si l'implémentation de fetch l'ignore
        reponse = await Promise.race([
          fetchImpl(courante, { ...init, headers: entetes, redirect: 'manual', signal }),
          new Promise<never>((_, rejeter) => signal.addEventListener('abort', () => rejeter(signal.reason), { once: true }))
        ])
      } catch {
        if (signal.aborted && signal.reason instanceof Error) throw signal.reason
        throw new ReseauError(MESSAGE_RESEAU)
      }
      if (reponse.status >= 300 && reponse.status < 400 && reponse.headers.get('location')) {
        if (saut >= redirections) throw new ReseauError('Le service redirige trop de fois : la demande est abandonnée.')
        courante = new URL(reponse.headers.get('location')!, courante).href
        await reponse.body?.cancel()
        continue
      }
      return { reponse, signal, fin }
    }
  } catch (e) {
    fin()
    throw e
  }
}

/** Une requête dont la réponse entière (bornée en taille) est lue. */
export async function requeteBornee(adresse: string, init: RequestInit = {}, options: OptionsRequete = {}): Promise<Reponse> {
  const { tailleMax = 2_000_000 } = options
  const { reponse, signal, fin } = await ouvrir(adresse, init, options)
  try {
    let corps: string
    try {
      corps = await lireCorps(reponse, tailleMax)
    } catch (e) {
      if (signal.aborted && signal.reason instanceof Error) throw signal.reason
      throw e
    }
    return { statut: reponse.status, corps, entetes: reponse.headers }
  } finally {
    fin()
  }
}
