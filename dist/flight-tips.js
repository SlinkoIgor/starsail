'use strict';
// The tutorial follows the current control independently of flight notices.
const ExpeditionTutorial = {
  storageKey: 'parus-intro-tutorial',
  startRate: 0.1,
  openSession(hasExpedition) {
    let firstVisit = !hasExpedition;
    try {
      if (localStorage.getItem(this.storageKey)) firstVisit = false;
      else localStorage.setItem(this.storageKey, 'seen');
    } catch {}
    if (firstVisit) state.timeScale = this.startRate;
    // A guided flight and its arrival remain in the tutorial even if the tab was closed.
    let step = state.tutorialStep === 'flight' ? 'flight' : firstVisit ? 'welcome' : null;
    try {
      const active = JSON.parse(sessionStorage.getItem(this.storageKey));
      if (active?.expedition === state.expedition && TUTORIAL_STEPS.includes(active.step))
        step = active.step;
    } catch {}
    // Earlier versions ended training on takeoff. The departure snapshot identifies that flight.
    if (!step && !state.tutorialStep && state.flight?.target === 'proxima' &&
        state.flight.rollback?.tutorialStep === 'launch' && !state.flight.tutorialDismissed) step = 'flight';
    if (['propulsion', 'launch'].includes(step) && (state.selected !== 'proxima' || !this.canChoose())) step = 'destination';
    if (step) this.prepareDeparture();
    this.setStep(step);
  },
  setStep(step) {
    if (step && !state.tutorialStep) Quests.pauseForTutorial();
    state.tutorialStep = step;
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
  advance() {
    const step = state.tutorialStep;
    if (!step) return;
    if (step === 'destination') {
      if (this.canChoose()) this.showMap();
      else this.finish();
      return;
    }
    if (step === 'flight') {
      if (!state.flight) this.finish();
      return;
    }
    if (step === 'launch') {
      if ($('launchBtn').disabled) this.finish();
      return;
    }
    const next = TUTORIAL_STEPS[TUTORIAL_STEPS.indexOf(step) + 1];
    this.setStep(next);
    persist();
    renderUI();
    if (next === 'destination' || next === 'launch') this.showMap();
  },
  showMap() {
    if (!state.tutorialStep) return;
    if (state.tutorialStep === 'flight') {
      if (state.flight) fitRoute(object(state.flight.target), {wholeRoute:true});
      return;
    }
    if (!this.allows('destination') || !this.canChoose()) {
      centerOnSun();
      return;
    }
    const points = ['sol', 'proxima'].map(id => MapLayout.project(object(id)));
    fitCameraPoints(points, routeViewport(true), SOLAR_CAMERA_SPAN);
  },
  canChoose() {
    return !state.flight && state.current !== 'proxima' && !state.itinerary.length;
  },
  target(o) {
    return o?.id === 'proxima' && state.tutorialStep === 'destination' && this.canChoose();
  },
  mapTargetPoint() {
    if (state.tutorialStep === 'destination' && this.canChoose()) return screen(object('proxima'));
  },
  lessons: {
    welcome: {
      title: 'Добро пожаловать на «Ковчег»',
      text: () => (OrbitalMotion.onEarth(state)
        ? '«Ковчег» начинает путь с Земли. После вылета вернуться в Солнечную систему можно будет только к Солнцу. '
        : '') + 'На этом корабле можно посетить ближайшую звезду или пересечь всю Вселенную. Познакомьтесь с кораблём и проложите курс.',
    },
    time: {
      title: 'Темп времени', anchor: 'timeControls',
      text: 'Попробуйте разные темпы. При 1× за секунду проходит год на борту, при 0,1× тот же год занимает десять секунд. Ноль ставит время на паузу.',
    },
    clocks: {
      title: 'Часы экспедиции', anchor: 'tutorialClocks',
      text: () => 'Время на корабле — год по бортовым часам.\nВремя наблюдателя — год по часам на Земле.\nВозраст Вселенной — время с Большого взрыва. На старте — ' + compact(INITIAL_UNIVERSE_AGE) + ' лет.',
    },
    zoom: {
      title: 'Масштаб карты', anchor: 'zoomControls',
      text: 'Выберите отметку «Звёзды», чтобы увидеть соседей Солнца. Колесом мыши можно плавно менять масштаб. Линейка слева внизу показывает расстояние на карте.',
    },
    mass: {
      title: 'Масса корабля', anchor: 'massReading',
      text: 'Сам «Ковчег» весит 1 кг. На старте в баке ещё 1 кг рабочего вещества. Фотонный двигатель расходует его на разгон и торможение.',
    },
    acceleration: {
      title: 'Ускорение', anchor: 'accelerationReading',
      text: () => 'Шкала показывает ускорение, которое ощущается на борту. Справа — разгон до ' + $('accelerationMax').textContent + ', слева — торможение до ' + $('accelerationMin').textContent + '. Один g равен ускорению свободного падения на Земле.',
    },
    velocity: {
      title: 'Скорость', anchor: 'velocityReading',
      text: 'Здесь скорость «Ковчега» показана в процентах от скорости света. Чем ближе корабль к скорости света, тем важнее каждый следующий знак после запятой.',
    },
    dilation: {
      title: 'Год на корабле', anchor: 'timeDilationRow',
      text: 'Пока корабль покоится, часы на борту и на Земле идут в одном темпе. На большой скорости часы расходятся. Эта шкала показывает, сколько лет наблюдателя приходится на один год на борту корабля.',
    },
    destination: {
      title: 'Выберите цель',
      text: 'Летим к Проксиме Центавра — ближайшей к Солнцу звезде. Нажмите на выделенную звезду на карте.',
    },
    propulsion: {
      title: 'Длительность перелёта', anchor: 'arrivalEstimate',
      text: () => QuickFlight.issueReason ||
        'Время в пути до Проксимы по бортовым часам — ' + $('arrivalProper').textContent +
        ', по часам наблюдателя на Земле — ' + $('arrivalEarth').textContent + '.',
    },
    launch: {
      title: 'Полёт к Проксиме', anchor: 'launchBtn',
      text: 'Нажмите «Лететь» в карточке звезды. На карте вы увидите перелёт, а на приборах — как меняются скорость корабля и ход его часов.',
    },
    flight: {
      title: 'Учебный перелёт завершён', anchor: 'arrivalEstimate',
      text: () => state.current === 'proxima' ? 'Вы у Проксимы Центавра. В карточке звезды указано, сколько времени занял перелёт.' : 'Теперь можно завершить обучение и продолжить экспедицию.',
    },
  },
  render() {
    this.layout();
    const step = state.tutorialStep, card = $('tutorialCard');
    const hideCard = !step || (step === 'flight' && !!state.flight);
    UIPatch.set(card, 'hidden', hideCard);
    if (hideCard) return;
    const lesson = this.lessons[step];
    let body = typeof lesson.text === 'function' ? lesson.text() : lesson.text;
    let action = 'Далее', waiting = false;
    let anchor = lesson.anchor && $(lesson.anchor).getBoundingClientRect();
    let sides = ['above', 'below', 'right', 'left'];
    if (step === 'welcome') {
      action = 'Начать обучение';
      UIPatch.style(card, 'left', '');
      UIPatch.style(card, 'top', '');
    } else if (step === 'time' || step === 'zoom') {
      sides = ['right', 'below', 'above', 'left'];
    } else if (step === 'destination') {
      const p = screen(object('proxima')), origin = canvas.getBoundingClientRect();
      const offscreen = p.x < 0 || p.x > width || p.y < 0 || p.y > cameraViewportHeight();
      const x = origin.left + clamp(p.x, 0, width), y = origin.top + clamp(p.y, 0, cameraViewportHeight());
      anchor = {left:x - 9, right:x + 9, top:y - 9, bottom:y + 9};
      if (this.canChoose()) {
        waiting = offscreen && !!cameraGoal;
        action = offscreen ? 'Показать на карте' : '';
      } else {
        body = 'Чтобы отправиться к звезде, выберите её на карте и нажмите «Лететь» в карточке. Теперь можно продолжить свою экспедицию.';
        action = 'Готово';
        anchor = {left:width / 2, right:width / 2, top:height / 2, bottom:height / 2};
      }
    } else if (step === 'propulsion' || step === 'launch' || step === 'flight') {
      if (step === 'flight') action = 'Завершить обучение';
      sides = ['left', 'above', 'below', 'right'];
      if (step === 'launch') {
        action = $('launchBtn').disabled ? 'Готово' : '';
        if (!action && speed > 1) body += ' Выберите темп 1×, чтобы рассмотреть разгон.';
        if (action) body = QuickFlight.issueReason || 'Для этого перелёта сейчас не хватает рабочего вещества. Завершите обучение, чтобы вернуться к планированию.';
      }
    }
    UIContent.text($('tutorialTitle'), lesson.title);
    UIContent.text($('tutorialText'), body);
    const next = $('tutorialNext'), shortcut = step === 'welcome' || action === 'Далее';
    UIContent.text(next, shortcut ? action + ' (Space)' : action);
    UIPatch.set(next, 'ariaKeyShortcuts', shortcut ? 'Space' : null);
    UIPatch.set(next, 'hidden', !action);
    UIPatch.set($('skipTutorial'), 'hidden', step !== 'welcome');
    UIPatch.style(card, 'visibility', waiting ? 'hidden' : '');
    if (anchor && !waiting) this.place(card, anchor, sides);
  },
  place(card, anchor, sides) {
    const box = card.getBoundingClientRect(), gap = 26, pad = 10;
    const room = {
      right: width - anchor.right - box.width, left: anchor.left - box.width,
      below: height - anchor.bottom - box.height, above: anchor.top - box.height,
    };
    const fits = sides.filter(s => room[s] >= gap + pad);
    if (!fits.length) fits.push(sides.reduce((a,b) => room[b] > room[a] ? b : a));
    const cx = (anchor.left + anchor.right) / 2, cy = (anchor.top + anchor.bottom) / 2;
    const side = fits[0], vertical = side === 'above' || side === 'below';
    const x = vertical ? cx - box.width / 2 : side === 'right' ? anchor.right + gap : anchor.left - gap - box.width;
    const y = !vertical ? cy - box.height / 2 : side === 'below' ? anchor.bottom + gap : anchor.top - gap - box.height;
    const left = clamp(x, pad, width - box.width - pad), top = clamp(y, pad, height - box.height - pad);
    if (card.dataset.side !== side) card.dataset.side = side;
    UIPatch.style(card, 'left', Math.round(left) + 'px');
    UIPatch.style(card, 'top', Math.round(top) + 'px');
    const arrow = $('tutorialPointer');
    UIPatch.style(arrow, 'left', vertical ? clamp(cx - left, 12, box.width - 12) + 'px' : '');
    UIPatch.style(arrow, 'top', vertical ? '' : clamp(cy - top, 12, box.height - 12) + 'px');
    UIPatch.style(arrow, 'width', side === 'left' ? Math.max(1, anchor.left - left - box.width - 8) + 'px' : '');
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
    if (state.tutorialStep === 'launch' && !continuingRoute && state.flight.target === 'proxima')
      ExpeditionTutorial.setStep('flight');
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
