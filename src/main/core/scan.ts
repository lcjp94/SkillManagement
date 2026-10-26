// Pré-analyse statique d'un skill. Logique pure : les règles viennent de scan-rules.json (déjà validé).
// Elle repère des motifs à risque ; elle ne remplace pas un scan complet (SkillSpector, voir M6).
import type { ScanRules } from '@shared/schemas/catalog'

export type Gravite = 'high' | 'medium' | 'low'
export type StatutScan = 'clean' | 'warning' | 'danger'

export interface ProblemeScan {
  severity: Gravite
  category: string
  message: string
  excerpt?: string
}

export interface ResultatScan {
  status: StatutScan
  rulesChecked: number
  issues: ProblemeScan[]
}

// Les motifs de JavaScript rétro-pointent : sur un texte hostile de plusieurs centaines de Ko, la règle
// d'exécution distante dépasse la seconde (mesuré : 2,3 s pour 200 Ko). Un skill légitime tient en quelques Ko
// (le plus long du catalogue : 1,4 Ko). Au-delà de cette taille, on refuse plutôt que d'analyser à moitié.
export const TAILLE_MAX_ANALYSE = 100_000

// Le motif d'exécution distante (curl … | sh) reste quadratique sur une ligne démesurée : mesuré à 2,3 s pour 100 Ko
// de « curl | » sur une seule ligne. Une ligne de skill dépasse rarement quelques centaines de caractères (la plus
// longue du catalogue : 223). Au-delà, on refuse plutôt que d'analyser à moitié ; et le motif est borné à la même
// longueur, donc un « curl » suivi d'un « | sh » 2 500 caractères plus loin est encore vu.
export const LIGNE_MAX_ANALYSE = 3000

// Lettres cyrilliques et grecques qui ressemblent à des lettres latines : « сurl » (с cyrillique) échappe
// sinon à toutes les règles. Liste des cas courants, pas un référentiel exhaustif d'homoglyphes.
const HOMOGLYPHES: Record<string, string> = {
  а: 'a', в: 'b', с: 'c', ԁ: 'd', е: 'e', һ: 'h', і: 'i', ј: 'j', к: 'k', ӏ: 'l', м: 'm', о: 'o', р: 'p', ԛ: 'q',
  ѕ: 's', т: 't', ս: 'u', ѵ: 'v', ԝ: 'w', х: 'x', у: 'y', ᴢ: 'z',
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', І: 'I', Ј: 'J', К: 'K', М: 'M', О: 'O', Р: 'P', Ѕ: 'S', Т: 'T', Х: 'X', У: 'Y',
  α: 'a', ε: 'e', ι: 'i', κ: 'k', ο: 'o', ρ: 'p', τ: 't', υ: 'u', ν: 'v', χ: 'x', γ: 'y',
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X'
}
const RE_HOMOGLYPHES = new RegExp(`[${Object.keys(HOMOGLYPHES).join('')}]`, 'g')

// Caractères sans usage légitime dans un skill, utilisés pour cacher du texte aux yeux de la personne :
// plage « tags » (U+E0000 à U+E007F, texte invisible lisible par un modèle) et surcharges de sens de lecture.
const CARACTERES_CACHES = /[\u{E0000}-\u{E007F}‪-‮⁦-⁩]/u
const INVISIBLES_SUPPLEMENTAIRES = /[\u{E0000}-\u{E007F}‪-‮⁦-⁩᠎⁡-⁤]/gu

function recapituler(issues: ProblemeScan[], rulesChecked: number): ResultatScan {
  const status: StatutScan = issues.some((i) => i.severity === 'high')
    ? 'danger'
    : issues.some((i) => i.severity === 'medium')
      ? 'warning'
      : 'clean'
  return { status, rulesChecked, issues }
}

export function creerScanner(regles: ScanRules): (contenu: string) => ResultatScan {
  const invisibles = new RegExp(regles.stripPattern, 'g')
  const compilees = regles.rules.map((regle) => ({
    severity: regle.severity,
    category: regle.category,
    message: regle.message,
    re: new RegExp(regle.pattern, 'i'),
    reTous: new RegExp(regle.pattern, 'gi'),
    sauf: regle.unless ? new RegExp(regle.unless, 'i') : null
  }))
  const total = compilees.length + 2 // + contrôles de taille et de caractères cachés

  return (contenu) => {
    const brut = contenu ?? ''
    if (brut.length > TAILLE_MAX_ANALYSE) {
      return recapituler(
        [{ severity: 'high', category: 'taille', message: 'Contenu trop volumineux pour être analysé sérieusement' }],
        total
      )
    }

    const issues: ProblemeScan[] = []
    if (CARACTERES_CACHES.test(brut)) {
      issues.push({ severity: 'high', category: 'caractères cachés', message: 'Contient du texte invisible ou un sens de lecture détourné' })
    }

    // Neutralise les variantes Unicode, les caractères invisibles et les homoglyphes utilisés pour échapper aux règles
    const texte = brut
      .normalize('NFKC')
      .replace(invisibles, '')
      .replace(INVISIBLES_SUPPLEMENTAIRES, '')
      .replace(RE_HOMOGLYPHES, (lettre) => HOMOGLYPHES[lettre] ?? lettre)

    if (texte.split('\n').some((ligne) => ligne.length > LIGNE_MAX_ANALYSE)) {
      return recapituler(
        [...issues, { severity: 'high', category: 'taille', message: `Une ligne dépasse ${LIGNE_MAX_ANALYSE.toLocaleString('fr-FR')} caractères : elle ne peut pas être analysée sérieusement` }],
        total
      )
    }

    for (const regle of compilees) {
      let trouve: string | null = null
      if (!regle.sauf) {
        trouve = texte.match(regle.re)?.[0] ?? null
      } else {
        // « unless » : une correspondance qui satisfait aussi ce motif est ignorée
        for (const m of texte.matchAll(regle.reTous)) {
          if (!regle.sauf.test(m[0])) {
            trouve = m[0]
            break
          }
        }
      }
      if (trouve !== null) {
        issues.push({ severity: regle.severity, category: regle.category, message: regle.message, excerpt: trouve.slice(0, 120) })
      }
    }
    return recapituler(issues, total)
  }
}
