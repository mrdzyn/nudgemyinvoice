"""Generate docs/showcase/flow.gif: original looping illustration of the
Describe -> AI Draft -> Human Review -> Save -> PayPal Sandbox DRAFT flow.

Pure Pillow, no external assets. Deterministic output.
Run: PYTHONPATH=/tmp/gifmods python3 docs/showcase/generate-flow-gif.py
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "flow.gif")

W, H = 720, 400
NAVY = (10, 26, 58)
CARD = (255, 255, 255)
BLUE = (37, 99, 235)
CYAN = (34, 211, 238)
GREEN = (22, 163, 74)
GRAY = (100, 116, 139)
LIGHT = (226, 232, 240)
TEXT_DARK = (15, 23, 42)
TEXT_LIGHT = (241, 245, 249)
GOLD = (202, 138, 4)

STEPS = [
    ("1", "DESCRIBE", "Operator writes what to bill,\nin plain words."),
    ("2", "AI DRAFT", "Parser proposes fields.\nServer recomputes totals."),
    ("3", "HUMAN REVIEW", "Operator edits every field.\nNothing moves yet."),
    ("4", "SAVE", "Explicit save writes\nto PostgreSQL only."),
    ("5", "SANDBOX DRAFT", "Confirmed PayPal Sandbox\nDRAFT. Never sent."),
]


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # very old Pillow
        return ImageFont.load_default()


def draw_frame(active: int) -> Image.Image:
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    # top banner
    d.rectangle([0, 0, W, 64], fill=(13, 34, 76))
    d.text((24, 14), "NudgeMyInvoice", font=font(26), fill=TEXT_LIGHT)
    d.text((24, 40), "PayPal Sandbox only  -  nothing here moves real money",
           font=font(13), fill=CYAN)
    # step nodes
    n = len(STEPS)
    gap = 16
    cw = (W - 48 - gap * (n - 1)) // n
    y0, y1 = 84, 200
    for i, (num, title, _desc) in enumerate(STEPS):
        x0 = 24 + i * (cw + gap)
        x1 = x0 + cw
        if i < active:
            fill, border, tcol = (22, 60, 40), GREEN, (220, 252, 231)
            mark = "OK"
        elif i == active:
            fill, border, tcol = (23, 55, 120), CYAN, TEXT_LIGHT
            mark = num
        else:
            fill, border, tcol = (30, 45, 80), GRAY, LIGHT
            mark = num
        d.rounded_rectangle([x0, y0, x1, y1], radius=12, fill=fill,
                            outline=border, width=3)
        d.text((x0 + 10, y0 + 10), mark, font=font(20), fill=border)
        d.text((x0 + 10, y0 + 40), title, font=font(15), fill=tcol)
        if i < n - 1:
            ax0 = x1 + 2
            ax1 = x1 + gap - 2
            ay = (y0 + y1) // 2
            col = GREEN if i < active else GRAY
            d.line([ax0, ay, ax1, ay], fill=col, width=3)
            d.polygon([ax1, ay - 6, ax1, ay + 6, ax1 + 6, ay], fill=col)
    # detail card for the active step
    _num, title, desc = STEPS[active]
    d.rounded_rectangle([24, 220, W - 24, 330], radius=12, fill=CARD)
    d.text((44, 236), f"Step {active + 1} of 5: {title}", font=font(22),
           fill=TEXT_DARK)
    for j, line in enumerate(desc.split("\n")):
        d.text((44, 266 + j * 26), line, font=font(17), fill=(51, 65, 85))
    # human gate reminder on review/save steps
    if active in (2, 3, 4):
        d.text((44, 312), "Human approval required - no autonomous sending.",
               font=font(14), fill=GOLD)
    # progress dots
    for i in range(n):
        cx = W // 2 - (n - 1) * 14 + i * 28
        col = CYAN if i == active else (GREEN if i < active else GRAY)
        d.ellipse([cx - 6, 348, cx + 6, 360], fill=col)
    return img


def main() -> None:
    frames = [draw_frame(i).quantize(colors=64, method=Image.MEDIANCUT)
              for i in range(len(STEPS))]
    frames[0].save(
        OUT,
        save_all=True,
        append_images=frames[1:],
        duration=1400,
        loop=0,
        optimize=True,
    )
    size = os.path.getsize(OUT)
    print(f"wrote {OUT} ({size} bytes)")


if __name__ == "__main__":
    main()
