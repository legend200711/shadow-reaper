#!/usr/bin/env python3
"""
Shadow Reaper PWA Icon Generator
Generates minimal valid PNG icons using only stdlib (struct, zlib).
Icons: dark background, blue accent ring, ☠ skull shape (drawn as simple paths).
"""

import struct, zlib, math, os

OUT = os.path.dirname(os.path.abspath(__file__))

# ─── Brand colours ───────────────────────────────────────────────────────────
BG       = (8,  12, 20,  255)   # #080c14
BG2      = (13, 22, 38,  255)   # #0d1626
ACCENT   = (30, 144, 255, 255)  # #1e90ff
SKULL_FG = (232, 237, 245, 255) # #e8edf5

# ─── Minimal PNG encoder ─────────────────────────────────────────────────────
def _chunk(name, data):
    c = zlib.crc32(name + data) & 0xffffffff
    return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)

def write_png(path, pixels, w, h):
    """pixels: list of (r,g,b,a) tuples, row-major."""
    raw = b''
    for y in range(h):
        raw += b'\x00'  # filter type None
        for x in range(w):
            r,g,b,a = pixels[y*w + x]
            raw += bytes([r,g,b,a])
    compressed = zlib.compress(raw, 9)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)   # bit_depth=8, color_type=2 RGB
    # Actually we need RGBA → color_type=6
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(_chunk(b'IHDR', ihdr))
        f.write(_chunk(b'IDAT', compressed))
        f.write(_chunk(b'IEND', b''))

# ─── Icon renderer ───────────────────────────────────────────────────────────
def lerp_color(a, b, t):
    return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(4))

def blend(src, dst):
    """Alpha-blend src over dst."""
    sa = src[3]/255.0
    da = dst[3]/255.0
    oa = sa + da*(1-sa)
    if oa == 0: return (0,0,0,0)
    r = (src[0]*sa + dst[0]*da*(1-sa)) / oa
    g = (src[1]*sa + dst[1]*da*(1-sa)) / oa
    b = (src[2]*sa + dst[2]*da*(1-sa)) / oa
    return (int(r), int(g), int(b), int(oa*255))

