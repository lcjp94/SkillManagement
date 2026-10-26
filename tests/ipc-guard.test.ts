import { describe, expect, it } from 'vitest'
import { isTrustedSender } from '../src/main/ipc/guard'

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
