"""Genera los iconos del lanzador a partir del logo incrustado en ../index.html."""
import base64, io, os, re
from PIL import Image, ImageDraw

root = os.path.dirname(os.path.abspath(__file__))
html = open(os.path.join(root, '..', 'index.html'), encoding='utf-8').read()
m = re.search(r'src="data:image/jpeg;base64,([^"]+)"', html)
img = Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert('RGBA')
for name, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    big = img.resize((px * 4, px * 4), Image.LANCZOS)
    mask = Image.new('L', big.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big.size[0] - 1, big.size[1] - 1), fill=255)
    big.putalpha(mask)
    out = big.resize((px, px), Image.LANCZOS)
    d = os.path.join(root, 'app', 'src', 'main', 'res', 'mipmap-' + name)
    os.makedirs(d, exist_ok=True)
    out.save(os.path.join(d, 'ic_launcher.png'))
print('iconos generados')
