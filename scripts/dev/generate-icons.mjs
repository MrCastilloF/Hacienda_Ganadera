#!/usr/bin/env node
/**
 * generate-icons.mjs — genera los iconos de la PWA sin dependencias externas.
 *
 * Escribe PNG RGBA válidos codificando a mano (IHDR/IDAT/IEND + zlib).
 * Diseño: fondo verde oscuro, monograma "H" claro y una línea de tierra.
 *
 *   node scripts/dev/generate-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(ROOT, 'apps', 'web', 'public', 'icons');

const CAMPOS = { r: 0x0b, g: 0x1f, b: 0x16 }; // verde oscuro
const CLARO = { r: 0xe6, g: 0xf0, b: 0xea }; // crema
const TIERRA = { r: 0xa9, g: 0x71, b: 0x4b }; // tierra

// ── Codificación PNG ─────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro "none"
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Dibujo ───────────────────────────────────────────────────────────────────
function crearLienzo(size, fondo) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4] = fondo.r;
    pixels[i * 4 + 1] = fondo.g;
    pixels[i * 4 + 2] = fondo.b;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

function rect(pixels, size, color, x0, y0, x1, y1) {
  for (let y = Math.round(y0); y < Math.round(y1); y++) {
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const i = (y * size + x) * 4;
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
      pixels[i + 3] = 255;
    }
  }
}

function dibujarIcono(size) {
  const pixels = crearLienzo(size, CAMPOS);
  const u = size / 512; // unidad de diseño

  // Margen de seguridad ~18 % para iconos "maskable"
  const izq = 116 * u;
  const der = 396 * u;
  const arriba = 132 * u;
  const abajo = 384 * u;
  const grosor = 56 * u;
  const medio = (arriba + abajo) / 2;

  // "H": dos verticales + travesaño
  rect(pixels, size, CLARO, izq, arriba, izq + grosor, abajo);
  rect(pixels, size, CLARO, der - grosor, arriba, der, abajo);
  rect(pixels, size, CLARO, izq + grosor, medio - grosor / 2, der - grosor, medio + grosor / 2);

  // Línea de tierra
  rect(pixels, size, TIERRA, izq, 424 * u, der, 424 * u + 20 * u);

  return pixels;
}

mkdirSync(OUT, { recursive: true });

const salidas = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon.png', 64],
];

for (const [nombre, size] of salidas) {
  const png = encodePng(size, size, dibujarIcono(size));
  writeFileSync(resolve(OUT, nombre), png);
  console.log(`  ${nombre.padEnd(24)} ${size}×${size}  ${png.length} bytes`);
}

// Icono vectorial para navegadores que prefieren SVG
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Hacienda Ganadera">
  <rect width="512" height="512" fill="#0b1f16"/>
  <g fill="#e6f0ea">
    <rect x="116" y="132" width="56" height="252"/>
    <rect x="340" y="132" width="56" height="252"/>
    <rect x="172" y="230" width="168" height="56"/>
  </g>
  <rect x="116" y="424" width="280" height="20" fill="#a9714b"/>
</svg>
`;
writeFileSync(resolve(OUT, 'icon.svg'), svg, 'utf8');
console.log(`  icon.svg                 512×512  ${Buffer.byteLength(svg)} bytes`);
