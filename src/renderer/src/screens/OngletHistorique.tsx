import { useDonnees } from '../api'
import { Alerte, Chargement, Donnee, Pastille, dateCourte, pluriel } from '../ui'

export function OngletHistorique({ projetId }: { projetId: string }) {
  const { donnees, erreur, chargement } = useDonnees('deploiement.historique', { projetId })
  if (erreur) {
    return (
      <Alerte ton="erreur" annonce>
        {erreur}
      </Alerte>
    )
  }
  if (chargement && !donnees) return <Chargement />
  if (!donnees || donnees.length === 0) return <p className="text-doux">Rien n’a encore été écrit sur votre disque pour ce projet.</p>
  return (
    <ul className="flex flex-col gap-3">
      {donnees.map((h) => (
        <li key={h.id} className="carte flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {h.libelleCible} · {dateCourte(h.creeLe)}
            </p>
            {h.etat === 'annule' ? <Pastille ton="attention">Annulée</Pastille> : h.etat === 'en-cours' ? <Pastille ton="erreur">Interrompue</Pastille> : h.retires > 0 && h.retires >= h.nbSkills ? <Pastille>Retirée</Pastille> : <Pastille ton="ok">Installée</Pastille>}
          </div>
          <p className="text-sm text-doux">
            {pluriel(h.nbFichiers, 'fichier écrit', 'fichiers écrits')}
            {h.nbSkills > 0 && ` · ${pluriel(h.nbSkills, 'skill', 'skills')}`}
            {h.retires > 0 && h.etat === 'termine' && ` · ${pluriel(h.retires, 'retiré depuis', 'retirés depuis')}`}
          </p>
          <p className="text-sm text-doux">
            Dossier : <Donnee>{h.dossier}</Donnee>
          </p>
          {h.annuleLe && <p className="text-sm text-doux">Annulée le {dateCourte(h.annuleLe)}.</p>}
        </li>
      ))}
    </ul>
  )
}
