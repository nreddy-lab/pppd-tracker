"""
Generate all PNG icon sizes for the PPPD Tracker PWA.
Design: teal gradient rounded-square, white figure + dizziness-wave arcs.
Draws at 2× then downscales for clean antialiasing.
"""

import os
from PIL import Image, ImageDraw

SIZES   = [72, 96, 128, 144, 152, 180, 192, 512]
OUT_DIR = os.path.join(os.path.dirname(__file__), "icons")

# ── Colours ──────────────────────────────────────────────────────────
TEAL_TL  = (127, 196, 204)   # top-left  gradient corner  #7fc4cc
TEAL_TR  = ( 95, 158, 168)   # top-right                  #5f9ea8
TEAL_BL  = ( 95, 158, 168)   # bottom-left
TEAL_BR  = ( 61, 127, 138)   # bottom-right               #3d7f8a
WHITE    = (255, 255, 255, 255)
WHITE_90 = (255, 255, 255, 230)


def gradient_bg(size):
    """Fast diagonal teal gradient via 2×2 → resize."""
    tiny = Image.new("RGB", (2, 2))
    tiny.putpixel((0, 0), TEAL_TL)
    tiny.putpixel((1, 0), TEAL_TR)
    tiny.putpixel((0, 1), TEAL_BL)
    tiny.putpixel((1, 1), TEAL_BR)
    return tiny.resize((size, size), Image.BILINEAR).convert("RGBA")


def rounded_mask(size, radius):
    """White filled rounded-rectangle mask, same size as icon."""
    mask = Image.new("L", (size, size), 0)
    d    = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def draw_icon(output_size):
    S  = output_size * 2          # work at 2× for antialiasing
    cx = S // 2

    # ── Background ───────────────────────────────────────────────────
    img  = gradient_bg(S)
    mask = rounded_mask(S, radius=int(S * 0.22))
    img.putalpha(mask)

    draw = ImageDraw.Draw(img)

    # ── Head ─────────────────────────────────────────────────────────
    head_r = int(S * 0.10)
    head_y = int(S * 0.17) + head_r          # centre of head circle
    draw.ellipse(
        [cx - head_r, head_y - head_r, cx + head_r, head_y + head_r],
        fill=WHITE,
    )

    # ── Neck + shoulders (trapezoid) ─────────────────────────────────
    neck_w      = int(S * 0.06)
    shoulder_w  = int(S * 0.22)
    shoulder_y  = head_y + head_r + int(S * 0.04)   # top of trapezoid
    body_h      = int(S * 0.12)
    draw.polygon(
        [
            (cx - neck_w,     shoulder_y),
            (cx + neck_w,     shoulder_y),
            (cx + shoulder_w, shoulder_y + body_h),
            (cx - shoulder_w, shoulder_y + body_h),
        ],
        fill=WHITE_90,
    )

    # ── Dizziness-wave arcs (∩ arch shape, emanating from below) ─────
    # Arc angles in PIL (clockwise from 3-o'clock):
    #   180° → 360° traces the upper semicircle (arch / ∩ shape).
    # Sweep trims the sharp tips for a softer look.
    wave_base_y = shoulder_y + body_h + int(S * 0.03)
    arc_gap     = int(S * 0.09)
    sweep       = 24          # degrees to trim from each end

    for i in range(3):
        arc_r  = int(S * 0.13) + i * arc_gap
        lw     = max(int(S * 0.055 - i * S * 0.01), int(S * 0.025))
        alpha  = int(255 * (1.0 - i * 0.20))

        bbox = [
            cx - arc_r,          wave_base_y - arc_r,
            cx + arc_r,          wave_base_y + arc_r,
        ]
        draw.arc(
            bbox,
            start = 180 + sweep,
            end   = 360 - sweep,
            fill  = (255, 255, 255, alpha),
            width = lw,
        )

    # ── Downscale to output size with Lanczos ───────────────────────
    return img.resize((output_size, output_size), Image.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        icon = draw_icon(size)
        path = os.path.join(OUT_DIR, f"icon-{size}.png")
        icon.save(path, "PNG")
        print(f"  ✓  icons/icon-{size}.png")
    print(f"\nDone — {len(SIZES)} icons saved to {OUT_DIR}/")


if __name__ == "__main__":
    main()
