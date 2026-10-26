// Faux serveurs locaux : un service d'IA compatible OpenAI et un GitHub minimal. De vraies requêtes HTTP passent
// par le vrai client, la vraie garde d'adresse et les vraies limites de taille et de délai.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface Requete {
  methode: string
  chemin: string
  autorisation: string | undefined
  corps: string
}

export interface ServeurIa {
  url: string
  requetes: Requete[]
  fermer: () => Promise<void>
}

export interface OptionsServeurIa {
  /** Clé attendue ; sans elle, 401. */
  cle?: string
  modeles?: unknown
  /** Statut forcé pour /models (ex. 404 pour tester le repli). */
  statutModeles?: number
  statutCompletion?: number
  /** Morceaux de la réponse en flux ; chacun est envoyé séparément. */
  morceaux?: string[]
  /** Délai (ms) avant chaque morceau. */
  delaiMorceau?: number
  /** Redirection de /models vers cette adresse. */
  redirectionModeles?: string
  /** Corps démesuré pour /models. */
  tailleModeles?: number
}

const lireCorps = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let corps = ''
    req.on('data', (c: Buffer) => (corps += c.toString()))
    req.on('end', () => resolve(corps))
  })

function ecouter(serveur: Server): Promise<string> {
  return new Promise((resolve) => serveur.listen(0, '127.0.0.1', () => resolve(`http://localhost:${(serveur.address() as AddressInfo).port}`)))
}

const fermerServeur = (serveur: Server) => (): Promise<void> =>
  new Promise((resolve) => {
    serveur.closeAllConnections()
    serveur.close(() => resolve())
  })

export async function demarrerServeurIa(options: OptionsServeurIa = {}): Promise<ServeurIa> {
  const requetes: Requete[] = []
  const serveur = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const corps = await lireCorps(req)
    requetes.push({ methode: req.method ?? '', chemin: req.url ?? '', autorisation: req.headers.authorization, corps })
    if (options.cle && req.headers.authorization !== `Bearer ${options.cle}`) {
      res.writeHead(401).end('{"error":"cle invalide : SECRET-DU-SERVICE"}')
      return
    }
    if (req.url === '/v1/models') {
      if (options.redirectionModeles) return void res.writeHead(302, { Location: options.redirectionModeles }).end()
      if (options.statutModeles) return void res.writeHead(options.statutModeles).end('{"error":"corps interne SECRET-DU-SERVICE"}')
      if (options.tailleModeles) return void res.writeHead(200, { 'Content-Type': 'application/json' }).end('x'.repeat(options.tailleModeles))
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(options.modeles ?? { data: [{ id: 'modele-a' }, { id: 'models/modele-b' }] }))
      return
    }
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      if (options.statutCompletion) return void res.writeHead(options.statutCompletion).end('{"error":"SECRET-DU-SERVICE"}')
      const demande = JSON.parse(corps) as { stream?: boolean }
      if (!demande.stream) return void res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"choices":[{"message":{"content":"ok"}}]}')
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      for (const m of options.morceaux ?? ['Bonjour']) {
        if (options.delaiMorceau) await new Promise((r) => setTimeout(r, options.delaiMorceau))
        if (res.destroyed) return
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: m } }] })}\n\n`)
      }
      res.end('data: [DONE]\n\n')
      return
    }
    res.writeHead(404).end()
  })
  const url = await ecouter(serveur)
  return { url: `${url}/v1`, requetes, fermer: fermerServeur(serveur) }
}

export interface FixturesGithub {
  /** repo → { chemin → contenu } */
  depots: Record<string, Record<string, string>>
  licences?: Record<string, string>
  /** Réponse forcée de l'API (ex. 403 pour la limite de requêtes). */
  statutApi?: number
}

export interface ServeurGithub {
  base: string
  requetes: string[]
  fermer: () => Promise<void>
}

export async function demarrerServeurGithub(f: FixturesGithub): Promise<ServeurGithub> {
  const requetes: string[] = []
  const serveur = createServer((req, res) => {
    const chemin = decodeURIComponent(req.url ?? '')
    requetes.push(chemin)
    if (chemin.startsWith('/api/')) {
      if (f.statutApi) return void res.writeHead(f.statutApi).end('{}')
      const arbre = /^\/api\/repos\/([^/]+\/[^/]+)\/git\/trees\/HEAD\?recursive=1$/.exec(chemin)
      if (arbre) {
        const depot = f.depots[arbre[1]!]
        if (!depot) return void res.writeHead(404).end('{}')
        return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ tree: Object.keys(depot).map((path) => ({ path, type: 'blob' })), truncated: false }))
      }
      const licence = /^\/api\/repos\/([^/]+\/[^/]+)\/license$/.exec(chemin)
      if (licence) {
        const spdx = f.licences?.[licence[1]!]
        return void (spdx ? res.writeHead(200).end(JSON.stringify({ license: { spdx_id: spdx } })) : res.writeHead(404).end('{}'))
      }
    }
    const brut = /^\/raw\/([^/]+\/[^/]+)\/HEAD\/(.+)$/.exec(chemin)
    if (brut) {
      const contenu = f.depots[brut[1]!]?.[brut[2]!]
      return void (contenu === undefined ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type': 'text/plain' }).end(contenu))
    }
    res.writeHead(404).end()
  })
  const base = await ecouter(serveur)
  return { base, requetes, fermer: fermerServeur(serveur) }
}
