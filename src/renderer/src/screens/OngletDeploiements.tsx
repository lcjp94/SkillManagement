import { FolderOpen, FolderSearch, Trash2, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DeploiementVue, FicheProjet, RapportRetraitVue, Sortie } from '@shared/contrat'
import { appeler, messageErreur } from '../api'
import { useApp } from '../appContexte'
import { Alerte, Btn, CaseCarte, Chargement, Dialogue, Donnee, Pastille, dateCourte, formaterOctets, pluriel, useNotifs } from '../ui'

const ACTIONS = { create: 'Créé', modify: 'Modifié', unchanged: 'Inchangé' } as const

export function OngletDeploiements({ fiche, onChange, ouvrirAuto }: { fiche: FicheProjet; onChange: () => void; ouvrirAuto: boolean }) {
  if (fiche.deploiements.length === 0) {
    return <Alerte ton="attention">Ce projet n’a aucun assistant. Utilisez « Modifier » pour en choisir un.</Alerte>
  }
  return (
    <div className="flex flex-col gap-4">
      {fiche.chevauchements.map((m) => (
        <Alerte key={m} ton="attention">
          {m}
        </Alerte>
      ))}
      <ul className="flex flex-col gap-4">
        {fiche.deploiements.map((d, i) => (
          <li key={d.assistant}>
            <CarteAssistant fiche={fiche} d={d} onChange={onChange} ouvrirAuto={ouvrirAuto && i === 0} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function CarteAssistant({ fiche, d, onChange, ouvrirAuto }: { fiche: FicheProjet; d: DeploiementVue; onChange: () => void; ouvrirAuto: boolean }) {
  const { toast } = useNotifs()
  const [apercu, setApercu] = useState<{ racine?: string } | null>(null)
  const [desinstaller, setDesinstaller] = useState(false)
  const [annuler, setAnnuler] = useState(false)
  const id = fiche.projet.id
  const modifies = d.installes.filter((i) => i.etat === 'modifie').length

  const demarrer = useCallback(async () => {
    if (d.dossier) return setApercu({})
    try {
      const racine = await appeler('dossier.choisir')
      if (racine) setApercu({ racine })
    } catch (e) {
      toast(messageErreur(e))
    }
  }, [d.dossier, toast])

  const changerDossier = async () => {
    try {
      const racine = await appeler('dossier.choisir')
      if (racine) setApercu({ racine })
    } catch (e) {
      toast(messageErreur(e))
    }
  }

  // « Enregistrer et appliquer » arrive ici avec l'aperçu déjà demandé
  const dejaOuvert = useRef(false)
  useEffect(() => {
    if (ouvrirAuto && !dejaOuvert.current) {
      dejaOuvert.current = true
      void demarrer()
    }
  }, [ouvrirAuto, demarrer])

  return (
    <section className="carte flex flex-col gap-3" aria-labelledby={`assistant-${d.assistant}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={`assistant-${d.assistant}`}>{d.libelle}</h2>
        {d.dossier === null ? (
          <Pastille>Aucun dossier choisi</Pastille>
        ) : d.aInstaller.length === 0 && d.installes.length > 0 ? (
          <Pastille ton="ok">À jour</Pastille>
        ) : (
          <Pastille ton="attention">{pluriel(d.aInstaller.length, 'skill à installer', 'skills à installer')}</Pastille>
        )}
      </div>
      <p className="text-sm text-doux">{d.description}</p>
      <p>
        <span className="text-doux">Dossier : </span>
        {d.dossier ? <Donnee>{d.dossier}</Donnee> : 'aucun pour le moment'}
      </p>
      {d.dossier && (
        <p className="text-sm" aria-live="polite">
          {pluriel(d.installes.length, 'skill installé', 'skills installés')} sur le disque
          {modifies > 0 && ` · ${pluriel(modifies, 'modifié par vous', 'modifiés par vous')}`}
          {d.derniere && ` · dernière installation le ${dateCourte(d.derniere.creeLe)}`}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Btn ton="primaire" onClick={demarrer} disabled={fiche.skills.every((s) => s.ecarte)}>
          {d.dossier ? d.libelleInstaller : 'Choisir un dossier et installer'}
        </Btn>
        {d.dossier && (
          <>
            <Btn onClick={() => changerDossier()}>
              <FolderSearch size={16} aria-hidden="true" />
              Changer de dossier
            </Btn>
            <Btn onClick={() => appeler('dossier.ouvrir', { projetId: id, assistant: d.assistant }).catch((e: unknown) => toast(messageErreur(e)))}>
              <FolderOpen size={16} aria-hidden="true" />
              Ouvrir le dossier
            </Btn>
            <Btn onClick={() => setDesinstaller(true)} disabled={d.installes.length === 0}>
              <Trash2 size={16} aria-hidden="true" />
              Désinstaller…
            </Btn>
            <Btn onClick={() => setAnnuler(true)} disabled={!d.derniere?.annulable}>
              <Undo2 size={16} aria-hidden="true" />
              Annuler la dernière installation
            </Btn>
          </>
        )}
      </div>
      {d.derniere && !d.derniere.annulable && <p className="text-sm text-doux">Une installation plus récente existe dans ce dossier : la dernière installation ne peut plus être annulée seule.</p>}

      {apercu && <DialogueApercu key={apercu.racine ?? 'memorise'} fiche={fiche} d={d} racineInitiale={apercu.racine} onFermer={() => { setApercu(null); onChange() }} onChange={onChange} />}
      <DialogueDesinstaller key={String(desinstaller)} fiche={fiche} d={d} ouvert={desinstaller} onFermer={() => setDesinstaller(false)} onChange={onChange} />
      <DialogueAnnuler projetId={id} d={d} ouvert={annuler} onFermer={() => setAnnuler(false)} onChange={onChange} />
    </section>
  )
}

type Apercu = Sortie<'deploiement.apercu'>

function DialogueApercu({ fiche, d, racineInitiale, onFermer, onChange }: { fiche: FicheProjet; d: DeploiementVue; racineInitiale?: string; onFermer: () => void; onChange: () => void }) {
  const { toast } = useNotifs()
  const { info } = useApp()
  const outil = info.analyseApprofondie.disponible
  // Les skills venus d'ailleurs sont les plus risqués : l'analyse approfondie est proposée d'office quand il y en a
  const [approfondie, setApprofondie] = useState(outil && fiche.skills.some((k) => !k.ecarte && k.source !== 'integre'))
  const [racine, setRacine] = useState(racineInitiale)
  const [reinstaller, setReinstaller] = useState<string[]>([])
  const [avertissements, setAvertissements] = useState<string[]>([])
  const [ecrasements, setEcrasements] = useState<string[]>([])
  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const nom = (slug: string) => fiche.skills.find((s) => s.slug === slug)?.name ?? slug

  useEffect(() => {
    let courant = true
    appeler('deploiement.apercu', { projetId: fiche.projet.id, assistant: d.assistant, racine, reinstaller, avertissementsConfirmes: avertissements, ecrasementsConfirmes: ecrasements, analyseApprofondie: approfondie }).then(
      (a) => {
        if (!courant) return
        setApercu(a)
        setErreur(null)
      },
      (e: unknown) => courant && setErreur(messageErreur(e))
    )
    return () => {
      courant = false
    }
  }, [fiche.projet.id, d.assistant, racine, reinstaller, avertissements, ecrasements, approfondie])

  const changerDossier = async () => {
    try {
      const nouveau = await appeler('dossier.choisir')
      if (nouveau) setRacine(nouveau)
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  const installer = async () => {
    if (!apercu) return
    setOccupe(true)
    try {
      const r = await appeler('deploiement.appliquer', { projetId: fiche.projet.id, assistant: d.assistant, racine, reinstaller, avertissementsConfirmes: avertissements, ecrasementsConfirmes: ecrasements, analyseApprofondie: approfondie })
      if (r.statut === 'applique') {
        toast(`${pluriel(r.apercu.nombreSkills, 'skill installé', 'skills installés')} dans ${d.libelle}. Vérifié sur votre disque.`)
        onChange()
        onFermer()
      } else if (r.statut === 'rien-a-faire') {
        toast('Tout était déjà installé.')
        onFermer()
      } else setErreur('Cochez les confirmations demandées avant d’installer.')
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  const bascule = (liste: string[], set: (l: string[]) => void, valeur: string, coche: boolean) => set(coche ? [...liste, valeur] : liste.filter((v) => v !== valeur))
  const manqueConfirmation = apercu ? apercu.apercu.ecrasements.some((k) => !ecrasements.includes(k)) : true
  const aEcrire = apercu?.choix.aEcrire.length ?? 0
  const nouveaux = apercu ? apercu.choix.aEcrire.filter((s) => !apercu.choix.dejaInstalles.includes(s)) : []

  return (
    <Dialogue
      ouvert
      titre={`Installer dans ${d.libelle}`}
      onFermer={onFermer}
      pied={
        <>
          <Btn onClick={onFermer}>Annuler</Btn>
          <Btn ton="primaire" onClick={installer} occupe={occupe} disabled={!apercu || aEcrire === 0 || manqueConfirmation || (apercu?.apercu.nombreSkills === 0 && apercu.apercu.dossiersACreer.length === 0)}>
            {apercu?.choix.libelle ?? 'Installer'}
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erreur && (
          <Alerte ton="erreur" annonce>
            {erreur}
          </Alerte>
        )}
        {!apercu && !erreur && <Chargement texte="Calcul de ce qui sera écrit…" />}
        {apercu && (
          <>
            <p>
              Dossier : <Donnee>{apercu.dossier}</Donnee>{' '}
              <Btn petit ton="discret" onClick={changerDossier}>
                Changer
              </Btn>
            </p>
            <p className="font-semibold">Rien n’est écrit tant que vous n’avez pas cliqué sur « {apercu.choix.libelle} ».</p>
            <p aria-live="polite">
              {pluriel(apercu.apercu.nombreSkills, 'skill sera écrit', 'skills seront écrits')} · espace nécessaire : {formaterOctets(apercu.apercu.octets)}.
            </p>

            {outil && (
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-4" checked={approfondie} onChange={(e) => setApprofondie(e.target.checked)} />
                  Lancer l’analyse approfondie avant d’installer (quelques secondes par skill)
                </label>
                {apercu.approfondie.executee && apercu.approfondie.erreurs.length === 0 && <p className="text-sm text-doux">Analyse approfondie terminée : rien de plus n’a été trouvé.</p>}
                {apercu.approfondie.erreurs.length > 0 && (
                  <Alerte ton="attention">L’analyse approfondie n’a pas pu se terminer pour : {apercu.approfondie.erreurs.map((slug) => nom(slug)).join(', ')}. L’analyse de sécurité habituelle a bien eu lieu.</Alerte>
                )}
              </div>
            )}

            {apercu.chevauchements.map((m) => (
              <Alerte key={m} ton="attention">
                {m}
              </Alerte>
            ))}
            {apercu.apercu.avertissements.map((m) => (
              <Alerte key={m} ton="attention">
                {m}
              </Alerte>
            ))}

            {nouveaux.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <h3 className="font-semibold">Nouveaux skills</h3>
                <ul className="list-disc pl-5">
                  {nouveaux.map((s) => (
                    <li key={s}>
                      <Donnee>{nom(s)}</Donnee>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {apercu.choix.dejaInstalles.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="font-semibold">Déjà installés</h3>
                <p className="text-sm text-doux">Ils sont décochés : cochez un skill pour le réinstaller.</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {apercu.choix.dejaInstalles.map((s) => (
                    <li key={s}>
                      <CaseCarte type="checkbox" checked={reinstaller.includes(s)} onChange={(c) => bascule(reinstaller, setReinstaller, s, c)} titre={<Donnee>{nom(s)}</Donnee>} description="Déjà installé" />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {apercu.apercu.refus.length > 0 && (
              <Alerte ton="erreur">
                <p className="font-semibold">Ne seront pas installés :</p>
                <ul className="list-disc pl-5">
                  {apercu.apercu.refus.map((r) => (
                    <li key={r.slug}>
                      <Donnee>{nom(r.slug)}</Donnee> — {r.raison}
                    </li>
                  ))}
                </ul>
              </Alerte>
            )}
            {apercu.apercu.aConfirmer.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="font-semibold">Ces skills demandent votre accord</h3>
                {apercu.apercu.aConfirmer.map((a) => (
                  <div key={a.slug}>
                    <CaseCarte type="checkbox" checked={avertissements.includes(a.slug)} onChange={(c) => bascule(avertissements, setAvertissements, a.slug, c)} titre={<Donnee>{nom(a.slug)}</Donnee>} description="Je l’ai examiné et je veux l’installer." />
                    <details className="px-3 pt-1">
                      <summary>Voir le détail</summary>
                      <ul className="mt-1 list-disc pl-5 text-sm">
                        {a.problemes.map((p, i) => (
                          <li key={i}>{p.message}</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                ))}
              </section>
            )}
            {apercu.apercu.ecrasements.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="font-semibold">Fichiers que vous avez écrits ou modifiés</h3>
                <p className="text-sm text-doux">Ils seront remplacés ; une copie est gardée et restaurée si vous désinstallez.</p>
                {apercu.apercu.ecrasements.map((k) => (
                  <CaseCarte key={k} type="checkbox" checked={ecrasements.includes(k)} onChange={(c) => bascule(ecrasements, setEcrasements, k, c)} titre={<Donnee>{k.replace('#', ' · bloc ')}</Donnee>} description="Je confirme le remplacement." />
                ))}
              </section>
            )}

            <details>
              <summary>Voir le détail</summary>
              <div className="mt-2 flex flex-col gap-2">
                <ul className="text-sm">
                  {apercu.apercu.lignes.map((l) => (
                    <li key={l.chemin}>
                      <strong>{ACTIONS[l.action]}</strong> · <Donnee>{l.chemin}</Donnee>
                    </li>
                  ))}
                </ul>
                {apercu.apercu.arbre && <pre className="texte-brut">{apercu.apercu.arbre}</pre>}
              </div>
            </details>
          </>
        )}
      </div>
    </Dialogue>
  )
}

function RapportRetrait({ rapport }: { rapport: RapportRetraitVue }) {
  return (
    <div className="flex flex-col gap-3">
      <Alerte ton={rapport.conserves.length > 0 ? 'attention' : 'ok'} annonce>
        {pluriel(rapport.retires.length + rapport.restaures.length, 'élément retiré ou restauré', 'éléments retirés ou restaurés')}
        {rapport.conserves.length > 0 && ` · ${pluriel(rapport.conserves.length, 'conservé', 'conservés')}`}.
      </Alerte>
      {rapport.restaures.length > 0 && (
        <section>
          <h3 className="font-semibold">Remis dans l’état d’avant</h3>
          <ul className="list-disc pl-5 text-sm">
            {rapport.restaures.map((c) => (
              <li key={c}>
                <Donnee>{c}</Donnee>
              </li>
            ))}
          </ul>
        </section>
      )}
      {rapport.conserves.length > 0 && (
        <section>
          <h3 className="font-semibold">Conservés</h3>
          <ul className="list-disc pl-5 text-sm">
            {rapport.conserves.map((c) => (
              <li key={c.chemin}>
                <Donnee>{c.chemin}</Donnee> — {c.raison}
              </li>
            ))}
          </ul>
        </section>
      )}
      <details>
        <summary>Voir le détail</summary>
        <ul className="mt-1 list-disc pl-5 text-sm">
          {[...rapport.retires, ...rapport.dossiersRetires.map((d) => `${d}/ (dossier vide)`)].map((c) => (
            <li key={c}>
              <Donnee>{c}</Donnee>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function DialogueDesinstaller({ fiche, d, ouvert, onFermer, onChange }: { fiche: FicheProjet; d: DeploiementVue; ouvert: boolean; onFermer: () => void; onChange: () => void }) {
  const [choisis, setChoisis] = useState<string[]>(d.installes.map((i) => i.slug))
  const [rapport, setRapport] = useState<RapportRetraitVue | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const nom = (slug: string) => fiche.skills.find((s) => s.slug === slug)?.name ?? slug

  const lancer = async () => {
    setOccupe(true)
    setErreur(null)
    try {
      const tous = choisis.length === d.installes.length
      setRapport(await appeler('deploiement.desinstaller', { projetId: fiche.projet.id, assistant: d.assistant, slugs: tous ? 'tous' : choisis }))
      onChange()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }
  const fermer = () => {
    setRapport(null)
    setChoisis(d.installes.map((i) => i.slug))
    onFermer()
  }

  return (
    <Dialogue
      ouvert={ouvert}
      titre={`Désinstaller de ${d.libelle}`}
      onFermer={fermer}
      pied={
        rapport ? (
          <Btn ton="primaire" onClick={fermer}>
            Terminé
          </Btn>
        ) : (
          <>
            <Btn onClick={fermer}>Annuler</Btn>
            <Btn ton="danger" onClick={lancer} occupe={occupe} disabled={choisis.length === 0}>
              Désinstaller {pluriel(choisis.length, 'skill', 'skills')}
            </Btn>
          </>
        )
      }
    >
      {rapport ? (
        <RapportRetrait rapport={rapport} />
      ) : (
        <div className="flex flex-col gap-3">
          <p>Seuls les fichiers écrits par l’application et que vous n’avez pas modifiés sont retirés. Un fichier remplacé à l’installation est remis dans son état d’avant.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {d.installes.map((i) => (
              <li key={i.slug}>
                <CaseCarte
                  type="checkbox"
                  checked={choisis.includes(i.slug)}
                  onChange={(c) => setChoisis(c ? [...choisis, i.slug] : choisis.filter((s) => s !== i.slug))}
                  titre={<Donnee>{nom(i.slug)}</Donnee>}
                  description={i.etat === 'modifie' ? 'Modifié par vous : sera conservé' : undefined}
                />
              </li>
            ))}
          </ul>
          {erreur && (
            <Alerte ton="erreur" annonce>
              {erreur}
            </Alerte>
          )}
        </div>
      )}
    </Dialogue>
  )
}

function DialogueAnnuler({ projetId, d, ouvert, onFermer, onChange }: { projetId: string; d: DeploiementVue; ouvert: boolean; onFermer: () => void; onChange: () => void }) {
  const [rapport, setRapport] = useState<RapportRetraitVue | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  const lancer = async () => {
    setOccupe(true)
    try {
      setRapport(await appeler('deploiement.annuler', { projetId, assistant: d.assistant }))
      onChange()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }
  const fermer = () => {
    setRapport(null)
    setErreur(null)
    onFermer()
  }

  return (
    <Dialogue
      ouvert={ouvert}
      titre="Annuler la dernière installation"
      onFermer={fermer}
      pied={
        rapport ? (
          <Btn ton="primaire" onClick={fermer}>
            Terminé
          </Btn>
        ) : (
          <>
            <Btn onClick={fermer}>Non, garder</Btn>
            <Btn ton="danger" onClick={lancer} occupe={occupe}>
              Annuler l’installation
            </Btn>
          </>
        )
      }
    >
      {rapport ? (
        <RapportRetrait rapport={rapport} />
      ) : (
        <div className="flex flex-col gap-3">
          <p>
            Les fichiers écrits par l’installation du {d.derniere ? dateCourte(d.derniere.creeLe) : ''} seront retirés, et ceux qu’elle avait remplacés seront remis comme avant. Ce que vous avez modifié depuis est conservé.
          </p>
          {erreur && (
            <Alerte ton="erreur" annonce>
              {erreur}
            </Alerte>
          )}
        </div>
      )}
    </Dialogue>
  )
}
