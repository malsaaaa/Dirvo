// Regenerates the app icons from resources/logo.svg:
//   resources/icon.png  (512x512, used by the window and for README/social use)
//   resources/icon.ico  (16 to 256 px, used for the title bar, taskbar and the future installer)
// Run with: npm run icons
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'resources', 'logo.svg'), 'utf8')

const render = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

writeFileSync(join(root, 'resources', 'icon.png'), render(512))

// Windows picks the closest size for each place (16 title bar, 32/48 taskbar, 256 large views).
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
const ico = await pngToIco(sizes.map(render))
writeFileSync(join(root, 'resources', 'icon.ico'), ico)

console.log(`wrote resources/icon.png and resources/icon.ico (${sizes.join(', ')} px)`)
