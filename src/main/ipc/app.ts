import { z } from 'zod'
import { AppInfoSchema, type AppInfo } from '@shared/ipc'
import type { HandlerSpec } from './guard'

export function appInfoHandler(info: AppInfo): HandlerSpec<z.ZodUndefined, typeof AppInfoSchema> {
  return { input: z.undefined(), output: AppInfoSchema, run: () => info }
}
