# Draws the app icon: build/icon.png (1024) and build/icon.ico (16 to 256).
#   python -I scripts/make_icon.py
# The same mark as the logo in the app's top bar (.menubar2 .logo in app.css): a
# conic gradient tile with two white caption lines, the top one fainter. That logo is
# 26px with 8px corners; here it is scaled up so the two always match.
import math
from pathlib import Path
from PIL import Image, ImageDraw

S = 1024
X = 4  # supersampling
OUT = Path(__file__).resolve().parent.parent / "build"

# conic-gradient(from 200deg, #ff3d6e, #ff6a3d, #ffb13d, #ff3d6e)
START = 200
STOPS = [(0.0, (255, 61, 110)), (1 / 3, (255, 106, 61)), (2 / 3, (255, 177, 61)), (1.0, (255, 61, 110))]

M = 40  # space round the tile at 1024
CSS = 26  # the logo's size in the app
K = (S - 2 * M) / CSS  # one CSS pixel at 1024


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def colour(t):
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t <= t1:
            return lerp(c0, c1, (t - t0) / (t1 - t0))
    return STOPS[-1][1]


def gradient(n):
    """Conic gradient round the centre, angles clockwise from the top as in CSS"""
    g = Image.new("RGB", (256, 256))
    px = g.load()
    for y in range(256):
        for x in range(256):
            a = math.degrees(math.atan2(x - 127.5, 127.5 - y)) % 360
            px[x, y] = colour(((a - START) % 360) / 360)
    return g.resize((n, n), Image.BICUBIC)


def draw(size_px=S):
    n = size_px * X
    u = lambda v: round(v * X * size_px / S)  # noqa: E731
    c = lambda v: u(M + v * K)  # CSS pixel inside the logo -> pixel here  # noqa: E731

    mask = Image.new("L", (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle((c(0), c(0), c(CSS), c(CSS)), radius=u(8 * K), fill=255)
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    img.paste(gradient(n), (0, 0), mask)

    # The two lines: 10 x 3 at left 8, top 13, and its 60% white copy 5px higher
    # (the ::after box and its box-shadow). Own layer so the faint one blends.
    lines = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(lines)
    r = u(2 * K)
    d.rounded_rectangle((c(8), c(8), c(18), c(11)), radius=r, fill=(255, 255, 255, 153))
    d.rounded_rectangle((c(8), c(13), c(18), c(16)), radius=r, fill=(255, 255, 255, 255))
    img = Image.alpha_composite(img, lines)

    return img.resize((size_px, size_px), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
big = draw()
big.save(OUT / "icon.png")
# Small sizes drawn on their own so the lines stay sharp
sizes = [16, 24, 32, 48, 64, 128, 256]
frames = [draw(s) if s <= 64 else big.resize((s, s), Image.LANCZOS) for s in sizes]
frames[-1].save(OUT / "icon.ico", sizes=[(s, s) for s in sizes], append_images=frames[:-1])
print("wrote", OUT / "icon.png", "and", OUT / "icon.ico")