def make_icon(size, maskable=False):
    half   = size / 2.0
    pixels = []

    corner_r = 0 if maskable else size * 0.22

    ring_r    = size * 0.41
    ring_w    = max(1.5, size * 0.014)

    # Skull body parameters (simplified geometric skull)
    skull_cy  = half - size * 0.06   # skull center-y (slightly above mid)
    skull_r   = size * 0.21          # skull cranium radius
    # Eye sockets
    eye_r     = size * 0.055
    eye_ly_cx = half - size * 0.085
    eye_ry_cx = half + size * 0.085
    eye_cy    = skull_cy - size * 0.02
    # Nose
    nose_r    = size * 0.030
    nose_cx   = half
    nose_cy   = skull_cy + size * 0.06
    # Teeth area bottom
    teeth_top = skull_cy + skull_r * 0.48
    teeth_bot = skull_cy + skull_r * 0.88
    tooth_w   = size * 0.065

    # "SR" text — skip (can't render text easily with stdlib), just use the skull geometry

    for y in range(size):
        for x in range(size):
            fx = x + 0.5
            fy = y + 0.5
            dx = fx - half
            dy = fy - half

            # ─ Background with radial gradient ─
            dist_from_center = math.sqrt(dx*dx + dy*dy) / (size * 0.7)
            t = min(1.0, dist_from_center)
            bg_pixel = lerp_color(BG2 + (255,) if len(BG2)==3 else BG2[:3]+(255,),
                                  BG[:3]+(255,), t)
            # fix tuples
            bg_pixel = (
                int(BG2[0] + (BG[0]-BG2[0])*t),
                int(BG2[1] + (BG[1]-BG2[1])*t),
                int(BG2[2] + (BG[2]-BG2[2])*t),
                255
            )
            pixel = bg_pixel

            # ─ Rounded-corner mask (non-maskable only) ─
            if not maskable and corner_r > 0:
                # Distance to nearest corner area
                cx2 = max(corner_r, min(size - corner_r, fx))
                cy2 = max(corner_r, min(size - corner_r, fy))
                if cx2 == fx: cx2 = fx  # not near corner
                # Simple corner distance
                near_corner = False
                for (qx, qy) in [(corner_r, corner_r), (size-corner_r, corner_r),
                                  (corner_r, size-corner_r), (size-corner_r, size-corner_r)]:
                    if fx < qx + 0.5 and fy < qy + 0.5 and fx > qx - corner_r - 0.5 and fy > qy - corner_r - 0.5:
                        d = math.sqrt((fx-qx)**2 + (fy-qy)**2)
                        if d > corner_r:
                            pixel = (0,0,0,0)
                        near_corner = True
                        break

            # ─ Glow halo ─
            dist_center = math.sqrt(dx*dx + dy*dy)
            glow_t = max(0, 1 - dist_center / (size * 0.45))
            glow_alpha = int(55 * glow_t * glow_t)
            glow_color = (30, 144, 255, glow_alpha)
            pixel = blend(glow_color, pixel)

            # ─ Accent ring ─
            ring_dist = abs(dist_center - ring_r)
            if ring_dist <= ring_w:
                aa = min(1.0, 1 - (ring_dist / ring_w))
                ring_color = (ACCENT[0], ACCENT[1], ACCENT[2], int(180 * aa))
                pixel = blend(ring_color, pixel)

            # ─ Skull shape ─
            # Cranium (circle)
            d_skull = math.sqrt((fx - half)**2 + (fy - skull_cy)**2)

            # Anti-aliased skull fill
            skull_aa = min(1.0, max(0.0, skull_r - d_skull + 1))

            # Eye socket left (subtract)
            d_eye_l = math.sqrt((fx - eye_ly_cx)**2 + (fy - eye_cy)**2)
            eye_l_inside = d_eye_l < eye_r

            # Eye socket right
            d_eye_r = math.sqrt((fx - eye_ry_cx)**2 + (fy - eye_cy)**2)
            eye_r_inside = d_eye_r < eye_r

            # Nose socket
            d_nose = math.sqrt((fx - nose_cx)**2 + (fy - nose_cy)**2)
            nose_inside = d_nose < nose_r

            # Teeth (bottom of cranium, thin vertical slots)
            teeth_mask = False
            if teeth_top <= fy <= teeth_bot and d_skull < skull_r:
                slot_x = (fx - (half - tooth_w * 2.5)) % (tooth_w * 1.5)
                if slot_x < tooth_w * 0.7:
                    teeth_mask = True

            if skull_aa > 0 and not eye_l_inside and not eye_r_inside and not nose_inside and not teeth_mask:
                skull_color = (SKULL_FG[0], SKULL_FG[1], SKULL_FG[2], int(235 * skull_aa))
                pixel = blend(skull_color, pixel)
            elif skull_aa > 0 and (eye_l_inside or eye_r_inside or nose_inside or teeth_mask):
                # Darken slightly (socket holes)
                hole_color = (BG[0]//2, BG[1]//2, BG[2]//2, int(200 * skull_aa))
                pixel = blend(hole_color, pixel)

            pixels.append(pixel)

    return pixels

def save_icon(filename, size, maskable=False):
    print(f'  Generating {filename} ({size}x{size}, maskable={maskable})…')
    px = make_icon(size, maskable)
    write_png(os.path.join(OUT, filename), px, size, size)
    print(f'  ✓ {filename}')

print('Shadow Reaper — generating PWA icons (Python)…')
save_icon('icon-192.png',          192, False)
save_icon('icon-512.png',          512, False)
save_icon('icon-maskable-192.png', 192, True)
save_icon('icon-maskable-512.png', 512, True)
save_icon('apple-touch-icon.png',  180, False)
print('All icons generated.')
