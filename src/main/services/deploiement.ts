// Services d'installation : l'interface désigne un projet et un assistant, jamais un chemin à écrire ni un contenu.
import type { ApercuVue, ApprofondieVue, Entree, HistoriqueVue, RapportRetraitVue, Sortie } from '@shared/contrat'
import type { AssistantId } from '@shared/schemas/catalog'
import type { Project } from '@shared/schemas/state'
import { choisirSkills } from '../core/deploiement'
import { corpsDuSkill } from '../core/frontmatter'
import { chevauchements, getDisposition, type SkillAEcrire } from '../core/layouts'
import { selectionnes, remplacerProjet, trouverProjet } from '../core/projets'
import { planArborescence } from '../core/tree'
import { appliquer, apercu, type Apercu, type DemandeDeploiement } from '../fs/deploiement'
import { lireManifestes } from '../fs/manifestes'
import { annulerDerniere, desinstaller, listerInstalles, retirerArborescence } from '../fs/retrait'
import { markdownDuSkill } from './analyse'
import { ErreurUtilisateur, libelleAssistant, tousLesSkills, type Services } from './contexte'

const versApercuVue = (a: Apercu): ApercuVue => a

const PAS_DE_DOSSIER = 'Choisissez d’abord le dossier où installer les skills de ce projet.'

function dossierDe(projet: Project, assistant: AssistantId, choisi?: string): string {
  const racine = choisi ?? projet.dossiers[assistant]
  if (!racine) throw new ErreurUtilisateur(PAS_DE_DOSSIER)
  return racine
}

/** Mémorise l'assistant et le dossier dans le projet (le choix survit à la fermeture de l'application). */
async function memoriser(s: Services, projetId: string, assistant: AssistantId, racine: string): Promise<void> {
  const projet = trouverProjet(s.etat.get(), projetId)
  if (projet.dossiers[assistant] === racine && projet.assistants.includes(assistant)) return
  await s.etat.update((etat) => {
    const courant = trouverProjet(etat, projetId)
    return remplacerProjet(
      etat,
      {
        ...courant,
        assistants: courant.assistants.includes(assistant) ? courant.assistants : [...courant.assistants, assistant],
        dossiers: { ...courant.dossiers, [assistant]: racine }
      },
      s.maintenant()
    )
  })
}

async function preparer(s: Services, e: Entree<'deploiement.apercu'>) {
  const etat = s.etat.get()
  const projet = trouverProjet(etat, e.projetId)
  const racine = dossierDe(projet, e.assistant, e.racine)
  const parSlug = new Map(tousLesSkills(s, etat).map((k) => [k.slug, k]))
  const retenus = selectionnes(projet).filter((slug) => parSlug.has(slug))
  const presents = (await listerInstalles(s.ctx, { racine, portee: 'projet', cible: e.assistant })).map((i) => i.slug)
  const options = { reinstaller: e.reinstaller, tout: e.tout }
  let choix = choisirSkills(retenus, presents, options)
  let skills: SkillAEcrire[] = choix.aEcrire.map((slug) => {
    const k = parSlug.get(slug)!
    return { slug, name: k.name, description: k.description, content: k.content }
  })

  // Analyse approfondie (facultative) : elle ne peut que retirer des skills de ce qui sera écrit
  const approfondie: ApprofondieVue = { disponible: s.info.analyseApprofondie.disponible, executee: false, erreurs: [] }
  const refusApprofondi: Apercu['refus'] = []
  const aConfirmerApprofondi: Apercu['aConfirmer'] = []
  if (e.analyseApprofondie && approfondie.disponible && skills.length > 0) {
    const lots = await s.skillspector.analyser(skills.map((k) => ({ slug: k.slug, markdown: markdownDuSkill(k.slug, k.description, corpsDuSkill(k.content)) })))
    approfondie.executee = true
    const confirmes = new Set(e.avertissementsConfirmes ?? [])
    const exclus = new Set<string>()
    for (const k of skills) {
      const lot = lots.get(k.slug)
      if (!lot) continue
      if (!lot.ok) {
        approfondie.erreurs.push(k.slug)
        continue
      }
      if (lot.resultat.statut === 'danger') {
        refusApprofondi.push({ slug: k.slug, raison: 'L’analyse approfondie recommande de ne pas installer ce skill.', problemes: lot.resultat.problemes })
        exclus.add(k.slug)
      } else if (lot.resultat.statut === 'warning' && !confirmes.has(k.slug)) {
        aConfirmerApprofondi.push({ slug: k.slug, problemes: lot.resultat.problemes })
        exclus.add(k.slug)
      }
    }
    if (exclus.size > 0) {
      skills = skills.filter((k) => !exclus.has(k.slug))
      // Le libellé du bouton suit ce qui sera réellement écrit
      choix = choisirSkills(retenus.filter((slug) => !exclus.has(slug)), presents, options)
    }
  }

  const demande: DemandeDeploiement = {
    cible: e.assistant,
    racine,
    portee: 'projet',
    projetId: projet.id,
    skills,
    avertissementsConfirmes: e.avertissementsConfirmes,
    ecrasementsConfirmes: e.ecrasementsConfirmes
  }
  const completer = (a: Apercu): ApercuVue => ({ ...a, refus: [...a.refus, ...refusApprofondi], aConfirmer: [...a.aConfirmer, ...aConfirmerApprofondi] })
  return { projet, racine, choix, demande, approfondie, completer }
}

