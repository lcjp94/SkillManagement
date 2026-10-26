// Aides des parcours de bout en bout : application compilée, dossier de données jetable, écrans natifs remplacés par des crochets.
import { _electron as electron, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface Session {
  app: ElectronApplication
  page: Page
  donnees: string
  /** Dossiers de projet créés pour le test, dans l'ordre où le sélecteur les rendra. */
  dossiers: string[]
  fermer: () => Promise<void>
}

export async function lancer(
  options: { dossiers?: number; donnees?: string; importFichier?: string; exportFichier?: string; github?: string; analyseApprofondie?: boolean } = {}
): Promise<Session> {
  const donnees = options.donnees ?? mkdtempSync(join(tmpdir(), 'sm-e2e-donnees-'))
  const dossiers = Array.from({ length: options.dossiers ?? 2 }, () => mkdtempSync(join(tmpdir(), 'sm-e2e-projet-')))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${donnees}`],
    env: {
      ...process.env,
      // Crochets de test, lus seulement par l'application non empaquetée
      SKILLMANAGEMENT_TEST_DOSSIERS: dossiers.join('|'),
      ...(options.importFichier ? { SKILLMANAGEMENT_TEST_IMPORT: options.importFichier } : {}),
      ...(options.exportFichier ? { SKILLMANAGEMENT_TEST_EXPORT: options.exportFichier } : {}),
      ...(options.github ? { SKILLMANAGEMENT_TEST_GITHUB: options.github } : {}),
      // Par défaut l'outil d'analyse approfondie est ignoré : les parcours ne dépendent pas de la machine
      ...(options.analyseApprofondie ? {} : { SKILLMANAGEMENT_TEST_SKILLSPECTOR: 'aucun' })
    }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, donnees, dossiers, fermer: () => app.close() }
}

export const contenu = (dossier: string): string[] => {
  try {
    return readdirSync(dossier)
  } catch {
    return []
  }
}

export const creerDossier = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'sm-e2e-'))
  mkdirSync(d, { recursive: true })
  return d
}

const MOTS_INTERDITS = /\b(tokens?|API|CLI|LLM|prompts?|frontmatter|hooks?|MCP|JSON|YAML|SkillSpector)\b|variables? d.environnement/i
const MOTS_D_USAGE = /inutilis|jamais utilis|utilisations?\b|\busage\b|\bcompteur/i

/**
 * Texte de l'interface tel que la personne le voit : sans le contenu replié d'un « Voir le détail » et sans les
 * noms de skills ou de projets (données, pas libellés).
 */
export async function texteInterface(page: Page): Promise<string> {
  return page.evaluate(() => {
    const morceaux: string[] = []
    const marcheur = document.createTreeWalker(document.getElementById('root')!, NodeFilter.SHOW_TEXT)
    for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
      const el = n.parentElement
      if (!el || el.closest('[data-donnee], script, style, [aria-hidden="true"]')) continue
      const replie = el.closest('details:not([open])')
      if (replie && !el.closest('summary')) continue
      // Une fenêtre de dialogue fermée n'est pas affichée
      const dialogue = el.closest('dialog')
      if (dialogue && !dialogue.open) continue
      const texte = (n.textContent ?? '').trim()
      if (texte) morceaux.push(texte)
    }
    return morceaux.join(' ')
  })
}

/** Vérifie les règles de § 13.5 sur l'écran affiché : un seul h1, pas de jargon, rien sur l'usage, champs nommés. */
export async function verifierEcran(page: Page, nom: string): Promise<void> {
  const texte = await texteInterface(page)
  expect(texte, `jargon sur « ${nom} »`).not.toMatch(MOTS_INTERDITS)
  expect(texte, `mention de l'usage sur « ${nom} »`).not.toMatch(MOTS_D_USAGE)
  expect(await page.locator('h1').count(), `un seul h1 sur « ${nom} »`).toBe(1)
  const sansNom = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLInputElement>('input, select, textarea'))
      .filter((c) => c.type !== 'hidden' && !c.closest('dialog:not([open])'))
      .filter((c) => c.labels?.length === 0 && !c.getAttribute('aria-label') && !c.getAttribute('aria-labelledby'))
      .map((c) => c.outerHTML.slice(0, 80))
  )
  expect(sansNom, `champs sans nom sur « ${nom} »`).toEqual([])
}

