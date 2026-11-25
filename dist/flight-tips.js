'use strict';
// The tutorial follows the current control independently of flight notices.
const ExpeditionTutorial = {
  storageKey: 'parus-intro-tutorial',
  startRate: 0.1,
  firstTarget: 'alpha',
  farTarget: 'sgr',
  centerRadius: 5,
  centerRuler: 0.02,
  approachSeconds: 6,
  galaxyTarget: 'andromeda',
  neighbourSpan: 1e7,
  galaxyRadius: 3e5,
  universeSecondsPerDecade: 2.5,
  approach: null,
  tracked: null,
  leadPhotos: {alpha: 'hubble-alpha', sgr: 'eso-eso1825e-orbits'},
  tour: {
    search: 'catalogBtn', filters: 'mapFilterBtn', follow: 'shipBtn', theme: 'themeBtn', library: 'libraryBtn',
    restart: 'resetBtn', settings: 'settingsBtn', zen: 'zenBtn', quests: 'questBtn',
  },
  heldButtons: ['catalogBtn', 'mapFilterBtn', 'shipBtn', 'resetBtn', 'zenBtn'],
  at(step) {
    return TUTORIAL_STEPS.indexOf(step);
  },
  between(first, last, step = state.tutorialStep) {
    const index = this.at(step);
    return index >= this.at(first) && index <= this.at(last);
  },
  openSession(hasExpedition) {
    let firstVisit = !hasExpedition;
    try {
      if (localStorage.getItem(this.storageKey)) firstVisit = false;
      else localStorage.setItem(this.storageKey, 'seen');
    } catch {}
    if (firstVisit) state.timeScale = this.startRate;
    // A guided flight and its arrival remain in the tutorial even if the tab was closed.
    let step = this.at(state.tutorialStep) >= this.at('flight') ? state.tutorialStep : firstVisit ? 'welcome' : null;
    try {
      const active = JSON.parse(sessionStorage.getItem(this.storageKey));
      if (active?.expedition === state.expedition && TUTORIAL_STEPS.includes(active.step))
        step = active.step;
    } catch {}
    // Earlier versions ended training on takeoff. The departure snapshot identifies that flight.
    if (!step && !state.tutorialStep && ['proxima', this.firstTarget].includes(state.flight?.target) &&
        state.flight.rollback?.tutorialStep === 'launch' && !state.flight.tutorialDismissed) step = 'flight';
    step = this.resume(step);
    if (step) this.prepareDeparture();
    this.setStep(step);
  },
  resume(step) {
    if (!TUTORIAL_STEPS.includes(step)) return null;
    if (this.between('propulsion', 'launch', step))
      return state.selected === this.firstTarget && this.canChoose() ? step : 'destination';
    if (this.between('star', 'collector', step)) {
      if (state.flight) return this.goal(state.flight) === this.farTarget ? 'voyage' : null;
      if (state.current !== this.firstTarget) return null;
      if (step === 'card') return 'star';
      return this.between('sail', 'collector', step) && state.selected !== this.farTarget ? 'blackhole' : step;
    }
    if (step === 'voyage' && !state.flight)
      return this.atCenter() ? 'braking' : state.current === this.firstTarget ? 'blackhole' : null;
    if (this.between('braking', 'holecard', step)) return !this.atCenter() ? null : step === 'holecard' ? 'hole' : step;
    if (this.between('neighbour', 'crossing', step)) {
      if (state.flight) return this.goal(state.flight) === this.galaxyTarget ? 'crossing' : null;
      if (step === 'crossing') return this.atGalaxy() ? 'arrival' : this.atCenter() ? 'neighbour' : null;
      if (!this.atCenter()) return null;
      return state.selected === this.galaxyTarget ? step : 'neighbour';
    }
    if (this.between('arrival', 'farewell', step)) return state.flight ? null : step;
    return step;
  },
  parks(step = state.tutorialStep) {
    return this.between('blackhole', 'voyage', step);
  },
  setStep(step) {
    if (step && !state.tutorialStep) Quests.pauseForTutorial();
    const parked = this.parks();
    state.tutorialStep = step;
    if (parked !== this.parks() && typeof MissionPlanner !== 'undefined') {
      const guided = '"' + this.farTarget + '"';
      for (const key of [...MissionPlanner.cache.keys()]) if (key.includes(guided)) MissionPlanner.cache.delete(key);
    }
    this.layout();
    if (!step && state.quests.starterPending) {
      delete state.quests.starterPending;
      Quests.subscribe(Quests.starterId);
    }
    try {
      if (step) sessionStorage.setItem(this.storageKey, JSON.stringify({expedition: state.expedition, step}));
      else sessionStorage.removeItem(this.storageKey);
    } catch {}
  },
  layout() {
    const app = $('app'), step = state.tutorialStep || '';
    if (app.dataset.tutorial === step) return;
    app.dataset.tutorial = step;
    app.dataset.tutorialParts = TUTORIAL_STEPS.slice(0, TUTORIAL_STEPS.indexOf(step) + 1).join(' ');
    const held = this.between('search', 'farewell', step);
    for (const id of this.heldButtons) $(id).inert = held;
    UIContent.text($('startTutorial'), step ? 'Отключить обучение' : 'Начать обучение');
    resize();
  },
  allows(step) {
    return !state.tutorialStep || TUTORIAL_STEPS.indexOf(state.tutorialStep) >= TUTORIAL_STEPS.indexOf(step);
  },
  prepareDeparture() {
    if (state.current === 'sol' && !state.flight && !state.orbit && !state.totalDistance &&
        state.visited.length === 1 && !state.flightHistory.length && !OrbitalMotion.onEarth(state))
      OrbitalMotion.parkOnEarth();
  },
  finish() {
    if (state.flight?.rollback?.tutorialStep === 'launch') state.flight.tutorialDismissed = true;
    this.setStep(null);
    persist();
    renderUI();
  },
  go(next) {
    this.setStep(next);
    persist();
    renderUI();
    if (next === 'center') this.showCenter(true);
    else if (next === 'destination' || next === 'launch' || next === 'blackhole' || next === 'neighbour') this.showMap();
    else if (next === 'hole') select(this.farTarget);
    else if (next === 'universe') this.showUniverse(true);
  },
  advance() {
    const step = state.tutorialStep;
    if (!step || step === 'star' || step === 'card' || step === 'holecard' || (step === 'center' && this.approach) ||
        (step === 'universe' && this.gliding())) return;
    if (step === 'destination' || step === 'blackhole' || step === 'neighbour') {
      if (this.targetId()) this.showMap();
      else this.finish();
      return;
    }
    if (step === 'flight' || step === 'voyage' || step === 'crossing') {
      if (!state.flight) this.finish();
      return;
    }
    if (step === 'launch' || step === 'collector' || step === 'burst') {
      if (this.blocked(step)) this.finish();
      return;
    }
    if (step === 'sail') {
      this.connectSail();
      return;
    }
    if (step === 'supernova') {
      if (this.burstIssue()) this.finish();
      else this.connectSail(true);
      return;
    }
    if (step === 'hole') {
      if (!this.cardReady()) showObject(this.farTarget);
      return;
    }
    if (step === 'quests') {
      Quests.open();
      renderUI();
      return;
    }
    if (step === 'farewell') {
      this.finish();
      return;
    }
    this.go(TUTORIAL_STEPS[this.at(step) + 1]);
  },
  blocked(step = state.tutorialStep) {
    return $('launchBtn').disabled || (step !== 'launch' && !!QuickFlight.issueReason);
  },
  burstIssue() {
    return FlightSetup.burstIssue(object(state.current));
  },
  connectSail(burst = false) {
    state.flightSetup = FlightSetup.normalize({...FlightSetup.preferred(), sail: true, collector: true, burst});
    FlightSetup.sync();
    persist();
    renderUI();
  },
  openLibrary() {
    Library.open('flight', state.tutorialStep === 'burst' ? 'supernova' : null);
  },
  questChosen() {
    if (state.tutorialStep !== 'quests') return;
    delete state.quests.starterPending;
    this.go('farewell');
  },
  freeFlight() {
    if (state.tutorialStep !== 'quests') return;
    Quests.close();
    this.questChosen();
  },
  orbitsSpan(hole) {
    const rows = typeof NuclearStars === 'undefined' ? [] : NuclearStars.rows.filter(q => q.e < 1),
      v = routeViewport(), cx = width / 2, cy = cameraViewportHeight() / 2,
      halfWidth = Math.min(cx - v.left, v.right - cx), halfHeight = Math.min(cy - v.top, v.bottom - cy);
    let span = 0;
    for (const q of rows) for (let n = 0; n < 90; n++) {
      const p = NuclearStars.map(q, n / 90 * 2 * Math.PI);
      span = Math.max(span, Math.abs(p.x - hole.x) * width / halfWidth, Math.abs(p.y - hole.y) * width / halfHeight);
    }
    return span * 1.1;
  },
  showCenter(slow = false) {
    const hole = MapLayout.project(object(this.farTarget)), near = this.centerRuler * width / GRID_TARGET_PIXELS,
      calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      wide = slow && !calm ? this.orbitsSpan(hole) : 0, staged = wide > near * 2,
      view = centeredCamera(hole, staged ? wide : near);
    releaseShipCamera();
    cameraGoal = {...view, focus: this.farTarget};
    updateMapHeading();
    this.approach = staged ? {goal: cameraGoal, hole, span: near} : null;
  },
  followApproach() {
    const a = this.approach;
    if (!a || cameraGoal === a.goal) return;
    const arrived = !cameraGoal && cam.x === a.goal.x && cam.y === a.goal.y && cam.span === a.goal.span;
    this.approach = null;
    if (a.gliding || !arrived || state.tutorialStep !== 'center') return;
    glideCamera(centeredCamera(a.hole, a.span), a.hole, this.approachSeconds);
    this.approach = {goal: cameraGoal, gliding: true};
  },
  showGalaxy() {
    fitCameraPoints([MapLayout.project(object(this.farTarget))], routeViewport(true), zoomStops[2].span);
  },
  showNeighbour() {
    fitCameraPoints([FlightView.ship(), MapLayout.project(object(this.galaxyTarget))], routeViewport(true), this.neighbourSpan);
  },
  universeView() {
    const view = UniverseMap.overview(), hud = document.querySelector('.telemetry')?.getBoundingClientRect();
    if (!(hud?.height > 0)) return view;
    const scale = width / view.span, r = this.universeRadius() * scale, cy = mapOriginY() - view.y * scale,
      top = 16 + r, bottom = hud.top - canvas.getBoundingClientRect().top - 44 - r;
    return {...view, y: (mapOriginY() - (top <= bottom ? clamp(cy, top, bottom) : (top + bottom) / 2)) / scale};
  },
  showUniverse(slow = false) {
    if (!globalThis.UniverseMap) return;
    const view = this.universeView();
    if (!slow || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      goCamera(view.x, view.y, view.span);
      return;
    }
    const seconds = Math.abs(Math.log10(view.span / cam.span)) * this.universeSecondsPerDecade;
    glideCamera(view, FlightView.ship(), clamp(seconds, 6, 16));
  },
  gliding() {
    return !!cameraGoal?.glide;
  },
  showMap() {
    const step = state.tutorialStep;
    if (!step) return;
    if (this.allows('neighbour')) {
      if (state.flight) {
        if (step === 'crossing') fitRoute(object(state.flight.target), {wholeRoute:true});
      } else if (this.between('neighbour', 'burst')) this.showNeighbour();
      else if (this.between('universe', 'farewell')) this.showUniverse();
      return;
    }
    if (this.allows('flight')) {
      if (state.flight) {
        if (step === 'flight' || step === 'voyage') fitRoute(object(state.flight.target), {wholeRoute:true});
      } else if (this.between('blackhole', 'collector')) this.showGalaxy();
      else if (this.between('center', 'holecard')) this.showCenter();
      return;
    }
    if (!this.allows('destination') || !this.canChoose()) {
      centerOnSun();
      return;
    }
    const points = ['sol', this.firstTarget].map(id => MapLayout.project(object(id)));
    fitCameraPoints(points, routeViewport(true), SOLAR_CAMERA_SPAN);
  },
  canChoose() {
    return !state.flight && state.current !== this.firstTarget && !state.itinerary.length;
  },
  goal(f) {
    return f.requestedTarget || f.target;
  },
  atCenter() {
    return !state.flight && !!state.current && state.visited.includes(this.farTarget) &&
      distance(state.ship, object(this.farTarget)) < this.centerRadius;
  },
  atGalaxy() {
    return !state.flight && !!state.current && state.visited.includes(this.galaxyTarget) &&
      distance(state.ship, object(this.galaxyTarget)) < this.galaxyRadius;
  },
  targetId() {
    const step = state.tutorialStep;
    if (step === 'destination') return this.canChoose() ? this.firstTarget : null;
    if (step === 'blackhole')
      return !state.flight && !state.itinerary.length && state.current === this.firstTarget ? this.farTarget : null;
    if (step === 'neighbour') return !state.itinerary.length && this.atCenter() ? this.galaxyTarget : null;
    return null;
  },
  target(o) {
    return !!o && o.id === this.targetId();
  },
  mapTarget() {
    const o = object(this.targetId());
    return o ? {object: o, name: MapDetails.mapLabelName(o) || o.name, p: screen(o)} : null;
  },
  mapTargetPoint() {
    const id = this.targetId();
    if (id) return screen(object(id));
  },
  choose(o) {
    if (!this.target(o)) return false;
    if (o.id !== this.firstTarget) {
      const light = o.id === this.galaxyTarget;
      state.flightSetup = FlightSetup.normalize({
        ...FlightSetup.preferred(), engine: true, dump: false, sail: light, collector: light, burst: false,
      });
    }
    this.setStep(o.id === this.firstTarget ? 'propulsion' : o.id === this.farTarget ? 'sail' : 'supernova');
    return true;
  },
  setup(s = state) {
    const step = s.tutorialStep;
    if ((step === 'propulsion' || step === 'launch') && s.selected === this.firstTarget)
      return {...FlightSetup.defaults(s), sail: false, collector: false};
    const source = s.planningSource || object(s.current), used = new Set(s.destroyed);
    if (this.between('neighbour', 'burst', step)) return FlightSetup.resolve(FlightSetup.preferred(s), source, used);
    if (!this.between('star', 'collector', step)) return null;
    return {...FlightSetup.resolve(FlightSetup.preferred(s), source, used), burst: false};
  },
  guided(f) {
    const step = state.tutorialStep;
    return (step === 'flight' && this.goal(f) === this.firstTarget) || (step === 'voyage' && this.goal(f) === this.farTarget) ||
      (step === 'crossing' && this.goal(f) === this.galaxyTarget);
  },
  launched(f) {
    const step = state.tutorialStep;
    if (step === 'launch' && this.goal(f) === this.firstTarget) this.setStep('flight');
    else if (step === 'collector' && this.goal(f) === this.farTarget) this.setStep('voyage');
    else if (step === 'burst' && this.goal(f) === this.galaxyTarget) this.setStep('crossing');
    else if (this.allows('star') && step) this.setStep(null);
  },
  cancelled() {
    const step = state.tutorialStep;
    if (step === 'flight')
      this.setStep(state.selected === this.firstTarget && this.canChoose() ? 'launch' : 'destination');
    else if (step === 'voyage')
      this.setStep(state.current !== this.firstTarget ? null : state.selected === this.farTarget ? 'sail' : 'blackhole');
    else if (step === 'crossing')
      this.setStep(!this.atCenter() ? null : state.selected === this.galaxyTarget ? 'supernova' : 'neighbour');
  },
  sync() {
    const step = state.tutorialStep;
    let next = step;
    if (step === 'flight' && !state.flight && state.current === this.firstTarget) next = 'star';
    else if ((step === 'sail' || step === 'collector') && !state.flight && state.selected === this.farTarget) {
      const setup = FlightSetup.read();
      next = setup.sail && setup.collector ? 'collector' : 'sail';
    } else if (step === 'voyage' && this.atCenter()) next = 'braking';
    else if ((step === 'supernova' || step === 'burst') && !state.flight && state.selected === this.galaxyTarget)
      next = FlightSetup.read().burst ? 'burst' : 'supernova';
    else if (step === 'crossing' && this.atGalaxy()) next = 'arrival';
    if (next === step) return;
    this.setStep(next);
    persist();
  },
  hostStar() {
    return typeof NuclearStars === 'undefined' ? null : NuclearStars.rows.find(q => q.id === state.current) || null;
  },
  fastestStar() {
    return typeof NuclearStars === 'undefined' ? null : NuclearStars.rows.filter(q => q.e < 1)
      .reduce((a, q) => !a || NuclearStars.period(q) < NuclearStars.period(a) ? q : a, null);
  },
  arrivalStar(host, destroyed) {
    if (host?.id !== this.farTarget || !this.parks()) return null;
    const star = object(this.fastestStar()?.id);
    return star && ![...destroyed].includes(star.id) ? star : null;
  },
  plural(n, one, few, many) {
    const unit = n % 10, rest = n % 100;
    return unit === 1 && rest !== 11 ? one : unit > 1 && unit < 5 && (rest < 10 || rest > 20) ? few : many;
  },
  yearsText(years) {
    const n = Math.round(years);
    return n + ' ' + this.plural(n, 'год', 'года', 'лет');
  },
  objectCount() {
    const n = (typeof ExtendedCatalog === 'undefined' ? 0 : ExtendedCatalog.total) + (globalThis.Exoplanets?.newCount || 0);
    return n > 0 ? n.toLocaleString('ru-RU') + ' ' + this.plural(n, 'объект', 'объекта', 'объектов') : '';
  },
  starName(id) {
    const o = object(id);
    return o ? MapDetails.mapLabelName(o) || o.name : '';
  },
  universeRadius() {
    return UniverseMap.radius * Cosmology.scale();
  },
  flightLimit() {
    const q = ReachDisplay.ship(), radius = q && ReachDisplay.section(q).radius;
    return radius > 0 ? {radius, text: distanceText(q.radius)} : null;
  },
  circleSpot(step) {
    const angle = -0.6, limit = step === 'reach' && this.flightLimit(),
      center = limit ? state.ship : {x: 0, y: 0}, radius = limit ? limit.radius : this.universeRadius();
    return {x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle)};
  },
  chosenQuest() {
    return Quests.quest(Quests.store().active.at(-1))?.title || '';
  },
  galleryLead(o) {
    const first = o.id === this.firstTarget && this.between('star', 'card'),
      far = o.id === this.farTarget && this.between('hole', 'holecard');
    return first || far ? this.leadPhotos[o.id] : null;
  },
  marksDistance() {
    return ['propulsion', 'sail', 'supernova'].includes(state.tutorialStep);
  },
  opensCard(o) {
    return this.between('hole', 'holecard') && !state.flight && o?.id === this.farTarget;
  },
  cardReady() {
    return state.tutorialStep === 'hole' && this.opensCard(object(state.selected)) && !$('objectCardBtn').hidden;
  },
  cardOpened(o) {
    const step = state.tutorialStep,
      next = step === 'star' && o.id === this.firstTarget ? 'card' : step === 'hole' && o.id === this.farTarget ? 'holecard' : null;
    if (!next) return;
    this.setStep(next);
    persist();
    renderUI();
  },
  dialogClosed() {
    if (state.tutorialStep === 'card') this.go('blackhole');
    else if (state.tutorialStep === 'holecard') this.go('neighbour');
  },
  legend: [
    ['Звёзды', 22, '<circle r="4" stroke-width=".8"/><circle class="solid" r="1.5"/><path stroke-width=".7" d="M-9 0H-6M6 0H9M0-9V-6M0 6V9"/>'],
    ['Чёрные дыры', 22, '<circle r="8" stroke-width=".8"/><circle class="solid" r="4"/><ellipse rx="17" ry="4" stroke-width="1.25" transform="rotate(-17.2)"/>'],
    ['Пульсары и квазары', 38, '<circle r="5"/><circle r="10" stroke-width=".5"/><path stroke-width=".8" d="M-5 18L5-18M-8 18H0M0-18H8"/>'],
    ['Туманности', 22, '<path d="M-4.8 .6C-5.3-2-2.8-4 .2-3.2M2.7-2.7C5-1.9 5.3 .8 3.4 2.2M1.3 3.2C-1.4 4.4-4 2.9-3.5 1.5M-1.8 .5C-1.1-1.7 1.3-1.3 1.7 .5"/>'],
    ['Звёздные скопления', 22, '<circle class="solid" r="1.6"/>'],
    ['Галактики', 22, '<circle r="1.5" stroke-width=".9"/>'],
    ['Скопления галактик', 22, '<circle r="9" stroke-width=".7" stroke-dasharray="7 3 1 3"/><circle r="1.2" stroke-width=".7"/>'],
    ['Галактические нити', 22, '<path stroke-width=".7" d="M13.9 9L14.4 6.1L16 3L14.8 2.2L13.9 0L14.2-3.8L13.8-4.2L11.3-3.6L9.9-3.9L5-9L3.9-9L.2-6.5L-3.5-3.6L-7.6 .8L-16 2.1"/>'],
  ],
  galaxyMark() {
    if (this.galaxyGlyph) return this.galaxyGlyph;
    const o = object(this.galaxyTarget), model = o?.galaxy && typeof MapGeometry !== 'undefined' && MapGeometry.model(o);
    if (!(model?.radius > 0)) return null;
    const tolerance = model.radius / 80, outline = MapGeometry.projected(o, {tolerance, steps: 48}).paths,
      arms = GalaxyStructure.projected(o, {tolerance}), points = outline.flatMap(path => path.points),
      scale = 16 / Math.max(...points.map(q => Math.abs(q.x))),
      size = 2 * Math.ceil(Math.max(...points.map(q => Math.abs(q.y))) * scale + 1.5),
      at = v => String(Math.round(v * scale * 10) / 10),
      d = paths => paths.map(path => 'M' + path.points.map(q => at(q.x) + ' ' + at(q.y)).join('L') + (path.closed ? 'Z' : '')).join('');
    return this.galaxyGlyph = [size, '<path stroke-width=".9" stroke-dasharray="3 5" d="' + d(outline) + '"/><path stroke-width=".6" d="' + d(arms) + '"/>'];
  },
  legendFigure() {
    return '<ul class="tutorial-legend" style="--rows:' + Math.ceil(this.legend.length / 2) + '">' + this.legend.map(([name, height, mark]) => {
      const [size, glyph] = name === 'Галактики' && this.galaxyMark() || [height, mark];
      return '<li><svg viewBox="-19 ' + -size / 2 + ' 38 ' + size + '" width="38" height="' + size + '" aria-hidden="true">' + glyph +
        '</svg><span>' + name + '</span></li>';
    }).join('') + '</ul>';
  },
  icons: {quests: ['quest-icon', 'кнопка «Квесты»'], library: ['library-icon', 'кнопка «Бортовая библиотека»']},
  iconMark(name) {
    const [icon, label] = this.icons[name];
    return '<span class="tutorial-icon" role="img" aria-label="' + label + '"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#' + icon + '"/></svg></span>';
  },
  paragraph(line) {
    return '<p>' + SkyGuide.escape(line).replace(/\{(\w+)\}/g, (token, name) => this.icons[name] ? this.iconMark(name) : token) + '</p>';
  },
  recommends(id) {
    return state.tutorialStep === 'quests' && id === Quests.starterId;
  },
  brakingFigure() {
    const gas = Array.from({length: 15}, (_, i) =>
      '<rect x="65" y="' + ((i % 5) - 2) * 10 + '" width="1.6" height="1.6" style="animation-delay:-' +
      (i / 15).toFixed(3) + 's"/>').join('');
    return '<figure class="tutorial-figure" role="img" aria-label="Торможение: парус позади корабля ловит встречный газ, двигатель даёт обратную тягу">' +
      '<svg viewBox="-62 -40 136 80" aria-hidden="true">' +
      '<path class="tutorial-brake-field" d="M-22 34.9A28 35 0 1 1 -21.6 -34.9"/>' +
      '<g class="tutorial-brake-gas">' + gas + '</g>' +
      '<path class="tutorial-brake-tether" d="M-4 0L-30 -21M-4 0L-30 21M-4 0L-42 0"/>' +
      '<path class="tutorial-brake-sail" d="M-30 -21Q-54 0 -30 21"/>' +
      '<path class="tutorial-brake-hull" d="M11 0L-3 -4L0 0L-3 4Z"/>' +
      '<path class="tutorial-brake-plume" d="M13 -2L23 0M13 2L23 0"/>' +
      '</svg></figure>';
  },
  gasDensityText() {
    const n = FlightSetup.preferred().densityCm3, whole = Number.isInteger(n),
      one = whole && n % 10 === 1 && n % 100 !== 11;
    return fmt(n, whole ? 0 : 2) + (one ? ' атом' : whole && (n % 10 === 0 || n % 10 > 4 || (n % 100 > 10 && n % 100 < 15)) ? ' атомов' : ' атома') +
      ' на кубический сантиметр';
  },
  lessons: {
    welcome: {
      title: 'Добро пожаловать на «Ковчег»',
      text: () => '«Ковчег» — межзвёздный корабль. На нём можно долететь до соседней звезды или пересечь всю Вселенную.\n' +
        (OrbitalMotion.onEarth(state) ? 'Экспедиция стартует с Земли. ' : '') +
        'Обучение покажет приборы корабля и поможет проложить первый курс.',
    },
    time: {
      title: 'Темп времени', anchor: 'timeControls',
      text: 'Регулятор задаёт ход времени. При 1× год на борту проходит за секунду, при 0,1× — за десять секунд. Отметка 0 ставит время на паузу.\nПопробуйте переключить темп.',
    },
    clocks: {
      title: 'Часы экспедиции', anchor: 'tutorialClocks',
      text: () => 'Время на корабле — год по бортовым часам.\nВремя наблюдателя — год по часам тех, кто остался на Земле.\nВозраст Вселенной — время от Большого взрыва: на старте ' + compact(INITIAL_UNIVERSE_AGE) + ' лет.',
    },
    zoom: {
      title: 'Масштаб карты', anchor: 'zoomControls',
      text: 'Выберите отметку «Звёзды», чтобы увидеть соседей Солнца. Колесо мыши меняет масштаб плавно.\nЛинейка слева внизу показывает размер клетки сетки.',
    },
    mass: {
      title: 'Масса корабля', anchor: 'massReading',
      text: 'Масса корпуса «Ковчега» — всего 1 кг. Ещё 1 кг на старте — топливо в баке: фотонный двигатель тратит его на разгон и торможение.',
    },
    acceleration: {
      title: 'Ускорение', anchor: 'accelerationReading',
      text: () => 'Шкала показывает ускорение, которое ощущается на борту. Вправо от нуля — разгон до ' + $('accelerationMax').textContent + ', влево — торможение до ' + $('accelerationMin').textContent + '.\nОдин g равен ускорению свободного падения на Земле.',
    },
    velocity: {
      title: 'Скорость', anchor: 'velocityReading',
      text: 'Скорость «Ковчега» показана в процентах от скорости света (c). Достичь скорости света корабль не может. Шкала логарифмическая: каждое деление добавляет ещё одну девятку.',
    },
    dilation: {
      title: 'Замедление времени', anchor: 'timeDilationRow',
      text: 'Пока корабль стоит, часы на борту и на Земле идут с одинаковой скоростью. Чем ближе скорость к световой, тем медленнее идут бортовые часы.\nШкала показывает, сколько лет проходит на Земле за один год на корабле.',
    },
    destination: {
      title: 'Выберите цель',
      text: 'Первая цель — Альфа Центавра A, главная звезда ближайшей к Солнцу звёздной системы. Нажмите на неё.',
    },
    propulsion: {
      title: 'Расстояние и время в пути', anchor: 'arrivalEstimate',
      text: () => QuickFlight.issueReason ||
        'До Альфы Центавра ' + $('targetDistance').textContent + '. Световой год — путь, который свет проходит за год.\n' +
        '«Ковчег» будет в пути ' + $('arrivalProper').textContent + ' по бортовым часам и ' +
        $('arrivalEarth').textContent + ' по часам на Земле: в полёте бортовые часы отстают.',
    },
    launch: {
      title: 'Полёт к Альфе Центавра', anchor: 'launchBtn',
      text: () => 'Нажмите «Лететь» в карточке звезды. Следите за картой и приборами: в полёте меняются скорость, масса и ход часов.' +
        ExpeditionTutorial.tempoText(),
    },
    flight: {
      title: 'Учебный перелёт завершён', anchor: 'arrivalEstimate',
      text: 'Теперь можно завершить обучение и продолжить экспедицию.',
    },
    star: {
      title: 'Первый межзвёздный перелёт', anchor: 'objectCardBtn',
      text: () => 'Первый межзвёздный перелёт завершён: «Ковчег» на орбите Альфы Центавра A.\n' +
        'Под названием звезды стоит краткая справка: «' + $('targetType').textContent + '». Жёлтый карлик — звезда того же типа, что и Солнце. ' +
        'Буква A обозначает главную из трёх звёзд системы: рядом с ней обращается Альфа Центавра B, намного дальше — Проксима.\n' +
        'Кнопка «Карточка объекта» открывает полную карточку звезды. Нажмите её.',
    },
    blackhole: {
      title: 'Выберите цель',
      text: () => 'Следующая цель намного дальше — Стрелец A*, сверхмассивная чёрная дыра в центре Млечного Пути, нашей Галактики. Её масса — ' +
        fmt(MapDetails.mass(object(ExpeditionTutorial.farTarget)) / 1e6, 1) + ' млн масс Солнца.\n' +
        'Выберите её на карте.',
    },
    sail: {
      title: 'Расстояние до цели', anchor: 'arrivalEstimate',
      text: () => {
        const setup = FlightSetup.read();
        if (setup.sail && !setup.collector)
          return 'Парус раскрыт, но рассеянного света звезды для разгона мало. Включите «Коллектор»: он соберёт свет в луч.';
        return 'До Стрельца A* ' + $('targetDistance').textContent + '. Только на тяге двигателя перелёт займёт ' +
          $('arrivalProper').textContent + ' по бортовым часам.\n' +
          'С фотонным парусом «Ковчег» долетит намного быстрее: ' +
          (FlightSetup.mobile() ? 'подключите парус и коллектор.' : 'включите «Парус» и «Коллектор» в карточке цели.');
      },
    },
    collector: {
      title: 'Парус и коллектор', anchor: 'launchBtn',
      text: () => 'Коллектор — зеркало возле звезды. Оно собирает её свет в узкий луч и направляет на парус «Ковчега». ' +
        'У фотонов нет массы, но есть импульс: отражаясь от паруса, они толкают корабль.\n' +
        'С лучом «Ковчег» разгонится до ' + $('quickSpeed').textContent + ' и пройдёт путь почти наравне со светом — за ' +
        $('arrivalEarth').textContent + ' по часам наблюдателя. На борту из-за замедления времени пройдёт всего ' +
        $('arrivalProper').textContent + '.\n' +
        'Устройство корабля описано в библиотеке — кнопка {library}. ' +
        '«Подробный план» открывает точную настройку полёта.\n' +
        'Нажмите «Лететь».' + ExpeditionTutorial.tempoText(),
    },
    voyage: {
      title: 'Учебный перелёт завершён', anchor: 'arrivalEstimate',
      text: 'Теперь можно завершить обучение и продолжить экспедицию.',
    },
    braking: {
      title: 'Как тормозит «Ковчег»',
      text: () => {
        const host = ExpeditionTutorial.hostStar();
        return '«Ковчег» в центре Млечного Пути' +
          (host ? ': он остановился у ' + host.name + ', одной из звёзд возле Стрельца A*' : ', рядом со Стрельцом A*') +
          '. Перед остановкой корабль выглядел на карте так:\n{figure}\n' +
          'Во время торможения парус собирает встречный межзвёздный газ и пыль. Вещества очень мало — в игре принят ' +
          ExpeditionTutorial.gasDensityText() + ', — но на околосветовой скорости даже оно заметно замедляет корабль.\n' +
          'Собранное вещество попадает в бак. Остаток скорости гасит фотонный двигатель. Он работает так же, как при разгоне ' +
          'на старте: целиком превращает вещество в свет по формуле E = mc². Только тяга теперь направлена против хода.';
      },
    },
    center: {
      title: 'Звёзды у чёрной дыры',
      text: () => {
        const rows = typeof NuclearStars === 'undefined' ? [] : NuclearStars.rows,
          host = ExpeditionTutorial.hostStar(), fastest = ExpeditionTutorial.fastestStar();
        return (rows.length ? 'Пунктирные линии — пути звёзд вокруг Стрельца A*. На карте ' + rows.length +
            ' звёзд с измеренными траекториями. ' : '') +
          (host?.e < 1 ? '«Ковчег» стоит у ' + host.name + ': она обходит чёрную дыру за ' +
            ExpeditionTutorial.yearsText(NuclearStars.period(host)) + (host === fastest ? ' — быстрее остальных' : '') + '.' : '') + '\n' +
          'Рядом с чёрной дырой время идёт медленнее из-за её гравитации. Когда звезда S2 проходит ближайшую к чёрной дыре точку орбиты, ' +
          'её часы отстают примерно на минуту в сутки: сказываются гравитация чёрной дыры и скорость самой звезды. ' +
          'Это измерили по покраснению света звезды.';
      },
    },
    hole: {
      title: 'Стрелец A*',
      text: () => 'В центре всех орбит — Стрелец A*. Его массу, ' +
        fmt(MapDetails.mass(object(ExpeditionTutorial.farTarget)) / 1e6, 1) +
        ' млн масс Солнца, определили по движению этих звёзд: все они обращаются вокруг одной точки.' +
        (ExpeditionTutorial.cardReady() ? '\nКнопка «Карточка объекта» открывает полную карточку чёрной дыры. Нажмите её.' : ''),
    },
    holecard: {title: 'Стрелец A*', text: ''},
    neighbour: {
      title: 'Выберите цель',
      text: 'Дальше — другая галактика. Андромеда — ближайшая к Млечному Пути крупная галактика. Выберите её на карте.',
    },
    supernova: {
      title: 'Расстояние до цели', anchor: 'arrivalEstimate',
      text: () => {
        const setup = FlightSetup.read(), light = setup.sail && setup.collector,
          time = QuickFlight.issueReason ? '' : (light ? ' С парусом и коллектором перелёт займёт ' : ' Сейчас перелёт займёт ') +
            $('arrivalProper').textContent + ' по бортовым часам.';
        return 'До Андромеды ' + $('targetDistance').textContent + '.' + time + '\n' +
          'Намного сильнее разгоняет вспышка сверхновой. ' +
          (FlightSetup.mobile() ? 'Включите её.' : 'Включите «Сверхновая» в карточке цели.');
      },
    },
    burst: {
      title: 'Взрыв сверхновой', anchor: 'launchBtn',
      text: () => {
        const setup = FlightSetup.read(), suns = setup.burstLuminosityW / Astro.solarLuminosity,
          star = ExpeditionTutorial.starName(state.current);
        return 'Сверхновая — взрыв звезды, у которой стоит «Ковчег». Вспышка ' + fmt(setup.burstDays, 0) + ' суток светит как ' +
          fmt(Math.round(suns / 1e8) * 100, 0) + ' млн Солнц. Коллектор направляет этот свет на парус: чем ярче свет, тем сильнее он толкает корабль.\n' +
          'Со вспышкой «Ковчег» разгонится до ' + $('quickSpeed').textContent + '. Перелёт займёт ' + $('arrivalProper').textContent +
          ' по бортовым часам и ' + $('arrivalEarth').textContent + ' по часам наблюдателя.' +
          (star ? ' Звезда ' + star + ' будет уничтожена.' : '') + '\n' +
          'Нажмите «Лететь».' + ExpeditionTutorial.tempoText();
      },
    },
    crossing: {
      title: 'Учебный перелёт завершён', anchor: 'arrivalEstimate',
      text: 'Теперь можно завершить обучение и продолжить экспедицию.',
    },
    arrival: {
      title: 'Перелёт к Андромеде', anchor: 'arrivalEstimate',
      text: () => {
        const trip = state.lastArrival;
        return 'Перелёт завершён: «Ковчег» в Андромеде, на орбите одной из её звёзд.' +
          (trip ? '\nВ пути прошло ' + durationText(trip.proper) + ' по бортовым часам и ' + durationText(trip.earth) +
            ' по часам наблюдателя. Эти числа показаны в карточке, в строке «Время в пути».' : '');
      },
    },
    universe: {
      title: 'Вся Вселенная',
      text: () => 'Карта показывает всю наблюдаемую Вселенную — шар радиусом ' + distanceText(ExpeditionTutorial.universeRadius()) +
        '. Млечный Путь и Андромеда на этом масштабе сливаются в одну точку в центре.\n' +
        'Вселенная расширяется, и далёкие галактики удаляются от нас. Поэтому долететь можно не до всего, что видно на карте.',
    },
    reach: {
      title: 'Предел полёта',
      text: () => {
        const limit = ExpeditionTutorial.flightLimit();
        return 'Чем дальше галактика, тем быстрее она удаляется. Самые далёкие «Ковчег» не догонит никогда, даже на скорости, близкой к световой.\n' +
          (limit ? 'Граница достижимого отмечена на карте штрихпунктирной окружностью вокруг корабля с подписью «Предел полёта». Сейчас её радиус — ' + limit.text + '.'
            : 'Расширение Вселенной сейчас выключено в настройках, поэтому границы достижимого на карте нет.');
      },
    },
    objects: {
      title: 'Объекты на карте',
      text: () => {
        const count = ExpeditionTutorial.objectCount();
        return (count ? 'В базе «Ковчега» ' + count + '. ' : '') + 'На карте они обозначены так:\n{legend}';
      },
    },
    search: {
      title: 'Поиск',
      text: 'Поиск находит объект по названию или обозначению в каталоге — например, «Сириус» или «M31».',
    },
    filters: {
      title: 'Фильтры',
      text: 'Фильтры определяют, что показано на карте: классы объектов, тематические подборки и отдельные каталоги.',
    },
    follow: {
      title: 'Слежение за кораблём',
      text: 'Эта кнопка возвращает карту к «Ковчегу» и включает слежение: карта движется вместе с кораблём.',
    },
    theme: {
      title: 'Тема оформления',
      text: 'Здесь выбирают цветовую схему карты и приборов.',
    },
    library: {
      title: 'Бортовая библиотека',
      text: 'В библиотеке описано, как летает «Ковчег», как устроена карта и откуда взяты данные. Здесь же — маршрут и журнал экспедиции.',
    },
    restart: {
      title: 'Новая экспедиция',
      text: 'Эта кнопка начинает экспедицию заново, от Солнца. Текущий прогресс при этом сбрасывается.',
    },
    settings: {
      title: 'Настройки',
      text: 'В настройках выбирают проекцию карты, включают мультиплеер и расширение Вселенной. Здесь же можно заново пройти обучение.',
    },
    zen: {
      title: 'Режим дзен',
      text: 'Режим дзен убирает с экрана приборы и панели: остаётся только карта. Выйти из него можно той же кнопкой.',
    },
    quests: {
      title: () => Quests.isOpen ? 'Выберите квест' : 'Квесты',
      text: () => {
        if (!Quests.isOpen) return 'Вселенная огромна. Выбрать, куда лететь, помогут квесты: каждый квест — путешествие по интересным объектам с рассказом о них.';
        const quest = Quests.quest(Quests.view);
        return 'Рекомендуем начать с квеста «' + Quests.quest(Quests.starterId).title + '» и расширять знание о Вселенной постепенно.\n' +
          (quest && !Quests.locked(quest) ? 'Чтобы выбрать этот квест, нажмите «Начать квест».' : 'Выберите квест в списке и нажмите «Начать квест».') +
          ' Либо выберите свободный полёт.';
      },
    },
    farewell: {
      title: 'Экспедиция начинается',
      text: () => {
        const quest = ExpeditionTutorial.chosenQuest();
        return (quest ? 'Квест «' + quest + '» начат. Его цели отмечены на карте флажками.'
            : 'Вы выбрали свободный полёт. Квесты можно открыть в любой момент кнопкой {quests}.') + '\n' +
          'Обучение пройдено, «Ковчег» в вашем распоряжении. Выбирайте цель на карте и нажимайте «Лететь».\n' +
          'Счастливого пути!';
      },
    },
  },
  flightSeconds() {
    const years = FlightEstimate.get()?.proper;
    if (!(years > 0) || !Number.isFinite(years)) return '';
    const n = Math.max(1, Math.round(years));
    return 'около ' + n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'секунды' : 'секунд');
  },
  tempoText() {
    const seconds = this.flightSeconds();
    return seconds ? (speed === 1 ? ' При темпе 1× перелёт займёт ' : ' Выберите темп 1× — тогда перелёт займёт ') + seconds + '.' : '';
  },
  union(...rects) {
    return {
      left: Math.min(...rects.map(r => r.left)), right: Math.max(...rects.map(r => r.right)),
      top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)),
    };
  },
  mapAnchor(p) {
    const origin = canvas.getBoundingClientRect(), limit = cameraViewportHeight();
    const x = origin.left + clamp(p.x, 0, width), y = origin.top + clamp(p.y, 0, limit);
    return {
      offscreen: p.x < 0 || p.x > width || p.y < 0 || p.y > limit,
      anchor: {left:x - 9, right:x + 9, top:y - 9, bottom:y + 9},
    };
  },
  render() {
    this.tracked = null;
    this.sync();
    this.followApproach();
    this.layout();
    const step = state.tutorialStep, card = $('tutorialCard');
    const hideCard = !step || step === 'card' || step === 'holecard' ||
      ((step === 'flight' || step === 'voyage' || step === 'crossing') && !!state.flight);
    UIPatch.set(card, 'hidden', hideCard);
    if (hideCard) return;
    const lesson = this.lessons[step];
    let body = typeof lesson.text === 'function' ? lesson.text() : lesson.text;
    let action = 'Далее', alt = '', waiting = false, library = '', spotOn = null;
    let anchor = lesson.anchor && $(lesson.anchor).getBoundingClientRect();
    let sides = ['above', 'below', 'right', 'left'], frame;
    const ready = step === 'hole' && this.cardReady();
    if (step === 'welcome') {
      action = 'Начать обучение';
      UIPatch.style(card, 'left', '');
      UIPatch.style(card, 'top', '');
    } else if (step === 'time' || step === 'zoom') {
      sides = ['right', 'below', 'above', 'left'];
    } else if (step === 'destination' || step === 'blackhole' || step === 'neighbour') {
      spotOn = object(step === 'destination' ? this.firstTarget : step === 'blackhole' ? this.farTarget : this.galaxyTarget);
      const spot = this.mapAnchor(screen(spotOn));
      anchor = spot.anchor;
      waiting = spot.offscreen && !!cameraGoal;
      if (step !== 'destination') sides = ['above', 'left', 'below', 'right'];
      if (this.targetId()) {
        action = spot.offscreen ? 'Показать на карте' : '';
      } else {
        waiting = false;
        body = 'Чтобы отправиться к звезде, выберите её на карте и нажмите «Лететь» в карточке. Теперь можно продолжить экспедицию.';
        action = 'Готово';
        spotOn = null;
        anchor = {left:width / 2, right:width / 2, top:height / 2, bottom:height / 2};
      }
    } else if (this.between('braking', 'hole') && !ready) {
      spotOn = step === 'braking' ? state.ship : object(this.farTarget);
      anchor = this.mapAnchor(screen(spotOn)).anchor;
      sides = ['left', 'right', 'above', 'below'];
      if (step === 'braking') action = 'Перейти к изучению чёрной дыры';
      if (step === 'hole') action = 'Открыть карточку чёрной дыры';
      waiting = step === 'center' && !!this.approach;
    } else if (step === 'universe' || step === 'reach') {
      spotOn = this.circleSpot(step);
      anchor = this.mapAnchor(screen(spotOn)).anchor;
      sides = ['right', 'left', 'above', 'below'];
      waiting = step === 'universe' && this.gliding();
    } else if (step === 'objects' || step === 'farewell') {
      const origin = canvas.getBoundingClientRect(), hud = document.querySelector('.telemetry')?.getBoundingClientRect(),
        x = origin.left + width / 2, y = hud?.height > 0 ? hud.top : origin.top + cameraViewportHeight();
      anchor = {left: x, right: x, top: y, bottom: y};
      sides = ['above'];
      if (step === 'farewell') action = 'Начать экспедицию';
    } else if (this.tour[step]) {
      anchor = $(this.tour[step]).getBoundingClientRect();
      sides = ['below', 'left', 'right', 'above'];
      if (step === 'quests') action = 'Открыть квесты';
      if (step === 'quests' && Quests.isOpen) {
        const quest = Quests.quest(Quests.view),
          mark = $('questsBody').querySelector(quest && !Quests.locked(quest) ? '[data-quest-start]' : '[data-quest-open="' + Quests.starterId + '"]')?.getBoundingClientRect();
        frame = $('quests').getBoundingClientRect();
        anchor = mark?.height > 0 ? mark : frame;
        sides = ['right', 'below', 'above', 'left'];
        action = '';
        alt = 'Свободный полёт';
      }
    } else if (this.allows('propulsion')) {
      sides = ['left', 'above', 'below', 'right'];
      frame = $('flightCard').getBoundingClientRect();
      if (step === 'flight' || step === 'voyage' || step === 'crossing') action = 'Завершить обучение';
      if (step === 'star' || ready) action = '';
      if (ready) anchor = $('objectCardBtn').getBoundingClientRect();
      if (step === 'propulsion' || step === 'sail' || step === 'supernova')
        anchor = this.union($('distanceRow').getBoundingClientRect(), anchor);
      if (step === 'sail') {
        action = FlightSetup.mobile() ? 'Подключить парус и коллектор' : '';
        UIPatch.set($('launchBtn'), 'disabled', true);
      }
      if (step === 'supernova') {
        const issue = this.burstIssue();
        action = issue ? 'Завершить обучение' : FlightSetup.mobile() ? 'Включить сверхновую' : '';
        if (issue) body = issue + ' Завершите обучение, чтобы вернуться к планированию.';
        UIPatch.set($('launchBtn'), 'disabled', true);
      }
      if (step === 'launch' || step === 'collector' || step === 'burst') {
        const blocked = this.blocked(step);
        action = !blocked ? '' : step === 'launch' ? 'Готово' : 'Завершить обучение';
        if (blocked) body = QuickFlight.issueReason || 'Для этого перелёта сейчас не хватает топлива. Завершите обучение, чтобы вернуться к планированию.';
        if (!blocked && step !== 'launch') library = step === 'burst' ? 'Сверхновая в библиотеке' : 'Как летает «' + SHIP_NAME + '»';
      }
    }
    UIContent.text($('tutorialTitle'), typeof lesson.title === 'function' ? lesson.title() : lesson.title);
    UIContent.html($('tutorialText'), body.split('\n').map(line =>
      line === '{figure}' ? this.brakingFigure() : line === '{legend}' ? this.legendFigure() : this.paragraph(line)).join(''));
    const next = $('tutorialNext'), shortcut = !!action;
    UIContent.text(next, shortcut ? action + ' [Пробел]' : action);
    UIPatch.set(next, 'ariaKeyShortcuts', shortcut ? 'Space' : null);
    UIPatch.set(next, 'hidden', !action);
    UIContent.text($('tutorialAlt'), alt);
    UIPatch.set($('tutorialAlt'), 'hidden', !alt);
    UIPatch.set($('skipTutorial'), 'hidden', step !== 'welcome');
    UIContent.text($('tutorialLibraryLabel'), library);
    UIPatch.set($('tutorialLibrary'), 'hidden', !library);
    UIPatch.style(card, 'visibility', waiting ? 'hidden' : '');
    this.tracked = spotOn && !waiting ? {spot: spotOn, sides, x: NaN, y: NaN} : null;
    if (this.tracked) this.follow();
    else if (anchor && !waiting) this.place(card, anchor, sides, frame);
  },
  follow() {
    const t = this.tracked;
    if (!t || !state.tutorialStep) return;
    const p = screen(t.spot);
    if (Math.abs(p.x - t.x) < .25 && Math.abs(p.y - t.y) < .25) return;
    t.x = p.x;
    t.y = p.y;
    this.place($('tutorialCard'), this.mapAnchor(p).anchor, t.sides);
  },
  place(card, anchor, sides, frame = anchor) {
    const box = card.getBoundingClientRect(), gap = 26, pad = width < 700 ? 10 : 24;
    const hud = document.querySelector('.telemetry')?.getBoundingClientRect();
    const floor = hud?.height > 0 && frame.bottom <= hud.top ? hud.top : height;
    const room = {
      right: width - frame.right - box.width, left: frame.left - box.width,
      below: floor - frame.bottom - box.height, above: frame.top - box.height,
    };
    const rail = document.querySelector('.map-rails')?.getBoundingClientRect();
    const cx = (anchor.left + anchor.right) / 2, cy = (anchor.top + anchor.bottom) / 2;
    const spot = side => {
      const vertical = side === 'above' || side === 'below';
      const x = vertical ? cx - box.width / 2 : side === 'right' ? frame.right + gap : frame.left - gap - box.width;
      const y = !vertical ? cy - box.height / 2 : side === 'below' ? frame.bottom + gap : frame.top - gap - box.height;
      let left = clamp(x, pad, width - box.width - pad);
      const top = clamp(y, pad, floor - box.height - pad);
      const blocked = () => rail?.width > 0 && left < rail.right + 12 && left + box.width > rail.left &&
        top < rail.bottom + 8 && top + box.height > rail.top;
      const aside = rail && rail.right + 12;
      if (vertical && blocked() && cx - aside >= 12 && aside + box.width <= width - pad) left = aside;
      return {side, vertical, left, top, clear: !blocked()};
    };
    const fits = sides.filter(s => room[s] >= gap + pad).map(spot);
    const {side, vertical, left, top} = fits.find(s => s.clear) || fits[0] ||
      spot(sides.reduce((a,b) => room[b] > room[a] ? b : a));
    if (card.dataset.side !== side) card.dataset.side = side;
    UIPatch.style(card, 'left', Math.round(left) + 'px');
    UIPatch.style(card, 'top', Math.round(top) + 'px');
    const arrow = $('tutorialPointer');
    UIPatch.style(arrow, 'left', vertical ? clamp(cx - left, 12, box.width - 12) + 'px' : '');
    UIPatch.style(arrow, 'top', vertical ? '' : clamp(cy - top, 12, box.height - 12) + 'px');
    UIPatch.style(arrow, 'width', side === 'left' ? Math.max(1, anchor.left - left - box.width - 8) + 'px'
      : side === 'right' && frame !== anchor ? Math.max(1, left - anchor.right - 8) + 'px' : '');
  },
};

