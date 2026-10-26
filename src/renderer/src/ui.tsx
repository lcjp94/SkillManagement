// Composants de base : accessibles au clavier et au lecteur d'écran, sans dépendance.
import { Check, CircleAlert, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

// --- Données venant du catalogue ou de la personne ------------------------------------------------

/** Texte venu du catalogue ou saisi par la personne (noms de skills, de projets…) : il n'est pas un libellé de l'interface. */
export function Donnee({ children }: { children: ReactNode }) {
  return <span data-donnee="">{children}</span>
}

// --- Boutons --------------------------------------------------------------------------------------

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ton?: 'primaire' | 'danger' | 'discret' | 'neutre'
  petit?: boolean
  occupe?: boolean
}

export function Btn({ ton = 'neutre', petit, occupe, className = '', children, disabled, type = 'button', ...reste }: BtnProps) {
  const classes = ['btn', ton === 'primaire' && 'btn-primaire', ton === 'danger' && 'btn-danger', ton === 'discret' && 'btn-discret', petit && 'btn-petit', className]
  return (
    <button type={type} className={classes.filter(Boolean).join(' ')} disabled={disabled || occupe} aria-busy={occupe || undefined} {...reste}>
      {children}
    </button>
  )
}

// --- Formulaires ----------------------------------------------------------------------------------

export function Champ({ libelle, aide, children }: { libelle: string; aide?: string; children: (props: { id: string; 'aria-describedby'?: string }) => ReactNode }) {
  const id = useId()
  const idAide = aide ? `${id}-aide` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {libelle}
      </label>
      {children({ id, 'aria-describedby': idAide })}
      {aide && (
        <p id={idAide} className="text-sm text-doux">
          {aide}
        </p>
      )}
    </div>
  )
}

interface CaseCarteProps {
  type: 'checkbox' | 'radio'
  name?: string
  checked: boolean
  onChange: (coche: boolean) => void
  titre: ReactNode
  description?: ReactNode
  icone?: string
  disabled?: boolean
}

