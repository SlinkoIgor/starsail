// Rebuild the offline NASA supplement from the frozen PSCompPars response.
// From the repo root: node data-tools/build-exoplanets.mjs [input.csv.gz] [output.js]
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readMapCatalog } from './map-radial-catalog.mjs';

const input = process.argv[2] || 'data-tools/stellar-sources/nasa-pscomppars.csv.gz';
const output = process.argv[3] || 'dist/exoplanets-data.js';
let csv = fs.readFileSync(input);
if (input.endsWith('.gz')) csv = gunzipSync(csv);
const rows = JSON.parse(execFileSync('python3', ['-c',
  'import csv,json,sys; json.dump(list(csv.DictReader(sys.stdin)),sys.stdout)'],
  { input: csv, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 }));

const archive = 'https://exoplanetarchive.ipac.caltech.edu';
function searchKey(s) {
  const label = (s || '').normalize('NFKD').toLowerCase();
  const gliese = label.match(/^(?:gl|gj)\s*(\d+(?:\.\d+)?)(?:\s*([a-z]))?$/);
  return gliese ? 'gj' + gliese[1] + (gliese[2] || '') : label.replace(/[^a-z0-9]/g, '');
}
const num = s => s !== '' && Number.isFinite(Number(s)) ? Number(s) : null;
const identifiers = r => [r.gaia_dr3_id, r.gaia_dr2_id, r.tic_id, r.hip_name, r.hd_name].filter(Boolean);
const byName = new Map();
for (const row of rows) {
  if (!byName.has(row.hostname)) byName.set(row.hostname, []);
  byName.get(row.hostname).push(row);
}
if (!rows.length || rows.some(r => !r.hostname || !r.pl_name) ||
  new Set(rows.map(r => r.pl_name)).size !== rows.length) throw Error('Invalid PSCompPars snapshot');

const { c, core, objects, pointer, rows: catalogRows } = await readMapCatalog();
const redirects = vm.runInContext('ExtendedCatalog.identityRedirects', c);
const wanted = new Set(rows.flatMap(r => [r.hostname, ...identifiers(r)].map(searchKey)));
const base = 'dist/' + pointer.dataRoot + '/';
const searchRows = JSON.parse(fs.readFileSync(base + 'search.json', 'utf8'));
const searchable = new Map(searchRows.map(row => [row[0], row]));
const byId = new Map(objects.map(o => [o.id, o]));
const atlasTiles = new Set(searchRows.filter(r => r[7] && !byId.has(r[0]) &&
  [searchKey(r[1]), ...r[6].split('|')].some(key => wanted.has(key))).map(r => r[5]));
for (const file of atlasTiles) {
  for (const r of JSON.parse(fs.readFileSync(base + file, 'utf8'))) {
    if (byId.has(r[0])) continue;
    byId.set(r[0], {
      id: r[0], name: r[1], kind: r[2], d: r[3], raDeg: r[4], decDeg: r[5],
      aliases: r[8], ...r[11], atlasOnly: true,
    });
  }
}
const atlas = new Map();
for (const o of byId.values()) {
  if (o.supersededBy || o.historicalStellarNavigation ||
    !['star', 'pulsar', 'blackhole'].includes(o.kind)) continue;
  const canonical = byId.get(redirects[o.id] || o.id);
  if (!canonical) continue;
  for (const label of [o.name, ...o.aliases || [],
    o.hip && 'HIP ' + o.hip, o.hd && 'HD ' + o.hd, o.gliese].filter(Boolean)) {
    const key = searchKey(label);
    if (!wanted.has(key)) continue;
    if (!atlas.has(key)) atlas.set(key, new Map());
    atlas.get(key).set(canonical.id, canonical);
  }
}
function skySeparationArcsec(a, b) {
  const rad = Math.PI / 180;
  const coords = (ra, dec) => [Math.cos(dec * rad) * Math.cos(ra * rad),
    Math.cos(dec * rad) * Math.sin(ra * rad), Math.sin(dec * rad)];
  const p = coords(a.ra, a.dec), q = coords(b.raDeg, b.decDeg);
  return 2 * Math.asin(Math.min(1, Math.hypot(...p.map((v, i) => v - q[i])) / 2)) / rad * 3600;
}
function match(name, records, circumbinary) {
  if (circumbinary) return [null, 'circumbinary'];
  const keys = new Map([[searchKey(name), 8]]);
  for (const ids of records.map(identifiers)) {
    for (const id of ids) {
      const key = searchKey(id), score = /^Gaia DR3 /i.test(id) ? 64 :
        /^Gaia DR2 |^TIC /i.test(id) ? 32 : /^HIP /i.test(id) ? 16 : 4;
      keys.set(key, Math.max(keys.get(key) || 0, score));
    }
  }
  const candidates = new Map();
  for (const [key, score] of keys) {
    for (const o of atlas.get(key)?.values() || []) {
      if (!candidates.has(o.id)) candidates.set(o.id, { o, score: 0, keys: [] });
      const q = candidates.get(o.id);
      q.score += score;
      q.keys.push(key);
    }
  }
  const sky = records.find(r => r.ra !== '' && r.dec !== '');
  const ranked = [...candidates.values()].filter(({o}) =>
    !sky || ![o.raDeg, o.decDeg].every(Number.isFinite) || skySeparationArcsec(sky, o) <= 180)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return [null, candidates.size ? 'position-conflict' : 'unmatched'];
  let [best, next] = ranked;
  if (best.score === next?.score) {
    // Some atlas aliases contain the same Gaia source on two imported records.
    // Prefer the unique record consistent with the NASA distance in that case.
    const distanceLy = records.find(r => num(r.sy_dist) > 0)?.sy_dist * 3.2615637771674336;
    const gaia = best.keys.find(key => key.startsWith('gaiadr3'));
    const tied = ranked.filter(q => q.score === best.score);
    const consistent = tied.filter(q => Math.abs(q.o.d / distanceLy - 1) < 0.01);
    if (!gaia || !tied.every(q => q.keys.includes(gaia)) || consistent.length !== 1)
      return [null, 'ambiguous'];
    [best] = consistent;
    return [best.o.id, best.keys.join(' ') + ' distance'];
  }
  if (next && next.score >= 32 && best.keys.every(key => !key.startsWith('gaiadr3')))
    return [null, 'identifier-conflict'];
  return [best.o.id, best.keys.join(' ')];
}

