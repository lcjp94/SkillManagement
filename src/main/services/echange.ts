import type { AnalyseImportVue, Entree, Sortie } from '@shared/contrat'
import { EXTENSION_PROJET, analyserImport, exporterProjet, integrerImport } from '../core/echange'
import { trouverProjet } from '../core/projets'
import { ErreurUtilisateur, type Services } from './contexte'

const IMPORTS_EN_ATTENTE_MAX = 5

export async function exporter(s: Services, id: string): Promise<Sortie<'projets.exporter'>> {
  const etat = s.etat.get()
  const projet = trouverProjet(etat, id)
  const enregistre = await s.dialogues.enregistrerFichierProjet(`${projet.nom}${EXTENSION_PROJET}`, exporterProjet(projet, etat.userSkills))
  return { enregistre }
}

/** Lit le fichier choisi et l'analyse ; rien n'entre dans les données avant la confirmation. */
export async function importerChoisir(s: Services): Promise<AnalyseImportVue | null> {
  const texte = await s.dialogues.lireFichierProjet()
  if (texte === null) return null
  const r = analyserImport(texte, {
    etat: s.etat.get(),
    catalogue: s.catalogue.skills,
    profiles: s.catalogue.profiles,
    scanner: s.ctx.scanner
  })
  if (!r.ok) return { ok: false, erreur: r.erreur }
  const jeton = s.nouvelId()
  s.imports.set(jeton, r.analyse)
  // On ne garde que les dernières analyses : la mémoire ne grossit pas si la personne abandonne
  while (s.imports.size > IMPORTS_EN_ATTENTE_MAX) s.imports.delete(s.imports.keys().next().value!)
  const a = r.analyse
  return {
    ok: true,
    jeton,
    nom: a.projet.nom,
    nbSkills: a.projet.skills.length,
    aConfirmer: a.aConfirmer.map((x) => ({ slug: x.skill.slug, name: x.skill.name, problemes: x.scan.issues })),
    refuses: a.refuses.map((x) => ({ slug: x.slug, raison: x.raison })),
    inconnus: a.inconnus,
    besoinsInconnus: a.besoinsInconnus
  }
}

export async function confirmerImport(s: Services, e: Entree<'projets.importer.confirmer'>): Promise<Sortie<'projets.importer.confirmer'>> {
  const analyse = s.imports.get(e.jeton)
  if (!analyse) throw new ErreurUtilisateur('Cet import a expiré. Choisissez de nouveau le fichier.')
  const id = s.nouvelId()
  let laisses: { slug: string; raison: string }[] = []
  await s.etat.update((etat) => {
    const r = integrerImport(etat, analyse, e.confirmes, { id, maintenant: s.maintenant() }, s.catalogue.profiles)
    laisses = r.rapport.laisses
    return r.etat
  })
  s.imports.delete(e.jeton)
  return { id, laisses }
}