export async function apercuDeploiement(s: Services, e: Entree<'deploiement.apercu'>): Promise<Sortie<'deploiement.apercu'>> {
  const { projet, racine, choix, demande, approfondie, completer } = await preparer(s, e)
  const a = await apercu(s.ctx, demande)
  // Le choix de dossier et d'assistant est mémorisé dès l'aperçu : on le retrouve en revenant sur l'écran
  await memoriser(s, projet.id, e.assistant, racine)
  return { choix, apercu: completer(a), chevauchements: chevauchements(projet.assistants).map((c) => c.message), dossier: a.racine, approfondie }
}

export async function appliquerDeploiement(s: Services, e: Entree<'deploiement.appliquer'>): Promise<Sortie<'deploiement.appliquer'>> {
  const { projet, racine, choix, demande, approfondie, completer } = await preparer(s, e)
  const r = await appliquer(s.ctx, demande)
  await memoriser(s, projet.id, e.assistant, racine)
  return {
    statut: r.statut,
    ...(r.statut === 'applique' ? { id: r.id } : {}),
    choix,
    apercu: completer(r.apercu),
    chevauchements: chevauchements(projet.assistants).map((c) => c.message),
    dossier: r.apercu.racine,
    approfondie
  }
}

const rapportVue = (r: RapportRetraitVue): RapportRetraitVue => ({ retires: r.retires, restaures: r.restaures, conserves: r.conserves, dossiersRetires: r.dossiersRetires })

export async function desinstallerSkills(s: Services, e: Entree<'deploiement.desinstaller'>): Promise<RapportRetraitVue> {
  const projet = trouverProjet(s.etat.get(), e.projetId)
  const racine = dossierDe(projet, e.assistant)
  return rapportVue(await desinstaller(s.ctx, { racine, portee: 'projet', cible: e.assistant, slugs: e.slugs }))
}

export async function annulerInstallation(s: Services, e: Entree<'deploiement.annuler'>): Promise<RapportRetraitVue> {
  const projet = trouverProjet(s.etat.get(), e.projetId)
  dossierDe(projet, e.assistant) // le projet doit avoir un dossier pour cet assistant
  const { manifestes } = await lireManifestes(s.ctx.dossierDonnees)
  const derniere = manifestes.filter((m) => m.etat === 'termine' && m.cible === e.assistant && m.projetId === projet.id).at(-1)
  if (!derniere) throw new ErreurUtilisateur('Il n’y a aucune installation à annuler pour cet assistant.')
  return rapportVue(await annulerDerniere(s.ctx, { racine: derniere.racine, portee: derniere.portee, id: derniere.id }))
}

