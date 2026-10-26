// IA facultative : réglage du service (Réglages) et rédaction d'un skill (Bibliothèque, fiche projet).
// La clé est saisie ici mais ne revient jamais : l'interface ne sait que « une clé est enregistrée ».
import { useEffect, useRef, useState } from 'react'
import type { AnalyseSkillVue, IaEtat } from '@shared/contrat'
import { appeler, messageErreur, useDonnees } from '../api'
import { Alerte, Btn, Champ, Chargement, Dialogue, Pastille, useNotifs } from '../ui'
import { ProblemesAnalyse } from './Analyse'

/** Services pour lesquels aucun essai avec une vraie clé n'a été fait par l'équipe du projet. */
const NON_ESSAYES = new Set(['gemini', 'abacus', 'anthropic'])
/** Services sans clé, jamais essayés avec le vrai outil installé. */
const NON_ESSAYES_SANS_CLE = new Set(['freellmpool'])

export function SectionIa() {
  const { donnees, erreur, chargement, recharger } = useDonnees('ia.etat')
  if (erreur) {
    return (
      <Alerte ton="erreur" annonce>
        {erreur}
      </Alerte>
    )
  }
  if (chargement && !donnees) return <Chargement />
  if (!donnees) return null
  return <FormulaireIa etat={donnees} onChange={recharger} />
}

