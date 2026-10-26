/// <reference types="vite/client" />
import type { SkillManagementApi } from '@shared/contrat'

declare global {
  interface Window {
    skillmanagement: SkillManagementApi
  }
}
