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
