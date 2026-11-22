import fs from 'node:fs';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const harness = fs.readFileSync('tests/verify-map.mjs', 'utf8').split('\nrun(`')[0]
  .replace('addEventListener(){}', 'addEventListener(type,handler){(this.listeners??={})[type]=handler;} setPointerCapture(){}') +
  '\nexport {context,run};';
const {context, run} = await import('data:text/javascript,' + encodeURIComponent(harness) + '#exoplanets');
context.fetch = async path => ({
  ok: true,
  json: async () => JSON.parse(fs.readFileSync('dist/' + path.split('?')[0], 'utf8')),
});
const data = run('EXOPLANETS_DATA');
const frozen = gunzipSync(fs.readFileSync('data-tools/stellar-sources/nasa-pscomppars.csv.gz'));
assert.equal(createHash('sha256').update(frozen).digest('hex'), data.metadata.sha256);
assert.equal(data.metadata.catalogRevision, JSON.parse(fs.readFileSync('dist/catalog-data/current.json')).revision);

await run(`(async () => {
  resize();
  state = initial();
  paused = true;
  const rows = EXOPLANETS_DATA.systems, planets = rows.flatMap(row => row[8]);
  assert.equal(new Set(rows.map(row => row[0])).size, rows.length);
  assert.equal(new Set(planets.map(row => row[0])).size, EXOPLANETS_DATA.metadata.planets);
  assert.equal(planets.length, EXOPLANETS_DATA.metadata.planets);
  for (const [id, name, , , , , , binary, list] of rows) {
    assert.ok(name && list.length);
    if (binary) assert.ok(id.startsWith('nasa-host-'), 'circumbinary host uses system position');
    for (const p of list) for (const field of p.slice(3)) {
      if (field?.[4] != null) assert.match(EXOPLANETS_DATA.references[field[4]], /^https:\\/\\//);
    }
  }

  for (const [id, counts] of [['trappist', [7, 7, 0]], ['proxima', [2, 0, 0]], ['barnard', [4, 0, 0]], ['hyg-43464', [5, 0, 3]]]) {
    const row = Exoplanets.byHost.get(id);
    const list = Exoplanets.planets(row);
    assert.equal(list.length, counts[0], id);
    assert.equal(list.filter(p => p.type === 'rocky').length, counts[1], id);
    assert.equal(list.filter(p => p.type === 'giant').length, counts[2], id);
  }
  assert.equal(Exoplanets.byHost.get('iau-lich')[8].length, 3, 'pulsar planets have their correct host');
  assert.ok(!Exoplanets.system(object('alpha')), 'Proxima planets do not attach to Alpha Cen A');
  assert.ok(!Exoplanets.system(object('hyg-71453')), 'Proxima planets do not attach to Alpha Cen B');
  const [period, axis, stellarMass] = [[365.25,1,-1,0,null], [1.1,null,null,0,null], [4,.1,-.1,0,null]];
  const sample = ({method = 'Transit', days = period, semimajor = null, eccentricity = null} = {}) =>
    ['Test b', method, null, days, semimajor, eccentricity, null, null, stellarMass];
  const computed = Exoplanets.orbit(sample(), false);
  assert.ok(computed.derived && computed.assumedCircle && computed.e === 0);
  assert.ok(Math.abs(computed.au - Math.cbrt(4)) < 1e-12);
  assert.equal(Exoplanets.orbit(sample(), true), null, 'mass of one component cannot model a circumbinary orbit');
  assert.equal(Exoplanets.orbit(sample({days:null, semimajor:[2,null,null,1,null]}), false), null);
  for (const method of ['Imaging', 'Microlensing'])
    assert.equal(Exoplanets.orbit(sample({method, semimajor:axis}), false), null);
  const elliptical = Exoplanets.orbit(sample({semimajor:axis, eccentricity:[.4,.1,-.1,0,null]}), false);
  const curve = Exoplanets.curve({x:0,y:0}, elliptical);
  assert.ok(Math.abs(curve.pointAt(0).x - 1.1 * .6 * OrbitalMotion.AU) < 1e-12);
  assert.ok(Math.abs(curve.pointAt(Math.PI).x + 1.1 * 1.4 * OrbitalMotion.AU) < 1e-12);
  const inferred = Exoplanets.orbit(sample({days:null, semimajor:axis}), false);
  assert.ok(inferred.periodDerived);
  assert.ok(Math.abs(inferred.periodYears - Math.sqrt(1.1 ** 3 / 4)) < 1e-12);
  const unknown = Exoplanets.orbit(sample({days:null, semimajor:axis}), true);
  assert.equal(Exoplanets.phase(unknown, 0, 0), Exoplanets.phase(unknown, 0, 1));
  const phases = Exoplanets.orbits(object('proxima'));
  assert.equal(phases.length, 2);
  assert.ok(phases.every(p => p.orbit.periodYears > 0));
  const forward = (from,to) => (to - from + 2 * Math.PI) % (2 * Math.PI);
  const meanAnomaly = (orbit, e) => e - orbit.e * Math.sin(e);
  for (const [i, {orbit}] of phases.entries()) {
    const at = t => Exoplanets.phase(orbit, i, t);
    const p0 = at(0), p1 = at(orbit.periodYears / 4);
    assert.ok(Math.abs(forward(meanAnomaly(orbit,p0),meanAnomaly(orbit,p1)) - Math.PI/2) < 1e-11);
    assert.ok(Math.abs(at(orbit.periodYears) - p0) < 1e-11);
    paused = false;
    state.universeElapsed = 0;
    const before = Exoplanets.phase(orbit,i);
    Simulation.advance(orbit.periodYears / 8 / speed);
    assert.notEqual(Exoplanets.phase(orbit,i), before);
    paused = true;
    const still = Exoplanets.phase(orbit,i);
    Simulation.advance(orbit.periodYears / speed);
    assert.equal(Exoplanets.phase(orbit,i), still);
  }
  Cosmology.sync(state);

  for (const [id,count] of [['proxima',2],['trappist',7],['sol',8],['sirius',0]]) {
    state.selected = id;
    renderUI();
    const icons = $('targetPlanets');
    assert.equal(icons.hidden,!count,id);
    assert.equal((icons.innerHTML.match(/class="exoplanet-icon /g) || []).length,count,id);
    if (id === 'proxima') {
      assert.match(icons.innerHTML,/data-planet-tooltip="Proxima Cen [bd]\\s+Планеты неизвестного типа · 2/);
      assert.ok(!icons.innerHTML.includes(' title='));
    }
    if (id === 'sol') {
      assert.match(icons.innerHTML,/Газовые гиганты · 2/);
      assert.match(icons.innerHTML,/Ледяные гиганты · 2/);
    }
  }

  const trappist = object('trappist');
  for (const mode of ['full', 'radial']) {
    MapSlice.setMode(mode);
    state.selected = trappist.id;
    showObject(trappist.id);
    const html = $('dialogContent').innerHTML;
    assert.equal((html.match(/class="exoplanet-icon rocky"/g) || []).length, 7);
    assert.match(html, /Подтверждённые экзопланеты <span>7<\\/span>/);
    assert.match(html, /Период.*Большая полуось.*Масса/);
    assert.match(html,/Вероятно каменистые планеты · 7/);
    const before = JSON.stringify(state);
    $('viewExoplanets').onclick();
    assert.equal(JSON.stringify(state), before, 'orbit view changes no expedition data');
    assert.ok(cameraGoal.span < SOLAR_CAMERA_SPAN / 10, 'planetary system resolves below Solar zoom');
    assert.ok(zoomInterpolate(0, 'value', 'span') <= cameraGoal.span);
    cam = {...cameraGoal};
    cameraGoal = null;
    const centre = MapLayout.project(trappist);
    const shown = [];
    const trace = OrbitalMotion.traceCurve;
    OrbitalMotion.traceCurve = (at, options) => shown.push({at, options});
    try {
      MapLabels.begin();
      drawObjects();
      Exoplanets.draw();
    } finally {
      OrbitalMotion.traceCurve = trace;
    }
    assert.equal(shown.length, 7);
    for (const {at} of shown) {
      for (const t of [0, Math.PI/2, Math.PI, 3*Math.PI/2]) {
        const p = screen(at(t));
        assert.ok(p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height);
      }
      const a = at(0), b = at(Math.PI);
      assert.equal(a.y, centre.y, 'orbit shares projected host frame');
      assert.ok(a.x > centre.x && b.x < centre.x);
    }
  }
  // Pick from the displayed frame, even when the planet moves between press and release.
  state.tutorialStep = null;
  const drawPlanets = () => {
    MapLabels.begin();
    drawObjects();
    Exoplanets.draw();
    MapLabels.draw();
  };
  drawPlanets();
  const pick = Exoplanets.hits.find(hit => hit.host === trappist);
  assert.ok(pick);
  const event = {clientX:pick.p.x, clientY:pick.p.y, button:0, pointerId:1, pointerType:'mouse'};
  assert.equal(pickMapTarget(event).planet, pick);
  MapPointer.move(event.clientX,event.clientY);
  MapPointer.flush();
  assert.equal(canvas.style.cursor,'pointer');
  assert.equal(canvas.title,'','planet hover avoids browser tooltip delay');
  const tip = $('planetTooltip');
  assert.ok(!tip.hidden);
  assert.equal(tip.textContent,Exoplanets.hoverTitle(pick));
  assert.match(tip.textContent,/Вероятно каменистые планеты · 7/);
  MapPointer.leave();
  assert.ok(tip.hidden,'leaving the map hides the tooltip');
  MapPointer.move(event.clientX,event.clientY);
  MapPointer.flush();
  canvas.listeners.pointerdown(event);
  state.universeElapsed += pick.planet.orbit.periodYears / 2;
  drawPlanets();
  assert.notEqual(Exoplanets.hit(pick.p.x,pick.p.y)?.planet,pick.planet);
  ExoplanetTooltip.refresh();
  assert.ok(tip.hidden,'tooltip does not linger when the animated planet moves away');
  const beforeClick = JSON.stringify(state);
  canvas.listeners.pointerup(event);
  assert.equal(JSON.stringify(state),beforeClick,'planet inspection preserves navigation');
  assert.ok($('dialogContent').innerHTML.includes('<h2>' + pick.planet.name + '</h2>'));
  assert.match($('dialogContent').innerHTML,/Большая полуось.*NASA Exoplanet Archive/);
  $('infoDialog').close();
  const label = MapLabels.placed.find(b => b.key.startsWith('exoplanet-'));
  assert.ok(label);
  const labelled = Exoplanets.hits.find(hit => hit.key === label.key);
  assert.equal(Exoplanets.hit(label.x+label.w-2,label.y+2),labelled);
  const drag = { ...event, clientX:labelled.p.x, clientY:labelled.p.y };
  canvas.listeners.pointerdown(drag);
  canvas.listeners.pointermove({...drag,clientX:drag.clientX+25});
  canvas.listeners.pointerup({...drag,clientX:drag.clientX+25});
  assert.ok(!$('infoDialog').open, 'dragging a planet pans without opening a card');
  cam.span = 24;
  drawPlanets();
  assert.equal(Exoplanets.hits.length,0,'zooming out clears planet hit zones');
  const matched = Exoplanets.search(MapDetails.searchKey('55 Cnc d'), 'star');
  assert.equal(matched[0].id, 'hyg-43464');
  assert.ok((await ExtendedCatalog.resolve(matched[0])).p3, 'resolve a host in an immutable tile');
  const pulsar = Exoplanets.search(MapDetails.searchKey('PSR J1719-1438 b'), 'pulsar')[0];
  assert.equal(pulsar.id, 'atnf-j1719-1438');
  const atlasOnly = await ExtendedCatalog.resolve(pulsar);
  assert.ok(atlasOnly.atlasOnly && !Exoplanets.orbits(atlasOnly).length, 'existing distance policy applies to NASA matches');
  showObject(atlasOnly.id);
  assert.match($('dialogContent').innerHTML, /PSR J1719-1438 b/);
  const kepler = Exoplanets.search(MapDetails.searchKey('Kepler-16 b'), 'star')[0];
  assert.ok(kepler.id.startsWith('nasa-host-') && kepler.searchExact);
  const host = await ExtendedCatalog.resolve(kepler);
  assert.ok(host.exoplanetHost && host.p3?.length === 3);
  ExtendedCatalog.pinned.delete('hyg-43464');
  ExtendedCatalog.pinned.delete(host.id);
  ExtendedCatalog.visible = [];
  ExtendedCatalog.visibleMap.clear();
  ExtendedCatalog.cache.clear();
  assert.deepEqual(MapFilters.indexedCollections(),MAP_FILTER_DATA.collections);
  MapFilters.change('all',MapFilters.indexedCollections(),'all',false);
  assert.ok(MapFilters.unrestricted('collections'),'old complete collection unions remain unrestricted');
  const expedition = JSON.stringify(state);
  MapFilters.change('all','exoplanets','all',false);
  assert.equal(MapFilters.total,Exoplanets.mapHosts().size);
  assert.ok(MapFilters.total>4800);
  assert.ok(MapFilters.matches(object('proxima')) && !MapFilters.matches(object('alpha')));
  assert.ok(!MapFilters.matches(object('sirius')));
  assert.equal(JSON.stringify(state),expedition,'map filter leaves the expedition intact');
  for (const mode of ['full','radial']) {
    MapSlice.setMode(mode);
    for (const id of ['hyg-43464',host.id]) {
      const star = object(id);
      assert.ok(star && MapFilters.promotes(star),'filter resolves a host without ordinary tiles');
      cam = {...MapLayout.project(star),span:24};
      drawPlanets();
      assert.ok(hitObjects.some(h=>h.o.id===id),'filter draws the host in ' + mode);
      assert.ok(hitObjects.every(h=>MapFilters.matches(h.o)),'only collection members and anchors are visible');
    }
  }
  const collectionSize = MapFilters.total, hosts = [...MapFilters.promoted];
  MapFilters.change(['exoplanets'],[],'all',false,'classes');
  assert.ok(MapFilters.planetHostsSelected);
  assert.equal(filter,'all','catalogue streaming keeps the real physical classes');
  assert.equal(MapFilters.total,collectionSize);
  assert.deepEqual([...MapFilters.promoted],hosts,'both tabs use the same catalogue');
  assert.ok(MapFilters.allowsCategory('star') && MapFilters.allowsCategory('pulsar'));
  assert.ok(!MapFilters.allowsCategory('galaxy'));
  assert.ok(!MapFilters.matches(object('sirius')) && MapFilters.matches(object('proxima')));
  cam = {...MapLayout.project(host),span:24};
  drawPlanets();
  assert.ok(hitObjects.some(h=>h.o.id===host.id),'class filter draws NASA hosts outside the ordinary atlas');
  MapFilters.change(['exoplanets','galaxy'],[],'all',false,'classes');
  assert.ok(MapFilters.planetHostsSelected && MapFilters.matches(object('proxima')) &&
    MapFilters.matches(object('andromeda')) && !MapFilters.matches(object('sirius')));
  assert.ok(MapFilters.total>collectionSize);
  MapFilters.change(MapFilters.classes.filter(k => k !== 'all'),[],'all',false,'classes');
  assert.ok(MapFilters.unrestricted('classes'),'saved all-classes selection predating the new option stays unrestricted');
  assert.ok(!MapFilters.planetHostsSelected);
  MapFilters.change('all','all','all',false);
  assert.ok(!MapFilters.values('classes').includes('exoplanets'),'the all-classes shortcut clears the planet-host toggle');
  assert.equal(MapFilters.promoted.size,0);

  state.selected = host.id;
  showObject(host.id);
  assert.match($('dialogContent').innerHTML, /Центр схемы — положение кратной системы в каталоге/);
  for (const mode of ['full', 'radial']) {
    MapSlice.setMode(mode);
    cam = {...MapLayout.project(host), span:2};
    assert.ok(Exoplanets.visibleHosts().includes(host), 'NASA-only host is discoverable on map in ' + mode);
  }
  ExtendedCatalog.capture(state);
  const restored = JSON.parse(JSON.stringify(state));
  ExtendedCatalog.restore(restored);
  assert.equal(restored.selected, host.id);
  assert.equal(Exoplanets.orbits(object(restored.selected)).length, 1);
})()`);
console.log('PASS NASA snapshot, cross-identities, sources, classes, missing elements, Kepler axes, both map projections, search and reload');
