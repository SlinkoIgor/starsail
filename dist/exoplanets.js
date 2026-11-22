'use strict';

const Exoplanets = {
  archive: 'https://exoplanetarchive.ipac.caltech.edu',
  source: 'https://exoplanetarchive.ipac.caltech.edu/docs/pscp_calc.html',
  pcToLy: 3.2615637771674336,
  types: { giant: 'Вероятный газовый гигант', rocky: 'Вероятно каменистая', unknown: 'Тип не определён' },
  typeGroups: {
    giant: 'Вероятные газовые гиганты',
    rocky: 'Вероятно каменистые планеты',
    unknown: 'Планеты неизвестного типа',
  },
  byHost: new Map(EXOPLANETS_DATA.systems.map(row => [row[0], row])),
  newHosts: new Map(),
  matchedHosts: new Map(),
  newCount: EXOPLANETS_DATA.systems.filter(row => row[0].startsWith('nasa-host-')).length,
  modelCache: new Map(),
  hits: [],

  system(o) {
    return o && this.byHost.get(o.id);
  },
  newHost(id) {
    if (!id?.startsWith('nasa-host-')) return;
    const row = this.byHost.get(id);
    if (!row) return;
    if (this.newHosts.has(id)) return this.newHosts.get(id);
    const [, name, aliases,, raDeg, decDeg, distance, binary,,, kind] = row;
    const d = distance?.[0] > 0 ? distance[0] * this.pcToLy : null;
    const located = d !== null && [raDeg, decDeg].every(Number.isFinite);
    const type = binary ? 'Кратная звёздная система' :
      kind === 'pulsar' ? 'Пульсар с экзопланетами' : 'Звезда с экзопланетами';
    const o = {
      id, name, aliases, kind, type, d, raDeg, decDeg,
      ...(located ? Space.point(Space.fromSky(raDeg, decDeg, d)) : { p3: null }),
      exoplanetHost: true, catalog: 'NASA Exoplanet Archive', source: this.systemURL(row),
      positionQuality: located ? 'approximate' : 'unknown', navigable: located, atlasOnly: !located,
      distanceMethod: located ? 'Расстояние NASA Exoplanet Archive · пк × 3,26156.' : '',
      facts: { class: type, refs: [[this.systemURL(row), 'NASA Exoplanet Archive · система']] },
    };
    this.newHosts.set(id, o);
    return o;
  },
  catalogHost(id) {
    const fresh = this.newHost(id);
    if (fresh) return fresh;
    if (!this.byHost.has(id) || EXOPLANETS_DATA.metadata.catalogRevision !== EXTENDED_BOOT.revision) return;
    this.hostRows ??= new Map((EXOPLANETS_DATA.hostRows || []).map(row => [row[0], row]));
    const row = this.hostRows.get(id);
    if (!row) return;
    if (!this.matchedHosts.has(id)) this.matchedHosts.set(id, ExtendedCatalog.decode(row));
    return this.matchedHosts.get(id);
  },
  mapHosts() {
    if (!this.hosts) {
      this.hosts = new Map();
      for (const [id] of this.byHost) {
        const o = ExtendedCatalog.get(id);
        if (o?.p3 && !o.atlasOnly && !o.supersededBy && !MapGeometry.unlocated(o))
          this.hosts.set(id, o);
      }
    }
    return this.hosts;
  },
  search(term, category) {
    if (!['all', 'star', 'pulsar', 'blackhole'].includes(category)) return [];
    this.searchIndex ??= EXOPLANETS_DATA.systems.map(row => {
      const [id, name, aliases,, ra, dec, distance,, planets, tile, kind, atlasOnly] = row;
      const d = distance?.[0] > 0 ? distance[0] * this.pcToLy : null;
      const entry = { id, name, kind, d, atlasOnly: atlasOnly || d === null || ![ra, dec].every(Number.isFinite), tile };
      return { entry, keys: [name, ...aliases, ...planets.map(p => p[0])].map(s => MapDetails.searchKey(s)) };
    });
    return this.searchIndex.flatMap(({entry, keys}) => {
      if (!ExtendedCatalog.matches(entry.kind, category, entry)) return [];
      if (term ? !keys.some(key => key.includes(term)) : !entry.id.startsWith('nasa-host-')) return [];
      return [{ ...entry, searchExact: keys.includes(term) }];
    });
  },
  // The active collection uses its own complete point index so the ordinary
  // atlas hierarchy cannot drop hosts before the filter sees them.
  visibleHosts() {
    const collecting = !!globalThis.MapFilters?.planetHostsSelected;
    if ((collecting ? cam.span > 130000 : cam.span >= 24) || Math.hypot(cam.x, cam.y) > 4e6) return [];
    const key = Number(MapRadial.active()) + 2 * Number(collecting);
    this.projections ??= new Map();
    if (!this.projections.has(key)) {
      const points = [];
      const hosts = collecting ? this.mapHosts().values() :
        EXOPLANETS_DATA.systems.filter(row => row[0].startsWith('nasa-host-') && row[6])
          .map(row => this.newHost(row[0]));
      for (const o of hosts) {
        if (!o.p3) continue;
        const p = MapLayout.baseProject(o);
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) points.push({ o, p });
      }
      this.projections.set(key, points.sort((a, b) => a.p.x - b.p.x));
    }
    const points = this.projections.get(key), left = world(-40, -40), right = world(width + 40, height + 40);
    let lo = 0, hi = points.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (points[mid].p.x < left.x) lo = mid + 1;
      else hi = mid;
    }
    const visible = [];
    for (let i = lo; i < points.length && points[i].p.x <= right.x; i++) {
      const { o, p } = points[i];
      if (p.y >= left.y && p.y <= right.y) visible.push(o);
    }
    return visible;
  },

  best(p) {
    return p && !p[3] ? p[0] : null;
  },
  reference(p) {
    return EXOPLANETS_DATA.references[p?.[4]];
  },
  calculated(p) {
    return this.reference(p) === this.source;
  },
  type(mass, radius, massKind) {
    const m = this.best(mass), r = this.calculated(radius) ? null : this.best(radius);
    if (m >= 4130 && massKind !== 'M-R relationship') return 'unknown';
    if (r > 0 && r + (radius[1] || 0) <= 1.6) return 'rocky';
    if (r >= 6 && r + (radius[2] || 0) >= 6) return 'giant';
    if (r === null && m >= 50 && m + (mass[2] || 0) >= 50 &&
      ['Mass', 'Msini', 'Msin(i)/sin(i)'].includes(massKind)) return 'giant';
    return 'unknown';
  },
  projectedSeparation(discovery, eccentricity) {
    // In these discovery methods the nominal axis column can contain the
    // instantaneous sky separation. A constrained e is evidence of an orbit fit.
    return ['Imaging', 'Microlensing'].includes(discovery) &&
      !(this.best(eccentricity) > 0 || this.best(eccentricity) === 0 && eccentricity[1] > 0);
  },
  orbit(planet, binary) {
    const [, discovery,, period, semimajor, eccentricity,,, stellarMass] = planet;
    const days = this.best(period), projected = this.projectedSeparation(discovery, eccentricity);
    const independentPeriod = !projected || !semimajor ||
      (this.reference(period) && this.reference(period) !== this.reference(semimajor) && !this.calculated(period));
    let au = projected ? null : this.best(semimajor), derived = false;
    const sunMasses = this.best(stellarMass);
    if (!(au > 0) && days > 0 && sunMasses > 0 && !binary && independentPeriod) {
      au = Math.cbrt(sunMasses * (days / 365.25) ** 2);
      derived = true;
    }
    if (!(au > 0)) return null;
    const e = this.best(eccentricity);
    if (e !== null && (e < 0 || e >= 1)) return null;
    const assumedCircle = e === null || (e === 0 && !eccentricity[1] && !eccentricity[2]);
    const periodYears = days > 0 && independentPeriod ? days / 365.25 : null;
    const periodDerived = periodYears === null && sunMasses > 0 && !binary;
    return {
      au, e: e ?? 0, assumedCircle, derived, periodDerived,
      periodYears: periodDerived ? Math.sqrt(au ** 3 / sunMasses) : periodYears,
    };
  },
  planets(system) {
    const id = system[0];
    if (!this.modelCache.has(id)) {
      const planets = system[8].map(raw => ({
        raw, name: raw[0], type: this.type(raw[6], raw[7], raw[2]),
        orbit: this.orbit(raw, system[7]),
      })).sort((a, b) => (a.orbit?.au ?? Infinity) - (b.orbit?.au ?? Infinity) || a.name.localeCompare(b.name));
      this.modelCache.set(id, planets);
    }
    return this.modelCache.get(id);
  },
  orbits(o) {
    const system = this.system(o);
    if (!system || o.atlasOnly || !o.p3 || state.destroyed.includes(o.id)) return [];
    return this.planets(system).filter(p => p.orbit);
  },
  minimumSpan(o) {
    const inner = this.orbits(o)[0]?.orbit.au;
    return inner ? Math.min(SOLAR_CAMERA_SPAN, 6 * inner * OrbitalMotion.AU) : SOLAR_CAMERA_SPAN;
  },
  curve(centre, orbit) {
    const { au, e } = orbit;
    const a = au * OrbitalMotion.AU, b = a * Math.sqrt(1 - e * e);
    return { radius: a, pointAt: E => ({
      x: centre.x + a * (Math.cos(E) - e), y: centre.y + b * Math.sin(E),
    }) };
  },
  focus(o) {
    const orbits = this.orbits(o);
    if (!orbits.length) return;
    $('infoDialog').close();
    if (state.selected !== o.id) select(o.id);
    if (!ExtendedCatalog.matchesMap(o, true)) MapFilters.change('all', 'all', 'all');
    ExtendedCatalog.systemView = { selected: o.id, members: new Set([o.id]) };
    const centre = MapLayout.project(o), curves = orbits.map(p => this.curve(centre, p.orbit));
    const [x1, y1, x2, y2] = orbitCurvesBox(curves);
    fitCameraPoints([{x:x1, y:y1}, {x:x2, y:y2}], routeViewport(true), this.minimumSpan(o));
  },
  phase(orbit, index, elapsed = OrbitalMotion.elapsed()) {
    const initial = (0.8 + index * 2.3999632297) % (2 * Math.PI);
    const { e, periodYears: period } = orbit;
    if (!(period > 0)) return initial;
    // Adopt a schematic initial phase and advance mean anomaly in observer time.
    const mean = initial - e * Math.sin(initial);
    return OrbitalMotion.phase({ e, period, peri: -period * mean / (2 * Math.PI) }, elapsed % period);
  },
  draw() {
    this.hits.length = 0;
    if (cam.span >= 0.3) return;
    const hosts = new Map(), elapsed = OrbitalMotion.elapsed();
    for (const {o} of hitObjects) if (this.system(o)) hosts.set(o.id, o);
    const selected = object(state.selected);
    if (this.system(selected) && ExtendedCatalog.matchesMap(selected)) hosts.set(selected.id, selected);
    for (const o of hosts.values()) {
      const centre = MapLayout.project(o);
      this.orbits(o).forEach((p, index) => this.drawPlanet(o, centre, p, index, elapsed));
    }
  },
  drawPlanet(host, centre, planet, index, elapsed) {
    const curve = this.curve(centre, planet.orbit), radius = curve.radius * width / cam.span;
    if (radius < 4) return;
    const phase = this.phase(planet.orbit, index, elapsed), mark = screen(curve.pointAt(phase));
    OrbitalMotion.traceCurve(curve.pointAt, {
      curvature: radius, knots: [phase], dash: planet.orbit.assumedCircle ? [3, 4] : [], color: '#777777', alpha: 0.72, lineWidth: 0.85,
    });
    if (mark.x < -6 || mark.x > width + 6 || mark.y < -6 || mark.y > height + 6) return;
    const giant = planet.type === 'giant';
    ctx.save();
    ctx.fillStyle = paint('#414141');
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, giant ? 3.6 : 2.5, 0, 2 * Math.PI);
    if (planet.type === 'unknown') {
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else ctx.fill();
    if (giant) {
      ctx.beginPath();
      ctx.ellipse(mark.x, mark.y, 6.1, 1.7, -0.38, 0, 2 * Math.PI);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
    const key = 'exoplanet-' + planet.name, star = screen(centre);
    const hitRadius = Math.min(giant ? 13 : 11, Math.max(4, Math.hypot(mark.x - star.x, mark.y - star.y) / 2));
    this.hits.push({ key, planet, host, p: mark, radius: hitRadius });
    if (radius >= 13) MapLabels.point({
      key, name: planet.name, p: mark, priority: 19, level: 0,
    });
  },
  hit(x, y) {
    if (!this.hits.length) return;
    let closest, distance = Infinity;
    for (const hit of this.hits) {
      const d = Math.hypot(x - hit.p.x, y - hit.p.y);
      if (d <= hit.radius && d < distance) {
        closest = hit;
        distance = d;
      }
    }
    if (closest) return closest;
    const label = MapLabels.placed.find(b => b.key.startsWith('exoplanet-') &&
      x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    return label && this.hits.find(hit => hit.key === label.key);
  },
  show({ host, planet }) {
    const escape = SkyGuide.escape, href = this.archive + '/overview/' + encodeURIComponent(planet.name);
    showDialog('<article class="object-card"><div class="modal-eyebrow">ЭКЗОПЛАНЕТА</div>' +
      '<h2>' + escape(planet.name) + '</h2><p class="object-designation">' + escape(host.name) + '</p>' +
      '<section class="object-section exoplanets"><h3>Орбита и параметры</h3>' +
      '<p class="exoplanet-type">' + this.types[planet.type] + '</p>' + this.factsHTML(planet) +
      '<p class="object-sources"><a href="' + href + '" target="_blank" rel="noopener">NASA Exoplanet Archive ↗</a></p>' +
      '</section></article>');
  },

  systemURL(row) {
    return this.archive + '/overview/' + encodeURIComponent(row[1]);
  },
  measurement(p, unit, qualifier = '') {
    if (!p) return '—';
    const number = n => n.toLocaleString('ru-RU', { maximumSignificantDigits: 6 });
    const [value, plus, minus, limit] = p;
    const prefix = limit === 1 ? '≤ ' : limit === -1 ? '≥ ' : '';
    const error = plus > 0 && minus < 0 && plus === -minus ? '± ' + number(plus) :
      [plus > 0 ? '+' + number(plus) : '', minus < 0 ? '−' + number(-minus) : ''].filter(Boolean).join(' / ');
    const text = prefix + number(value) + (error ? ' ' + error : '') +
      (unit ? ' ' + unit : '') + (qualifier ? ' · ' + qualifier : '');
    const link = this.reference(p);
    return link ? '<a href="' + SkyGuide.escape(link) + '" target="_blank" rel="noopener">' + text + '</a>' : text;
  },
  factsHTML({raw, orbit}) {
    const [, discovery, massKind, period, axis, eccentricity, mass, radius] = raw;
    const massLabel = {'Msini':'M sin(i)', 'M-R relationship':'расчёт NASA', 'Msin(i)/sin(i)':'из M sin(i) и наклонения'}[massKind];
    const projected = this.projectedSeparation(discovery, eccentricity);
    const axisHTML = orbit?.derived
      ? '≈ ' + orbit.au.toLocaleString('ru-RU', {maximumSignificantDigits: 5}) +
        ' а.е. · по периоду и массе звезды (' + this.measurement(raw[8], 'M☉') + ')'
      : this.measurement(axis, 'а.е.', this.calculated(axis) ? 'расчёт NASA' : '');
    const eHTML = this.measurement(eccentricity, '') +
      (orbit?.assumedCircle ? ' · на карте круг' : '');
    const periodHTML = orbit?.periodDerived
      ? '≈ ' + (orbit.periodYears * 365.25).toLocaleString('ru-RU', {maximumSignificantDigits: 5}) +
        ' сут. · по полуоси и массе звезды (' + this.measurement(raw[8], 'M☉') + ')'
      : this.measurement(period, 'сут.');
    const values = [
      ['Период', periodHTML],
      [projected && !orbit?.derived ? 'Расстояние в проекции' : 'Большая полуось', axisHTML],
      ['Эксцентриситет', eHTML], ['Масса', this.measurement(mass, 'M⊕', massLabel)],
      ['Радиус планеты', this.measurement(radius, 'R⊕', this.calculated(radius) ? 'расчёт NASA' : '')],
    ];
    return '<dl>' + values.map(([label, value]) =>
      '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>').join('') + '</dl>';
  },
  planetTitle(planet, planets) {
    const group = planet.typeGroup || this.typeGroups[planet.type];
    const count = planets.filter(p => (p.typeGroup || this.typeGroups[p.type]) === group).length;
    return planet.name + '\n' + group + ' · ' + count;
  },
  hoverTitle({planet, host}) {
    return this.planetTitle(planet, this.planets(this.system(host)));
  },
  iconsHTML(planets) {
    return planets.map(p => '<span class="exoplanet-icon ' + p.type + '" aria-hidden="true" title="' +
      SkyGuide.escape(this.planetTitle(p, planets)) + '"></span>').join('');
  },
  renderTargetIcons(o) {
    const node = $('targetPlanets'), system = this.system(o);
    const planets = o.id === 'sol' ? OrbitalMotion.planets.map((p, i) => ({
      name: p.name, type: i < 4 ? 'rocky' : 'giant',
      typeGroup: i < 4 ? 'Каменистые планеты' : i < 6 ? 'Газовые гиганты' : 'Ледяные гиганты',
    })) : system ? this.planets(system) : [];
    UIPatch.set(node, 'hidden', !planets.length);
    UIPatch.attr(node, 'aria-label', 'Планеты · ' + planets.length);
    UIContent.html(node, this.iconsHTML(planets));
  },
  cardHTML(o) {
    const system = this.system(o);
    if (!system) return '';
    const planets = this.planets(system), canFocus = this.orbits(o).length > 0;
    const icons = this.iconsHTML(planets);
    const content = planets.map(p => '<li><strong>' + SkyGuide.escape(p.name) +
      '</strong><span class="exoplanet-type">' + this.types[p.type] + '</span>' + this.factsHTML(p) + '</li>').join('');
    return '<section class="object-section exoplanets"><h3>Подтверждённые экзопланеты <span>' + planets.length +
      '</span></h3><div class="exoplanet-icons" aria-hidden="true">' + icons + '</div>' +
      (canFocus ? '<button class="map-size-action" id="viewExoplanets">Показать орбиты ↗</button>' : '') +
      '<details><summary>Параметры планет</summary><ol>' + content + '</ol></details>' +
      (canFocus ? '<p class="object-note">Орбиты показаны в масштабе, вид сверху. Ориентация и начальное положение условны. Планеты с известным или расчётным периодом движутся по времени наблюдателя.' +
        (system[7] ? ' Центр схемы — положение кратной системы в каталоге.' : '') + '</p>' : '') +
      '<p class="object-sources"><a href="' + this.systemURL(system) + '" target="_blank" rel="noopener">' +
      'NASA Exoplanet Archive ↗</a></p></section>';
  },
};
globalThis.Exoplanets = Exoplanets;
