import type { AnalyseSkillVue } from '@shared/contrat'

/** Ce que l'analyse a trouvé : le verdict est dit par l'appelant, le détail reste replié. */
export function ProblemesAnalyse({ analyse }: { analyse: AnalyseSkillVue }) {
  const { approfondie } = analyse
  const messages = [...analyse.problemes.map((p) => p.message), ...approfondie.problemes.map((p) => p.message)]
  return (
    <>
      {approfondie.disponible && (
        <p className="text-sm text-doux">{approfondie.executee ? 'Analyse approfondie effectuée.' : (approfondie.erreur ?? 'Analyse approfondie non effectuée.')}</p>
      )}
      {messages.length > 0 && (
        <details>
          <summary>Voir le détail</summary>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