// Only tips about explicit user actions can be learned; explanations keep their display cap.
const FlightTips = {
  minimumFlightSeconds: 20,
  startDelaySeconds: 4,
  arrivalSeconds: 4,
  minimumReadingSeconds: 10,
  maximumShows: 2,
  engineAdviceSeconds: 60,
  solarHorizonText: 'Корабль пересёк космологический горизонт Солнца. Вернуться к Земле уже невозможно: даже отправленный сейчас световой сигнал никогда её не достигнет.',
  entries: [
    {id:'double-click', learnable:true, text:'Двойной клик запускает полёт к объекту. Если маршрут уже задан, объект становится его последней точкой. Во время полёта двойной клик добавляет следующий участок.'},
    {id:'shift-route', learnable:true, text:'Чтобы построить маршрут из нескольких точек, удерживайте Shift и выбирайте объекты на карте.'},
    {id:'black-holes', library:['gravity','flyby'], learnable:true, after:['shift-route'], text:'Чёрные дыры можно использовать для гравитационных манёвров.'},
    {id:'supernova', library:['flight','supernova'], learnable:true, after:['collector'], text:'Для перелетов на длинные расстояния используйте "взрыв сверхновой". Звезда при этом будет уничтожена.'},
    {id:'collector', library:['flight','collector'], when:'collector', text:'Коллектор собирает свет звезды и направляет его узким пучком на парус.'},
    {id:'gas-collection', library:['flight','braking'], when:'gas', text:'Во время торможения парус собирает межзвездный газ в топливный бак.'},
    {id:'braking-refill', library:['flight','braking'], when:'gas', after:['gas-collection'], text:'Торможение часто занимает много времени из-за необходимости заполнить топливный бак межзвездным газом.'},
    {id:'stellar-luminosity', library:['flight','collector'], when:'sail', text:'Скорость разгона от звезды зависит от ее светимости.'},
    {id:'collector-survival', library:['flight','supernova'], after:['collector','supernova'], text:'Коллектор расположен в 100 а.е. от звезды. При взрыве сверхновой он фокусирует фотонный поток около 5 суток, прежде чем выброс вещества уничтожит конструкцию.'},
    {id:'time-dilation', library:['relativity','clocks'], text:'Чем ближе скорость полёта к скорости света, тем медленнее идут бортовые часы по сравнению с часами на Земле.'},
    {id:'time-dilation-99', library:['relativity','clocks'], after:['time-dilation'], text:'При полёте на 99% скорости света за один бортовой год на Земле проходит около 7,1 года.'},
    {id:'time-dilation-99995', library:['relativity','clocks'], after:['time-dilation-99'], text:'При полёте на 99,995% скорости света за один бортовой год на Земле проходит около ста лет.'},
    {id:'proper-time-distance', library:['relativity','clocks'], after:['time-dilation'], text:'Перелёт на сотни световых лет может занять лишь несколько бортовых лет: при околосветовой скорости время на корабле замедляется.'},
    {id:'light-speed-limit', library:['relativity','rapidity'], text:'Даже непрерывный разгон не позволит кораблю достичь скорости света: для этого потребовалась бы бесконечная энергия.'},
    {id:'expanding-flight', library:['gravity','expansion'], when:'expansion', text:'Расширение Вселенной продолжается и во время полёта. Планировщик учитывает, насколько за это время успеет удалиться далёкая цель.'},
    {id:'bound-local-group', library:['gravity','expansion'], when:'expansion', after:['expanding-flight'], text:'Гравитация удерживает галактики Местной группы вместе, поэтому расширение Вселенной не меняет расстояние между ними.'},
    {id:'ancient-light', library:['gravity','horizons'], when:'expansion', after:['cosmic-horizon'], text:'Свет далёкой галактики мог отправиться к нам миллиарды лет назад. Сегодня из-за расширения Вселенной она уже может быть недостижима.'},
    {id:'cosmic-horizon', library:['gravity','horizons'], when:'expansion', after:['cosmic-chase'], text:'В начале игры радиус наблюдаемой Вселенной — 46,1 млрд световых лет, а предел достижимости даже для света — около 16,7 млрд.'},
    {id:'cosmic-chase', library:['gravity','expansion'], when:'expansion', after:['expanding-flight'], text:'Из-за расширения Вселенной корабль может не догнать далёкую галактику.'},
    {id:'superluminal-expansion', library:['gravity','expansion'], when:'expansion', after:['expanding-flight','light-speed-limit'], text:'Расширение пространства может отдалять объекты от корабля быстрее скорости света.'},
    {id:'sail-doppler', library:['relativity','doppler'], when:'sail', after:['stellar-luminosity','time-dilation'], text:'Чем быстрее парус удаляется от звезды, тем слабее его толкает свет. Из-за эффекта Доплера фотоны несут меньше энергии для корабля.'},
    {id:'beam-diffraction', library:['flight','collector'], after:['collector'], text:'Дифракция расширяет световой пучок коллектора даже при идеальном наведении. Поэтому вдали от коллектора часть света проходит мимо паруса.'},
    {id:'photons-in-flight', library:['flight','supernova'], after:['collector-survival'], text:'После разрушения коллектора из-за взрыва сверхновой разгон парусом может продолжаться: ранее отправленный свет ещё находится в пути к кораблю.'},
    {id:'photon-engine', library:['flight','engine'], when:'engine', text:'Фотонный двигатель создаёт тягу, превращая собранное вещество в свет.'},
    {id:'flyby-course', library:['gravity','flyby'], after:['black-holes'], text:'Гравитационный манёвр у чёрной дыры позволяет повернуть к следующей цели без остановки и повторного разгона.'},
    {id:'flyby-stars', library:['gravity','flyby'], after:['flyby-course'], text:'На околосветовой скорости гравитация обычной звезды слабо изгибает путь корабля. Для сильных поворотов в игре используются чёрные дыры.'},
    {id:'flyby-angle', library:['gravity','flyby'], after:['flyby-course'], text:'Угол гравитационного поворота зависит от скорости и расстояния до чёрной дыры. Планировщик подбирает параметры сближения так, чтобы избежать области захвата.'},
    {id:'sail-collector', library:['flight'], when:'longEngine', text:'Дальние перелёты можно ускорить: включите «Парус» и «Коллектор» для следующего полёта. Коллектор направляет свет звезды на парус.'},
  ],
  current: null,
  learned: null,
  libraryLinks: new Map(),
  libraryAction(reference) {
    if (!reference) return null;
    const key = reference.join('/');
    if (!this.libraryLinks.has(key)) {
      const [chapter, section] = reference;
      this.libraryLinks.set(key, {label:'В библиотеке', run:() => Library.open(chapter, section)});
    }
    return this.libraryLinks.get(key);
  },
  known(used = {}) {
    if (!this.learned) {
      try { this.learned = JSON.parse(localStorage.getItem('parus-flight-tip-used')); } catch {}
      this.learned ||= {};
    }
    const previous = this.learned;
    this.learned = this.normalize({used:previous}).used;
    let changed = this.entries.some(t => previous[t.id] === true && !this.learned[t.id]);
    for (const {id, learnable} of this.entries) if (learnable && used[id] === true && !this.learned[id]) {
      this.learned[id] = true;
      changed = true;
    }
    if (changed) {
      try { localStorage.setItem('parus-flight-tip-used', JSON.stringify(this.learned)); } catch {}
    }
    return {...this.learned};
  },
  normalize(progress) {
    const shown = {}, used = {}, experienced = {};
    for (const {id, learnable} of this.entries) {
      shown[id] = Number.isFinite(progress?.shown?.[id])
        ? Math.max(0, Math.min(this.maximumShows, Math.floor(progress.shown[id]))) : 0;
      used[id] = learnable === true && progress?.used?.[id] === true;
    }
    // Keep valid saved key order: an unchanged expedition must serialize identically after reload.
    for (const id of Object.keys(progress?.experienced || {}))
      if (Object.hasOwn(shown,id) && progress.experienced[id] === true) experienced[id] = true;
    const queue = [...new Set(Array.isArray(progress?.queue) ? progress.queue : [])]
      .filter(id => Object.hasOwn(shown,id) && shown[id] < this.maximumShows && !used[id]);
    const last = Object.hasOwn(shown,progress?.last) ? progress.last : null;
    return {shown, used, experienced, queue, last, solarHorizonShown:progress?.solarHorizonShown === true};
  },
  mergeProgress(older, newer) {
    const a = this.normalize(older), b = this.normalize(newer);
    for (const {id} of this.entries) {
      b.shown[id] = Math.max(a.shown[id], b.shown[id]);
      b.used[id] ||= a.used[id];
      if (a.experienced[id]) b.experienced[id] = true;
    }
    b.solarHorizonShown ||= a.solarHorizonShown;
    return this.normalize(b);
  },
  restoreProgress(saved) {
    const legacyTopics = !saved.flightTips?.experienced;
    const p = saved.flightTips = this.normalize(saved.flightTips), f = saved.flight;
    // Infer knowledge only from actions that existing saves can actually prove.
    if ((saved.phase === 'flyby' && object(f?.target)?.kind === 'blackhole' && f?.encounter?.plan) ||
        saved.journal?.some(entry => entry.text?.startsWith('Пролёт: ')))
      p.used['black-holes'] = true;
    if (saved.destroyed?.some(id => id !== 'sol')) p.used.supernova = true;
    p.used = this.known(p.used);
    if (legacyTopics) this.observe(saved);
    if (f?.flightTip && !this.entries.some(t => t.id === f.flightTip.id && p.shown[t.id] > 0))
      delete f.flightTip;
    if (f?.flightTip && !p.last) p.last = f.flightTip.id;
  },
  use(id,{persistNow=true}={}) {
    if (!this.entries.some(t => t.id === id && t.learnable)) return;
    const p = state.flightTips;
    if (p.used[id] && this.known()[id]) return;
    p.used[id] = true;
    p.queue = p.queue.filter(queued => queued !== id);
    this.known(p.used);
    if (this.current?.tip?.id === id && $('toast').dataset.kind === 'tip')
      $('toast').hidden = true;
    if(persistNow)persist();
  },
  noteLaunch(continuingRoute = false) {
    if (!continuingRoute) ExpeditionTutorial.launched(state.flight);
    state.flight.noticeElapsed = 0;
    this.observe(state);
  },
  elapsed(f) {
    if (!f) return 0;
    if (Number.isFinite(f.noticeElapsed) && f.noticeElapsed >= 0) return f.noticeElapsed;
    // Older saves have no presentation clock. Infer their progress once from
    // physical time; subsequent updates record active real seconds across rates.
    const proper = f.missionElapsed?.proper ??
      (Number.isFinite(f.rollback?.proper) ? Math.max(0, state.proper - f.rollback.proper) : 0);
    return Math.max(0, proper / speed);
  },
  advance(f, elapsed, seconds) {
    if (f && Number.isFinite(elapsed) && Number.isFinite(seconds) && seconds >= 0)
      f.noticeElapsed = elapsed + seconds;
  },
  hide() {
    if (['tip','arrival','quest'].includes($('toast').dataset.kind)) $('toast').hidden = true;
  },
  clear() {
    this.hide();
    this.current = null;
  },
  observe(s) {
    const p = s.flightTips, f = s.flight, c = f?.mission?.setup;
    // Familiarity unlocks explanations; it never marks an explanation as learned.
    const remember = (id, happened) => { if (happened) p.experienced[id] = true; };
    remember('shift-route', s.itinerary?.length > 1 || f?.route?.length > 1);
    remember('collector', (c?.sail && c.collector && f.mission.sourceId) || f?.wind?.collectorDiameterM > 0);
    remember('stellar-luminosity', (c?.sail && f.mission.sourceId) || f?.wind);
    remember('gas-collection', s.captured > 0);
    remember('photon-engine', c?.engine || f?.engine);
    remember('expanding-flight', f?.cosmic && s.expansion !== false);
  },
  familiar(id, p = state.flightTips) {
    return p.shown[id] > 0 || p.experienced[id] === true ||
      (this.entries.find(t => t.id === id)?.learnable === true && p.used[id] === true);
  },
  longEngineFlight(s = state) {
    const f = s.flight, c = f?.mission?.setup;
    if (!f || !(c ? c.engine && !c.dump && !c.sail : f.departureMode === 'engine')) return false;
    // At tempo 1 a ship year takes one real second. Use the whole leg's
    // physical plan, independent of tempo, elapsed wall time and remaining ETA.
    const proper = f.mission?.proper ?? f.summary?.proper;
    return Number.isFinite(proper) && proper > this.engineAdviceSeconds;
  },
  context(s = state) {
    const f = s.flight, c = f?.mission?.setup, p = s.flightTips;
    return {
      collector: p.experienced.collector === true,
      sail: p.experienced['stellar-luminosity'] === true,
      gas: p.experienced['gas-collection'] === true || (c?.brakeSail && c.collectGas !== false && c.densityCm3 > 0) ||
        (f?.magnetic?.k > 0 && !f.magnetic.noCapture),
      engine: p.experienced['photon-engine'] === true,
      expansion: s.expansion !== false,
      longEngine: this.longEngineFlight(s),
    };
  },
  eligible(t, p = state.flightTips, context = this.context()) {
    return !(t.learnable && p.used[t.id]) && p.shown[t.id] < this.maximumShows &&
      (!t.when || context[t.when]) && (t.after || []).every(id => this.familiar(id,p));
  },
  shuffle(ids) {
    for (let i = 0; i < ids.length - 1; i++) {
      const j = i + Math.floor(Math.random() * (ids.length - i));
      [ids[i],ids[j]] = [ids[j],ids[i]];
    }
    return ids;
  },
  pick() {
    const p = state.flightTips, context = this.context();
    const eligible = this.entries.filter(t => this.eligible(t,p,context));
    if (!eligible.length) return null;
    // Newly unlocked, unseen tips take priority over a second pass.
    const minimum = Math.min(...eligible.map(t => p.shown[t.id]));
    const ids = eligible.filter(t => p.shown[t.id] === minimum).map(t => t.id);
    p.queue = p.queue.filter(id => ids.includes(id));
    const added = ids.filter(id => !p.queue.includes(id));
    if (added.length) p.queue = this.shuffle([...p.queue,...added]);
    const index = p.queue.findIndex(id => id !== p.last);
    if (index < 0) return null; // A lone remaining tip must not repeat immediately.
    const [id] = p.queue.splice(index,1);
    p.last = id;
    return this.entries.find(t => t.id === id);
  },
  beyondSolarHorizon() {
    if (state.expansion === false || !state.ship?.p3?.every(Number.isFinite)) return false;
    // Both sides use the current physical metric, including bound-group translation.
    // The projected map distance and the ship's fuel-limited range are irrelevant.
    const time = state.cosmicTime || 0, radius = Cosmology.horizon(time) * Cosmology.scale(time);
    return Math.hypot(...Cosmology.position(state.ship)) >= radius;
  },
  renderSolarHorizon() {
    const node = $('toast'), p = state.flightTips;
    if (!node.hidden && node.dataset.kind === 'solar-horizon') {
      if (p.solarHorizonShown && this.beyondSolarHorizon()) return true;
      node.hidden = true;
    }
    if (p.solarHorizonShown || !this.beyondSolarHorizon()) return false;
    // Let an existing user notice finish; retry even after arrival or on a short leg.
    if (!node.hidden && node.dataset.kind === 'notice') return false;
    p.solarHorizonShown = true;
    log(this.solarHorizonText);
    clearTimeout(toastTimer);
    Notices.render(this.solarHorizonText, 'warning', 'solar-horizon', this.libraryAction(['gravity','horizons']));
    toastTimer = setTimeout(() => {
      if (node.dataset.kind !== 'solar-horizon') return;
      node.hidden = true;
      this.render();
    }, 14000);
    return true;
  },
  render(estimate) {
    if (this.renderSolarHorizon()) return;
    const f = state.flight, node = $('toast');
    if (!f) { this.clear(); return; }
    this.observe(state);
    if (this.current?.flight !== f) {
      this.clear();
      this.current = {flight:f,
        tip:this.entries.find(t => t.id === f.flightTip?.id) || null};
    }
    const current = this.current;
    const remaining = (estimate || FlightEstimate.get())?.proper / speed;
    const elapsed = this.elapsed(f);
    const advice = this.entries.find(t => t.id === 'sail-collector');
    const pendingAdvice = current.tip?.id !== advice.id && !paused && elapsed >= this.startDelaySeconds &&
      remaining - this.arrivalSeconds > this.minimumReadingSeconds &&
      this.longEngineFlight() && this.eligible(advice);
    const priorityAdvice = pendingAdvice || current.tip?.id === advice.id;
    const story = remaining > 0 && !priorityAdvice ? globalThis.Quests?.flightStory(f) : null;
    if (story) {
      if (!node.hidden && node.dataset.kind === 'notice' && (Notices.action || (Notices.context?.flight === f &&
          (elapsed < this.startDelaySeconds || Notices.context.elapsed >= this.startDelaySeconds)))) return;
      clearTimeout(toastTimer);
      Quests.announce(story);
      return;
    }
    if (node.dataset.kind === 'quest') node.hidden = true;
    if (remaining > 0 && remaining <= this.arrivalSeconds &&
        !f.mission?.passage && !Route.isFlyby(f) && state.phase !== 'flyby') {
      const orbit = !!f.mission?.arrival, target = object(f.target);
      clearTimeout(toastTimer);
      Notices.render((orbit ? 'Выход на орбиту: ' : 'Прибытие: ') + target.name + '.',
        orbit ? 'orbit' : 'arrival', 'arrival');
      return;
    }
    // A speed change may move the arrival window away again.
    if (node.dataset.kind === 'arrival') node.hidden = true;
    if (!(remaining > 0) || elapsed < this.startDelaySeconds ||
        (!priorityAdvice && !(elapsed + remaining > this.minimumFlightSeconds))) { this.hide(); return; }
    if (!pendingAdvice && current.tip?.learnable && state.flightTips.used[current.tip.id]) {
      this.hide();
      return;
    }
    // Startup messages yield after four seconds. Later user notices retain
    // priority; hidden tips never spend the expedition's display quota.
    if (!node.hidden && node.dataset.kind === 'notice' &&
        ((priorityAdvice && Notices.action) ||
         (Notices.context?.flight === f && Notices.context.elapsed >= this.startDelaySeconds))) return;
    if (!current.tip || pendingAdvice) {
      if (paused) return;
      if (!(remaining - this.arrivalSeconds > this.minimumReadingSeconds)) return;
      current.tip = pendingAdvice ? advice : this.pick();
      if (!current.tip) return; // A later action may unlock a topic on this same leg.
      if (pendingAdvice) {
        state.flightTips.last = advice.id;
        state.flightTips.queue = state.flightTips.queue.filter(id => id !== advice.id);
      }
      state.flightTips.shown[current.tip.id] = (state.flightTips.shown[current.tip.id] || 0) + 1;
      // This receipt survives phase transitions and reloads of the same leg.
      f.flightTip = {id:current.tip.id};
      persist();
    }
    clearTimeout(toastTimer);
    Notices.render(current.tip.text,'tip','tip',this.libraryAction(current.tip.library));
  },
};
globalThis.FlightTips = FlightTips;
