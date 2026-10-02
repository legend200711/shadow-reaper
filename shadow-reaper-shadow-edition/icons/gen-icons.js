#!/usr/bin/env node
/**
 * Shadow Reaper PWA Icon Generator
 * Generates PNG icons using Node canvas (node-canvas) if available,
 * otherwise falls back to writing inline SVG-based PNG via a pure-JS
 * PNG encoder approach.
 *
 * Run: node icons/gen-icons.js
 */

const fs   = require('fs');
const path = require('path');

// Try to use @napi-rs/canvas or canvas (node-canvas)
let createCanvas;
try {
  createCanvas = require('@napi-rs/canvas').createCanvas;
} catch (e1) {
  try {
    createCanvas = require('canvas').createCanvas;
  } catch (e2) {
    createCanvas = null;
  }
}

const OUT = path.join(__dirname);

// ─── Brand colours ───────────────────────────────────────────────────────────
const BG_DARK     = '#080c14';   // app background
const ACCENT      = '#1e90ff';   // electric blue
const ACCENT_GLOW = 'rgba(30,144,255,0.35)';
const SKULL_FG    = '#e8edf5';

// ─── SVG source for each icon variant ────────────────────────────────────────
function makeSVG(size, maskable) {
  const pad    = maskable ? Math.round(size * 0.12) : Math.round(size * 0.04);
  const inner  = size - pad * 2;
  const cx     = size / 2;
  const cy     = size / 2;
  const r      = inner / 2;
  const skull  = size * 0.38;   // skull emoji font-size

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#0d1626"/>
      <stop offset="100%" stop-color="${BG_DARK}"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : Math.round(size * 0.22)}" fill="url(#bg)"/>

  <!-- Glow halo -->
  <circle cx="${cx}" cy="${cy}" r="${r * 0.85}" fill="url(#glow)"/>

  <!-- Outer ring -->
  <circle cx="${cx}" cy="${cy}" r="${r * 0.82}" fill="none" stroke="${ACCENT}" stroke-width="${Math.max(1.5, size * 0.012)}" stroke-opacity="0.55"/>

  <!-- Skull ☠ -->
  <text
    x="${cx}" y="${cy + skull * 0.38}"
    text-anchor="middle"
    font-size="${skull}"
    font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif"
    fill="${SKULL_FG}"
  >&#9760;</text>

  <!-- Word-mark below skull -->
  <text
    x="${cx}" y="${cy + skull * 0.38 + skull * 0.62}"
    text-anchor="middle"
    font-size="${Math.round(size * 0.085)}"
    font-family="-apple-system, Segoe UI, system-ui, sans-serif"
    font-weight="700"
    fill="${ACCENT}"
    letter-spacing="${Math.round(size * 0.01)}"
    opacity="0.9"
  >SR</text>
</svg>`;
}

// ─── Tiny pure-JS PNG encoder (1-bit palette is not enough; use canvas) ──────
// If canvas is not available we write the SVG and skip PNG generation,
// letting the developer know they need to convert manually.

function writeIcon(filename, size, maskable) {
  const svgStr = makeSVG(size, maskable);
  const svgPath = path.join(OUT, filename.replace('.png', '.svg'));
  fs.writeFileSync(svgPath, svgStr);

  if (!createCanvas) {
    console.log(`  [SVG only] ${filename} — install canvas/napi-rs-canvas to auto-generate PNG`);
    return;
  }

  const canvas = createCanvas(size, size);
  const ctx    = canvas.getContext('2d');

  // Background
  const grd = ctx.createRadialGradient(size/2, size*0.4, 0, size/2, size/2, size*0.7);
  grd.addColorStop(0, '#0d1626');
  grd.addColorStop(1, BG_DARK);

  if (!maskable) {
    // Rounded corners via clip
    const rr = Math.round(size * 0.22);
    ctx.beginPath();
    ctx.moveTo(rr, 0);
    ctx.lineTo(size - rr, 0);
    ctx.quadraticCurveTo(size, 0, size, rr);
    ctx.lineTo(size, size - rr);
    ctx.quadraticCurveTo(size, size, size - rr, size);
    ctx.lineTo(rr, size);
    ctx.quadraticCurveTo(0, size, 0, size - rr);
    ctx.lineTo(0, rr);
    ctx.quadraticCurveTo(0, 0, rr, 0);
    ctx.closePath();
    ctx.clip();
  }

  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);

  // Glow
  const glowGrd = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size * 0.45);
  glowGrd.addColorStop(0, 'rgba(30,144,255,0.18)');
  glowGrd.addColorStop(1, 'rgba(30,144,255,0)');
  ctx.fillStyle = glowGrd;
  ctx.fillRect(0, 0, size, size);

  // Ring
  ctx.beginPath();
  ctx.arc(size/2, size/2, size * 0.41, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(30,144,255,0.55)';
  ctx.lineWidth   = Math.max(1.5, size * 0.012);
  ctx.stroke();

  // Skull
  const skullSize = size * 0.38;
  ctx.font      = `${skullSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = SKULL_FG;
  ctx.fillText('☠', size/2, size * 0.47);

  // "SR" wordmark
  const wordSize = Math.round(size * 0.085);
  ctx.font      = `700 ${wordSize}px -apple-system, "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = ACCENT;
  ctx.globalAlpha = 0.9;
  ctx.fillText('SR', size/2, size * 0.78);
  ctx.globalAlpha = 1;

  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(OUT, filename), buf);
  console.log(`  [PNG] ${filename} (${size}x${size})`);
}

console.log('Shadow Reaper — generating PWA icons…');
writeIcon('icon-192.png',         192, false);
writeIcon('icon-512.png',         512, false);
writeIcon('icon-maskable-192.png',192, true);
writeIcon('icon-maskable-512.png',512, true);
writeIcon('apple-touch-icon.png', 180, false);
console.log('Done.');
