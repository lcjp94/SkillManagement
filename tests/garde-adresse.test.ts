import { describe, expect, it } from 'vitest'
import { AdresseRefuseeError, estAdresseInterdite, verifierAdresse } from '../src/main/ai/garde-adresse'

const public1 = async () => ['93.184.216.34']
const verif = (adresse: string, resolveur = public1) => verifierAdresse(adresse, { resolveur })

describe('adresses acceptées', () => {
  it.each([
    'https://api.openai.com/v1',
    'https://generativelanguage.googleapis.com/v1beta/openai',
    'http://localhost:11434/v1',
    'http://127.0.0.1:1234/v1',
    'http://[::1]:8080/v1',
    'https://exemple.org:8443/api'
  ])('%s', async (adresse) => {
    const resolveur = async (h: string) => (h === 'localhost' ? ['127.0.0.1'] : ['93.184.216.34'])
    await expect(verifierAdresse(adresse, { resolveur })).resolves.toBeInstanceOf(URL)
  })
})

describe('adresses refusées', () => {
  it.each([
    ['du texte', 'pas une adresse', /valide/],
    ['un protocole inconnu', 'ftp://exemple.org/v1', /https/],
    ['file://', 'file:///C:/Windows/win.ini', /https/],
    ['http vers un site public', 'http://exemple.org/v1', /localhost/],
    ['http vers une adresse privée', 'http://192.168.1.10/v1', /localhost/],
    ['un identifiant dans l’adresse', 'https://jp:secret@exemple.org/v1', /identifiant/],
    ['les métadonnées de AWS et Azure', 'http://169.254.169.254/latest/meta-data', /réservée/],
    ['les métadonnées en https', 'https://169.254.169.254/', /réservée/],
    ['une adresse link-local', 'https://169.254.10.20/v1', /réservée/],
    ['les métadonnées de Google', 'http://metadata.google.internal/computeMetadata/v1', /réservée/],
    ['les métadonnées d’Alibaba', 'http://100.100.100.200/latest', /réservée/],
    ['0.0.0.0', 'http://0.0.0.0:8080/v1', /réservée/],
    ['une adresse IPv6 link-local', 'https://[fe80::1]/v1', /réservée/],
    ['IPv4 déguisée en IPv6', 'https://[::ffff:169.254.169.254]/', /réservée/]
  ])('%s', async (_nom, adresse, motif) => {
    const e = await verif(adresse).catch((x: Error) => x)
    expect(e).toBeInstanceOf(AdresseRefuseeError)
    expect((e as Error).message).toMatch(motif)
  })

  it('un nom qui pointe vers une adresse interdite (rebond DNS) est refusé', async () => {
    await expect(verif('https://innocent.example.org/v1', async () => ['169.254.169.254'])).rejects.toThrow(/destination réservée/)
    await expect(verif('https://innocent.example.org/v1', async () => ['93.184.216.34', '169.254.0.5'])).rejects.toThrow(/destination réservée/)
  })

  it('« localhost » qui ne mène pas vers cet ordinateur est refusé', async () => {
    await expect(verif('http://localhost:1234/v1', async () => ['93.184.216.34'])).rejects.toThrow(/ne mène pas vers cet ordinateur/)
  })

  it('un nom introuvable donne un message utile', async () => {
    await expect(
      verif('https://nexiste-pas.example.org/v1', async () => {
        throw new Error('ENOTFOUND')
      })
    ).rejects.toThrow(/introuvable/)
  })
})

describe('estAdresseInterdite', () => {
  it('reconnaît les plages réservées et laisse passer le reste', () => {
    for (const ip of ['169.254.0.1', '169.254.255.255', '0.0.0.0', '100.100.100.200', 'fe80::1', 'febf::1', '::', '::ffff:169.254.1.1']) expect(estAdresseInterdite(ip), ip).toBe(true)
    for (const ip of ['8.8.8.8', '127.0.0.1', '192.168.1.1', '10.0.0.1', '2606:4700::1111', '::1', '169.253.1.1']) expect(estAdresseInterdite(ip), ip).toBe(false)
  })
})
