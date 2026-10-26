import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc'

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [erreur, setErreur] = useState(false)

  useEffect(() => {
    window.skillmanagement.app.info().then(setInfo, () => setErreur(true))
  }, [])

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">SkillManagement</h1>
      <p className="text-lg opacity-70">Gérez les skills de vos assistants IA, projet par projet.</p>
      <p role="status" className="text-sm opacity-60">
        {erreur ? "La liaison avec l'application a échoué." : info ? `Version ${info.version}` : 'Chargement…'}
      </p>
    </main>
  )
}
