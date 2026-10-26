// Parcours de bout en bout dans l'application compilée. Chaque test reprend un défaut réel de la première version
// (CLAUDE.md § 15) ; le numéro est rappelé dans le titre.
import { expect, test, type Page } from '@playwright/test'
import { appendFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { auditerAccessibilite, cocher, contenu, demarrer, lancer, lire, texteInterface, verifierEcran } from './aide'

test.setTimeout(180_000)

interface Carte {
  projet: { id: string; nom: string }
  etat: { type: string; nombre: number }
  selectionnes: number
  installes: number
}
const projets = (page: Page) => lire<Carte[]>(page, 'projets.liste', {})

const skillsInstalles = (dossier: string): string[] => {
  const d = join(dossier, '.claude', 'skills')
  return existsSync(d) ? readdirSync(d) : []
}

test('#2 #3 #4 #5 #8 #11 : de la sélection à l\'installation vérifiée sur le disque, puis la désinstallation', async () => {
  const s = await lancer({ dossiers: 1 })
  const { page } = s
  const dossier = s.dossiers[0]!
  try {
    // --- #4 : le parcours de démarrage ne demande ni clé ni compte
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quels assistants IA utilisez-vous ?')
    await expect(page.getByText('Aucune clé ni compte n’est nécessaire.')).toBeVisible()
    expect(await page.locator('input[type=password]').count()).toBe(0)
    expect(await page.getByLabel(/clé|api|jeton|mot de passe/i).count()).toBe(0)
    await verifierEcran(page, 'Démarrage – assistants')
    await auditerAccessibilite(page, 'Démarrage – assistants')

    await demarrer(page)

    // --- #2 : à la fin du parcours, l'interface dit « sélectionnés », jamais « installés »
    const texte = await texteInterface(page)
    expect(texte).toMatch(/\d+ skills? sélectionnés?/)
    expect(texte).not.toMatch(/\d+ skills? installés?/)
    await verifierEcran(page, 'Démarrage – proposition')
    await auditerAccessibilite(page, 'Démarrage – proposition')

    await page.getByRole('button', { name: /Créer « Mon premier projet »/ }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mon premier projet')
    await expect(page.getByRole('tab', { name: 'Déploiements' })).toHaveAttribute('aria-selected', 'true')
    const [carte] = await projets(page)
    const total = carte!.selectionnes
    expect(total).toBeGreaterThan(0)
    expect(carte!.etat.type).toBe('jamais')
    await expect(page.getByText('Jamais appliqué')).toBeVisible()
    await verifierEcran(page, 'Fiche projet – déploiements')

    // --- #3 : le dossier est demandé ; l'aperçu n'écrit rien
    await expect(page.getByText('Aucun dossier choisi').first()).toBeVisible()
    await page.getByRole('button', { name: 'Choisir un dossier et installer' }).click()
    const dialogue = page.getByRole('dialog', { name: 'Installer dans Claude Code' })
    await expect(dialogue).toBeVisible()
    await expect(dialogue).toContainText(basename(dossier))
    await expect(dialogue.getByRole('button', { name: new RegExp(`^Installer ${total} nouveaux? skills?$`) })).toBeVisible()
    expect(contenu(dossier)).toEqual([])
    await verifierEcran(page, 'Aperçu avant installation')
    await auditerAccessibilite(page, 'Aperçu avant installation')

    // Échap ferme la fenêtre sans rien écrire
    await page.keyboard.press('Escape')
    await expect(dialogue).toBeHidden()
    expect(contenu(dossier)).toEqual([])

    // --- Installation : « installé » n'apparaît qu'après l'écriture, et c'est vérifié sur le disque
    await page.getByRole('button', { name: new RegExp(`^Installer ${total} nouveaux? skills?$`) }).click()
    await expect(dialogue).toBeVisible()
    await dialogue.getByRole('button', { name: new RegExp(`^Installer ${total} nouveaux? skills?$`) }).click()
    await expect(page.getByText(/Vérifié sur votre disque/)).toBeVisible()
    expect(skillsInstalles(dossier)).toHaveLength(total)
    for (const nom of skillsInstalles(dossier)) expect(existsSync(join(dossier, '.claude', 'skills', nom, 'SKILL.md'))).toBe(true)
    await expect(page.getByText(new RegExp(`${total} skills? installés? sur le disque`))).toBeVisible()
    await expect(page.getByText('À jour').first()).toBeVisible()

    // --- #5 : assistant et dossier sont mémorisés, même après un redémarrage de la fenêtre
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mon premier projet')
    await expect(page.getByText(basename(dossier)).first()).toBeVisible()
    await page.getByRole('link', { name: 'Projets', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Projets')
    await expect(page.getByText('À jour')).toBeVisible()
    await verifierEcran(page, 'Projets')
    await auditerAccessibilite(page, 'Projets')
    await page.getByRole('link', { name: 'Mon premier projet' }).click()
    await page.getByRole('tab', { name: 'Déploiements' }).click()
    await expect(page.getByText(basename(dossier)).first()).toBeVisible()

    // --- #8 : un changement sur le disque est vu au retour sur la fenêtre, sans action
    const premier = skillsInstalles(dossier)[0]!
    rmSync(join(dossier, '.claude', 'skills', premier), { recursive: true })
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByText(/1 skill à installer/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Installer 1 nouveau skill' })).toBeVisible()
    await page.getByRole('button', { name: 'Installer 1 nouveau skill' }).click()
    await dialogue.getByRole('button', { name: 'Installer 1 nouveau skill' }).click()
    await expect(page.getByText(new RegExp(`${total} skills? installés? sur le disque`))).toBeVisible()

    // --- #11 : désinstaller ; un fichier modifié à la main est conservé et signalé
    const modifie = skillsInstalles(dossier)[1]!
    appendFileSync(join(dossier, '.claude', 'skills', modifie, 'SKILL.md'), '\nMa note à moi.\n')
    await page.getByRole('button', { name: 'Désinstaller…' }).click()
    const desinstaller = page.getByRole('dialog', { name: 'Désinstaller de Claude Code' })
    await expect(desinstaller).toBeVisible()
    await desinstaller.getByRole('button', { name: new RegExp(`^Désinstaller ${total} skills?$`) }).click()
    await expect(desinstaller.getByText(/conservé/).first()).toBeVisible()
    await desinstaller.getByRole('button', { name: 'Terminé' }).click()
    expect(skillsInstalles(dossier)).toEqual([modifie])
    expect(readFileSync(join(dossier, '.claude', 'skills', modifie, 'SKILL.md'), 'utf8')).toContain('Ma note à moi.')
    await expect(page.getByText(/1 skill installé sur le disque · 1 modifié par vous/)).toBeVisible()
  } finally {
    await s.fermer()
  }
})

test('#9 : 12 installés + 3 nouveaux → « Installer 3 nouveaux skills », les 12 décochés et marqués déjà installés', async () => {
  const s = await lancer({ dossiers: 1 })
  const { page } = s
  const dossier = s.dossiers[0]!
  try {
    await demarrer(page, {
      metier: 'Développeur / ingénieur',
      aisance: 'Expert',
      objectifs: ['Développer du code', 'Mettre en ligne et surveiller', 'Sécuriser et me mettre en conformité']
    })
    await page.getByRole('button', { name: /Créer « Mon premier projet »/ }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mon premier projet')
    const total = (await projets(page))[0]!.selectionnes
    expect(total).toBeGreaterThanOrEqual(15)

    // On garde 12 skills : les autres sont écartés le temps de la première installation
    await page.getByRole('tab', { name: 'Skills' }).click()
    const cases = page.getByRole('tabpanel').getByRole('checkbox')
    await expect(cases).toHaveCount(total)
    const n = total
    for (let i = 12; i < n; i++) await cocher(cases.nth(i), false)
    await expect(page.getByRole('heading', { level: 2, name: '12 skills sélectionnés' })).toBeVisible()

    await page.getByRole('tab', { name: 'Déploiements' }).click()
    await page.getByRole('button', { name: 'Choisir un dossier et installer' }).click()
    const dialogue = page.getByRole('dialog', { name: 'Installer dans Claude Code' })
    await dialogue.getByRole('button', { name: 'Installer 12 nouveaux skills' }).click()
    await expect(page.getByText(/12 skills installés sur le disque/)).toBeVisible()
    expect(skillsInstalles(dossier)).toHaveLength(12)

    // Trois skills de plus sont sélectionnés
    await page.getByRole('tab', { name: 'Skills' }).click()
    for (let i = 12; i < 15; i++) await cocher(page.getByRole('tabpanel').getByRole('checkbox').nth(i))
    await page.getByRole('tab', { name: 'Déploiements' }).click()
    await expect(page.getByRole('button', { name: 'Installer 3 nouveaux skills' })).toBeVisible()
    await page.getByRole('button', { name: 'Installer 3 nouveaux skills' }).click()
    await expect(dialogue.getByRole('button', { name: 'Installer 3 nouveaux skills' })).toBeVisible()
    await expect(dialogue.getByText('Déjà installés')).toBeVisible()
    // Les 12 déjà installés sont décochés
    const dejaInstalles = dialogue.getByRole('checkbox')
    await expect(dejaInstalles).toHaveCount(12)
    for (let i = 0; i < 12; i++) await expect(dejaInstalles.nth(i)).not.toBeChecked()
    // En cocher un passe en mode explicite
    await cocher(dejaInstalles.first())
    await expect(dialogue.getByRole('button', { name: 'Installer 4 skills' })).toBeVisible()
    await cocher(dejaInstalles.first(), false)
    await dialogue.getByRole('button', { name: 'Installer 3 nouveaux skills' }).click()
    await expect(page.getByText(/15 skills installés sur le disque/)).toBeVisible()
    expect(skillsInstalles(dossier)).toHaveLength(15)
  } finally {
    await s.fermer()
  }
})

test('#6 : un skill sélectionné depuis la bibliothèque mène à un bouton d\'installation', async () => {
  const s = await lancer({ dossiers: 1 })
  const { page } = s
  const dossier = s.dossiers[0]!
  try {
    await demarrer(page)
    await page.getByRole('button', { name: /Créer « Mon premier projet »/ }).click()
    await page.getByRole('button', { name: 'Choisir un dossier et installer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /^Installer \d+ nouveaux? skills?$/ }).click()
    await expect(page.getByText(/Vérifié sur votre disque/)).toBeVisible()
    const avant = skillsInstalles(dossier).length

    await page.getByRole('link', { name: 'Bibliothèque' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bibliothèque')
    await verifierEcran(page, 'Bibliothèque')
    await auditerAccessibilite(page, 'Bibliothèque')
    await page.getByLabel('Rechercher un skill').fill('git')
    const premiere = page.getByRole('listitem').filter({ hasText: 'Ajouter à un projet' }).first()
    await premiere.getByRole('button', { name: 'Ajouter à un projet' }).click()
    const choix = page.getByRole('dialog', { name: 'Ajouter à un projet' })
    await choix.getByRole('button', { name: /Mon premier projet/ }).click()
    // Le message de confirmation propose directement d'installer
    const toast = page.getByRole('status').filter({ hasText: 'est sélectionné dans' })
    await expect(toast).toBeVisible()
    await toast.getByRole('button', { name: 'Installer' }).click()
    const dialogue = page.getByRole('dialog', { name: 'Installer dans Claude Code' })
    await expect(dialogue).toBeVisible()
    await dialogue.getByRole('button', { name: /^Installer 1 nouveau skill$/ }).click()
    // Le message de la première installation peut encore être affiché : c'est le disque qui fait foi
    await expect.poll(() => skillsInstalles(dossier).length).toBe(avant + 1)
    // La bibliothèque montre maintenant le skill comme installé
    await page.getByRole('link', { name: 'Bibliothèque' }).click()
    await expect(page.getByText('Installé').first()).toBeVisible()
  } finally {
    await s.fermer()
  }
})

test('#3 : créer un projet en 4 étapes, l\'aperçu change selon l\'assistant, puis « Enregistrer et appliquer »', async () => {
  const s = await lancer({ dossiers: 2 })
  const { page } = s
  const [dossierCursor] = s.dossiers
  try {
    await demarrer(page)
    await page.getByRole('button', { name: /Créer « Mon premier projet »/ }).click()
    await page.getByRole('link', { name: 'Projets', exact: true }).click()
    await page.getByRole('link', { name: 'Nouveau projet' }).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Comment s’appelle votre projet ?')
    await verifierEcran(page, 'Nouveau projet – nom')
    await page.getByLabel('Nom du projet').fill('Visibilité du cabinet')
    await page.getByLabel('Description (facultatif)').fill('Publier chaque semaine et améliorer mon référencement')
    await page.getByRole('button', { name: 'Continuer' }).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Que voulez-vous faire ?')
    await verifierEcran(page, 'Nouveau projet – besoins')
    await auditerAccessibilite(page, 'Nouveau projet – besoins')
    await cocher(page.getByRole('checkbox', { name: /Référencement \(SEO\)/ }))
    await cocher(page.getByRole('checkbox', { name: /Publication sur les réseaux sociaux/ }))
    await page.getByRole('button', { name: 'Continuer' }).click()

    // Étape 3 : ni Cursor ni Claude Code ne sont obligés d'avoir un dossier
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Où installer les skills ?')
    await cocher(page.getByRole('checkbox', { name: 'Cursor', exact: true }))
    await cocher(page.getByRole('checkbox', { name: 'Claude Code', exact: true }), false)
    await page.getByRole('button', { name: 'Choisir un dossier' }).click()
    await expect(page.getByText(basename(dossierCursor!))).toBeVisible()
    await page.getByRole('button', { name: 'Continuer' }).click()

    // Étape 4 : couverture, skills avec leur raison, arborescence et espace
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Voici notre proposition')
    await expect(page.getByText(/Référencement \(SEO\) : \d+ skills?/)).toBeVisible()
    await expect(page.getByText(/Publication sur les réseaux sociaux : \d+ skills?/)).toBeVisible()
    await expect(page.getByText('seo/mots-cles/')).toBeVisible()
    await expect(page.getByText(/Espace nécessaire/)).toBeVisible()
    await verifierEcran(page, 'Nouveau projet – proposition')
    await auditerAccessibilite(page, 'Nouveau projet – proposition')
    expect(contenu(dossierCursor!)).toEqual([])

    await page.getByRole('button', { name: 'Enregistrer et appliquer' }).click()
    // Le dossier a été mémorisé : l'aperçu s'ouvre tout de suite, avec le chemin propre à Cursor
    const dialogue = page.getByRole('dialog', { name: 'Installer dans Cursor' })
    await expect(dialogue).toBeVisible()
    await dialogue.getByText('Voir le détail').click()
    await expect(dialogue).toContainText('.cursor/rules/')
    expect(contenu(dossierCursor!)).toEqual([])
    await dialogue.getByRole('button', { name: /^Installer \d+ nouveaux? skills?$/ }).click()
    await expect(page.getByText(/Vérifié sur votre disque/)).toBeVisible()
    expect(readdirSync(join(dossierCursor!, '.cursor', 'rules')).every((f) => f.endsWith('.mdc'))).toBe(true)

    // Arborescence : aperçu, création, retrait
    await page.getByRole('tab', { name: 'Arborescence' }).click()
    await verifierEcran(page, 'Fiche projet – arborescence')
    await page.getByRole('button', { name: 'Aperçu et création' }).click()
    const arbo = page.getByRole('dialog', { name: 'Créer l’arborescence' })
    await expect(arbo).toBeVisible()
    await expect(arbo.getByText(/Espace nécessaire/)).toBeVisible()
    await arbo.getByRole('button', { name: /^Créer \d+ dossiers$/ }).click()
    await expect(page.getByText('Arborescence créée.')).toBeVisible()
    expect(existsSync(join(dossierCursor!, 'seo', 'mots-cles'))).toBe(true)
    await page.getByRole('button', { name: 'Retirer l’arborescence' }).click()
    await page.getByRole('dialog', { name: 'Retirer l’arborescence' }).getByRole('button', { name: 'Retirer' }).click()
    await expect(page.getByText('Arborescence retirée.')).toBeVisible()
    expect(existsSync(join(dossierCursor!, 'seo'))).toBe(false)

    // Historique
    await page.getByRole('tab', { name: 'Historique' }).click()
    await expect(page.getByText(/Cursor · /)).toBeVisible()
    await verifierEcran(page, 'Fiche projet – historique')
  } finally {
    await s.fermer()
  }
})

test('#1 #10 : réglages sans fichier à éditer, aucun écran ne parle d\'usage, un seul h1 par écran, thème et clavier', async () => {
  const s = await lancer({ dossiers: 1 })
  const { page } = s
  try {
    await demarrer(page)
    await page.getByRole('button', { name: /Créer « Mon premier projet »/ }).click()

    for (const [lien, titre] of [
      ['Projets', 'Projets'],
      ['Bibliothèque', 'Bibliothèque'],
      ['Réglages', 'Réglages']
    ] as const) {
      await page.getByRole('link', { name: lien, exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(titre)
      await verifierEcran(page, titre)
    }

    // #1 : aucun champ de configuration à éditer, rien qui parle de fichier
    expect(await page.locator('textarea').count()).toBe(0)
    expect(await texteInterface(page)).not.toMatch(/\.json|fichier de configuration|éditer le fichier/i)
    await auditerAccessibilite(page, 'Réglages')

    // Le thème se change et se retrouve
    await cocher(page.getByRole('radio', { name: 'Sombre' }))
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sombre')
    await auditerAccessibilite(page, 'Réglages – thème sombre')
    await cocher(page.getByRole('radio', { name: 'Clair' }))
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'clair')

    // Le profil se modifie
    await page.getByLabel('Prénom').fill('Alex')
    await page.getByRole('button', { name: 'Enregistrer le profil' }).click()
    await expect(page.getByText('Profil enregistré.')).toBeVisible()

    // Clavier seul : les onglets se parcourent aux flèches
    await page.getByRole('link', { name: 'Projets', exact: true }).click()
    await page.getByRole('link', { name: 'Mon premier projet' }).click()
    await page.getByRole('tab', { name: 'Skills' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Arborescence' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Arborescence' })).toBeFocused()
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: 'Historique' })).toHaveAttribute('aria-selected', 'true')

    // Réduire les animations est respecté
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const animation = await page.evaluate(() => getComputedStyle(document.body).animationName)
    expect(animation).toBe('none')
  } finally {
    await s.fermer()
  }
})

test('exporter puis importer un projet : recette seule, sans chemin, analysée à l\'entrée', async () => {
  const exportFichier = join(await import('node:os').then((o) => o.tmpdir()), `sm-e2e-export-${Date.now()}.skillforge-projet.json`)
  const s = await lancer({ dossiers: 1, exportFichier, importFichier: exportFichier })
  const { page } = s
  try {
    await demarrer(page)
    await page.getByRole('button', { name: /Créer « Mon premier projet »/ }).click()
    await page.getByRole('button', { name: 'Exporter' }).click()
    await expect(page.getByText('Projet exporté.')).toBeVisible()
    const texte = readFileSync(exportFichier, 'utf8')
    expect(texte).toContain('skillforge-projet')
    expect(texte).not.toContain(s.dossiers[0]!.replaceAll('\\', '\\\\'))
    expect(texte).not.toContain('dossiers')

    await page.getByRole('link', { name: 'Projets', exact: true }).click()
    await page.getByRole('button', { name: 'Importer un projet' }).click()
    const dialogue = page.getByRole('dialog', { name: 'Importer un projet' })
    await expect(dialogue).toContainText('Mon premier projet')
    await verifierEcran(page, 'Importer un projet')
    await dialogue.getByRole('button', { name: 'Importer le projet' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mon premier projet (2)')
    // Un projet importé n'a ni dossier ni installation
    await expect(page.getByText('Jamais appliqué')).toBeVisible()
    rmSync(exportFichier, { force: true })
  } finally {
    await s.fermer()
  }
})
