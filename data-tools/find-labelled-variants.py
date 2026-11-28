#!/usr/bin/env python3
"""Find publisher-labelled versions of photographs the gallery already shows.

Network audit; needs curl and macOS sips. Observatories often publish the same
frame twice: clean and with the objects named on it. The importers keep the
clean frame; this audit finds its labelled twin so the gallery can show that
instead. Two sources of candidates, both stated by the publisher:

* a record of the same release in the AstroPix feed whose title says
  "annotated" or "labelled" (fetch-astropix-media.py rejects it as a photo);
* an image page linked from the page of the clean frame (ESO, ESA/Hubble,
  ESA/Webb, NOIRLab) whose own title says "annotated" or "labelled".

A candidate is accepted only if its pixels repeat the clean frame: the same
proportions within 1 %, the difference hash of a 9 x 8 greyscale grid and the
mean colour difference of a 16 x 16 grid within the limits. A wider field, a
crop or a collage with insets is a different picture and is listed under
"skipped" with the measured values. Wikipedia lead images are covered when
the Commons file name carries the publisher's image ID.

The result goes to sky-sources/labelled-variants.json; build-sky-photos.py
and build-wikipedia-media.py attach it offline. No clean record is changed.
"""
import argparse
import hashlib
import html
import importlib.util
import json
import re
import subprocess
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data-tools/sky-sources'
AGENT = 'ParusCatalogAudit/1.0 (labelled image audit)'
MARK = re.compile(r'\(?\b(?:annotated|labell?ed|with (?:labels|annotations))\b\)?', re.I)
PLAIN = re.compile(r'\b(?:unannotated|non[- ]annotated|not[- ]annotated|unlabell?ed|without (?:annotations?|labels))\b', re.I)
MENTION = re.compile(r'\bannotat\w*|\blabell?ed\b', re.I)
SITES = dict(eso='https://www.eso.org/public/images/', esahubble='https://esahubble.org/images/',
             esawebb='https://esawebb.org/images/', noirlab='https://noirlab.edu/public/images/')
NAMES = dict(eso='ESO', esahubble='ESA/Hubble', esawebb='ESA/Webb', noirlab='NOIRLab')
HOSTS = {'www.eso.org': 'eso', 'eso.org': 'eso', 'esahubble.org': 'esahubble', 'www.spacetelescope.org': 'esahubble',
         'spacetelescope.org': 'esahubble', 'esawebb.org': 'esawebb', 'noirlab.edu': 'noirlab'}
