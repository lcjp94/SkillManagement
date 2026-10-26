// Services complets sur un dossier temporaire, avec de faux écrans natifs : pour tester le contrat sans Electron.
import { z } from 'zod'
import { getCatalogue } from '../../src/shared/data'
import type { Dialogues, ReglagesStockes, Services } from '../../src/main/services/contexte'
import { JsonStore } from '../../src/main/store/json-store'
import { creerStoreEtat } from '../../src/main/store/state-store'
import { creerBanc, type Banc } from './disque'

export interface BancServices extends Banc {
  s: Services
  /** Réponses des écrans natifs, consommées dans l'ordre. */
  ecrans: { dossiers: (string | null)[]; fichiersProjet: (string | null)[]; exports: { nom: string; contenu: string }[]; ouverts: string[] }
}

export async function creerBancServices(): Promise<BancServices> {
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
    fichier: `${banc.donnees}/settings.json`,
    versionCourante: 1,
    schema: z.object({ version: z.literal(1), theme: z.enum(['auto', 'clair', 'sombre']) }),
    creer: () => ({ version: 1 as const, theme: 'auto' as const })
  })
  await reglages.load()
  let n = 0
  let minute = 0
  const s: Services = {
    etat,
    reglages,
    ctx: banc.ctx,
    catalogue: getCatalogue(),
    info: { nom: 'SkillManagement', version: '0.1.0', plateforme: 'win32', reprises: 0 },
    dialogues,
    nouvelId: () => `id-${String(++n).padStart(6, '0')}`,
    maintenant: () => new Date(Date.UTC(2026, 9, 26, 12, ++minute)),
    imports: new Map()
  }
  return { ...banc, s, ecrans }
}
