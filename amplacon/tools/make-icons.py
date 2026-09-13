#!/usr/bin/env python3
"""Gera os ícones PNG do aplicativo (sem dependências externas).

Desenho: a divisa do logotipo da AMPLACON, no azul da marca, sobre o fundo
escuro do app. Os vértices são os mesmos de `assets/marca.svg`, vetorizados a
partir do logotipo original. Renderiza em 3x e reduz por média (antialiasing).

Uso: python3 amplacon/tools/make-icons.py
"""

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"

FUNDO_TOPO = (0x16, 0x1E, 0x2C)
FUNDO_BASE = (0x0A, 0x0D, 0x14)
MARCA = (0x2E, 0x77, 0xF0)   # azul da marca, clareado para ler no fundo escuro

# divisa normalizada: caixa de 100 x 51.45 (igual a assets/marca.svg)
DIVISA = [(50, 0), (100, 34.91), (100, 51.45), (50, 21.64), (0, 51.45), (0, 34.91)]
DIVISA_ALT = 51.45


def span_arredondado(y, largura, raio):
    """(xa, xb) da linha y dentro do quadrado arredondado."""
    if y < raio:
        dy = raio - y
    elif y >= largura - raio:
        dy = y - (largura - raio - 1)
    else:
        return 0, largura
    if dy > raio:
        return None
    dx = raio - (raio * raio - dy * dy) ** 0.5
    return dx, largura - dx


def dentro(poligono, x, y):
    """Teste de ponto em polígono (regra par-ímpar)."""
    dentro_ = False
    n = len(poligono)
    for i in range(n):
        x0, y0 = poligono[i]
        x1, y1 = poligono[(i + 1) % n]
        if (y0 > y) != (y1 > y):
            corte = x0 + (y - y0) * (x1 - x0) / (y1 - y0)
            if x < corte:
                dentro_ = not dentro_
    return dentro_


def desenhar(tamanho, escala=3, maskable=False):
    w = tamanho * escala
    px = [[FUNDO_BASE for _ in range(w)] for _ in range(w)]
    raio = 0 if maskable else int(w * 0.22)

    for y in range(w):
        t = y / max(1, w - 1)
        fundo = tuple(int(FUNDO_TOPO[i] + (FUNDO_BASE[i] - FUNDO_TOPO[i]) * t) for i in range(3))
        faixa = span_arredondado(y, w, raio) if raio else (0, w)
        if not faixa:
            continue
        xa, xb = faixa
        for x in range(int(xa), int(xb)):
            px[y][x] = fundo

    # a divisa ocupa 62% da largura (54% no maskable, que tem zona de corte)
    largura_marca = w * (0.54 if maskable else 0.62)
    unidade = largura_marca / 100.0
    altura_marca = DIVISA_ALT * unidade
    origem_x = (w - largura_marca) / 2
    origem_y = (w - altura_marca) / 2

    poligono = [(origem_x + px_ * unidade, origem_y + py * unidade) for px_, py in DIVISA]
    y_min = int(min(p[1] for p in poligono))
    y_max = int(max(p[1] for p in poligono)) + 1
    x_min = int(min(p[0] for p in poligono))
    x_max = int(max(p[0] for p in poligono)) + 1

    for y in range(max(0, y_min), min(w, y_max)):
        for x in range(max(0, x_min), min(w, x_max)):
            if dentro(poligono, x + 0.5, y + 0.5):
                px[y][x] = MARCA

    # reduz por média (escala x escala)
    saida = [[(0, 0, 0) for _ in range(tamanho)] for _ in range(tamanho)]
    for y in range(tamanho):
        for x in range(tamanho):
            r = g = b = 0
            for dy in range(escala):
                for dx in range(escala):
                    c = px[y * escala + dy][x * escala + dx]
                    r += c[0]
                    g += c[1]
                    b += c[2]
            n = escala * escala
            saida[y][x] = (r // n, g // n, b // n)
    return saida


def gravar_png(caminho, pixels):
    altura = len(pixels)
    largura = len(pixels[0])
    linhas = bytearray()
    for linha in pixels:
        linhas.append(0)
        for (r, g, b) in linha:
            linhas += bytes((r, g, b))

    def bloco(tipo, dados):
        return (struct.pack(">I", len(dados)) + tipo + dados
                + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += bloco(b"IHDR", struct.pack(">IIBBBBB", largura, altura, 8, 2, 0, 0, 0))
    png += bloco(b"IDAT", zlib.compress(bytes(linhas), 9))
    png += bloco(b"IEND", b"")
    caminho.write_bytes(png)
    print(f"  {caminho.name} ({largura}x{largura})")


def svg_icone():
    pontos = " L".join(f"{x} {y}" for x, y in DIVISA)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#161E2C"/>
      <stop offset="1" stop-color="#0A0D14"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="114" fill="url(#f)"/>
  <g transform="translate(97 190) scale(3.18)">
    <path d="M{pontos} Z" fill="#2E77F0"/>
  </g>
</svg>
'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print("Gerando ícones em", OUT)
    gravar_png(OUT / "icon-192.png", desenhar(192))
    gravar_png(OUT / "icon-512.png", desenhar(512, escala=2))
    gravar_png(OUT / "icon-maskable-512.png", desenhar(512, escala=2, maskable=True))
    gravar_png(OUT / "apple-touch-icon.png", desenhar(180))
    (OUT / "icon.svg").write_text(svg_icone(), encoding="utf-8")
    print("  icon.svg")


if __name__ == "__main__":
    main()