/** Carte cliquable : une vraie case ou un vrai bouton radio, recouvert d'une carte. */
export function CaseCarte({ type, name, checked, onChange, titre, description, icone, disabled }: CaseCarteProps) {
  return (
    <label className="case-carte">
      <input type={type} name={name} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="repere" aria-hidden="true">
        {checked && <Check size={14} strokeWidth={3} />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold">
          {icone && (
            <span aria-hidden="true" className="mr-1.5">
              {icone}
            </span>
          )}
          {titre}
        </span>
        {description && <span className="text-sm text-doux">{description}</span>}
      </span>
    </label>
  )
}

// --- Pastilles et alertes -------------------------------------------------------------------------

export function Pastille({ ton = 'neutre', children }: { ton?: 'neutre' | 'ok' | 'attention' | 'erreur' | 'info'; children: ReactNode }) {
  return <span className={`pastille ${ton !== 'neutre' ? `pastille-${ton}` : ''}`}>{children}</span>
}

export function Alerte({ ton = 'info', children, annonce = false }: { ton?: 'info' | 'attention' | 'erreur' | 'ok'; children: ReactNode; annonce?: boolean }) {
  const Icone = ton === 'ok' ? Check : ton === 'info' ? Info : CircleAlert
  return (
    <div className={`alerte ${ton !== 'info' ? `alerte-${ton}` : ''}`} role={annonce ? (ton === 'erreur' ? 'alert' : 'status') : undefined}>
      <Icone size={18} aria-hidden="true" className="mt-0.5 flex-none" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function Analyse({ statut }: { statut: 'clean' | 'warning' | 'danger' }) {
  if (statut === 'clean') return <Pastille ton="ok">Vérifié</Pastille>
  if (statut === 'warning') return <Pastille ton="attention">À examiner</Pastille>
  return <Pastille ton="erreur">Refusé</Pastille>
}

/** Poids d'un skill dans le contexte de l'assistant, dit avec des mots plutôt qu'un nombre. */
export function Poids({ tokens }: { tokens: number }) {
  return <span>{tokens <= 300 ? 'Court' : tokens <= 450 ? 'Moyen' : 'Long'}</span>
}

// --- Fenêtre de dialogue --------------------------------------------------------------------------

interface DialogueProps {
  ouvert: boolean
  titre: string
  onFermer: () => void
  children: ReactNode
  pied?: ReactNode
}

/** `<dialog>` natif : le focus reste dans la fenêtre, Échap la ferme, l'arrière-plan est inerte. */
export function Dialogue({ ouvert, titre, onFermer, children, pied }: DialogueProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const idTitre = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (ouvert && !d.open) d.showModal()
    if (!ouvert && d.open) d.close()
  }, [ouvert])
  return (
    <dialog ref={ref} aria-labelledby={idTitre} onClose={onFermer}>
      {ouvert && (
        <div className="flex max-h-[calc(100vh-3rem)] flex-col">
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <h2 id={idTitre} className="text-xl">
              {titre}
            </h2>
            <button type="button" className="btn btn-discret btn-petit" onClick={onFermer} aria-label="Fermer">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-4">{children}</div>
          {pied && <div className="flex flex-wrap justify-end gap-2 border-t border-separateur px-6 py-4">{pied}</div>}
        </div>
      )}
    </dialog>
  )
}

// --- Onglets (modèle ARIA : flèches, Début, Fin) ------------------------------------------------------

export function Onglets<T extends string>({ onglets, actif, onChoisir, libelle }: { onglets: { id: T; libelle: string }[]; actif: T; onChoisir: (id: T) => void; libelle: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const base = useId()
  const surTouche = (e: React.KeyboardEvent, index: number) => {
    const n = onglets.length
    const cible = e.key === 'ArrowRight' ? (index + 1) % n : e.key === 'ArrowLeft' ? (index - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (cible < 0) return
    e.preventDefault()
    const suivant = onglets[cible]!
    onChoisir(suivant.id)
    refs.current[suivant.id]?.focus()
  }
  return (
    <div role="tablist" aria-label={libelle} className="flex flex-wrap gap-1 border-b border-separateur">
      {onglets.map((o, i) => (
        <button
          key={o.id}
          ref={(el) => {
            refs.current[o.id] = el
          }}
          role="tab"
          id={`${base}-${o.id}`}
          aria-selected={o.id === actif}
          aria-controls={`${base}-panneau`}
          tabIndex={o.id === actif ? 0 : -1}
          onClick={() => onChoisir(o.id)}
          onKeyDown={(e) => surTouche(e, i)}
          className={`-mb-px border-b-2 px-4 py-2.5 font-semibold whitespace-nowrap ${o.id === actif ? 'border-bouton text-accent' : 'border-transparent text-doux hover:text-texte'}`}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  )
}

export function PanneauOnglet({ idOnglets, actif, children }: { idOnglets?: string; actif: string; children: ReactNode }) {
  return (
    <div role="tabpanel" tabIndex={0} aria-label={idOnglets ?? actif} className="pt-5 outline-offset-4">
      {children}
    </div>
  )
}

// --- Notifications --------------------------------------------------------------------------------

interface Toast {
  id: number
  texte: string
  action?: { libelle: string; onClick: () => void }
}

interface Notifs {
  /** Annonce un texte aux lecteurs d'écran sans rien afficher. */
  annoncer: (texte: string) => void
  /** Message bref en bas de la fenêtre, avec une action facultative. */
  toast: (texte: string, action?: Toast['action']) => void
}

const ContexteNotifs = createContext<Notifs>({ annoncer: () => {}, toast: () => {} })
export const useNotifs = (): Notifs => useContext(ContexteNotifs)

export function FournisseurNotifs({ children }: { children: ReactNode }) {
  const [annonce, setAnnonce] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const compteur = useRef(0)

  const annoncer = useCallback((texte: string) => {
    // Vider puis remplir force la relecture d'un même message
    setAnnonce('')
    setTimeout(() => setAnnonce(texte), 50)
  }, [])
  const toast = useCallback((texte: string, action?: Toast['action']) => {
    const id = ++compteur.current
    setToasts((liste) => [...liste, { id, texte, action }])
    setTimeout(() => setToasts((liste) => liste.filter((t) => t.id !== id)), action ? 12000 : 7000)
  }, [])
  const valeur = useMemo(() => ({ annoncer, toast }), [annoncer, toast])

  return (
    <ContexteNotifs.Provider value={valeur}>
      {children}
      <div className="sr-only-sm" role="status" aria-live="polite" aria-atomic="true">
        {annonce}
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-texte px-4 py-3 text-fond shadow-xl">
            <span>{t.texte}</span>
            {t.action && (
              <button
                type="button"
                className="rounded-lg bg-fond px-3 py-1 font-semibold text-texte"
                onClick={() => {
                  t.action!.onClick()
                  setToasts((liste) => liste.filter((x) => x.id !== t.id))
                }}
              >
                {t.action.libelle}
              </button>
            )}
            <button type="button" aria-label="Fermer le message" className="opacity-80 hover:opacity-100" onClick={() => setToasts((liste) => liste.filter((x) => x.id !== t.id))}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ContexteNotifs.Provider>
  )
}

// --- Mise en forme --------------------------------------------------------------------------------

export function Chargement({ texte = 'Chargement…' }: { texte?: string }) {
  return (
    <p role="status" className="py-8 text-center text-doux">
      {texte}
    </p>
  )
}

export function formaterOctets(octets: number): string {
  if (octets < 1000) return 'moins de 1 Ko'
  if (octets < 1_000_000) return `environ ${Math.round(octets / 1000)} Ko`
  return `environ ${(octets / 1_000_000).toFixed(1).replace('.', ',')} Mo`
}

export const dateCourte = (iso: string): string =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const dateJour = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

export const pluriel = (n: number, un: string, plusieurs: string): string => `${n} ${n > 1 ? plusieurs : un}`
