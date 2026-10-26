// Rédactions en cours : le texte arrive par morceaux, l'interface le relit à intervalle régulier.
// Une seule rédaction à la fois ; elle peut être annulée.

export type EtatRedaction = 'en-cours' | 'termine' | 'erreur' | 'annule'

export interface Redaction {
  id: string
  etat: EtatRedaction
  texte: string
  erreur?: string
  /** Ce que la personne a demandé : sert à compléter le skill rédigé. */
  meta: string
}

interface Interne extends Redaction {
  controle: AbortController
  fin?: number
}

const CONSERVATION_MS = 10 * 60_000

export class Redactions {
  private readonly taches = new Map<string, Interne>()

  constructor(private readonly maintenant: () => number = Date.now) {}

  /** Lance la consommation du flux. `source` reçoit le signal d'annulation. */
  demarrer(id: string, meta: string, source: (signal: AbortSignal) => AsyncGenerator<string>): void {
    this.purger()
    if ([...this.taches.values()].some((t) => t.etat === 'en-cours')) throw new Error('rédaction déjà en cours')
    const tache: Interne = { id, etat: 'en-cours', texte: '', meta, controle: new AbortController() }
    this.taches.set(id, tache)
    void (async () => {
      try {
        for await (const morceau of source(tache.controle.signal)) {
          if (tache.etat !== 'en-cours') return
          tache.texte += morceau
        }
        if (tache.etat === 'en-cours') tache.etat = 'termine'
      } catch (e) {
        if (tache.etat === 'en-cours') {
          tache.etat = 'erreur'
          tache.erreur = e instanceof Error ? e.message : 'La rédaction a échoué.'
        }
      } finally {
        tache.fin = this.maintenant()
      }
    })()
  }

  lire(id: string): Redaction | null {
    const t = this.taches.get(id)
    return t ? { id: t.id, etat: t.etat, texte: t.texte, meta: t.meta, ...(t.erreur ? { erreur: t.erreur } : {}) } : null
  }

  annuler(id: string): void {
    const t = this.taches.get(id)
    if (t?.etat !== 'en-cours') return
    t.etat = 'annule'
    t.controle.abort()
  }

  private purger(): void {
    const limite = this.maintenant() - CONSERVATION_MS
    for (const [id, t] of this.taches) if (t.fin !== undefined && t.fin < limite) this.taches.delete(id)
  }
}
