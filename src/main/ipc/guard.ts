import { z } from 'zod'

// Un appel IPC n'est accepté que s'il vient de la page de l'application :
// fichier local de l'interface en production, serveur de développement en dev.
export function isTrustedSender(senderUrl: string, options: { devOrigin?: string; rendererFile: string }): boolean {
  let url: URL
  try {
    url = new URL(senderUrl)
  } catch {
    return false
  }
  if (options.devOrigin && url.origin === new URL(options.devOrigin).origin) return true
  if (url.protocol !== 'file:') return false
  // Comparaison insensible à la casse : Windows ne distingue pas majuscules et minuscules
  const attendu = new URL(options.rendererFile).pathname.toLowerCase()
  return decodeURIComponent(url.pathname).toLowerCase() === decodeURIComponent(attendu)
}

export interface HandlerSpec<I extends z.ZodType, O extends z.ZodType> {
  input: I
  output: O
  run: (input: z.infer<I>) => z.infer<O> | Promise<z.infer<O>>
}

// Enveloppe commune : origine, validation de l'entrée, validation de la sortie.
// Les messages d'erreur ne contiennent ni trace ni détail interne.
export function wrapHandler<I extends z.ZodType, O extends z.ZodType>(
  spec: HandlerSpec<I, O>,
  trusted: (senderUrl: string) => boolean
) {
  return async (senderUrl: string, raw: unknown): Promise<z.infer<O>> => {
    if (!trusted(senderUrl)) throw new Error('Appel refusé : origine non reconnue.')
    const entree = spec.input.safeParse(raw)
    if (!entree.success) throw new Error('Demande invalide.')
    const sortie = spec.output.safeParse(await spec.run(entree.data))
    if (!sortie.success) throw new Error('Réponse interne invalide.')
    return sortie.data
  }
}
