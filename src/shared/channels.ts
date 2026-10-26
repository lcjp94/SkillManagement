// Noms des canaux IPC. Fichier sans dépendance : le preload en bac à sable
// ne peut charger que le module electron, donc rien d'autre ne doit y entrer.
export const IPC = {
  appInfo: 'app.info'
} as const