// Électron ne sait pas ouvrir la page secondaire qu'utilise @axe-core/playwright : on injecte le moteur axe
// (axe-core, installé avec ce paquet) directement dans la page, ce qui donne les mêmes règles.
const sourceAxe = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

interface ResultatAxe {
  violations: { id: string; nodes: { html: string; any: { message: string }[] }[] }[]
}

/** Audit d'accessibilité WCAG 2.1 AA (règles de contraste comprises) dans les deux thèmes. */
export async function auditerAccessibilite(page: Page, nom: string): Promise<void> {
  await page.evaluate(sourceAxe)
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme })
    // Les transitions de couleur (120 ms) doivent être terminées : axe lirait sinon une couleur à mi-chemin
    await page.waitForTimeout(300)
    const r = (await page.evaluate(() =>
      (globalThis as unknown as { axe: { run(c: Document, o: unknown): Promise<unknown> } }).axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
      })
    )) as ResultatAxe
    const resume = r.violations.map((v) => `${v.id} (${v.nodes.length}) : ${v.nodes[0]?.html.slice(0, 140)} → ${v.nodes[0]?.any[0]?.message}`)
    expect(resume, `accessibilité de « ${nom} » en thème ${theme}`).toEqual([])
  }
  await page.emulateMedia({ colorScheme: null })
  await page.waitForTimeout(300)
}

/** Réponses du parcours de démarrage. */
export async function demarrer(
  page: Page,
  choix: { assistants?: string[]; prenom?: string; metier?: string; aisance?: string; objectifs?: string[] } = {}
): Promise<void> {
  const { assistants = ['Claude Code'], prenom = 'Camille', metier = 'Juridique / droit', aisance = 'Débutant', objectifs = ['Travailler le droit'] } = choix
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quels assistants IA utilisez-vous ?')
  for (const a of assistants) await cocher(page.getByRole('checkbox', { name: a, exact: true }))
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByLabel('Prénom').fill(prenom)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await cocher(page.getByRole('radio', { name: new RegExp(metier.replace(/[/]/g, '\\/')) }))
  await page.getByRole('button', { name: 'Continuer' }).click()
  await cocher(page.getByRole('radio', { name: new RegExp(`^${aisance}`) }))
  await page.getByRole('button', { name: 'Continuer' }).click()
  for (const o of objectifs) await cocher(page.getByRole('checkbox', { name: o, exact: true }))
  await page.getByRole('button', { name: 'Continuer' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Voici ce que nous vous proposons')
  await expect(page.getByRole('button', { name: /Créer « Mon premier projet »/ })).toBeEnabled()
}

/** Appel direct d'un canal, pour lire l'état réel sans passer par l'écran (jamais pour agir à la place de la personne). */
export function lire<T>(page: Page, canal: string, entree?: unknown): Promise<T> {
  return page.evaluate(
    ([c, e]) => (window as unknown as { skillmanagement: { invoke(c: string, e?: unknown): Promise<unknown> } }).skillmanagement.invoke(c as string, e),
    [canal, entree] as const
  ) as Promise<T>
}

/**
 * Coche ou décoche une carte comme le ferait la personne : un clic sur la carte (l'étiquette), pas sur la case
 * native qui n'est là que pour le clavier et les lecteurs d'écran.
 */
export async function cocher(champ: Locator, etat = true): Promise<void> {
  if ((await champ.isChecked()) !== etat) await champ.locator('xpath=..').click()
  await expect(champ).toBeChecked({ checked: etat })
}
