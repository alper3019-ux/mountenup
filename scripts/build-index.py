"""Erzeugt <picture>-Markup aus public/photos/manifest.json und schreibt index.html
aus scripts/index.template.html (Platzhalter {{pic:key|alt|sizes|cls|eager}})."""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
man = json.loads((root / 'public/photos/manifest.json').read_text())

def pic(key, alt, sizes, cls='', eager=False):
    m = man[key]
    files = m['files']
    def srcset(ext):
        return ', '.join(f"/photos/{key}-{f['w']}.{ext} {f['w']}w" for f in files)
    big = files[-1]
    load = 'fetchpriority="high" decoding="async"' if eager else 'loading="lazy" decoding="async"'
    c = f' class="{cls}"' if cls else ''
    return (f'<picture{c}><source type="image/avif" srcset="{srcset("avif")}" sizes="{sizes}">'
            f'<source type="image/webp" srcset="{srcset("webp")}" sizes="{sizes}">'
            f'<img src="/photos/{key}-{big["w"]}.webp" width="{big["w"]}" height="{big["h"]}" alt="{alt}" sizes="{sizes}" {load}></picture>')

tpl = (root / 'scripts/index.template.html').read_text()
def rep(mo):
    parts = mo.group(1).split('|')
    key, alt, sizes = parts[0], parts[1], parts[2]
    cls = parts[3] if len(parts) > 3 else ''
    eager = len(parts) > 4 and parts[4] == 'eager'
    return pic(key, alt, sizes, cls, eager)
out = re.sub(r'\{\{pic:([^}]+)\}\}', rep, tpl)
(root / 'index.html').write_text(out)
print('index.html geschrieben', len(out))
