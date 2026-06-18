from PIL import Image, ImageDraw

INK = (27, 36, 48, 255)
CORAL = (232, 105, 58, 255)
LINEN = (250, 245, 236, 255)


def piece_path(size, scale=1.0, offset=(0, 0)):
    """Returns a list of points approximating a single jigsaw piece silhouette."""
    s = size * scale
    ox, oy = offset
    cx, cy = ox + s * 0.5, oy + s * 0.5
    pts = []
    n = 64
    # Build a rounded square with one tab (right) and one blank (bottom) using simple arcs.
    return cx, cy, s


def draw_icon(path, size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = int(size * (0.22 if maskable else 0.10))
    bg_radius = int(size * 0.22)
    d.rounded_rectangle([0, 0, size, size], radius=bg_radius, fill=INK)

    # Piece body (rounded square) in linen
    box = [pad, pad, size - pad, size - pad]
    body_radius = int((size - 2 * pad) * 0.22)
    d.rounded_rectangle(box, radius=body_radius, fill=LINEN)

    w = size - 2 * pad
    knob_r = int(w * 0.20)

    # Tab knob protruding right
    kx = box[2]
    ky = pad + w // 2
    d.ellipse([kx - knob_r * 0.3, ky - knob_r, kx + knob_r * 1.2, ky + knob_r], fill=LINEN)

    # Blank notch on bottom (cut a coral circle out by drawing background color)
    nx = pad + w // 2
    ny = box[3]
    d.ellipse([nx - knob_r, ny - knob_r * 0.5, nx + knob_r, ny + knob_r * 1.3], fill=INK)

    # Coral accent dot (the "piece" highlight)
    dot_r = int(w * 0.16)
    d.ellipse(
        [size / 2 - dot_r, size / 2 - dot_r, size / 2 + dot_r, size / 2 + dot_r],
        fill=CORAL,
    )

    img.save(path)


draw_icon("/home/claude/jigsaw-puzzle/public/icons/icon-192.png", 192)
draw_icon("/home/claude/jigsaw-puzzle/public/icons/icon-512.png", 512)
draw_icon("/home/claude/jigsaw-puzzle/public/icons/maskable-512.png", 512, maskable=True)
draw_icon("/home/claude/jigsaw-puzzle/public/icons/apple-touch-icon.png", 180)
print("done")
