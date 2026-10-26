import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  BlocIncompletError,
  baliseDebut,
  baliseFin,
  contientBalise,
  fusionnerBlocs,
  listerBlocs,
  neContientQueEntete,
  retirerBlocs
} from '../src/main/core/blocks'

const ENTETE = '# Instructions\n'
const a = { id: 'seo-technique', texte: 'Règle A\n- point' }
const b = { id: 'posts-linkedin', texte: 'Règle B' }

describe('fusionnerBlocs', () => {
  it('crée le fichier avec son en-tête et les blocs balisés', () => {
    expect(fusionnerBlocs(null, ENTETE, [a, b])).toBe(
      `# Instructions\n\n${baliseDebut(a.id)}\nRègle A\n- point\n${baliseFin(a.id)}\n\n${baliseDebut(b.id)}\nRègle B\n${baliseFin(b.id)}\n`
    )
  })

  it('conserve le texte de la personne, avant comme après un bloc existant', () => {
    const existant = `Mes règles\n\n${baliseDebut(a.id)}\nancien\n${baliseFin(a.id)}\n\nMa conclusion\n`
    const resultat = fusionnerBlocs(existant, ENTETE, [a])
    expect(resultat).toBe(`Mes règles\n\n${baliseDebut(a.id)}\nRègle A\n- point\n${baliseFin(a.id)}\n\nMa conclusion\n`)
  })

  it('est idempotente', () => {
    const une = fusionnerBlocs('Mon texte\n', ENTETE, [a, b])
    expect(fusionnerBlocs(une, ENTETE, [a, b])).toBe(une)
  })

  it('respecte les fins de ligne Windows du fichier existant', () => {
    const resultat = fusionnerBlocs('Mon texte\r\n', ENTETE, [a])
    expect(resultat).not.toMatch(/(?<!\r)\n/)
    expect(resultat.startsWith('Mon texte\r\n\r\n<!--')).toBe(true)
  })

  it('refuse un bloc dont la balise de fin manque, sans rien écrire', () => {
    const abime = `Texte\n${baliseDebut(a.id)}\nsuite sans fin\n`
    expect(() => fusionnerBlocs(abime, ENTETE, [a])).toThrow(BlocIncompletError)
  })

  it('ajoute une fin de ligne manquante en fin de fichier', () => {
    expect(fusionnerBlocs('sans fin de ligne', ENTETE, [b]).endsWith(`${baliseFin(b.id)}\n`)).toBe(true)
  })
})

describe('retirerBlocs', () => {
  it('rend le fichier à la personne tel qu\'elle l\'avait écrit', () => {
    const original = 'Mes instructions\n- une\n- deux\n'
    expect(retirerBlocs(fusionnerBlocs(original, ENTETE, [a, b]), [a.id, b.id])).toBe(original)
  })

  it('retire un seul bloc et laisse les autres', () => {
    const fichier = fusionnerBlocs('Début\n', ENTETE, [a, b])
    expect(listerBlocs(retirerBlocs(fichier, [a.id]))).toEqual([b.id])
  })

  it('ne colle pas deux lignes de la personne quand le bloc était au milieu', () => {
    const fichier = `Avant\n${baliseDebut(a.id)}\nx\n${baliseFin(a.id)}\nAprès\n`
    expect(retirerBlocs(fichier, [a.id])).toBe('Avant\nAprès\n')
  })

  it('ignore un bloc absent', () => {
    expect(retirerBlocs('Texte\n', ['inconnu'])).toBe('Texte\n')
  })

  it('reconnaît un fichier qui ne contient plus que son en-tête', () => {
    const cree = fusionnerBlocs(null, ENTETE, [a, b])
    expect(neContientQueEntete(cree, ENTETE, [a.id, b.id])).toBe(true)
    const modifie = fusionnerBlocs('Mon texte\n', ENTETE, [a])
    expect(neContientQueEntete(modifie, ENTETE, [a.id])).toBe(false)
  })
})

describe('contientBalise', () => {
  it.each([
    baliseDebut('x'),
    baliseFin('x'),
    '<!--skillforge:end y-->',
    '<!-- SKILLFORGE:BEGIN y -->'
  ])('détecte %s', (texte) => {
    expect(contientBalise(`avant ${texte} après`)).toBe(true)
  })

  it('laisse passer un commentaire HTML ordinaire', () => {
    expect(contientBalise('<!-- note -->')).toBe(false)
  })
})

describe('propriétés', () => {
  // Texte de la personne : lignes quelconques, sans balise, avec la fin de ligne du fichier
  const ligne = fc.string({ maxLength: 40 }).filter((l) => !l.includes('\n') && !l.includes('\r') && !contientBalise(l))
  const ids = fc.uniqueArray(fc.constantFrom('a', 'b-c', 'seo', 'x1', 'zz'), { minLength: 1, maxLength: 5 })
  const eol = fc.constantFrom('\n', '\r\n')
  const texteBloc = fc.array(ligne, { minLength: 1, maxLength: 4 }).map((l) => l.join('\n')).filter((t) => t.trim() !== '')

  it('ajouter puis retirer les blocs rend le fichier de départ (à la fin de ligne finale près)', () => {
    fc.assert(
      fc.property(fc.array(ligne, { maxLength: 6 }), eol, fc.boolean(), ids, texteBloc, (lignes, fin, finale, liste, corps) => {
        const original = lignes.join(fin) + (finale && lignes.length > 0 ? fin : '')
        const blocs = liste.map((id) => ({ id, texte: corps }))
        const fusionne = fusionnerBlocs(original, ENTETE, blocs)
        const retire = retirerBlocs(fusionne, liste)
        // Un fichier sans aucun saut de ligne n'a pas de fin de ligne reconnaissable : \n par défaut
        const eolReconnue = original.includes('\r\n') ? '\r\n' : '\n'
        const attendu = original === '' ? '' : original.endsWith(eolReconnue) ? original : original + eolReconnue
        // Un fichier vide devient l'en-tête seul : cas couvert par neContientQueEntete
        if (original === '') return neContientQueEntete(fusionne, ENTETE, liste)
        return retire === attendu
      }),
      { numRuns: 500 }
    )
  })

  it('ne modifie jamais une ligne de la personne', () => {
    fc.assert(
      fc.property(fc.array(ligne, { minLength: 1, maxLength: 6 }), ids, texteBloc, (lignes, liste, corps) => {
        const original = lignes.join('\n') + '\n'
        const fusionne = fusionnerBlocs(original, ENTETE, liste.map((id) => ({ id, texte: corps })))
        return fusionne.startsWith(original)
      }),
      { numRuns: 500 }
    )
  })

  it('fusionner deux fois donne le même fichier', () => {
    fc.assert(
      fc.property(fc.array(ligne, { maxLength: 6 }), ids, texteBloc, (lignes, liste, corps) => {
        const blocs = liste.map((id) => ({ id, texte: corps }))
        const une = fusionnerBlocs(lignes.join('\n'), ENTETE, blocs)
        return fusionnerBlocs(une, ENTETE, blocs) === une
      }),
      { numRuns: 300 }
    )
  })
})
