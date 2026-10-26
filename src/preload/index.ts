import { contextBridge, ipcRenderer } from 'electron'
import { CANAUX } from '@shared/channels'
import type { SkillManagementApi } from '@shared/contrat'

const autorises = new Set<string>(CANAUX)

// Seule surface entre l'interface et le processus principal : un appel, restreint aux canaux du contrat
const api = {
  invoke: (canal: string, entree?: unknown) =>
    autorises.has(canal) ? ipcRenderer.invoke(canal, entree) : Promise.reject(new Error('Canal inconnu.'))
} as SkillManagementApi

contextBridge.exposeInMainWorld('skillmanagement', api)
