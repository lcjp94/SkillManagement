// Consignes données au service d'IA pour rédiger un skill. Le texte obtenu n'est jamais installé tel quel :
// il est relu par la personne, analysé, puis enregistré comme n'importe quel autre skill.
import { lireSkillMd, sansEnveloppeCode, slugifier } from '../core/skillmd'
import type { Message } from './client'

export interface DemandeRedaction {
  /** Ce que la personne veut obtenir, dans ses mots. */
  sujet: string
  /** Métier ou contexte, pour adapter le ton. */
  metier?: string
  /** Besoin du projet qui a motivé la demande. */
  besoin?: string
}

const CONSIGNES = `Tu rédiges des « skills » : des consignes réutilisables qu'un assistant IA suit pour accomplir une tâche précise.

Réponds uniquement avec le contenu d'un fichier SKILL.md, sans aucun commentaire autour, au format suivant :

---
name: un-nom-court-en-minuscules-avec-des-tirets
description: Une seule phrase qui dit quand utiliser ce skill.
---

# Titre

Le corps du skill en Markdown : objectif, étapes à suivre, critères de qualité, exemple court.

Règles :
- Écris en français clair, sans jargon inutile, pour une personne qui n'est pas technicienne.
- Reste concret et bref : 40 lignes au maximum.
- N'inclus jamais de clé, de mot de passe ni d'adresse secrète.
- Ne demande jamais à l'assistant de télécharger puis d'exécuter du code, de lire des fichiers secrets, de désactiver des protections ou d'ignorer ses consignes précédentes.`

export function construireMessages(d: DemandeRedaction): Message[] {
  const contexte = [d.metier ? `Métier de la personne : ${d.metier}.` : '', d.besoin ? `Besoin du projet : ${d.besoin}.` : ''].filter(Boolean).join('\n')
  return [
    { role: 'system', content: CONSIGNES },
    { role: 'user', content: `${contexte ? `${contexte}\n` : ''}Rédige un skill pour : ${d.sujet.trim()}` }
  ]
}

export interface SkillRedige {
  slug: string
  name: string
  description: string
  corps: string
}

/** Extrait nom, description et corps de la réponse du service ; complète ce qui manque avec le sujet demandé. */
export function extraireSkill(reponse: string, sujet: string): SkillRedige {
  const lu = lireSkillMd(sansEnveloppeCode(reponse))
  const titre = /^#\s+(.+)$/m.exec(lu.corps)?.[1]?.trim()
  const name = (lu.name ?? titre ?? sujet).slice(0, 120)
  return {
    slug: slugifier(lu.name ?? titre ?? sujet),
    name: titre && lu.name && /^[a-z0-9-]+$/.test(lu.name) ? titre : name,
    description: (lu.description ?? sujet).slice(0, 1000),
    corps: lu.corps.trim()
  }
}
