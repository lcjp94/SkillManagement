// Disposition des fichiers à écrire pour chaque assistant : « où vont les skills sélectionnés ».
// Module pur : aucune lecture ni écriture de fichier. L'écriture sécurisée est faite en M4.
//
// Chaque disposition cite la documentation officielle consultée le 26 octobre 2026 (voir docs/ASSISTANTS.md).
// `verifie` reste false tant que la disposition n'a pas été essayée dans l'outil réel.
import type { AssistantId } from '@shared/schemas/catalog'
import { contientBalise, type Bloc } from './blocks'
import { corpsDuSkill } from './frontmatter'

export interface SkillAEcrire {
  slug: string
  name: string
  description: string
  content: string
}

export type FichierPlanifie =
  /** Fichier entier, créé ou remplacé (l'ancien est sauvegardé). */
  | { chemin: string; mode: 'fichier'; contenu: string; slug: string }
  /** Fichier partagé : un bloc balisé par skill, le reste du fichier est conservé. */
  | { chemin: string; mode: 'blocs'; entete: string; blocs: Bloc[] }
  /** Fichier de réglage créé seulement s'il n'existe pas ; un fichier existant n'est jamais modifié. */
  | { chemin: string; mode: 'creer-si-absent'; contenu: string }

export interface SkillRefuse {
  slug: string
  raison: string
}

export interface PlanEcriture {
  fichiers: FichierPlanifie[]
  refus: SkillRefuse[]
}

export type Portee = 'projet' | 'global'

export interface Disposition {
  id: AssistantId
  libelle: string
  accepteGlobal: boolean
  documentation: { url: string; consulteLe: string }
  /** false tant que la disposition n'a pas été essayée dans l'outil réel. */
  verifie: boolean
  /** Phrase lisible décrivant où iront les fichiers. */
  decrire: (portee: Portee) => string
  planifier: (skills: SkillAEcrire[]) => PlanEcriture
}

const CONSULTE_LE = '2026-10-26'

// Windsurf : « Workspace rule files are limited to 12,000 characters each »
const WINDSURF_MAX_CARACTERES = 12_000

const uneLigne = (texte: string): string => texte.replace(/\s+/g, ' ').trim()
/** Texte entre guillemets doubles, valide en YAML (un JSON valide est un scalaire YAML valide). */
const guillemets = (texte: string): string => JSON.stringify(uneLigne(texte))

interface SkillPret extends SkillAEcrire {
  corps: string
}

// Écarte ce qui ne peut être écrit sans risque, avant même de choisir les fichiers
function preparer(skills: SkillAEcrire[]): { prets: SkillPret[]; refus: SkillRefuse[] } {
  const prets: SkillPret[] = []
  const refus: SkillRefuse[] = []
  for (const skill of skills) {
    const corps = corpsDuSkill(skill.content)
    if (corps === '') refus.push({ slug: skill.slug, raison: 'Le skill est vide.' })
    else if (uneLigne(skill.description) === '') refus.push({ slug: skill.slug, raison: 'Le skill n\'a pas de description.' })
    else if (contientBalise(corps) || contientBalise(skill.description)) {
      refus.push({ slug: skill.slug, raison: 'Le contenu contient une balise réservée à SkillManagement.' })
    } else prets.push({ ...skill, corps })
  }
  return { prets, refus }
}

/** SKILL.md normalisé : le nom du dossier et le nom déclaré concordent. */
const skillMarkdown = (s: SkillPret): string =>
  `---\nname: ${s.slug}\ndescription: ${guillemets(s.description)}\n---\n\n${s.corps}\n`

function unFichierParSkill(construire: (s: SkillPret) => { chemin: string; contenu: string } | { refus: string }) {
  return (skills: SkillAEcrire[]): PlanEcriture => {
    const { prets, refus } = preparer(skills)
    const fichiers: FichierPlanifie[] = []
    for (const skill of prets) {
      const resultat = construire(skill)
      if ('refus' in resultat) refus.push({ slug: skill.slug, raison: resultat.refus })
      else fichiers.push({ chemin: resultat.chemin, mode: 'fichier', contenu: resultat.contenu, slug: skill.slug })
    }
    return { fichiers, refus }
  }
}

