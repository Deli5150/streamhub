# Builds the Android adaptive icon from the iOS icon so Android looks like the other platforms (#19).
# Needs Pillow + numpy: python3 scripts/android-icon.py assets/icon.png assets/android-icon-foreground.png assets/android-icon-monochrome.png /tmp/preview.png
import sys
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
src, out_fg, out_mono, out_preview = sys.argv[1:5]
N = 1024
ios = Image.open(src).convert('RGB')
# Inside the iOS icon's rounded corners: just its artwork.
crop = ios.crop((72, 72, 952, 952))
# Bubble is ~74% of the iOS icon; the launcher shows the middle 72/108 of the canvas.
size = round(880 * 0.494 * N / 755)
crop = crop.resize((size, size), Image.LANCZOS)
top, bottom = np.array((26, 34, 42), float), np.array((7, 11, 12), float)
t = np.linspace(0, 1, N)[:, None, None]
grad = (top * (1 - t) + bottom * t).repeat(N, axis=1).astype(np.uint8)
canvas = Image.fromarray(grad)
off = (N - size) // 2
mask = Image.new('L', (size, size), 0)
f = 60
ImageDraw.Draw(mask).rectangle((f, f, size - f, size - f), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(f / 2))
canvas.paste(crop, (off, off), mask)
canvas.save(out_fg)
# Themed icon: the bubble silhouette with its two bars cut out (only alpha matters).
S = 4 * 432
m = Image.new('L', (S, S), 0)
d = ImageDraw.Draw(m)
c, r = S / 2, S * 0.215
d.ellipse((c - r, c - r * 0.97, c + r, c + r * 0.97), fill=255)
d.polygon([(c - r * 0.78, c + r * 0.45), (c - r * 0.85, c + r * 1.02), (c - r * 0.25, c + r * 0.9)], fill=255)
bw, bh = r * 0.2, r * 0.62
for x in (c - r * 0.24, c + r * 0.24):
    d.rounded_rectangle((x - bw / 2, c - bh / 2, x + bw / 2, c + bh / 2), radius=bw / 2, fill=0)
m = m.resize((432, 432), Image.LANCZOS)
mono = Image.new('RGBA', (432, 432), (255, 255, 255, 0))
mono.putalpha(m)
mono.save(out_mono)
# Preview: circle and squircle masks like a launcher.
prev = Image.new('RGB', (N * 2 + 60, N), (240, 240, 240))
circ = Image.new('L', (N, N), 0)
ImageDraw.Draw(circ).ellipse((N / 6, N / 6, N * 5 / 6, N * 5 / 6), fill=255)
sq = Image.new('L', (N, N), 0)
ImageDraw.Draw(sq).rounded_rectangle((N / 6, N / 6, N * 5 / 6, N * 5 / 6), radius=N / 9, fill=255)
prev.paste(canvas, (0, 0), circ)
prev.paste(canvas, (N + 60, 0), sq)
prev.save(out_preview)
