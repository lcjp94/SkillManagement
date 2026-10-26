import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { isTrustedSender, wrapHandler } from '../src/main/ipc/guard'
import { appInfoHandler } from '../src/main/ipc/app'

const rendererFile = 'file:///C:/Program%20Files/SkillManagement/resources/app/out/renderer/index.html'

describe('isTrustedSender', () => {
  it('accepte la page locale de l interface, quelle que soit la casse', () => {
    expect(isTrustedSender(rendererFile, { rendererFile })).toBe(true)
    expect(isTrustedSender(rendererFile.toUpperCase().replace('FILE:', 'file:'), { rendererFile })).toBe(true)
  })

  it('accepte le serveur de développement uniquement si configuré', () => {
    const dev = 'http://localhost:5173'
    expect(isTrustedSender('http://localhost:5173/', { rendererFile, devOrigin: dev })).toBe(true)
    expect(isTrustedSender('http://localhost:5173/', { rendererFile })).toBe(false)
    expect(isTrustedSender('http://localhost:6000/', { rendererFile, devOrigin: dev })).toBe(false)
  })

  it('refuse les pages externes, les autres fichiers et les adresses illisibles', () => {
    expect(isTrustedSender('https://example.com/', { rendererFile })).toBe(false)
    expect(isTrustedSender('file:///C:/Users/autre/page.html', { rendererFile })).toBe(false)
    expect(isTrustedSender('', { rendererFile })).toBe(false)
    expect(isTrustedSender('pas une adresse', { rendererFile })).toBe(false)
  })
})

describe('wrapHandler', () => {
  const info = { nom: 'SkillManagement', version: '0.1.0', plateforme: 'win32' }
  const toujours = (): boolean => true

  it('renvoie la réponse validée', async () => {
    const appel = wrapHandler(appInfoHandler(info), toujours)
    await expect(appel('x', undefined)).resolves.toEqual(info)
  })

  it('refuse une origine non reconnue sans exécuter le handler', async () => {
    let appele = false
    const appel = wrapHandler(
      { input: z.undefined(), output: z.string(), run: () => ((appele = true), 'ok') },
      () => false
    )
    await expect(appel('https://example.com', undefined)).rejects.toThrow('origine non reconnue')
    expect(appele).toBe(false)
  })

  it('refuse une entrée qui ne respecte pas le schéma', async () => {
    const appel = wrapHandler(appInfoHandler(info), toujours)
    await expect(appel('x', { inattendu: true })).rejects.toThrow('Demande invalide')
  })

  it('refuse une sortie qui ne respecte pas le schéma, sans détail interne', async () => {
    const appel = wrapHandler(
      { input: z.undefined(), output: z.object({ n: z.number() }), run: () => ({ n: 'secret' }) as never },
      toujours
    )
    const erreur = await appel('x', undefined).catch((e: Error) => e)
    expect(erreur).toBeInstanceOf(Error)
    expect((erreur as Error).message).toBe('Réponse interne invalide.')
  })
})
