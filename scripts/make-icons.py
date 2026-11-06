"""Draws the IntegrAlo icons for the installer (Start menu and desktop shortcuts).

Own design, drawn here so it can be regenerated: a rounded blue square with a central node
linked to three nodes (the platform supervising its field nodes). Variants carry a badge:
green with a "play" triangle (start the server) and red with a square (stop it).

Usage: python scripts/make-icons.py   ->  installer/icons/{integralo,iniciar,detener}.ico (+ .png)
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1024
SS = 4  # supersampling for smooth edges
OUT = Path(__file__).resolve().parent.parent / "installer" / "icons"
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def base() -> Image.Image:
    s = SIZE * SS
    # Vertical gradient, clipped to a rounded square.
    top, bottom = (37, 99, 235), (14, 116, 144)  # blue -> teal
    grad = Image.new("RGBA", (s, s))
    gd = ImageDraw.Draw(grad)
    for y in range(s):
        gd.line([(0, y), (s, y)], fill=lerp(top, bottom, y / (s - 1)) + (255,))
    mask = Image.new("L", (s, s), 0)
    margin = round(s * 0.04)
    ImageDraw.Draw(mask).rounded_rectangle([margin, margin, s - margin, s - margin], radius=round(s * 0.22), fill=255)
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    white = (255, 255, 255, 255)
    cx, cy = s * 0.5, s * 0.53
    r_orbit = s * 0.27
    hub_r, node_r = s * 0.115, s * 0.075
    nodes = [(cx + r_orbit * math.cos(math.radians(a)), cy + r_orbit * math.sin(math.radians(a))) for a in (-90, 30, 150)]
    for x, y in nodes:
        d.line([(cx, cy), (x, y)], fill=white, width=round(s * 0.045))
    d.ellipse([cx - hub_r, cy - hub_r, cx + hub_r, cy + hub_r], fill=white)
    inner = hub_r * 0.45
    d.ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=lerp(top, bottom, 0.53) + (255,))
    for x, y in nodes:
        d.ellipse([x - node_r, y - node_r, x + node_r, y + node_r], fill=white)
    return img


def with_badge(img: Image.Image, color, symbol: str) -> Image.Image:
    img = img.copy()
    s = img.width
    d = ImageDraw.Draw(img)
    r = s * 0.22
    ring = s * 0.035
    cx = cy = s - r - ring - s * 0.005  # inside the canvas, white ring included
    d.ellipse([cx - r - ring, cy - r - ring, cx + r + ring, cy + r + ring], fill=(255, 255, 255, 255))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color + (255,))
    white = (255, 255, 255, 255)
    if symbol == "play":
        k = r * 0.5
        d.polygon([(cx - k * 0.75, cy - k), (cx - k * 0.75, cy + k), (cx + k * 1.0, cy)], fill=white)
    else:
        k = r * 0.42
        d.rounded_rectangle([cx - k, cy - k, cx + k, cy + k], radius=round(k * 0.2), fill=white)
    return img


def save(img: Image.Image, name: str) -> None:
    final = img.resize((SIZE, SIZE), Image.LANCZOS)
    final.resize((256, 256), Image.LANCZOS).save(OUT / f"{name}.png")
    final.save(OUT / f"{name}.ico", sizes=ICO_SIZES)


OUT.mkdir(parents=True, exist_ok=True)
icon = base()
save(icon, "integralo")
save(with_badge(icon, (22, 163, 74), "play"), "iniciar")
save(with_badge(icon, (220, 38, 38), "stop"), "detener")
print(f"icons written to {OUT}")
