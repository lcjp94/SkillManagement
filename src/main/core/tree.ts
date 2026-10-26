// Arborescence d'un projet : gabarit selon la nature du projet, plus des dossiers par besoin.
// Le dossier de l'assistant (.claude/skills…) vient de la disposition, jamais d'ici.
import type { Profiles } from '@shared/schemas/catalog'
import type { FichierPlanifie } from './layouts'

export interface Gabarit {
  libelle: string
  dossiers: string[]
}

export const GABARITS: Record<string, Gabarit> = {
  aucun: { libelle: 'Aucune arborescence', dossiers: [] },
  developpement: { libelle: 'Développement', dossiers: ['src', 'tests', 'docs'] },
  documents: { libelle: 'Documents', dossiers: ['brouillons', 'a-relire', 'termines'] },
  recherche: { libelle: 'Recherche', dossiers: ['sources', 'notes', 'syntheses'] },
  juridique: { libelle: 'Juridique', dossiers: ['dossiers', 'modeles', 'veille'] },
  enseignement: { libelle: 'Enseignement', dossiers: ['sequences', 'evaluations', 'ressources'] },
  rh: { libelle: 'Ressources humaines', dossiers: ['recrutement', 'entretiens', 'integration'] },
  finance: { libelle: 'Finance', dossiers: ['budgets', 'previsions', 'controles'] },
  marketing: { libelle: 'Marketing', dossiers: ['campagnes', 'contenus', 'analyses'] }
}

// Un jeu de dossiers par besoin du référentiel : le test vérifie qu'aucun besoin n'en manque
export const DOSSIERS_BESOIN: Record<string, string[]> = {
  seo: ['seo/mots-cles', 'seo/audits'],
  'reseaux-sociaux': ['reseaux/calendrier', 'reseaux/brouillons'],
  'redaction-web': ['redaction/articles', 'redaction/brouillons'],
  newsletter: ['newsletter/editions', 'newsletter/brouillons'],
  veille: ['veille/sources', 'veille/syntheses'],
  'analyse-donnees': ['donnees/brutes', 'donnees/analyses'],
  presentations: ['presentations/plans', 'presentations/diaporamas'],
  video: ['video/scripts', 'video/montages'],
  'gestion-projet': ['projet/planning', 'projet/comptes-rendus'],
  'qualite-code': ['qualite/revues'],
  'securite-code': ['securite/audits'],
  deploiement: ['deploiement/scripts'],
  juridique: ['juridique/dossiers', 'juridique/modeles'],
  enseignement: ['enseignement/sequences', 'enseignement/evaluations'],
  rh: ['rh/recrutement', 'rh/entretiens'],
  finance: ['finance/budgets', 'finance/previsions']
}

export interface DemandeArborescence {
  gabarit: string
  extras: string[]
  besoins: string[]
  /** Un README.md d'orientation par dossier de premier niveau (facultatif). */
  readme: boolean
}

export interface PlanArborescence {
  dossiers: string[]
  readmes: FichierPlanifie[]
}

/** Dossiers à créer (chemins relatifs, « / »), sans doublon, du plus court au plus long. */
export function planArborescence(demande: DemandeArborescence, profiles: Profiles): PlanArborescence {
  const gabarit = Object.hasOwn(GABARITS, demande.gabarit) ? GABARITS[demande.gabarit]! : GABARITS.aucun!
  const libelles = new Map(profiles.besoins.map((b) => [b.id, b.libelle]))
  const liste: string[] = [...gabarit.dossiers]
  for (const id of new Set(demande.besoins)) {
    if (Object.hasOwn(DOSSIERS_BESOIN, id)) liste.push(...DOSSIERS_BESOIN[id]!)
  }
  // Un dossier qui commence par un point appartiendrait à un assistant ou à un outil : jamais ici
  liste.push(...demande.extras.filter((e) => !e.startsWith('.')))
  const vus = new Set<string>()
  const dossiers = liste.filter((d) => {
    const cle = d.toLocaleLowerCase('fr')
    if (vus.has(cle)) return false
    vus.add(cle)
    return true
  })
  dossiers.sort((a, b) => a.length - b.length || a.localeCompare(b))

  const readmes: FichierPlanifie[] = []
  if (demande.readme) {
    const racines = Array.from(new Set(dossiers.map((d) => d.split('/')[0]!)))
    for (const racine of racines) {
      const besoin = Object.entries(DOSSIERS_BESOIN).find(([, ds]) => ds.some((d) => d.startsWith(`${racine}/`)))
      const sujet = besoin ? libelles.get(besoin[0]) : undefined
      readmes.push({
        chemin: `${racine}/README.md`,
        mode: 'creer-si-absent',
        contenu: `# ${racine}\n\nDossier créé par SkillManagement${sujet ? ` pour le besoin « ${sujet} »` : ''}.\nVous pouvez y ranger vos fichiers et supprimer ce texte.\n`
      })
    }
  }
  return { dossiers, readmes }
}
