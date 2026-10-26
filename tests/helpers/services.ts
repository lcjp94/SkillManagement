// Services complets sur un dossier temporaire, avec de faux écrans natifs : pour tester le contrat sans Electron.
import { join } from 'node:path'
import { CoffreCles, type Chiffrement } from '../../src/main/ai/coffre'
import { Redactions } from '../../src/main/ai/redactions'
import { SkillSpector, type Lancer } from '../../src/main/securite/skillspector'
import { Sources, type ConfigSources } from '../../src/main/sources/github'
import { getCatalogue } from '../../src/shared/data'
import { ReglagesStockesSchema, type ReglagesStockes } from '../../src/shared/schemas/reglages'
import type { Dialogues, Services } from '../../src/main/services/contexte'
import { JsonStore } from '../../src/main/store/json-store'
import { creerStoreEtat } from '../../src/main/store/state-store'
import { creerBanc, type Banc } from './disque'

export interface BancServices extends Banc {
  s: Services
  /** Réponses des écrans natifs, consommées dans l'ordre. */
  ecrans: { dossiers: (string | null)[]; fichiersProjet: (string | null)[]; exports: { nom: string; contenu: string }[]; ouverts: string[] }
}

/** Chiffrement de test : brouille le texte (jamais lisible tel quel dans le fichier), sans dépendre du système. */
export const chiffrementDeTest: Chiffrement = {
  disponible: async () => true,
  chiffrer: async (t) => Buffer.from(`enc:${[...t].reverse().join('')}`),
  dechiffrer: async (b) => [...b.toString().replace(/^enc:/, '')].reverse().join('')
}

export interface OptionsBanc {
  /** Faux lanceur pour l'analyse approfondie ; sans lui, l'outil est absent. */
  lancerApprofondie?: Lancer
  sources?: Partial<ConfigSources>
  chiffrement?: Chiffrement
  miseAJour?: Services['miseAJour']
}

export async function creerBancServices(options: OptionsBanc = {}): Promise<BancServices> {
  const banc = await creerBanc()
  const ecrans: BancServices['ecrans'] = { dossiers: [], fichiersProjet: [], exports: [], ouverts: [] }
  const dialogues: Dialogues = {
    choisirDossier: async () => ecrans.dossiers.shift() ?? null,
    ouvrirDossier: async (chemin) => void ecrans.ouverts.push(chemin),
    lireFichierProjet: async () => ecrans.fichiersProjet.shift() ?? null,
    enregistrerFichierProjet: async (nom, contenu) => {
      ecrans.exports.push({ nom, contenu })
      return true
    }
  }
  const etat = creerStoreEtat(banc.donnees)
  await etat.load()
  const reglages = new JsonStore<ReglagesStockes>({
    fichier: join(banc.donnees, 'settings.json'),
    versionCourante: 1,
    schema: ReglagesStockesSchema,
    creer: () => ({ version: 1 as const, theme: 'auto' as const })
  })
  await reglages.load()
  const chiffrement = options.chiffrement ?? chiffrementDeTest
  const skillspector = new SkillSpector(options.lancerApprofondie ? { executable: 'skillspector-de-test', lancer: options.lancerApprofondie } : { executable: null })
  let n = 0
  let minute = 0
  const s: Services = {
    etat,
    reglages,
    ctx: banc.ctx,
    catalogue: getCatalogue(),
    info: { nom: 'SkillManagement', version: '0.1.0', plateforme: 'win32', reprises: 0, analyseApprofondie: await skillspector.info() },
    dialogues,
    nouvelId: () => `id-${String(++n).padStart(6, '0')}`,
    maintenant: () => new Date(Date.UTC(2026, 9, 26, 12, ++minute)),
    imports: new Map(),
    coffre: new CoffreCles(join(banc.donnees, 'secrets.bin'), chiffrement),
    coffreDisponible: await chiffrement.disponible(),
    redactions: new Redactions(),
    // Les faux serveurs sont en « localhost » ; les noms réels se résolvent vers une adresse publique fixe
    reseau: { resolveur: async (hote) => (hote === 'localhost' ? ['127.0.0.1'] : ['93.184.216.34']) },
    skillspector,
    miseAJour: options.miseAJour ?? { etat: () => ({ statut: 'inactive' }), verifier: async () => ({ statut: 'inactive' }), telecharger: async () => undefined, installer: async () => undefined },
    sources: new Sources({ apiBase: 'http://localhost:1/api', rawBase: 'http://localhost:1/raw', ...options.sources })
  }
  return { ...banc, s, ecrans }
}
