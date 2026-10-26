// Registre des canaux : relie chaque nom du contrat à son service. Utilisé par Electron (ipcMain) et par les tests.
import { CONTRAT, type Canal, type Entree, type Sortie } from '@shared/contrat'
import { FichierIllisibleError } from '../fs/lecture'
import { PerimetreError } from '../fs/perimetre'
import { RetraitError } from '../fs/retrait'
import { DeploiementError } from '../fs/deploiement'
import { ProjetError } from '../core/projets'
import { BlocIncompletError } from '../core/blocks'
import { VersionFutureError } from '../store/json-store'
import { CoffreError } from '../ai/coffre'
import { AdresseRefuseeError } from '../ai/garde-adresse'
import { ReseauError } from '../ai/http'
import { analyserNouveau, creerSkill, supprimerSkill } from './skills'
import { apercu as apercuImport, ajouterSource, importer, lireAdresse, listeSources, rechercher, retirerSource } from './enligne'
import * as ia from './ia'
import {
  apercuArborescence,
  apercuDeploiement,
  appliquerArborescence,
  appliquerDeploiement,
  annulerInstallation,
  desinstallerSkills,
  historique,
  ouvrirDossierProjet,
  retirerArborescenceProjet
} from './deploiement'
import { ErreurUtilisateur, referentiels, vueSkill, tousLesSkills, type Services } from './contexte'
import { confirmerImport, exporter, importerChoisir } from './echange'
import {
  accepterChangements,
  archiver,
  changementsPropose,
  changerSkills,
  conseilInitial,
  creerUnProjet,
  dupliquer,
  listerProjets,
  modifierProjet,
  obtenirFiche,
  proposition,
  supprimer,
  terminerOnboarding
} from './projets'
import { bibliotheque } from './catalogue'

/** Préfixe des messages destinés à la personne : le reste des erreurs ne traverse jamais l'IPC. */
export const MARQUE_MESSAGE = 'SM|'

const MESSAGES_UTILISATEUR = [ErreurUtilisateur, ProjetError, PerimetreError, DeploiementError, RetraitError, FichierIllisibleError, BlocIncompletError, VersionFutureError, CoffreError, AdresseRefuseeError, ReseauError]
export const estMessageUtilisateur = (e: unknown): e is Error => MESSAGES_UTILISATEUR.some((classe) => e instanceof classe)

type Implementation<C extends Canal> = (s: Services, entree: Entree<C>) => Sortie<C> | Promise<Sortie<C>>
type Registre = { [C in Canal]: Implementation<C> }

