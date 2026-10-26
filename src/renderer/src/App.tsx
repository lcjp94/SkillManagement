import { BookOpen, FolderKanban, Settings } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AppInfo, Referentiels } from '@shared/contrat'
import { appeler, messageErreur, useDonnees } from './api'
import type { Profile } from '@shared/schemas/state'
import { Contexte, type ContexteApp } from './appContexte'
import { aller, lien, useRoute } from './routes'
import { Bibliotheque } from './screens/Bibliotheque'
import { CreerProjet } from './screens/CreerProjet'
import { Demarrage } from './screens/Demarrage'
import { FicheProjetEcran } from './screens/FicheProjet'
import { Projets } from './screens/Projets'
import { Reglages } from './screens/Reglages'
import { Alerte, Chargement, FournisseurNotifs } from './ui'

const NAVIGATION = [
  { cle: 'projets', libelle: 'Projets', href: lien.projets, Icone: FolderKanban },
  { cle: 'bibliotheque', libelle: 'Bibliothèque', href: lien.bibliotheque, Icone: BookOpen },
  { cle: 'reglages', libelle: 'Réglages', href: lien.reglages, Icone: Settings }
] as const

function Coque({ actif, children }: { actif: string; children: ReactNode }) {
  return (
    <div className="coque">
      <nav aria-label="Navigation principale" className="flex flex-col gap-1 border-r border-separateur bg-surface/60 p-3">
        <p className="px-3 pt-2 pb-4 text-lg font-bold tracking-tight">SkillManagement</p>
        {NAVIGATION.map(({ cle, libelle, href, Icone }) => (
          <a
            key={cle}
            href={href}
            aria-current={actif === cle ? 'page' : undefined}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 font-semibold no-underline ${actif === cle ? 'bg-bouton text-white' : 'text-texte hover:bg-surface-2'}`}
          >
            <Icone size={18} aria-hidden="true" />
            {libelle}
          </a>
        ))}
      </nav>
      <main className="mx-auto w-full max-w-5xl px-8 py-8 max-sm:px-4">{children}</main>
    </div>
  )
}

function Theme() {
  const { donnees } = useDonnees('reglages.get')
  useEffect(() => {
    const racine = document.documentElement
    if (!donnees || donnees.theme === 'auto') racine.removeAttribute('data-theme')
    else racine.setAttribute('data-theme', donnees.theme)
  }, [donnees])
  return null
}

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [ref, setRef] = useState<Referentiels | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const profil = useDonnees('profil.get')
  // Le profil qui vient d'être enregistré compte tout de suite, sans attendre la relecture
  const [profilLocal, setProfilLocal] = useState<Profile | null>(null)
  const profilActuel = profilLocal ?? profil.donnees
  const route = useRoute()
  const [avisFerme, setAvisFerme] = useState(false)

  useEffect(() => {
    Promise.all([appeler('app.info'), appeler('referentiels.get')]).then(
      ([i, r]) => {
        setInfo(i)
        setRef(r)
      },
      (e: unknown) => setErreur(messageErreur(e))
    )
  }, [])

  // Sans profil, la seule porte d'entrée est le parcours de démarrage
  const sansProfil = !profil.chargement && profilActuel === null && !profil.erreur
  // Le profil existait-il à l'ouverture ? Seule cette situation renvoie vers les projets : à la fin du parcours,
  // c'est le parcours lui-même qui choisit où aller.
  const profilAuDepart = useRef<boolean | null>(null)
  useEffect(() => {
    if (profil.chargement) return
    profilAuDepart.current ??= profilActuel !== null
    if (sansProfil && route.nom !== 'demarrage') aller(lien.demarrage)
    if (profilAuDepart.current && route.nom === 'demarrage') aller(lien.projets)
  }, [sansProfil, profil.chargement, profilActuel, route.nom])

  if (erreur || profil.erreur) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1>SkillManagement</h1>
        <Alerte ton="erreur" annonce>
          {erreur ?? profil.erreur}
        </Alerte>
      </main>
    )
  }
  if (!info || !ref || profil.chargement) {
    return (
      <main className="mx-auto max-w-xl p-8 text-center">
        <h1>SkillManagement</h1>
        <Chargement />
      </main>
    )
  }

  const valeur: ContexteApp = {
    ref,
    profil: profilActuel,
    info,
    profilEnregistre: (p) => {
      setProfilLocal(p)
      profil.recharger()
    }
  }
  const cle = route.nom === 'projet' || route.nom === 'nouveau-projet' ? 'projets' : route.nom
  return (
    <Contexte.Provider value={valeur}>
      <FournisseurNotifs>
        <Theme />
        {route.nom === 'demarrage' ? (
          <main className="mx-auto w-full max-w-3xl px-6 py-10">
            <Demarrage />
          </main>
        ) : (
          <Coque actif={cle}>
            {info.reprises > 0 && !avisFerme && (
              <div className="mb-5">
                <Alerte ton="attention" annonce>
                  <p className="font-semibold">Une installation avait été interrompue.</p>
                  <p>
                    L’application s’est arrêtée pendant une installation. Les fichiers ont été remis dans l’état d’avant : rien n’est resté à moitié écrit.
                  </p>
                  <button type="button" className="btn btn-petit mt-2" onClick={() => setAvisFerme(true)}>
                    Compris
                  </button>
                </Alerte>
              </div>
            )}
            {route.nom === 'projets' && <Projets />}
            {route.nom === 'nouveau-projet' && <CreerProjet />}
            {route.nom === 'projet' && <FicheProjetEcran key={route.id} id={route.id} onglet={route.onglet} installer={route.installer} />}
            {route.nom === 'bibliotheque' && <Bibliotheque />}
            {route.nom === 'reglages' && <Reglages />}
          </Coque>
        )}
      </FournisseurNotifs>
    </Contexte.Provider>
  )
}
