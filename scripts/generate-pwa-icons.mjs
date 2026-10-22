// One-off/rerunnable generator for placeholder PWA icons, since no image
// tooling (ImageMagick etc.) or real exported app icon is available yet.
// Draws a simple cream circle (seal motif, matching AuthLayout's
// auth-seal-placeholder) on the app's green accent background, sized to fit
// Android's maskable-icon safe zone. Swap public/pwa-*.png for the real
// brand icon once available — see theme.css's own placeholder-value note.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const GREEN = [0x2e, 0x7d, 0x4f] // --qb-green-accent
const CREAM = [0xfb, 0xf3, 0xe3] // --qb-cream

function crc32(buf) {
  let c
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c >>> 0
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function generatePng(size) {
  const radius = size * 0.32
  const cx = size / 2
  const cy = size / 2

  const raw = Buffer.alloc(size * (1 + size * 3))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3)
    raw[rowStart] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      const inCircle = dx * dx + dy * dy <= radius * radius
      const color = inCircle ? CREAM : GREEN
      const pxStart = rowStart + 1 + x * 3
      raw[pxStart] = color[0]
      raw[pxStart + 1] = color[1]
      raw[pxStart + 2] = color[2]
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const idat = deflateSync(raw)

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(`public/pwa-${size}x${size}.png`, generatePng(size))
  console.log(`wrote public/pwa-${size}x${size}.png`)
}
