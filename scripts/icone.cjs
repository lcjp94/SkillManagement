// Génère build/icon.png (1024 × 1024) avec Electron lui-même : aucune dépendance de dessin à ajouter.
// Usage : npx electron scripts/icone.cjs
const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" rx="230" fill="#0071e3"/>
  <rect x="250" y="190" width="524" height="644" rx="72" fill="#ffffff"/>
  <rect x="338" y="296" width="348" height="44" rx="22" fill="#0071e3" opacity="0.35"/>
  <rect x="338" y="382" width="260" height="44" rx="22" fill="#0071e3" opacity="0.35"/>
  <path d="M356 640 L450 734 L668 500" fill="none" stroke="#0071e3" stroke-width="66" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const fenetre = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  await fenetre.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<style>html,body{margin:0;background:transparent}</style>${SVG}`)}`)
  await new Promise((r) => setTimeout(r, 400))
  const image = await fenetre.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  const dossier = join(__dirname, '..', 'build')
  mkdirSync(dossier, { recursive: true })
  writeFileSync(join(dossier, 'icon.png'), image.toPNG())
  console.log('build/icon.png', image.getSize())
  app.quit()
})