export const DISPOSITIONS: Record<AssistantId, Disposition> = {
  'claude-code': {
    id: 'claude-code',
    libelle: 'Claude Code',
    accepteGlobal: true,
    documentation: { url: 'https://code.claude.com/docs/en/skills', consulteLe: CONSULTE_LE },
    verifie: false,
    decrire: (portee) =>
      portee === 'global'
        ? 'Dans votre dossier personnel, sous .claude/skills/ : disponibles dans tous vos projets.'
        : 'Dans le dossier choisi, sous .claude/skills/ : un dossier par skill.',
    planifier: unFichierParSkill((s) => ({ chemin: `.claude/skills/${s.slug}/SKILL.md`, contenu: skillMarkdown(s) }))
  },
  cursor: {
    id: 'cursor',
    libelle: 'Cursor',
    accepteGlobal: false,
    documentation: { url: 'https://cursor.com/docs/context/rules', consulteLe: CONSULTE_LE },
    verifie: false,
    decrire: () => 'Dans le dossier choisi, sous .cursor/rules/ : une règle (.mdc) par skill.',
    // Sans « globs » ni « alwaysApply », la règle est proposée à l'assistant d'après sa description
    planifier: unFichierParSkill((s) => ({
      chemin: `.cursor/rules/${s.slug}.mdc`,
      contenu: `---\ndescription: ${guillemets(s.description)}\nalwaysApply: false\n---\n\n${s.corps}\n`
    }))
  },
  windsurf: {
    id: 'windsurf',
    libelle: 'Windsurf',
    accepteGlobal: false,
    documentation: { url: 'https://docs.devin.ai/desktop/cascade/memories', consulteLe: CONSULTE_LE },
    verifie: false,
    decrire: () => 'Dans le dossier choisi, sous .windsurf/rules/ : un fichier par skill.',
    // « model_decision » : seule la description reste en permanence dans le contexte de l'assistant
    planifier: unFichierParSkill((s) => {
      const contenu = `---\ntrigger: model_decision\ndescription: ${guillemets(s.description)}\n---\n\n${s.corps}\n`
      if (contenu.length > WINDSURF_MAX_CARACTERES) {
        return { refus: `Trop long pour Windsurf (${WINDSURF_MAX_CARACTERES.toLocaleString('fr-FR')} caractères au maximum par fichier).` }
      }
      return { chemin: `.windsurf/rules/${s.slug}.md`, contenu }
    })
  },
  copilot: {
    id: 'copilot',
    libelle: 'GitHub Copilot',
    accepteGlobal: false,
    documentation: {
      url: 'https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot',
      consulteLe: CONSULTE_LE
    },
    verifie: false,
    decrire: () =>
      'Dans le dossier choisi : un seul fichier .github/copilot-instructions.md, où chaque skill a son bloc. Vos propres instructions sont conservées.',
    planifier: (skills) => {
      const { prets, refus } = preparer(skills)
      return {
        fichiers: [
          {
            chemin: '.github/copilot-instructions.md',
            mode: 'blocs',
            entete: '# Instructions pour GitHub Copilot\n',
            blocs: prets.map((s) => ({ id: s.slug, texte: s.corps }))
          }
        ],
        refus
      }
    }
  },
  aider: {
    id: 'aider',
    libelle: 'Aider',
    accepteGlobal: false,
    documentation: { url: 'https://aider.chat/docs/usage/conventions.html', consulteLe: CONSULTE_LE },
    verifie: false,
    decrire: () => "Dans le dossier choisi : CONVENTIONS.md (un bloc par skill) et, s'il n'existe pas, .aider.conf.yml qui le charge.",
    // Aider ne charge pas CONVENTIONS.md tout seul : le fichier de réglage est indispensable
    planifier: (skills) => {
      const { prets, refus } = preparer(skills)
      return {
        fichiers: [
          { chemin: 'CONVENTIONS.md', mode: 'blocs', entete: '# Conventions\n', blocs: prets.map((s) => ({ id: s.slug, texte: s.corps })) },
          { chemin: '.aider.conf.yml', mode: 'creer-si-absent', contenu: 'read: CONVENTIONS.md\n' }
        ],
        refus
      }
    }
  },
  continue: {
    id: 'continue',
    libelle: 'Continue',
    accepteGlobal: false,
    documentation: { url: 'https://docs.continue.dev/customize/deep-dives/rules', consulteLe: CONSULTE_LE },
    verifie: false,
    decrire: () => 'Dans le dossier choisi, sous .continue/rules/ : un fichier par skill.',
    // « alwaysApply: false » est indispensable : sans lui la règle est toujours incluse
    planifier: unFichierParSkill((s) => ({
      chemin: `.continue/rules/${s.slug}.md`,
      contenu: `---\nname: ${guillemets(s.name)}\ndescription: ${guillemets(s.description)}\nalwaysApply: false\n---\n\n${s.corps}\n`
    }))
  },
  cline: {
    id: 'cline',
    libelle: 'Cline',
    accepteGlobal: false,
    documentation: { url: 'https://docs.cline.bot/features/cline-rules', consulteLe: CONSULTE_LE },
    verifie: false,
    decrire: () => 'Dans le dossier choisi, sous .clinerules/ : un fichier par skill (toujours actif).',
    // Sans en-tête, une règle Cline est toujours active : tout le texte compte dans le contexte
    planifier: unFichierParSkill((s) => ({ chemin: `.clinerules/${s.slug}.md`, contenu: `${s.corps}\n` }))
  },
  opencode: {
    id: 'opencode',
    libelle: 'OpenCode',
    accepteGlobal: false,
    documentation: { url: 'https://opencode.ai/docs/skills/', consulteLe: CONSULTE_LE },
    verifie: false,
    decrire: () => 'Dans le dossier choisi, sous .opencode/skills/ : un dossier par skill.',
    planifier: unFichierParSkill((s) => ({ chemin: `.opencode/skills/${s.slug}/SKILL.md`, contenu: skillMarkdown(s) }))
  }
}

export function getDisposition(id: string): Disposition | undefined {
  return Object.hasOwn(DISPOSITIONS, id) ? DISPOSITIONS[id as AssistantId] : undefined
}

export interface Chevauchement {
  assistants: AssistantId[]
  message: string
}

/**
 * Cas où deux assistants choisis pour le même dossier liraient les mêmes skills deux fois.
 * OpenCode lit aussi .claude/skills/ : l'écrire en plus de .opencode/skills/ crée des doublons.
 */
export function chevauchements(assistants: AssistantId[]): Chevauchement[] {
  const trouves: Chevauchement[] = []
  if (assistants.includes('claude-code') && assistants.includes('opencode')) {
    trouves.push({
      assistants: ['claude-code', 'opencode'],
      message:
        "OpenCode lit aussi les skills installés pour Claude Code (.claude/skills/) : en choisir les deux dans le même dossier les ferait apparaître en double dans OpenCode."
    })
  }
  return trouves
}
