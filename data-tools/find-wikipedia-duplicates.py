#!/usr/bin/env python3
"""Find Wikipedia frames that repeat a curated frame of the same object.

Network audit; needs curl and macOS sips. Every object with both a curated
frame and a Wikipedia frame is compared by pixels. Two measures must agree:
the difference hash of a 9 x 8 greyscale grid (composition) and the mean
colour difference of a 16 x 16 grid (processing). A reprocessed or recropped
release of the same data is a different frame and is kept. Accepted pairs go
to sky-sources/wikipedia-duplicates.json; build-wikipedia-media.py then
leaves the curated frame as the only copy. Videos are skipped.
"""
import argparse
import hashlib
import json
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data-tools/sky-sources'
CURATED = ['media.json', 'media-hubble.json', 'media-cosmic.json', 'media-quests.json']
AGENT = 'ParusCatalogAudit/1.0 (image identity audit)'


def fetch(url, cache):
    path = cache / (hashlib.sha256(url.encode()).hexdigest()[:24] + '.img')
    if not path.exists() or not path.stat().st_size:
        subprocess.run(['curl', '-sL', '--fail', '-m', '60', '-A', AGENT, '-o', str(path), url], check=False)
    return path if path.exists() and path.stat().st_size else None


def pixels(path, cache, width, height):
    out = cache / (path.stem + '.' + str(width) + 'x' + str(height) + '.bmp')
    if not out.exists():
        subprocess.run(['sips', '-s', 'format', 'bmp', '-z', str(height), str(width), str(path), '--out', str(out)],
                       check=False, capture_output=True)
    if not out.exists():
        return None
    data = out.read_bytes()
    offset, bits = struct.unpack_from('<I', data, 10)[0], struct.unpack_from('<H', data, 28)[0]
    w, h = struct.unpack_from('<ii', data, 18)
    if abs(w) != width or abs(h) != height or bits not in (24, 32):
        return None
    step = bits // 8
    row = (width * step + 3) // 4 * 4
    rows = []
    for y in range(height):
        line = data[offset + y * row: offset + y * row + width * step]
        rows.append([(line[x * step + 2], line[x * step + 1], line[x * step]) for x in range(width)])
    return rows if h < 0 else rows[::-1]


def signature(path, cache):
    grid, colour = pixels(path, cache, 9, 8), pixels(path, cache, 16, 16)
    if not grid or not colour:
        return None
    grey = [[(r * 299 + g * 587 + b * 114) / 1000 for r, g, b in line] for line in grid]
    return [int(line[x] > line[x + 1]) for line in grey for x in range(8)], [v for line in colour for p in line for v in p]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', required=True)
    parser.add_argument('--hash-limit', type=int, default=12)
    parser.add_argument('--colour-limit', type=float, default=10)
    args = parser.parse_args()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    curated = {}
    for name in CURATED:
        for p in json.loads((SRC / name).read_text()):
            if p.get('format', 'image') != 'image':
                continue
            for oid in p.get('objects') or []:
                curated.setdefault(oid, []).append(p)
    wiki = {}
    for r in json.loads((SRC / 'wikipedia.json').read_text())['records']:
        if r.get('media'):
            for oid in r.get('mediaObjects', r['matches']):
                wiki.setdefault(oid, []).append(r['media'])
    gallery = SRC / 'wikipedia-gallery.json'
    if gallery.exists():
        for p in json.loads(gallery.read_text())['records']:
            for oid in p['objects']:
                wiki.setdefault(oid, []).append(p)
    signatures, compared, unavailable, pairs = {}, 0, set(), []

    def sign(url):
        if url not in signatures:
            path = fetch(url, cache)
            signatures[url] = signature(path, cache) if path else None
        return signatures[url]

    shared = sorted(set(curated) & set(wiki))
    for oid in shared:
        for w in wiki[oid]:
            for c in curated[oid]:
                a, b = sign(w['url']), sign(c['url'])
                if not a or not b:
                    unavailable.add(w['url'] if not a else c['url'])
                    continue
                compared += 1
                distance = sum(x != y for x, y in zip(a[0], b[0]))
                colour = round(sum(abs(x - y) for x, y in zip(a[1], b[1])) / len(a[1]), 1)
                if distance <= args.hash_limit and colour <= args.colour_limit:
                    pairs.append(dict(object=oid, wikipedia=w['id'], curated=c['id'], hashDistance=distance,
                                      colourDifference=colour, wikipediaSource=w['source'], curatedSource=c['source']))
    data = dict(version=1,
                method='1280 px frames; 9x8 greyscale difference hash within ' + str(args.hash_limit) +
                       ' of 64 bits and mean 16x16 RGB difference within ' + str(args.colour_limit) + ' of 255',
                objects=len(shared), compared=compared, unavailable=sorted(unavailable),
                records=sorted(pairs, key=lambda p: (p['object'], p['wikipedia'], p['curated'])))
    (SRC / 'wikipedia-duplicates.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in data.items() if k not in ('records', 'method', 'unavailable')}),
          'duplicates:', len(pairs), 'unavailable:', len(unavailable))


if __name__ == '__main__':
    main()
