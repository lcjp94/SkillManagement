// Client d'un service d'IA compatible OpenAI : liste des modèles, test de connexion, génération en flux.
// Les messages d'erreur sont en français et ne relaient jamais le corps de la réponse du service.
import { ouvrir, requeteBornee, ReseauError, type OptionsRequete } from './http'

export interface Connexion {
  adresse: string
  cle?: string
  modele: string
}

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const sansBarre = (adresse: string): string => adresse.replace(/\/+$/, '')

function entetes(c: Connexion, json: boolean): Record<string, string> {
  return {
    Accept: json ? 'application/json' : 'text/event-stream',
    ...(c.cle ? { Authorization: `Bearer ${c.cle}` } : {}),
    'User-Agent': 'SkillManagement'
  }
}

const INATTENDU = 'Le service a répondu de façon inattendue. Vérifiez l’adresse.'

/** Message pour la personne selon le code de réponse du service. */
export function messagePourStatut(statut: number): string {
  if (statut === 401 || statut === 403) return 'Le service a refusé la clé. Vérifiez-la, ou créez-en une nouvelle sur le site du service.'
  if (statut === 404) return 'Le service ne connaît pas cette adresse ou ce modèle. Vérifiez l’adresse et le nom du modèle.'
  if (statut === 429) return 'Le service limite les demandes ou votre crédit est épuisé. Patientez un moment ou vérifiez votre forfait.'
  if (statut === 400 || statut === 422) return 'Le service a refusé la demande. Vérifiez le nom du modèle.'
  if (statut >= 500) return 'Le service rencontre un problème. Réessayez dans quelques minutes.'
  return INATTENDU
}

/** Identifiants de modèles d'une réponse /models ; le préfixe « models/ » de Gemini est retiré. */
export function extraireModeles(corps: string): string[] {
  let json: unknown
  try {
    json = JSON.parse(corps)
  } catch {
    throw new ReseauError(INATTENDU)
  }
  const racine = json as { data?: unknown; models?: unknown } | null
  const liste = racine?.data ?? racine?.models
  if (!Array.isArray(liste)) throw new ReseauError(INATTENDU)
  const ids = liste
    .map((m: unknown) => (typeof m === 'string' ? m : ((m as { id?: unknown })?.id ?? (m as { name?: unknown })?.name)))
    .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200)
    .map((id) => id.replace(/^models\//, ''))
  return Array.from(new Set(ids)).slice(0, 500)
}

export async function lireModeles(c: Connexion, options: OptionsRequete = {}): Promise<string[]> {
  const r = await requeteBornee(`${sansBarre(c.adresse)}/models`, { headers: entetes(c, true) }, { delaiMs: 15_000, tailleMax: 2_000_000, ...options })
  if (r.statut !== 200) throw new ReseauError(messagePourStatut(r.statut), r.statut)
  return extraireModeles(r.corps)
}

export interface ResultatTest {
  ok: boolean
  modeles: string[]
  message: string
}

const messageDe = (e: unknown): string => (e instanceof Error ? e.message : 'Connexion impossible.')

/** Lit /models (léger) ; si le service n'a pas cette route (404/405), se rabat sur une complétion minimale. */
export async function tester(c: Connexion, options: OptionsRequete = {}): Promise<ResultatTest> {
  try {
    const modeles = await lireModeles(c, options)
    return { ok: true, modeles, message: `Connexion réussie (${modeles.length} modèle${modeles.length > 1 ? 's' : ''} disponible${modeles.length > 1 ? 's' : ''}).` }
  } catch (e) {
    if (!(e instanceof ReseauError) || (e.statut !== 404 && e.statut !== 405)) return { ok: false, modeles: [], message: messageDe(e) }
  }
  try {
    const r = await requeteBornee(
      `${sansBarre(c.adresse)}/chat/completions`,
      { method: 'POST', headers: { ...entetes(c, true), 'Content-Type': 'application/json' }, body: JSON.stringify({ model: c.modele, messages: [{ role: 'user', content: 'ok' }], max_tokens: 1 }) },
      { delaiMs: 30_000, ...options }
    )
    if (r.statut !== 200) return { ok: false, modeles: [], message: messagePourStatut(r.statut) }
    return { ok: true, modeles: [], message: 'Connexion réussie.' }
  } catch (e) {
    return { ok: false, modeles: [], message: messageDe(e) }
  }
}

/** Texte d'une ligne d'une réponse en flux (format « data: {...} » du service). */
export function* extraireMorceaux(ligne: string): Generator<string> {
  if (!ligne.startsWith('data:')) return
  const donnee = ligne.slice(5).trim()
  if (donnee === '' || donnee === '[DONE]') return
  try {
    const delta = (JSON.parse(donnee) as { choices?: { delta?: { content?: unknown } }[] }).choices?.[0]?.delta?.content
    if (typeof delta === 'string' && delta) yield delta
  } catch {
    // ligne incomplète ou commentaire : ignorée
  }
}

/** Génération en flux. Le texte total est borné : un service qui ne s'arrête pas ne remplit pas la mémoire. */
export async function* generer(c: Connexion, messages: Message[], options: OptionsRequete & { tailleTexteMax?: number } = {}): AsyncGenerator<string> {
  const { tailleTexteMax = 60_000 } = options
  const { reponse, signal, fin } = await ouvrir(
    `${sansBarre(c.adresse)}/chat/completions`,
    { method: 'POST', headers: { ...entetes(c, false), 'Content-Type': 'application/json' }, body: JSON.stringify({ model: c.modele, messages, stream: true, temperature: 0.4 }) },
    { delaiMs: 180_000, ...options }
  )
  try {
    if (reponse.status !== 200) {
      await reponse.body?.cancel()
      throw new ReseauError(messagePourStatut(reponse.status), reponse.status)
    }
    if (!reponse.body) throw new ReseauError('Le service n’a rien renvoyé.')
    const lecteur = reponse.body.getReader()
    const decodeur = new TextDecoder()
    let reste = ''
    let total = 0
    for (;;) {
      let lu: ReadableStreamReadResult<Uint8Array>
      try {
        lu = await lecteur.read()
      } catch {
        if (signal.aborted && signal.reason instanceof Error) throw signal.reason
        throw new ReseauError('La connexion avec le service s’est interrompue.')
      }
      if (lu.done) break
      reste += decodeur.decode(lu.value, { stream: true })
      const lignes = reste.split(/\r?\n/)
      reste = lignes.pop() ?? ''
      for (const ligne of lignes) {
        for (const morceau of extraireMorceaux(ligne)) {
          total += morceau.length
          if (total > tailleTexteMax) {
            await lecteur.cancel()
            return
          }
          yield morceau
        }
      }
    }
    for (const morceau of extraireMorceaux(reste)) yield morceau
  } finally {
    fin()
  }
}