FILE_ID = [(re.compile(r'\b(eso\d{4}[a-z]{1,2})\b', re.I), 'eso'), (re.compile(r'\b((?:heic|opo)\d{4}[a-z]{1,2})\b', re.I), 'esahubble'),
           (re.compile(r'\b(weic\d{4}[a-z]{1,2})\b', re.I), 'esawebb'), (re.compile(r'\b(potw\d{4}[a-z])\b', re.I), None)]


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT / 'data-tools' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def text(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', ' ', value or ''))).strip()


def secure(url):
    return 'https://' + url[7:] if url.startswith('http://') else url


def release(image):
    return re.sub(r'[a-z]{1,2}\d?$', '', image.lower())


def page_address(url):
    match = re.match(r'https?://([^/]+)/(?:public/)?images/([A-Za-z0-9_.-]+)/?$', url or '')
    site = match and HOSTS.get(match[1].lower())
    return (site, match[2].lower()) if site else None


def parse_page(body, site):
    """Read one image page of the common ESO/ESA outreach site engine."""
    head = body.split('About the Image', 1)[0]
    title = re.search(r'<title>\s*(.*?)\s*\|[^|<]*</title>', body, re.S)
    image = re.search(r'property="og:image"\s+content="([^"]+)"', body)
    credit = re.search(r'<div class="credit">(.*?)</div>', body, re.S)
    notice = re.search(r'<div class="copyright">\s*<a href="([^"]+)">([^<]+)</a>', body)
    links = []
    for host, found in re.findall(r'href="(?:https?://([^"/]+))?/(?:public/)?images/([A-Za-z0-9_.-]+)/?"', head):
        if host and HOSTS.get(host.lower()) != site:
            continue
        if found.lower() not in links:
            links.append(found.lower())
    credit = re.sub(r'\s+([,.;:])', r'\1', re.sub(r'^Image credit:\s*', '', text(credit[1]))) if credit else ''
    return dict(title=text(title[1]) if title else '', url=secure(image[1]) if image else '',
                credit=credit, notice=text(notice[2]) if notice else '', links=links)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--feed-cache', type=Path, default=Path(tempfile.gettempdir()) / 'parus-astropix-metadata',
                        help='pages saved by fetch-astropix-media.py')
    parser.add_argument('--cache', type=Path, required=True, help='pages and frames of this audit')
    parser.add_argument('--hash-limit', type=int, default=12)
    parser.add_argument('--colour-limit', type=float, default=10)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    importer, frames = load('fetch-astropix-media'), load('find-wikipedia-duplicates')
    feed = [row for path in sorted(args.feed_cache.glob('feed-*.json')) for row in json.loads(path.read_text())]
    assert len(feed) >= 8000, 'Run fetch-astropix-media.py with the same cache first'
    frozen = {p['id']: p for p in json.loads((SRC / 'media-astropix.json').read_text())['records']}
    webb = {p['id']: p for p in json.loads((SRC / 'media-webb.json').read_text())['records']}
    rows = {'astropix-' + q['publisher_id'] + '-' + q['image_id']: q for q in feed}
    by_page = {(q['publisher_id'], q['image_id'].lower()): q for q in feed if q['publisher_id'] in SITES}
    by_image = defaultdict(list)
    for id, p in frozen.items():
        by_image[p['imageId'].lower()].append(id)
    default_rights = {site: Counter(p['rights'] for p in frozen.values() if p['publisher'] == site).most_common(1)[0][0]
                      for site in SITES if any(p['publisher'] == site for p in frozen.values())}
    pages, sizes, signatures = {}, {}, {}
    candidates, skipped = defaultdict(list), []

    def page(site, image):
        key = (site, image)
        if key not in pages:
            url = SITES[site] + image + '/'
            path = args.cache / (hashlib.sha256(url.encode()).hexdigest()[:24] + '.html')
            if not path.exists() or not path.stat().st_size:
                subprocess.run(['curl', '-sL', '--fail', '-m', '60', '-A', AGENT, '-o', str(path), url], check=False)
            body = path.read_text(errors='replace') if path.exists() and path.stat().st_size else ''
            pages[key] = dict(parse_page(body, site), source=url, sha256=hashlib.sha256(body.encode()).hexdigest()) if body else None
        return pages[key]

    def frame(url):
        if url not in signatures:
            path = frames.fetch(url, args.cache)
            signatures[url] = frames.signature(path, args.cache) if path else None
            found = subprocess.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', str(path)], capture_output=True, text=True).stdout if path else ''
            size = [int(v) for v in re.findall(r'pixel(?:Width|Height): (\d+)', found)]
            sizes[url] = size if len(size) == 2 else None
        return signatures[url], sizes[url]

    def from_feed(row):
        url = importer.convert(dict(row, title=re.sub(r'\s+', ' ', MARK.sub('', row['title'])).strip() or row['title']))
        return dict(publisher=row['publisher_id'], imageId=row['image_id'], title=importer.clean(row['title']),
                    url=url['url'], source=url['source'], credit=url['credit'], rights=url['rights'],
                    archive=url['archive'], archiveLabel='AstroPix', publisherName=NAMES.get(row['publisher_id'], ''))

    def labelled_title(title):
        return bool(MARK.search(title)) and not PLAIN.search(title)

    def twins(row):
        """Labelled records of the same release in the AstroPix feed."""
        for other in feed:
            if other is row or other['publisher_id'] != row['publisher_id'] or release(other['image_id']) != release(row['image_id']):
                continue
            title = importer.clean(other.get('title'))
            if not labelled_title(title) or importer.rejection_reason(other) != 'non-photo-title':
                continue
            if importer.rejection_reason(dict(other, title=re.sub(r'\s+', ' ', MARK.sub('', title)).strip() or 'frame')):
                continue
            yield from_feed(other), dict(method='astropix-release-twin', astropixId=other['astropix_id'])

    def linked(site, image):
        """Labelled image pages linked from the page of the clean frame."""
        base = page(site, image)
        for found in base['links'] if base else []:
            if found == image:
                continue
            other = page(site, found)
            if not other or not other['url'] or not labelled_title(other['title']):
                continue
            row = by_page.get((site, found))
            variant = from_feed(row) if row and not importer.rejection_reason(dict(row, title='frame')) else dict(
                publisher=site, imageId=found, title=other['title'], url=other['url'], source=other['source'],
                credit=other['credit'], rights=default_rights.get(site, ''), rightsBasis=other['notice'],
                archive=other['source'], archiveLabel=NAMES[site], publisherName=NAMES[site])
            if variant['credit'] and variant['rights']:
                yield variant, dict(method='publisher-page-link', page=base['source'], pageSha256=base['sha256'],
                                    labelledPageSha256=other['sha256'])

    def consider(photo, collection, clean_url, found):
        for variant, evidence in found:
            if any(c[0]['url'] == variant['url'] for c in candidates[photo]):
                continue
            candidates[photo].append((variant, dict(evidence, collection=collection, cleanUrl=clean_url)))

    for id, p in sorted(frozen.items()):
        row = rows.get(id)
        if not row:
            continue
        consider(id, 'astropix', p['url'], twins(row))
        address = page_address(p['source'])
        if address and MENTION.search(p['sourceCaption']):
            consider(id, 'astropix', p['url'], linked(*address))
    for id, p in sorted(webb.items()):
        address = page_address(p['source'])
        if address and MENTION.search(p.get('sourceCaption', '')):
            consider(id, 'webb', p['url'], linked(*address))
    wikipedia = {}
    for r in json.loads((SRC / 'wikipedia.json').read_text())['records']:
        if r.get('media'):
            wikipedia[r['media']['id']] = r['media']
    for id, p in sorted(wikipedia.items()):
        name = p.get('fileTitle') or p['source']
        for pattern, site in FILE_ID:
            match = pattern.search(name)
            if not match:
                continue
            image = match[1].lower()
            known = by_image.get(image, [])
            if not site and len(known) == 1 and frozen[known[0]]['publisher'] in SITES:
                site = frozen[known[0]]['publisher']
            if not site:
                skipped.append(dict(photo=id, candidate=image, reason='publisher-not-identified'))
                break
            for twin in known:
                if frozen[twin]['publisher'] == site and rows.get(twin):
                    consider(id, 'wikipedia', p['url'], twins(rows[twin]))
            consider(id, 'wikipedia', p['url'], linked(site, image))
            break

    records = []
    for photo, found in sorted(candidates.items()):
        accepted = []
        for variant, evidence in found:
            (a, clean_size), (b, labelled_size) = frame(evidence['cleanUrl']), frame(variant['url'])
            note = dict(photo=photo, candidate=variant['source'], method=evidence['method'])
            if not a or not b or not clean_size or not labelled_size:
                skipped.append(dict(note, reason='frame-unavailable'))
                continue
            aspect = (labelled_size[0] / labelled_size[1]) / (clean_size[0] / clean_size[1])
            distance = sum(x != y for x, y in zip(a[0], b[0]))
            colour = round(sum(abs(x - y) for x, y in zip(a[1], b[1])) / len(a[1]), 1)
            measured = dict(hashDistance=distance, colourDifference=colour, cleanSize=clean_size, labelledSize=labelled_size)
            if abs(aspect - 1) > .01:
                skipped.append(dict(note, reason='different-proportions', **measured))
            elif distance > args.hash_limit or colour > args.colour_limit:
                skipped.append(dict(note, reason='different-frame', **measured))
            elif max(labelled_size) < .9 * min(max(clean_size), 1280):
                skipped.append(dict(note, reason='smaller-frame', **measured))
            else:
                accepted.append((distance, colour, variant, dict(evidence, **measured)))
        if not accepted:
            continue
        accepted.sort(key=lambda item: (item[0], item[1], item[2]['url']))
        for distance, colour, variant, evidence in accepted[1:]:
            skipped.append(dict(photo=photo, candidate=variant['source'], method=evidence['method'], reason='another-variant-is-closer',
                                hashDistance=distance, colourDifference=colour))
        distance, colour, variant, evidence = accepted[0]
        records.append(dict(photo=photo, collection=evidence.pop('collection'), labelled=variant,
                            evidence={k: v for k, v in evidence.items() if k != 'cleanUrl'}))
    owners = defaultdict(list)
    for r in records:
        owners[r['collection'], r['labelled']['url']].append(r)
    titles = {**{id: p['archiveTitle'] for id, p in frozen.items()}, **{id: p.get('archiveTitle', p['title']) for id, p in webb.items()},
              **{id: p['title'] for id, p in wikipedia.items()}}
    plain = lambda title: re.sub('[^a-z0-9]+', ' ', MARK.sub(' ', title.lower())).strip()
    for group in owners.values():
        group.sort(key=lambda r: (plain(titles[r['photo']]) != plain(r['labelled']['title']), r['evidence']['hashDistance'],
                                  r['evidence']['colourDifference'], r['photo']))
        for r in group[1:]:
            records.remove(r)
            skipped.append(dict(photo=r['photo'], candidate=r['labelled']['source'], method=r['evidence']['method'],
                                reason='labelled-frame-replaces-another-photo', replaces=group[0]['photo'],
                                hashDistance=r['evidence']['hashDistance'], colourDifference=r['evidence']['colourDifference']))
    data = dict(version=1,
                method='labelled frame named by the publisher (AstroPix record of the same release or image page linked from the clean '
                       'frame, title says annotated/labelled); same proportions within 1 %, 9x8 greyscale difference hash within ' +
                       str(args.hash_limit) + ' of 64 bits and mean 16x16 RGB difference within ' + str(args.colour_limit) + ' of 255; ' +
                       'one labelled frame replaces one clean frame of a collection: matching title first, then the closest pixels',
                feedRecords=len(feed), pagesRead=sum(bool(p) for p in pages.values()), candidates=sum(len(v) for v in candidates.values()),
                records=records, skipped=sorted(skipped, key=lambda s: (s['photo'], s['candidate'])))
    (SRC / 'labelled-variants.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in data.items() if k not in ('records', 'skipped', 'method')}), 'labelled:', len(records),
          dict(Counter(r['collection'] for r in records)), 'skipped:', dict(Counter(s['reason'] for s in skipped)))


if __name__ == '__main__':
    main()
