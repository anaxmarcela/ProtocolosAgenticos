"""Renderiza la captura real de record-demo.js como MP4; requiere Pillow y FFmpeg."""
import json
import subprocess
import sys
import textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
events = json.loads((root / 'docs/evidencia/demo-events.json').read_text(encoding='utf-8'))
ffmpeg = sys.argv[1] if len(sys.argv) > 1 else 'ffmpeg'
font_path = sys.argv[2] if len(sys.argv) > 2 else 'C:/Windows/Fonts/consola.ttf'
font = ImageFont.truetype(font_path, 18)
title_font = ImageFont.truetype(font_path, 28)
width, height = 1920, 1080
out = root / 'docs/evidencia/demo-protocolos.mp4'
proc = subprocess.Popen([ffmpeg, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-vcodec', 'rawvideo',
    '-pix_fmt', 'rgb24', '-s', f'{width}x{height}', '-r', '5', '-i', '-',
    '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', str(out)], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
panels = {p: [] for p in ['MCP', 'A2A', 'CLIENTE']}
colors = {'MCP': '#63e6be', 'A2A': '#7abfff', 'CLIENTE': '#ffda79'}

def frame(elapsed):
    image = Image.new('RGB', (width, height), '#0c1220')
    draw = ImageDraw.Draw(image)
    draw.text((30, 18), 'CC3116 | Hoja 7 | Parachute S.A. | MCP + A2A', font=title_font, fill='white')
    draw.text((30, 62), 'REPRODUCCION DE SALIDA REAL - modo demo sin Gemini - captura automatizada, pausas ampliadas', font=font, fill='#ffda79')
    for panel, x, y, w, h in [('MCP', 20, 110, 930, 445), ('A2A', 970, 110, 930, 445), ('CLIENTE', 20, 575, 1880, 450)]:
        draw.rounded_rectangle((x, y, x+w, y+h), radius=10, fill='#161f30', outline=colors[panel], width=2)
        draw.text((x+15, y+12), panel, font=title_font, fill=colors[panel])
        max_lines = (h-66)//23
        for i, line in enumerate(panels[panel][-max_lines:]):
            draw.text((x+15, y+54+i*23), line, font=font, fill='#e0e8f4')
    draw.text((30, 1040), f'Terminal cliente -> A2A :14000 -> MAS demo -> MCP Streamable HTTP :14001 | captura t={elapsed:.2f}s', font=font, fill='#a2b3cc')
    return image.tobytes()

try:
    for event in events:
        cols = 82 if event['panel'] != 'CLIENTE' else 168
        for line in event['text'].splitlines():
            panels[event['panel']].extend(textwrap.wrap(line, width=cols, replace_whitespace=False) or [''])
        raw = frame(event['time'])
        # Dos segundos por bloque y cinco para las respuestas de terminal.
        for _ in range(25 if event['panel'] == 'CLIENTE' else 10):
            proc.stdin.write(raw)
    for _ in range(20):
        proc.stdin.write(frame(events[-1]['time']))
finally:
    proc.stdin.close()
stderr = proc.stderr.read().decode(errors='replace')
if proc.wait() != 0:
    raise SystemExit(stderr)
print(out)
