#!/usr/bin/env python3
"""Gera os ícones PNG do app (sem dependências externas).

Desenho: fundo escuro arredondado + halter estilizado na cor "volt".
Renderiza em 2x e reduz com média 2x2 (antialiasing simples).

Uso: python3 tools/make-icons.py
"""

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"

BG_TOP = (0x16, 0x1A, 0x20)
BG_BOTTOM = (0x08, 0x09, 0x0B)
VOLT = (0xC8, 0xFF, 0x4D)
DIM = (0x8F, 0xBF, 0x17)


def rounded_rect_span(y, x0, y0, x1, y1, r):
    """Devolve (xa, xb) da linha y dentro do retângulo arredondado, ou None."""
    if y < y0 or y >= y1:
        return None
    if y < y0 + r:
        dy = (y0 + r) - y
    elif y >= y1 - r:
        dy = y - (y1 - r - 1)
    else:
        return (x0, x1)
    if dy > r:
        return None
    dx = r - (r * r - dy * dy) ** 0.5
    return (x0 + dx, x1 - dx)


def draw(size, scale=2, maskable=False):
    w = size * scale
    px = [[BG_BOTTOM for _ in range(w)] for _ in range(w)]

    corner = 0 if maskable else int(w * 0.22)
    inset = int(w * 0.16) if maskable else 0

    # fundo com gradiente vertical
    for y in range(w):
        t = y / max(1, w - 1)
        bg = tuple(int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))
        span = rounded_rect_span(y, 0, 0, w, w, corner)
        if not span:
            continue
        xa, xb = span
        for x in range(int(xa), int(xb)):
            px[y][x] = bg

    # halter: barra + placas
    cx, cy = w / 2, w / 2
    unit = (w - inset * 2) / 100.0

    def fill(x0, y0, x1, y1, r, color):
        for y in range(max(0, int(y0)), min(w, int(y1) + 1)):
            span = rounded_rect_span(y, x0, y0, x1, y1, r)
            if not span:
                continue
            xa, xb = span
            for x in range(max(0, int(xa)), min(w, int(xb))):
                px[y][x] = color

    bar_h = 9 * unit
    fill(cx - 30 * unit, cy - bar_h / 2, cx + 30 * unit, cy + bar_h / 2, bar_h / 2, VOLT)

    for sign in (-1, 1):
        # placa interna
        fill(cx + sign * 30 * unit - (10 * unit if sign > 0 else 0),
             cy - 22 * unit,
             cx + sign * 30 * unit + (10 * unit if sign < 0 else 0),
             cy + 22 * unit,
             5 * unit, VOLT)
        # placa externa
        ox = cx + sign * 42 * unit
        fill(ox - (8 * unit if sign > 0 else 0),
             cy - 14 * unit,
             ox + (8 * unit if sign < 0 else 0),
             cy + 14 * unit,
             4 * unit, DIM)

    # downsample
    out = bytearray()
    for y in range(size):
        out.append(0)  # filtro None
        for x in range(size):
            r = g = b = 0
            for dy in range(scale):
                for dx in range(scale):
                    p = px[y * scale + dy][x * scale + dx]
                    r += p[0]; g += p[1]; b += p[2]
            n = scale * scale
            out += bytes((r // n, g // n, b // n))
    return bytes(out)


def write_png(path, size, raw):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", header)
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)
    print(f"  {path.name}  ({len(png)/1024:.1f} KB)")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print("Gerando ícones em", OUT)
    for name, size, maskable in [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("apple-touch-icon.png", 180, False),
        ("icon-maskable-512.png", 512, True),
    ]:
        write_png(OUT / name, size, draw(size, scale=2, maskable=maskable))


if __name__ == "__main__":
    main()
