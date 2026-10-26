/// <reference types="vite/client" />
import type { SkillManagementApi } from '@shared/ipc'

declare global {
  interface Window {
    skillmanagement: SkillManagementApi
  }
}