export const REGISTRE: Registre = {
  'app.info': (s) => s.info,
  'referentiels.get': (s) => referentiels(s),
  'reglages.get': (s) => ({ theme: s.reglages.get().theme }),
  'reglages.set': async (s, e) => {
    const suivant = await s.reglages.update((r) => ({ ...r, theme: e.theme }))
    return { theme: suivant.theme }
  },
  'profil.get': (s) => s.etat.get().profile,
  'profil.set': async (s, e) => {
    if (!s.catalogue.profiles.natures.some((n) => n.id === e.metier)) throw new ErreurUtilisateur('Choisissez un métier dans la liste.')
    return (await s.etat.update((etat) => ({ ...etat, profile: e }))).profile!
  },
  'onboarding.conseil': (s, e) => conseilInitial(s, e),
  'onboarding.terminer': (s, e) => terminerOnboarding(s, e),
  'catalogue.liste': (s) => bibliotheque(s),
  'catalogue.detail': (s, e) => {
    const skill = tousLesSkills(s).find((k) => k.slug === e.slug)
    if (!skill) throw new ErreurUtilisateur('Ce skill n’existe pas.')
    return { ...vueSkill(s, skill), content: skill.content }
  },
  'projets.liste': (s, e) => listerProjets(s, e),
  'projets.fiche': (s, e) => obtenirFiche(s, e.id),
  'projets.proposition': (s, e) => proposition(s, e),
  'projets.creer': (s, e) => creerUnProjet(s, e),
  'projets.modifier': (s, e) => modifierProjet(s, e),
  'projets.skills': (s, e) => changerSkills(s, e),
  'projets.propositionChangements': (s, e) => changementsPropose(s, e.id),
  'projets.accepterChangements': (s, e) => accepterChangements(s, e),
  'projets.dupliquer': (s, e) => dupliquer(s, e.id),
  'projets.archiver': (s, e) => archiver(s, e.id, e.archiver),
  'projets.supprimer': (s, e) => supprimer(s, e.id),
  'projets.exporter': (s, e) => exporter(s, e.id),
  'projets.importer.choisir': (s) => importerChoisir(s),
  'projets.importer.confirmer': (s, e) => confirmerImport(s, e),
  'dossier.choisir': (s) => s.dialogues.choisirDossier(),
  'dossier.ouvrir': (s, e) => ouvrirDossierProjet(s, e),
  'deploiement.apercu': (s, e) => apercuDeploiement(s, e),
  'deploiement.appliquer': (s, e) => appliquerDeploiement(s, e),
  'deploiement.desinstaller': (s, e) => desinstallerSkills(s, e),
  'deploiement.annuler': (s, e) => annulerInstallation(s, e),
  'deploiement.historique': (s, e) => historique(s, e.projetId),
  'arborescence.apercu': (s, e) => apercuArborescence(s, e),
  'arborescence.appliquer': (s, e) => appliquerArborescence(s, e),
  'arborescence.retirer': (s, e) => retirerArborescenceProjet(s, e.projetId),
  'ia.etat': (s) => ia.etat(s),
  'ia.enregistrer': (s, e) => ia.enregistrer(s, e),
  'ia.tester': (s, e) => ia.verifier(s, e),
  'ia.rediger': (s, e) => ia.rediger(s, e),
  'ia.lire': (s, e) => ia.lire(s, e.id),
  'ia.annuler': (s, e) => s.redactions.annuler(e.id),
  'skills.analyser': (s, e) => analyserNouveau(s, e),
  'skills.creer': (s, e) => creerSkill(s, e),
  'skills.supprimer': (s, e) => supprimerSkill(s, e.slug),
  'maj.etat': (s) => s.miseAJour.etat(),
  'maj.verifier': (s) => s.miseAJour.verifier(),
  'maj.telecharger': (s) => s.miseAJour.telecharger(),
  'maj.installer': (s) => s.miseAJour.installer(),
  'sources.liste': (s) => listeSources(s),
  'sources.ajouter': (s, e) => ajouterSource(s, e.repo),
  'sources.retirer': (s, e) => retirerSource(s, e.repo),
  'sources.adresse': (_s, e) => lireAdresse(e.adresse),
  'sources.rechercher': (s, e) => rechercher(s, e),
  'sources.apercu': (s, e) => apercuImport(s, e),
  'sources.importer': (s, e) => importer(s, e)
}

/**
 * Exécute un canal : valide l'entrée et la sortie avec le contrat, et convertit toute erreur en message
 * pour la personne (les erreurs internes sont journalisées, jamais relayées).
 */
export async function appeler<C extends Canal>(s: Services, canal: C, brut: unknown): Promise<Sortie<C>> {
  const contrat = CONTRAT[canal]
  const entree = contrat.entree.safeParse(brut)
  if (!entree.success) throw new Error(`${MARQUE_MESSAGE}Demande invalide.`)
  try {
    const sortie = contrat.sortie.safeParse(await (REGISTRE[canal] as Implementation<C>)(s, entree.data as Entree<C>))
    if (!sortie.success) {
      s.ctx.journal?.error('réponse invalide', { canal })
      throw new Error('réponse invalide')
    }
    return sortie.data as Sortie<C>
  } catch (erreur) {
    if (estMessageUtilisateur(erreur)) throw new Error(`${MARQUE_MESSAGE}${erreur.message}`)
    s.ctx.journal?.error('erreur interne', { canal, type: erreur instanceof Error ? erreur.name : 'inconnu' })
    throw new Error(`${MARQUE_MESSAGE}Une erreur inattendue est survenue. Réessayez ; si elle revient, fermez puis rouvrez l’application.`)
  }
}
