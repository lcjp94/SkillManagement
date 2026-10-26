import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/channels'
import type { SkillManagementApi } from '@shared/ipc'

// Seule surface entre l'interface et le processus principal
const api: SkillManagementApi = {
  app: { info: () => ipcRenderer.invoke(IPC.appInfo) }
}

contextBridge.exposeInMainWorld('skillmanagement', api)
