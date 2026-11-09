# Draws the app icon: build/icon.png (1024) and build/icon.ico (16 to 256).
#   python -I scripts/make_icon.py
# A warm tile with a play mark (video) over two caption lines, the top one moving in
# from the left (motion streaks). Drawn at 4x and scaled down for clean edges.
from pathlib import Path
from PIL import Image, ImageDraw

S = 1024
X = 4  # supersampling
OUT = Path(__file__).resolve().parent.parent / "build"


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def tile(size):
    """Diagonal gradient on a rounded square"""
    top, bottom = (255, 122, 69), (214, 38, 96)
    g = Image.new("RGB", (256, 256))
    px = g.load()
    for y in range(256):
        for x in range(256):
            px[x, y] = lerp(top, bottom, (x * 0.35 + y * 0.65) / 256)
    g = g.resize((size, size), Image.BICUBIC)
    mask = Image.new("L", (size, size), 0)
    k = size / S  # tile drawn at any size
    m = round(40 * k)
    ImageDraw.Draw(mask).rounded_rectangle((m, m, size - m, size - m), radius=round(210 * k), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(g, (0, 0), mask)
    return out, mask


def draw(size_px=S):
    n = size_px * X
    img, mask = tile(n)
    d = ImageDraw.Draw(img)
    u = lambda v: round(v * X * size_px / S)  # noqa: E731

    # Translucent parts go on their own layer: drawing them straight onto the tile
    # would replace its colour instead of blending (they came out grey)
    soft = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    ds = ImageDraw.Draw(soft)

    # Play mark: a rounded triangle, drawn as a polygon with round joins
    cx, cy, h = 520, 330, 250
    pts = [(cx - h * 0.45, cy - h / 2), (cx - h * 0.45, cy + h / 2), (cx + h * 0.55, cy)]
    pts = [(u(x), u(y)) for x, y in pts]
    d.polygon(pts, fill="white")
    d.line(pts + [pts[0]], fill="white", width=u(56), joint="curve")
    for p in pts:
        r = u(28)
        d.ellipse((p[0] - r, p[1] - r, p[0] + r, p[1] + r), fill="white")

    # Caption lines: the top one arrives from the left with streaks behind it
    d.rounded_rectangle((u(360), u(580), u(840), u(668)), radius=u(44), fill="white")
    if size_px > 24:
        for x0, x1, a in ((260, 322, 210), (186, 230, 140), (130, 154, 80)):
            ds.rounded_rectangle((u(x0), u(600), u(x1), u(648)), radius=u(24), fill=(255, 255, 255, a))
    ds.rounded_rectangle((u(360), u(712), u(720), u(800)), radius=u(44), fill=(255, 255, 255, 165))
    img = Image.alpha_composite(img, soft)

    return img.resize((size_px, size_px), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
big = draw()
big.save(OUT / "icon.png")
# Small sizes drawn on their own so thin parts stay sharp
sizes = [16, 24, 32, 48, 64, 128, 256]
frames = [draw(s) if s <= 64 else big.resize((s, s), Image.LANCZOS) for s in sizes]
frames[-1].save(OUT / "icon.ico", sizes=[(s, s) for s in sizes], append_images=frames[:-1])
print("wrote", OUT / "icon.png", "and", OUT / "icon.ico")
