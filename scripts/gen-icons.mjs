import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const outDir = join(process.cwd(), 'public', 'icons')
mkdirSync(outDir, { recursive: true })

// Simple SVG logo (FS) with gradient background
const svg = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0ea5e9"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="96" fill="url(#g)"/>
  <g fill="#ffffff" font-family="Inter, Arial, sans-serif" font-weight="800" text-anchor="middle">
    <text x="256" y="300" font-size="220" letter-spacing="6">FS</text>
  </g>
</svg>`

async function generate(size) {
  const svgBuf = Buffer.from(svg(size))
  const png = await sharp(svgBuf).png().toBuffer()
  const out = join(outDir, `pwa-${size}.png`)
  writeFileSync(out, png)
  console.log('Generated', out)
}

async function generateFavicon() {
  const sizes = [16, 32, 48, 64]
  const bufs = []
  for (const s of sizes) {
    const svgBuf = Buffer.from(svg(s))
    const pngBuf = await sharp(svgBuf).png().toBuffer()
    bufs.push(pngBuf)
  }
  const icoBuf = await pngToIco(bufs)
  const out = join(process.cwd(), 'public', 'favicon.ico')
  writeFileSync(out, icoBuf)
  console.log('Generated', out)
}

const sizes = [192, 512]
Promise.all(sizes.map(generate)).then(generateFavicon).then(() => console.log('Done')).catch((e) => {
  console.error(e)
  process.exit(1)
})
