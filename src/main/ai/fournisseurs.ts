// Les services d'IA proposés : tous exposent une API compatible OpenAI (/models, /chat/completions).
// AUCUN n'a été essayé avec une vraie clé dans ce projet : les tests passent contre un faux serveur local.

export interface Fournisseur {
  id: string
  libelle: string
  /** Adresse de base ; vide pour « autre service » (saisie libre). */
  adresse: string
  modele: string
  cle: 'oui' | 'non' | 'selon'
  /** Page où la personne trouve sa clé (ou où installer le service local). */
  lien: string
  /** Précision utile avant de saisir la clé (abonnement, adresse d'entreprise…). */
  note?: string
  /**
   * Service qui envoie la demande à des tiers qu'il choisit lui-même : un consentement explicite est exigé avant de
   * l'enregistrer, et on ne lui envoie que le strict nécessaire (jamais le métier de la personne).
   */
  consentement?: string
  /** Service qui tourne sur cet ordinateur : l'adresse « http » locale est acceptée. */
  local: boolean
}

export const FOURNISSEURS: Fournisseur[] = [
  { id: 'openai', libelle: 'ChatGPT (OpenAI)', adresse: 'https://api.openai.com/v1', modele: 'gpt-4o-mini', cle: 'oui', lien: 'https://platform.openai.com/api-keys', local: false },
  { id: 'anthropic', libelle: 'Claude (Anthropic)', adresse: 'https://api.anthropic.com/v1', modele: 'claude-sonnet-5-5', cle: 'oui', lien: 'https://platform.claude.com/settings/keys', local: false },
  { id: 'gemini', libelle: 'Gemini (Google)', adresse: 'https://generativelanguage.googleapis.com/v1beta/openai', modele: 'gemini-2.5-flash', cle: 'oui', lien: 'https://aistudio.google.com/apikey', local: false },
  { id: 'abacus', libelle: 'Abacus.AI (RouteLLM)', adresse: 'https://routellm.abacus.ai/v1', modele: 'route-llm', cle: 'oui', lien: 'https://abacus.ai/help/route-llm/', local: false, note: 'L’accès demande un abonnement ChatLLM ; la clé se crée sur la page « RouteLLM API » de votre compte. Pour une organisation avec espace dédié, l’adresse est https://votre-espace.abacus.ai/v1.' },
  { id: 'mistral', libelle: 'Mistral', adresse: 'https://api.mistral.ai/v1', modele: 'mistral-small-latest', cle: 'oui', lien: 'https://console.mistral.ai/api-keys', local: false },
  { id: 'openrouter', libelle: 'OpenRouter', adresse: 'https://openrouter.ai/api/v1', modele: 'openai/gpt-4o-mini', cle: 'oui', lien: 'https://openrouter.ai/keys', local: false },
  { id: 'groq', libelle: 'Groq', adresse: 'https://api.groq.com/openai/v1', modele: 'llama-3.3-70b-versatile', cle: 'oui', lien: 'https://console.groq.com/keys', local: false },
  { id: 'ollama', libelle: 'Ollama (sur cet ordinateur)', adresse: 'http://localhost:11434/v1', modele: 'llama3.1', cle: 'non', lien: 'https://ollama.com/download', local: true },
  {
    id: 'freellmpool',
    libelle: 'FreeLLMPool (gratuit, sur cet ordinateur)',
    adresse: 'http://localhost:8080/v1',
    modele: 'auto',
    cle: 'non',
    lien: 'https://github.com/0xzr/freellmpool',
    local: true,
    note: 'Outil libre à installer et à lancer sur votre ordinateur (Python demandé) : il répartit vos demandes entre des offres gratuites de plusieurs services. Les offres gratuites changent sans préavis et peuvent être limitées ou indisponibles.',
    consentement: 'Je comprends que ma demande sera envoyée à des services gratuits tiers, choisis automatiquement par l’outil et pouvant la conserver ou la modérer. Je n’y mettrai rien de confidentiel.'
  },
  { id: 'lmstudio', libelle: 'LM Studio (sur cet ordinateur)', adresse: 'http://localhost:1234/v1', modele: '', cle: 'non', lien: 'https://lmstudio.ai', local: true },
  { id: 'autre', libelle: 'Autre service compatible', adresse: '', modele: '', cle: 'selon', lien: '', local: false }
]

/** Services dont l'adresse peut être changée : ceux qui tournent sur cet ordinateur, « autre », et Abacus.AI (espace d'entreprise). */
export const adresseModifiable = (f: Fournisseur): boolean => f.local || f.id === 'autre' || f.id === 'abacus'

export const trouverFournisseur = (id: string): Fournisseur | undefined => FOURNISSEURS.find((f) => f.id === id)