function FormulaireIa({ etat, onChange }: { etat: IaEtat; onChange: () => void }) {
  const { toast } = useNotifs()
  const depart = etat.choix
  const [fournisseur, setFournisseur] = useState(depart?.fournisseur ?? '')
  const [adresse, setAdresse] = useState(depart?.adresse ?? '')
  const [modele, setModele] = useState(depart?.modele ?? '')
  const [cle, setCle] = useState('')
  const [consentement, setConsentement] = useState(Boolean(depart?.consentement))
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)
  const [modeles, setModeles] = useState<string[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState<'test' | 'enregistrer' | null>(null)
  const f = etat.fournisseurs.find((x) => x.id === fournisseur)
  const adresseLibre = Boolean(f && (f.local || f.id === 'autre' || f.id === 'abacus'))

  const choisir = (id: string) => {
    const suivant = etat.fournisseurs.find((x) => x.id === id)
    setFournisseur(id)
    setAdresse(suivant?.adresse ?? '')
    setModele(suivant?.modele ?? '')
    setCle('')
    // Un consentement déjà donné pour ce service est conservé ; pour un autre service, il faut le redonner
    setConsentement(depart?.fournisseur === id && Boolean(depart.consentement))
    setTest(null)
    setModeles([])
    setErreur(null)
  }

  const donneesFormulaire = () => ({ fournisseur, adresse: adresseLibre ? adresse : undefined, modele, ...(cle.trim() ? { cle } : {}), ...(f?.consentement ? { consentement } : {}) })

  const verifier = async () => {
    setOccupe('test')
    setErreur(null)
    setTest(null)
    try {
      const r = await appeler('ia.tester', donneesFormulaire())
      setTest({ ok: r.ok, message: r.message })
      setModeles(r.modeles)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(null)
    }
  }

  const enregistrer = async (supprimerCle = false) => {
    setOccupe('enregistrer')
    setErreur(null)
    try {
      await appeler('ia.enregistrer', { ...donneesFormulaire(), ...(supprimerCle ? { supprimerCle: true } : {}) })
      setCle('')
      toast(supprimerCle ? 'Clé supprimée.' : 'Réglage enregistré.')
      onChange()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-doux">
        Facultatif. Une IA peut rédiger un skill à votre place. Seul le texte de votre demande est envoyé au service, jamais vos fichiers ni vos projets. Avec un service que vous choisissez vous-même, il part chez lui ; certains services (signalés ci-dessous) le transmettent à d’autres. Tout le reste de l’application fonctionne sans.
      </p>
      {!etat.stockageSecurise && <Alerte ton="attention">Le stockage sécurisé de votre ordinateur n’est pas disponible : une clé ne peut pas être enregistrée. Les services sur cet ordinateur, sans clé, restent utilisables.</Alerte>}
      <Champ libelle="Service">
        {(c) => (
          <select {...c} className="champ max-w-md" value={fournisseur} onChange={(e) => choisir(e.target.value)}>
            <option value="">Aucun</option>
            {etat.fournisseurs.map((x) => (
              <option key={x.id} value={x.id}>
                {x.libelle}
              </option>
            ))}
          </select>
        )}
      </Champ>
      {f && (
        <>
          {f.note && <Alerte>{f.note}</Alerte>}
          {NON_ESSAYES_SANS_CLE.has(f.id) && <Alerte ton="attention">Ce service n’a pas encore été essayé avec l’outil réel installé. Si « Vérifier » échoue alors que l’outil tourne, dites-le-nous.</Alerte>}
          {NON_ESSAYES.has(f.id) && <Alerte ton="attention">Ce service n’a pas encore été essayé avec une vraie clé. Si « Vérifier » échoue alors que votre clé est bonne, dites-le-nous.</Alerte>}
          {f.cle !== 'non' && (
            <div className="flex flex-col gap-1.5">
              <Champ
                libelle={f.cle === 'selon' ? 'Clé du service (si le service en demande une)' : 'Clé du service'}
                aide={depart?.fournisseur === f.id && depart.cleEnregistree ? 'Une clé est enregistrée sur cet ordinateur. Laissez vide pour la conserver, ou collez-en une nouvelle.' : undefined}
              >
                {(c) => <input {...c} type="password" autoComplete="off" spellCheck={false} className="champ max-w-md" value={cle} onChange={(e) => setCle(e.target.value)} />}
              </Champ>
              {f.lien && (
                <a href={f.lien} target="_blank" rel="noopener noreferrer" className="w-fit text-sm">
                  Où trouver ma clé ?
                </a>
              )}
            </div>
          )}
          {f.cle === 'non' && f.lien && (
            <a href={f.lien} target="_blank" rel="noopener noreferrer" className="w-fit text-sm">
              Installer ce service sur mon ordinateur
            </a>
          )}
          {adresseLibre && <Champ libelle="Adresse du service">{(c) => <input {...c} className="champ max-w-xl" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="https://…" />}</Champ>}
          <Champ libelle="Modèle" aide={f.id === 'lmstudio' || f.id === 'autre' ? 'Cliquez sur « Vérifier » pour voir les modèles proposés par le service.' : undefined}>
            {(c) => (
              <>
                <input {...c} className="champ max-w-md" value={modele} list="modeles-ia" onChange={(e) => setModele(e.target.value)} />
                <datalist id="modeles-ia">
                  {modeles.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </>
            )}
          </Champ>
          {f.consentement && (
            <label className="flex items-start gap-2 rounded-xl bg-surface-2 p-3">
              <input type="checkbox" className="mt-1 size-4 flex-none" checked={consentement} onChange={(e) => setConsentement(e.target.checked)} />
              <span>{f.consentement}</span>
            </label>
          )}
          {test && (
            <Alerte ton={test.ok ? 'ok' : 'erreur'} annonce>
              {test.message}
            </Alerte>
          )}
          {erreur && (
            <Alerte ton="erreur" annonce>
              {erreur}
            </Alerte>
          )}
          <div className="flex flex-wrap gap-2">
            <Btn onClick={verifier} occupe={occupe === 'test'}>
              Vérifier
            </Btn>
            <Btn ton="primaire" onClick={() => enregistrer()} occupe={occupe === 'enregistrer'} disabled={Boolean(f.consentement) && !consentement}>
              Enregistrer
            </Btn>
            {depart?.fournisseur === f.id && depart.cleEnregistree && <Btn onClick={() => enregistrer(true)}>Supprimer la clé</Btn>}
          </div>
        </>
      )}
      {!f && etat.choix && (
        <p className="text-sm text-doux">
          Le service actuellement enregistré reste en place tant que vous n’en choisissez pas un autre.
        </p>
      )}
      <details>
        <summary>Voir le détail</summary>
        <p className="mt-1 text-sm text-doux">
          Les services proposés utilisent le même protocole que OpenAI (adresses /models et /chat/completions). Votre clé est chiffrée par Windows dans un fichier de l’application et n’est jamais affichée ni écrite en clair.
        </p>
      </details>
    </div>
  )
}

// --- Rédaction d'un skill -----------------------------------------------------------------------------

interface Brouillon {
  slug: string
  name: string
  description: string
  corps: string
}

export function DialogueRediger({
  ouvert,
  sujetInitial = '',
  besoin,
  onFermer,
  onCree
}: {
  ouvert: boolean
  sujetInitial?: string
  besoin?: string
  onFermer: () => void
  onCree: (slug: string) => void
}) {
  const [sujet, setSujet] = useState(sujetInitial)
  const [idRedaction, setIdRedaction] = useState<string | null>(null)
  const [texte, setTexte] = useState('')
  const [etat, setEtat] = useState<'saisie' | 'en-cours' | 'revue'>('saisie')
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null)
  const [analyse, setAnalyse] = useState<AnalyseSkillVue | null>(null)
  const [confirme, setConfirme] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const { annoncer } = useNotifs()

  useEffect(() => {
    if (ouvert) setSujet(sujetInitial)
  }, [ouvert, sujetInitial])

  // Suivi de la rédaction : le texte arrive par morceaux
  useEffect(() => {
    if (!idRedaction || etat !== 'en-cours') return
    let actif = true
    const minuterie = setInterval(async () => {
      try {
        const r = await appeler('ia.lire', { id: idRedaction })
        if (!actif) return
        setTexte(r.texte)
        if (r.etat === 'termine' && r.skill) {
          setBrouillon({ slug: r.skill.slug, name: r.skill.name, description: r.skill.description, corps: r.skill.corps })
          setEtat('revue')
          annoncer('Le skill est rédigé : relisez-le avant de l’enregistrer.')
        } else if (r.etat === 'erreur' || r.etat === 'annule' || r.etat === 'termine') {
          if (r.etat === 'erreur') setErreur(r.erreur ?? 'La rédaction a échoué.')
          if (r.etat === 'termine') setErreur('Le service n’a rien renvoyé d’utilisable. Réessayez avec une demande plus précise.')
          setEtat('saisie')
        }
      } catch (e) {
        if (actif) {
          setErreur(messageErreur(e))
          setEtat('saisie')
        }
      }
    }, 300)
    return () => {
      actif = false
      clearInterval(minuterie)
    }
  }, [idRedaction, etat, annoncer])

  // Le verdict de l'analyse suit ce que la personne modifie
  const derniere = useRef(0)
  useEffect(() => {
    if (etat !== 'revue' || !brouillon) return
    const numero = ++derniere.current
    const minuterie = setTimeout(() => {
      appeler('skills.analyser', { slug: brouillon.slug, name: brouillon.name, description: brouillon.description, content: brouillon.corps }).then(
        (a) => numero === derniere.current && setAnalyse(a),
        () => numero === derniere.current && setAnalyse(null)
      )
    }, 400)
    return () => clearTimeout(minuterie)
  }, [etat, brouillon])

  const lancer = async () => {
    setErreur(null)
    setOccupe(true)
    try {
      const { id } = await appeler('ia.rediger', { sujet, ...(besoin ? { besoin } : {}) })
      setIdRedaction(id)
      setTexte('')
      setEtat('en-cours')
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  const annuler = async () => {
    if (idRedaction) await appeler('ia.annuler', { id: idRedaction }).catch(() => undefined)
    setEtat('saisie')
  }

  const enregistrer = async () => {
    if (!brouillon) return
    setOccupe(true)
    setErreur(null)
    try {
      const { slug } = await appeler('skills.creer', { slug: brouillon.slug, name: brouillon.name, description: brouillon.description, content: brouillon.corps, confirme })
      reinitialiser()
      onCree(slug)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  const reinitialiser = () => {
    setEtat('saisie')
    setBrouillon(null)
    setAnalyse(null)
    setConfirme(false)
    setTexte('')
    setIdRedaction(null)
    setErreur(null)
  }
  const fermer = () => {
    if (etat === 'en-cours') void annuler()
    reinitialiser()
    onFermer()
  }

  const bloque = analyse?.analyse === 'danger'
  const exigeAccord = analyse?.analyse === 'warning' && !confirme
  return (
    <Dialogue
      ouvert={ouvert}
      titre="Rédiger un skill avec une IA"
      onFermer={fermer}
      pied={
        etat === 'saisie' ? (
          <>
            <Btn onClick={fermer}>Annuler</Btn>
            <Btn ton="primaire" onClick={lancer} occupe={occupe} disabled={sujet.trim().length < 3}>
              Rédiger
            </Btn>
          </>
        ) : etat === 'en-cours' ? (
          <Btn onClick={annuler}>Arrêter</Btn>
        ) : (
          <>
            <Btn onClick={reinitialiser}>Recommencer</Btn>
            <Btn ton="primaire" onClick={enregistrer} occupe={occupe} disabled={!analyse || bloque || exigeAccord || brouillon?.corps.trim() === ''}>
              Enregistrer le skill
            </Btn>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {etat === 'saisie' && (
          <>
            <Champ libelle="Que doit savoir faire ce skill ?" aide="Par exemple « relire un contrat de prestation clause par clause ».">
              {(c) => <textarea {...c} className="champ min-h-24" value={sujet} maxLength={500} onChange={(e) => setSujet(e.target.value)} />}
            </Champ>
            <p className="text-sm text-doux">Le texte obtenu n’est jamais installé tout seul : vous le relisez, il est analysé, puis vous décidez.</p>
          </>
        )}
        {etat === 'en-cours' && (
          <div className="flex flex-col gap-2" aria-busy="true">
            <p role="status">Rédaction en cours…</p>
            <pre className="texte-brut">{texte || '…'}</pre>
          </div>
        )}
        {etat === 'revue' && brouillon && (
          <>
            <Champ libelle="Nom">{(c) => <input {...c} className="champ" value={brouillon.name} maxLength={120} onChange={(e) => setBrouillon({ ...brouillon, name: e.target.value })} />}</Champ>
            <Champ libelle="Description (une phrase)">
              {(c) => <input {...c} className="champ" value={brouillon.description} maxLength={1000} onChange={(e) => setBrouillon({ ...brouillon, description: e.target.value })} />}
            </Champ>
            <Champ libelle="Consignes">
              {(c) => <textarea {...c} className="champ min-h-56 font-mono text-sm" value={brouillon.corps} onChange={(e) => setBrouillon({ ...brouillon, corps: e.target.value })} />}
            </Champ>
            {analyse && (
              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-2 font-semibold">
                  Analyse de sécurité : {analyse.analyse === 'clean' ? <Pastille ton="ok">Vérifié</Pastille> : analyse.analyse === 'warning' ? <Pastille ton="attention">À examiner</Pastille> : <Pastille ton="erreur">Refusé</Pastille>}
                </p>
                <ProblemesAnalyse analyse={analyse} />
                {analyse.analyse === 'warning' && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="size-4" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} />
                    J’ai lu ces points et je veux enregistrer ce skill.
                  </label>
                )}
                {bloque && <Alerte ton="erreur">Ce skill contient un contenu dangereux : il ne peut pas être enregistré. Modifiez-le ou recommencez.</Alerte>}
              </div>
            )}
            {!analyse && <Chargement texte="Analyse du skill…" />}
          </>
        )}
        {erreur && (
          <Alerte ton="erreur" annonce>
            {erreur}
          </Alerte>
        )}
      </div>
    </Dialogue>
  )
}

