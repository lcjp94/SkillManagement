// Processus enfant du test de coupure : écrit en boucle jusqu'à être tué de l'extérieur.
import { z } from 'zod'
import { JsonStore } from '../../src/main/store/json-store'

const Schema = z.object({ version: z.literal(1), n: z.number().int(), bourrage: z.string() })

const store = new JsonStore({
  fichier: process.argv[2]!,
  versionCourante: 1,
  schema: Schema,
  creer: () => ({ version: 1 as const, n: 0, bourrage: '' })
})

await store.load()
// Assez gros pour que l'écriture dure : la coupure tombe souvent pendant celle-ci
const bourrage = 'x'.repeat(400_000)
let annonce = false
for (;;) {
  await store.update((s) => {
    s.n += 1
    s.bourrage = bourrage
  })
  if (!annonce) {
    annonce = true
    process.stdout.write('pret\n')
  }
}
