// IA facultative : réglage, test de connexion, rédaction en flux. La clé reste dans le processus principal.
import type { Entree, IaEtat, RedactionVue, Sortie } from '@shared/contrat'
import { generer, tester, type Connexion } from '../ai/client'
import { FOURNISSEURS, adresseModifiable, trouverFournisseur, type Fournisseur } from '../ai/fournisseurs'
import { verifierAdresse } from '../ai/garde-adresse'
import { construireMessages, extraireSkill } from '../ai/prompt'
import { ErreurUtilisateur, type Services } from './contexte'

const adresseLibre = (f: Fournisseur): boolean => adresseModifiable(f)

async function construireConnexion(s: Services, d: { fournisseur: string; adresse?: string; modele: string; cle?: string }): Promise<{ connexion: Connexion; fournisseur: Fournisseur }> {
  const fournisseur = trouverFournisseur(d.fournisseur)
  if (!fournisseur) throw new ErreurUtilisateur('Choisissez un service dans la liste.')
  const adresse = (adresseLibre(fournisseur) ? d.adresse?.trim() || fournisseur.adresse : fournisseur.adresse).trim()
  if (!adresse) throw new ErreurUtilisateur('Indiquez l’adresse du service.')
  await verifierAdresse(adresse, { resolveur: s.reseau.resolveur })
  const modele = (d.modele.trim() || fournisseur.modele).trim()
  if (!modele) throw new ErreurUtilisateur('Indiquez le nom du modèle (« Vérifier » peut vous en proposer).')
  const cle = d.cle?.trim() || (fournisseur.cle === 'non' ? null : await s.coffre.lireCle(fournisseur.id))
  if (fournisseur.cle === 'oui' && !cle) throw new ErreurUtilisateur('Ce service demande une clé : collez-la d’abord.')
  return { connexion: { adresse, modele, ...(cle ? { cle } : {}) }, fournisseur }
}

export async function etat(s: Services): Promise<IaEtat> {
  const choix = s.reglages.get().ia
  const fournisseur = choix ? trouverFournisseur(choix.fournisseur) : undefined
  const cleEnregistree = fournisseur ? await s.coffre.a(fournisseur.id) : false
  return {
    fournisseurs: FOURNISSEURS,
    choix: choix && fournisseur ? { fournisseur: fournisseur.id, adresse: choix.adresse ?? fournisseur.adresse, modele: choix.modele, cleEnregistree } : null,
    configure: Boolean(choix && fournisseur && (fournisseur.cle === 'non' || fournisseur.cle === 'selon' || cleEnregistree)),
    stockageSecurise: s.coffreDisponible
  }
}

export async function enregistrer(s: Services, e: Entree<'ia.enregistrer'>): Promise<IaEtat> {
  // La connexion est contrôlée (adresse, modèle, clé requise) avant de rien enregistrer
  const { connexion, fournisseur } = await construireConnexion(s, e)
  if (e.supprimerCle) await s.coffre.supprimer(fournisseur.id)
  if (e.cle?.trim()) await s.coffre.enregistrer(fournisseur.id, e.cle)
  await s.reglages.update((r) => ({ ...r, ia: { fournisseur: fournisseur.id, modele: connexion.modele, ...(adresseLibre(fournisseur) ? { adresse: connexion.adresse } : {}) } }))
  return etat(s)
}

export async function verifier(s: Services, e: Entree<'ia.tester'>): Promise<Sortie<'ia.tester'>> {
  const { connexion } = await construireConnexion(s, e)
  return tester(connexion, s.reseau)
}

export async function rediger(s: Services, e: Entree<'ia.rediger'>): Promise<Sortie<'ia.rediger'>> {
  const reglage = s.reglages.get().ia
  if (!reglage) throw new ErreurUtilisateur('Choisissez d’abord un service dans les Réglages.')
  const { connexion } = await construireConnexion(s, reglage)
  const metier = s.etat.get().profile?.metier
  const nomMetier = s.catalogue.profiles.natures.find((n) => n.id === metier)?.name
  const id = s.nouvelId()
  try {
    s.redactions.demarrer(id, e.sujet, (signal) => generer(connexion, construireMessages({ sujet: e.sujet, metier: nomMetier, besoin: e.besoin }), { ...s.reseau, signal }))
  } catch {
    throw new ErreurUtilisateur('Une rédaction est déjà en cours : attendez qu’elle se termine ou annulez-la.')
  }
  return { id }
}

export function lire(s: Services, id: string): RedactionVue {
  const r = s.redactions.lire(id)
  if (!r) throw new ErreurUtilisateur('Cette rédaction n’existe plus.')
  const skill = r.etat === 'termine' && r.texte.trim() !== '' ? extraireSkill(r.texte, r.meta) : undefined
  return { etat: r.etat, texte: r.texte, ...(r.erreur ? { erreur: r.erreur } : {}), ...(skill ? { skill } : {}) }
}
