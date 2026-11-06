"""Draws the IntegrAlo icons: installer shortcuts and the app (mobile and web).

Own design, drawn here so it can be regenerated: a central node linked to three nodes (the
platform supervising its field nodes), white on the app's brand green (the emerald accent of
apps/client/src/theme/palette.ts and of the server panel). Installer variants carry a badge:
white with a green "play" triangle (start the server) and red with a white square (stop it).

Usage: python scripts/make-icons.py [--installer DIR] [--app DIR]
  defaults: installer/icons (integralo, iniciar, detener: .ico + .png preview)
            apps/client/assets (icon, android-icon-{background,foreground,monochrome}, favicon)
"""
import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SIZE = 1024
SS = 4  # supersampling for smooth edges
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]

# Brand green, from the client palette: accent-strong of the dark theme (top) to
# accent-strong of the light theme (bottom); the light theme accent for the play triangle.
TOP = (16, 185, 129)
BOTTOM = (4, 120, 87)
PLAY = (5, 150, 105)
DANGER = (220, 38, 38)
WHITE = (255, 255, 255, 255)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def gradient(s: int) -> Image.Image:
    img = Image.new("RGBA", (s, s))
    d = ImageDraw.Draw(img)
    for y in range(s):
        d.line([(0, y), (s, y)], fill=lerp(TOP, BOTTOM, y / (s - 1)) + (255,))
    return img


def draw_nodes(img: Image.Image, scale: float, hole=None) -> None:
    """The node motif, centred, `scale` = its size relative to the canvas (1.0 = the shortcut icon)."""
    s = img.width
    d = ImageDraw.Draw(img)
    cx, cy = s * 0.5, s * (0.5 + 0.03 * scale)
    r_orbit = s * 0.27 * scale
    hub_r, node_r = s * 0.115 * scale, s * 0.075 * scale
    nodes = [(cx + r_orbit * math.cos(math.radians(a)), cy + r_orbit * math.sin(math.radians(a))) for a in (-90, 30, 150)]
    for x, y in nodes:
        d.line([(cx, cy), (x, y)], fill=WHITE, width=round(s * 0.045 * scale))
    d.ellipse([cx - hub_r, cy - hub_r, cx + hub_r, cy + hub_r], fill=WHITE)
    inner = hub_r * 0.45
    d.ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=hole if hole else (0, 0, 0, 0))
    for x, y in nodes:
        d.ellipse([x - node_r, y - node_r, x + node_r, y + node_r], fill=WHITE)


def rounded_icon() -> Image.Image:
    """Shortcut and favicon icon: the motif on a rounded green square."""
    s = SIZE * SS
    mask = Image.new("L", (s, s), 0)
    margin = round(s * 0.04)
    ImageDraw.Draw(mask).rounded_rectangle([margin, margin, s - margin, s - margin], radius=round(s * 0.22), fill=255)
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    img.paste(gradient(s), (0, 0), mask)
    draw_nodes(img, 1.0, hole=lerp(TOP, BOTTOM, 0.53) + (255,))
    return img


def with_badge(img: Image.Image, kind: str) -> Image.Image:
    img = img.copy()
    s = img.width
    d = ImageDraw.Draw(img)
    r = s * 0.22
    ring = s * 0.035
    cx = cy = s - r - ring - s * 0.005  # inside the canvas, ring included
    # The ring separates the badge from the icon and from a light desktop.
    ring_color = BOTTOM if kind == "play" else (255, 255, 255)
    d.ellipse([cx - r - ring, cy - r - ring, cx + r + ring, cy + r + ring], fill=ring_color + (255,))
    if kind == "play":
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
        k = r * 0.5
        d.polygon([(cx - k * 0.75, cy - k), (cx - k * 0.75, cy + k), (cx + k * 1.0, cy)], fill=PLAY + (255,))
    else:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=DANGER + (255,))
        k = r * 0.42
        d.rounded_rectangle([cx - k, cy - k, cx + k, cy + k], radius=round(k * 0.2), fill=WHITE)
    return img


def final(img: Image.Image, size: int = SIZE) -> Image.Image:
    return img.resize((size, size), Image.LANCZOS)


def installer_icons(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    icon = rounded_icon()
    for name, img in (("integralo", icon), ("iniciar", with_badge(icon, "play")), ("detener", with_badge(icon, "stop"))):
        big = final(img)
        final(big, 256).save(out / f"{name}.png")
        big.save(out / f"{name}.ico", sizes=ICO_SIZES)


def app_icons(out: Path) -> None:
    """Expo: icon.png (iOS needs it square and opaque: the system rounds it), the Android
    adaptive icon layers (the system crops them to its own shape: the motif stays inside the
    central safe zone) and the web favicon."""
    out.mkdir(parents=True, exist_ok=True)
    s = SIZE * SS
    icon = gradient(s)
    draw_nodes(icon, 1.15, hole=lerp(TOP, BOTTOM, 0.53) + (255,))
    final(icon).convert("RGB").save(out / "icon.png")
    final(gradient(s)).convert("RGB").save(out / "android-icon-background.png")
    fg = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw_nodes(fg, 0.8)
    final(fg).save(out / "android-icon-foreground.png")
    final(fg).save(out / "android-icon-monochrome.png")  # white on transparent: themed icons
    final(rounded_icon(), 48).save(out / "favicon.png")


parser = argparse.ArgumentParser()
parser.add_argument("--installer", default=str(ROOT / "installer" / "icons"))
parser.add_argument("--app", default=str(ROOT / "apps" / "client" / "assets"))
args = parser.parse_args()
installer_icons(Path(args.installer))
app_icons(Path(args.app))
print(f"icons written to {args.installer} and {args.app}")
