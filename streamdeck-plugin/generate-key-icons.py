# Génère les images carrées des touches Stream Deck (72x72 et 144x144).
# Usage : python generate-key-icons.py [aperçu.png]   (nécessite Pillow)
import os, sys
from PIL import Image, ImageDraw
RED_TOP=(255,40,70); RED_BOTTOM=(205,0,40); WHITE=(255,255,255,255)
S=576

def glyph(d, kind, cx, cy, r, color):
    if kind=="play":
        d.polygon([(cx-r*0.6,cy-r),(cx-r*0.6,cy+r),(cx+r,cy)],fill=color)
    elif kind=="pause":
        w=r*0.55
        d.rectangle((cx-r*0.85,cy-r,cx-r*0.85+w,cy+r),fill=color)
        d.rectangle((cx+r*0.85-w,cy-r,cx+r*0.85,cy+r),fill=color)
    elif kind in ("next","prev"):
        s=1 if kind=="next" else -1; bar=r*0.28
        d.polygon([(cx-s*r,cy-r),(cx-s*r,cy+r),(cx+s*(r*0.7),cy)],fill=color)
        x0=cx+s*(r*0.7); x1=cx+s*(r*0.7+bar)
        d.rectangle((min(x0,x1),cy-r,max(x0,x1),cy+r),fill=color)
    elif kind in ("volup","voldown"):
        x=cx-r*1.05
        d.rectangle((x, cy-r*0.32, x+r*0.38, cy+r*0.32), fill=color)
        d.polygon([(x+r*0.3, cy-r*0.32),(x+r*0.95, cy-r*0.8),(x+r*0.95, cy+r*0.8),(x+r*0.3, cy+r*0.32)], fill=color)
        sx=cx+r*0.62; t=r*0.13; L=r*0.42
        d.rectangle((sx-L, cy-t, sx+L, cy+t), fill=color)
        if kind=="volup": d.rectangle((sx-t, cy-L, sx+t, cy+L), fill=color)

def key(kind):
    # Dégradé vertical rouge sur toute la touche.
    img=Image.new("RGBA",(S,S))
    d=ImageDraw.Draw(img)
    for y in range(S):
        k=y/(S-1)
        d.line([(0,y),(S,y)],fill=tuple(int(a+(b-a)*k) for a,b in zip(RED_TOP,RED_BOTTOM))+(255,))
    # Les boutons de volume affichent le volume en bas : symbole un peu remonté.
    cy=S*0.44 if kind.startswith("vol") else S/2
    dx=S*0.03 if kind=="play" else 0
    r=S*0.31 if kind.startswith("vol") else S*0.24
    glyph(d,kind,S/2+dx,cy,r,WHITE)
    return img

def save(img,path):
    img.resize((72,72),Image.LANCZOS).save(f"{path}.png")
    img.resize((144,144),Image.LANCZOS).save(f"{path}@2x.png")

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "com.zionzion94.ytmusic.sdPlugin"))
files={"play":"playpause/play","pause":"playpause/pause","prev":"previous/prev","next":"next/next",
       "voldown":"volumedown/key","volup":"volumeup/key"}
for kind,path in files.items():
    save(key(kind),f"imgs/actions/{path}")

if len(sys.argv) < 2:
    sys.exit(0)
out=Image.new('RGBA',(154*6,144),(40,40,40,255))
for i,path in enumerate(files.values()):
    out.paste(Image.open(f"imgs/actions/{path}@2x.png"),(i*154,0))
out.save(sys.argv[1])