export async function ouvrirDossierProjet(s: Services, e: Entree<'dossier.ouvrir'>): Promise<void> {
  const projet = trouverProjet(s.etat.get(), e.projetId)
  await s.dialogues.ouvrirDossier(dossierDe(projet, e.assistant))
}

export async function historique(s: Services, projetId: string): Promise<HistoriqueVue> {
  const { manifestes } = await lireManifestes(s.ctx.dossierDonnees)
  return manifestes
    .filter((m) => m.projetId === projetId)
    .map((m) => {
      const ecrits = m.fichiers.filter((f) => f.action !== 'unchanged')
      const slugs = new Set(ecrits.flatMap((f) => f.skills.map((k) => k.slug)))
      const retires = new Set(ecrits.flatMap((f) => f.skills.filter((k) => k.retire).map((k) => k.slug)))
      return {
        id: m.id,
        creeLe: m.creeLe,
        cible: m.cible,
        libelleCible: m.cible === 'arborescence' ? 'Arborescence' : libelleAssistant(m.cible),
        dossier: m.racine,
        etat: m.etat,
        nbFichiers: ecrits.length,
        nbSkills: slugs.size,
        retires: retires.size,
        ...(m.annuleLe ? { annuleLe: m.annuleLe } : {})
      }
    })
    .reverse()
}

// --- Arborescence --------------------------------------------------------------------------------

async function preparerArborescence(s: Services, e: Entree<'arborescence.apercu'>) {
  const projet = trouverProjet(s.etat.get(), e.projetId)
  // Par défaut, le premier dossier déjà mémorisé pour le projet
  const defaut = projet.assistants.map((a) => projet.dossiers[a]).find((d): d is string => Boolean(d))
  const racine = e.racine ?? defaut
  if (!racine) throw new ErreurUtilisateur(PAS_DE_DOSSIER)
  const plan = planArborescence({ gabarit: e.gabarit, extras: e.extras, besoins: projet.besoins, readme: e.readme }, s.catalogue.profiles)
  return { projet, racine, demande: { cible: 'arborescence' as const, racine, projetId: projet.id, arborescence: plan } }
}

export async function apercuArborescence(s: Services, e: Entree<'arborescence.apercu'>): Promise<Sortie<'arborescence.apercu'>> {
  const { demande } = await preparerArborescence(s, e)
  const a = await apercu(s.ctx, demande)
  return { apercu: versApercuVue(a), dossier: a.racine }
}

export async function appliquerArborescence(s: Services, e: Entree<'arborescence.appliquer'>): Promise<Sortie<'arborescence.appliquer'>> {
  const { projet, demande } = await preparerArborescence(s, e)
  const r = await appliquer(s.ctx, demande)
  if (r.statut === 'confirmation-requise') throw new ErreurUtilisateur('Un fichier existant serait remplacé : l’arborescence n’a pas été créée.')
  await s.etat.update((etat) =>
    remplacerProjet(etat, { ...trouverProjet(etat, projet.id), arborescence: { gabarit: e.gabarit, extras: e.extras } }, s.maintenant())
  )
  return { statut: r.statut === 'applique' ? 'applique' : 'rien-a-faire', apercu: versApercuVue(r.apercu) }
}

export async function retirerArborescenceProjet(s: Services, projetId: string): Promise<RapportRetraitVue> {
  const { manifestes } = await lireManifestes(s.ctx.dossierDonnees)
  const m = manifestes.filter((x) => x.cible === 'arborescence' && x.etat === 'termine' && x.projetId === projetId).at(-1)
  if (!m) throw new ErreurUtilisateur('Aucune arborescence créée par l’application pour ce projet.')
  return rapportVue(await retirerArborescence(s.ctx, m.id))
}

export { getDisposition }