const references = [], referenceIndex = new Map();
function ref(value) {
  const href = value?.match(/href=["']?([^\s"'<>]+)/i)?.[1];
  if (!href) return null;
  const url = new URL(href, archive);
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') throw Error('Unexpected reference: ' + value);
  const link = url.href;
  if (!referenceIndex.has(link)) {
    referenceIndex.set(link, references.length);
    references.push(link);
  }
  return referenceIndex.get(link);
}
function parameter(r, k, distance = false) {
  const value = num(r[k]);
  return value === null ? null : [value, num(r[k + 'err1']),
    num(r[k + 'err2']), distance ? null : num(r[k + 'lim']), ref(r[k + '_reflink'])];
}
const matches = new Map();
const systems = [...byName].map(([name, records]) => {
  const circumbinary = records.some(r => r.cb_flag === '1');
  const [id, evidence] = match(name, records, circumbinary);
  const astrometry = records.find(r => num(r.sy_dist) > 0 && r.ra !== '' && r.dec !== '') || records[0];
  const alternative = id || 'nasa-host-' + createHash('sha256').update(name).digest('hex').slice(0, 16);
  const previous = matches.get(alternative);
  if (previous) throw Error('Two NASA hosts match ' + alternative + ': ' + previous + ' / ' + name);
  matches.set(alternative, name);
  const matched = id && byId.get(id);
  const kind = matched?.kind || (!circumbinary && records.some(r => r.discoverymethod === 'Pulsar Timing') ? 'pulsar' : 'star');
  return [alternative, name, [...new Set(records.flatMap(identifiers))], evidence,
    num(astrometry.ra), num(astrometry.dec), parameter(astrometry, 'sy_dist', true), circumbinary,
    records.map(r => [r.pl_name, r.discoverymethod, r.pl_bmassprov || null,
      ...['pl_orbper', 'pl_orbsmax', 'pl_orbeccen', 'pl_bmasse', 'pl_rade', 'st_mass']
        .map(k => parameter(r, k))]), id ? searchable.get(id)?.[5] || null : null, kind, !!matched?.atlasOnly];
});
// Embed the original immutable rows for matched hosts outside the core.
const coreIds = new Set(core.map(o => o.id));
const hostRows = catalogRows.filter(r => matches.has(r[0]) && !coreIds.has(r[0]));
const header = { table: 'pscomppars', catalogRevision: pointer.revision, planets: rows.length,
  sha256: createHash('sha256').update(csv).digest('hex') };
const data = '// Generated by data-tools/build-exoplanets.mjs\nconst EXOPLANETS_DATA = {\n' +
  '  metadata: ' + JSON.stringify(header) + ',\n  references: ' + JSON.stringify(references) + ',\n  systems: [\n' +
  systems.map(row => '    ' + JSON.stringify(row)).join(',\n') + '\n  ],\n  hostRows: [\n' +
  hostRows.map(row => '    ' + JSON.stringify(row)).join(',\n') + '\n  ],\n};\n';
fs.writeFileSync(output, data);
const counts = {};
for (const system of systems) {
  const key = system[0].startsWith('nasa-host-') ? system[3] : 'matched';
  counts[key] ??= { systems: 0, planets: 0 };
  counts[key].systems++;
  counts[key].planets += system[8].length;
}
console.log(counts);
