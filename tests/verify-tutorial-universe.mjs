import fs from 'node:fs';
const harness=fs.readFileSync('tests/verify-map.mjs','utf8').split('\nrun(`')[0]
 .replace('addEventListener(){}getBoundingClientRect()', 'addEventListener(type,handler){(this.listeners??={})[type]=handler;}setPointerCapture(){}getBoundingClientRect()')
 .replace('devicePixelRatio:1,addEventListener(){}','devicePixelRatio:1,addEventListener(type,handler){(this.listeners??={})[type]=handler;}')+'\nexport {run};';
const {run}=await import('data:text/javascript,'+encodeURIComponent(harness));
run(`$('targetDistance').parentElement=$('distanceRow');$('arrivalEarth').parentElement=$('arrivalEarthRow');`+fs.readFileSync('dist/universe-map.js','utf8'));
run(`
function space(options={}){
 let consumed=false;
 window.listeners.keydown({key:' ',code:'Space',target:{closest:()=>null},preventDefault(){consumed=true;},...options});
 return consumed;
}
const storage = () => {
 const data = new Map();
 return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
};
const arriveGuided=()=>{Simulation.tick(state.flight.mission.proper*1.00001);renderUI();};
const flat=s=>String(s).split(String.fromCharCode(160)).join(' ').replace(/<span class="tutorial-nowrap">([^<]*)<[/]span>/g,'$1');
const lesson=()=>flat($('tutorialText').innerHTML);
globalThis.sessionStorage=storage();
globalThis.localStorage=storage();
state=initial({deferStarterQuest:true});
state.ship=Space.point(object('s55').p3);state.current='s55';state.selected='sgr';state.visited=['sol','alpha','sgr','s55'];
state.flightSetup=FlightSetup.normalize({...FlightSetup.defaults(),sail:true,collector:true,burst:false});
ExpeditionTutorial.setStep('holecard');renderUI();
assert.equal(ExpeditionTutorial.atCenter(),true);assert.equal($('tutorialCard').hidden,true);
ExpeditionTutorial.dialogClosed();
assert.equal(state.tutorialStep,'neighbour','the lesson continues with the nearest large galaxy');assert.equal($('flightCard').dataset.cardOnly,undefined);
assert.equal($('tutorialTitle').textContent,'За пределы Галактики');
assert.equal(lesson(),'<p>Дальше маршрут «Ковчега» уходит за пределы нашей Галактики.</p><p>Следующая цель — Андромеда, ближайшая к Млечному Пути крупная галактика. Она самая большая в Местной группе — небольшом семействе галактик, куда входит и Млечный Путь. С Земли Андромеду видно без телескопа — как слабое туманное пятно.</p><p>Выберите её на карте.</p>');
assert.equal(ExpeditionTutorial.targetId(),'andromeda');assert.equal(ExpeditionTutorial.mapTarget().name,'Андромеда');
assert.equal(ExpeditionTutorial.target(object('sgr')),false);assert.equal(ExpeditionTutorial.target(object('andromeda')),true);
{const typeset=q=>ExpeditionTutorial.typeset(q).split(String.fromCharCode(160)).join('_');
 assert.equal(typeset('Регулятор задаёт ход времени. При 1× год на борту проходит за секунду, при 0,1× — за десять секунд. Отметка 0 ставит время на паузу.'),'Регулятор_задаёт ход_времени. При_1×_год на_борту проходит за_секунду, при_0,1×_— за_десять_секунд. Отметка_0_ставит время на_паузу.');
 assert.equal(typeset('На борту из-за замедления времени пройдёт всего ≈ 33 года.'),'На_борту <span class="tutorial-nowrap">из-за</span> замедления времени пройдёт всего ≈_33_года.');
 assert.equal(typeset('До Стрельца A* 27 000 св. лет. Только на тяге двигателя перелёт займёт 64 800 лет по бортовым часам.'),'До_Стрельца_A* 27_000_св._лет. Только_на_тяге двигателя перелёт займёт 64_800_лет по_бортовым_часам.');
 assert.equal(typeset('Устройство корабля описано в библиотеке — кнопка {library}. «Подробный план» открывает точную настройку полёта.'),'Устройство корабля описано в_библиотеке_— кнопка_{library}. «Подробный_план» открывает точную настройку_полёта.');
 assert.equal(typeset('В центре всех орбит — Стрелец A*. Его массу, 4,3 млн масс Солнца, определили по движению этих звёзд: все они обращаются вокруг одной точки.'),'В_центре всех орбит_— Стрелец_A*. Его_массу, 4,3_млн_масс Солнца, определили по_движению этих_звёзд: все_они обращаются вокруг одной_точки.');
 assert.equal(typeset('Когда звезда S2 проходит ближайшую к чёрной дыре точку, формула E = mc² и скорость света 99,99 % c.'),'Когда_звезда_S2 проходит ближайшую к_чёрной_дыре точку, формула_E_=_mc² и_скорость_света 99,99_%_c.');
 assert.equal(flat(ExpeditionTutorial.typeset('Вещества очень мало — в игре принят 1 атом на кубический сантиметр, — но оно тормозит.')),'Вещества очень мало — в игре принят 1 атом на кубический сантиметр, — но оно тормозит.','typesetting changes only the kind of spaces');
}
{const view=cameraGoal;assert.equal(view.span,ExpeditionTutorial.neighbourSpan,'the map zooms out to the scale of galaxies');
 assert.equal(view.glide.seconds,ExpeditionTutorial.neighbourSeconds,'the zoom-out to the galaxies is a slow glide');assert.equal(ExpeditionTutorial.neighbourSeconds,3);
 window.matchMedia=()=>({matches:true});ExpeditionTutorial.showNeighbour(true);assert.ok(!cameraGoal.glide&&cameraGoal.span===view.span,'reduced motion skips the glide');delete window.matchMedia;
 ExpeditionTutorial.showMap();assert.ok(!cameraGoal.glide&&cameraGoal.span===view.span,'showing the target again uses the ordinary camera move');assert.ok(view.span>zoomStops[2].span*10&&view.span<zoomStops[3].span);
 cam={x:view.x,y:view.y,span:view.span};cameraGoal=null;const v=routeViewport(true);
 for(const p of [screen(FlightView.ship()),screen(object('andromeda'))])assert.ok(p.x>=v.left&&p.x<=v.right&&p.y>=v.top&&p.y<=v.bottom,'the ship and Andromeda are both in view');renderUI();}
assert.equal($('tutorialNext').hidden,true);assert.equal($('tutorialCard').style.visibility,'');assert.equal(ExpeditionTutorial.tracked.spot,object('andromeda'));
assert.deepEqual(Quests.activeIds,[]);assert.equal(Quests.suspended,true);
globalThis.sessionStorage=storage();state=restore(FlightHistory.snapshot());ExpeditionTutorial.openSession(true);renderUI();assert.equal(state.tutorialStep,'neighbour');
select('andromeda');assert.equal(state.tutorialStep,'supernova');
{const beam=FlightSetup.read();assert.ok(beam.engine&&beam.sail&&beam.collector&&!beam.burst,'the flight starts from the sail and the collector');}
assert.equal($('tutorialTitle').textContent,'Расстояние до цели');
assert.ok(lesson().startsWith(flat('<p>До Андромеды '+ExpeditionTutorial.shown('targetDistance')+'. С парусом и коллектором перелёт займёт '+ExpeditionTutorial.shown('arrivalProper')+' по бортовым часам.</p>')));
assert.ok(lesson().endsWith('<p>Для межгалактических перелётов есть более мощный способ разгона — вспышка сверхновой. Включите «Сверхновая» в карточке цели.</p>'));
assert.equal($('tutorialNext').hidden,true);assert.equal($('launchBtn').disabled,true,'the launch button waits for the supernova');assert.equal(ExpeditionTutorial.marksDistance(),true);
{const flown=state.flight;$('launchBtn').onclick();assert.equal(state.flight,flown);assert.equal(state.tutorialStep,'supernova');}
const beamTrip=FlightEstimate.get().proper;assert.ok(beamTrip>1000);
window.matchMedia=()=>({matches:true});renderUI();
assert.ok(!FlightSetup.read().burst,'the mobile preset does not light the supernova by itself');
assert.equal($('tutorialNext').textContent,'Включить сверхновую [Пробел]');
$('tutorialNext').onclick();assert.equal(state.tutorialStep,'burst');delete window.matchMedia;
QuickFlight.toggle('burst');assert.equal(state.tutorialStep,'supernova');
QuickFlight.toggle('burst');assert.equal(state.tutorialStep,'burst');
assert.equal($('tutorialTitle').textContent,'Взрыв сверхновой');assert.equal($('launchBtn').disabled,false);assert.equal($('tutorialNext').hidden,true);
assert.ok(lesson().startsWith('<p>Некоторые звёзды в конце жизни взрываются как сверхновые. Такая вспышка светит как 300 млн Солнц — примерно как небольшая галактика — и остаётся яркой от нескольких недель до нескольких месяцев.</p><p>В игре «Ковчег» может вызвать вспышку у любой звезды, кроме Солнца. Вспышка длится 30 суток.</p><p>Коллектор направит её свет на парус, и «Ковчег» разгонится до '));
assert.ok(lesson().includes('<p>От звезды S55 после вспышки останется только звёздный остаток: разогнаться от неё светом второй раз не получится.</p>')&&lesson().includes('<p>Нажмите «Лететь».'));
for(const id of ['quickSpeed','arrivalEarth','arrivalProper'])assert.ok($(id).textContent&&lesson().includes(id==='quickSpeed'?$(id).textContent:id==='arrivalProper'?ExpeditionTutorial.about($(id).textContent):ExpeditionTutorial.shown(id)),id+' is quoted in the supernova lesson');
assert.ok(/Перелёт займёт ≈ \\d+ (?:год|года|лет) по бортовым часам/.test(lesson()),'the on-board years of the crossing are rounded');
assert.ok(FlightEstimate.get().proper<beamTrip/10,'the supernova shortens the flight on board');
assert.equal($('tutorialLibrary').hidden,false);assert.equal($('tutorialLibraryLabel').textContent,'Сверхновая в библиотеке');
{let shown=null;$('lib-flight-supernova').scrollIntoView=()=>{shown='supernova';};
 $('tutorialLibrary').onclick();assert.equal($('infoDialog').open,true);assert.equal(Library.current,'flight');assert.equal(shown,'supernova','the library opens at the supernova');}
$('infoDialog').close();ExpeditionTutorial.dialogClosed();assert.equal(state.tutorialStep,'burst');
$('launchBtn').onclick();assert.equal(state.tutorialStep,'crossing');assert.equal($('tutorialCard').hidden,true);
assert.equal(ExpeditionTutorial.goal(state.flight),'andromeda');assert.ok(state.flight.mission.setup.burst&&ExpeditionTutorial.guided(state.flight));
{const crossing=FlightHistory.snapshot();
 FlightHistory.cancel();renderUI();assert.equal(state.current,'s55');assert.equal(state.tutorialStep,'burst','a cancelled crossing returns to its plan');
 globalThis.sessionStorage=storage();state=restore(crossing);ExpeditionTutorial.openSession(true);renderUI();}
assert.equal(state.tutorialStep,'crossing','the crossing survives a new session');arriveGuided();
assert.equal(state.tutorialStep,'arrival');assert.ok(state.visited.includes('andromeda')&&ExpeditionTutorial.atGalaxy());
assert.equal(state.pendingQuestArrivals,undefined);assert.ok(state.destroyed.includes('s55'));
assert.equal($('tutorialTitle').textContent,'Перелёт к Андромеде');assert.equal($('tutorialNext').textContent,'Далее [Пробел]');
assert.ok(state.lastArrival.earth>2e6&&state.lastArrival.proper<100);
assert.equal(lesson(),flat('<p>Перелёт завершён: «Ковчег» в Андромеде, на орбите одной из её звёзд.</p><p>В пути прошло '+ExpeditionTutorial.about(durationText(state.lastArrival.proper))+' по бортовым часам и '+ExpeditionTutorial.plain(durationText(state.lastArrival.earth))+' по часам наблюдателя. Эти числа показаны в карточке, в строке «Время в пути».</p>'));
assert.equal($('arrivalLabel').textContent,'ВРЕМЯ В ПУТИ');assert.equal($('arrivalProper').textContent,durationText(state.lastArrival.proper));
globalThis.sessionStorage=storage();state=restore(FlightHistory.snapshot());ExpeditionTutorial.openSession(true);renderUI();assert.equal(state.tutorialStep,'arrival');
cam={x:state.ship.x,y:state.ship.y,span:3e7};cameraGoal=null;
assert.equal(space(),true);assert.equal(state.tutorialStep,'universe');
{const goal=cameraGoal,view=UniverseMap.overview(),from=cam.span,ship=FlightView.ship(),start=screen(ship);
 assert.ok(goal.glide&&goal.x===view.x&&goal.y===view.y&&goal.span===view.span,'the map zooms out to the whole Universe');
 assert.equal(goal.glide.seconds,clamp(Math.log10(view.span/from)*2.5,6,16));assert.ok(goal.glide.seconds>8,'the zoom-out leaves time to load the catalogue');
 assert.equal($('tutorialCard').style.visibility,'hidden','the lesson does not flash at the old scale before the zoom-out');
 renderUI();assert.equal($('tutorialCard').style.visibility,'hidden','the lesson waits for the zoom-out');
 assert.equal(space(),true);assert.equal(state.tutorialStep,'universe','Space does not skip the zoom-out');
 const end={x:width*.43+(ship.x-view.x)*width/view.span,y:mapOriginY()+(ship.y-view.y)*width/view.span};let last=from;
 for(let i=1;i<20;i++){stepCameraGlide(goal.glide.seconds/20);const p=screen(ship),t=Math.abs(end.x-start.x)>Math.abs(end.y-start.y)?(p.x-start.x)/(end.x-start.x):(p.y-start.y)/(end.y-start.y);
  assert.ok(cam.span>last&&cam.span<view.span&&t>0&&t<1&&Math.abs(p.x-start.x-(end.x-start.x)*t)<1e-3&&Math.abs(p.y-start.y-(end.y-start.y)*t)<1e-3,'the ship stays in view on a straight screen line');last=cam.span;}
 stepCameraGlide(goal.glide.seconds);assert.deepEqual(cam,view);cameraGoal=null;renderUI();}
assert.equal($('tutorialCard').style.visibility,'');assert.equal($('tutorialTitle').textContent,'Вся Вселенная');
assert.ok(lesson().startsWith(flat('<p>Карта показывает всю наблюдаемую Вселенную — шар радиусом '+distanceText(UniverseMap.radius*Cosmology.scale())+'.')));
assert.ok(lesson().endsWith('<p>Вселенная расширяется, и далёкие галактики удаляются от нас. Поэтому долететь можно не до всего, что видно на карте.</p>'));
{const g=UniverseMap.geometry(),p=screen(ExpeditionTutorial.tracked.spot);assert.ok(Math.abs(Math.hypot(p.x-g.x,p.y-g.y)-g.r)<1e-6,'the lesson points at the edge of the observable Universe');}
{const reduced=window.matchMedia;window.matchMedia=()=>({matches:true});cam={x:0,y:0,span:3e7};ExpeditionTutorial.showUniverse(true);window.matchMedia=reduced;
 assert.ok(!cameraGoal.glide&&cameraGoal.span===UniverseMap.overview().span,'reduced motion skips the slow zoom-out');cam=UniverseMap.overview();cameraGoal=null;}
{const find=document.querySelector,plain=UniverseMap.overview();
 assert.deepEqual(ExpeditionTutorial.universeView(),plain,'without instruments the overview is used as is');
 for(const top of [560,300]){document.querySelector=s=>s==='.telemetry'?{getBoundingClientRect:()=>({top,height:80})}:find.call(document,s);
  const v=ExpeditionTutorial.universeView(),r=ExpeditionTutorial.universeRadius()*width/v.span,cy=mapOriginY()-v.y*width/v.span;
  assert.equal(v.span,plain.span);assert.equal(v.x,plain.x);
  if(2*r<=top-60)assert.ok(cy-r>=16-1e-6&&cy+r<=top-44+1e-6,'the whole Universe stays above the instruments');
  else assert.ok(Math.abs(cy-(top-28)/2)<1e-6,'a circle that cannot fit is centred above the instruments');}
 document.querySelector=find;}
assert.equal(space(),true);assert.equal(state.tutorialStep,'reach');assert.equal($('tutorialTitle').textContent,'Предел полёта');
{const q=ReachDisplay.ship(),p=screen(ExpeditionTutorial.tracked.spot),ship=screen(state.ship);
 assert.ok(q.radius>1e10&&q.radius<UniverseMap.radius,'the flight limit is inside the observable Universe');
 assert.ok(lesson().endsWith(flat('<p>Граница достижимого отмечена на карте штрихпунктирной окружностью вокруг корабля с подписью «Предел полёта». Сейчас её радиус — '+distanceText(q.radius)+'.</p>')));
 assert.ok(Math.abs(Math.hypot(p.x-ship.x,p.y-ship.y)-ReachDisplay.section(q).radius*width/cam.span)<1e-6,'the lesson points at the flight limit');
 state.expansion=false;renderUI();assert.ok(lesson().endsWith('<p>Расширение Вселенной сейчас выключено в настройках, поэтому границы достижимого на карте нет.</p>'));state.expansion=true;renderUI();}
assert.equal(space(),true);assert.equal(state.tutorialStep,'objects');assert.equal($('tutorialTitle').textContent,'Объекты на карте');
{const count=ExtendedCatalog.total+(globalThis.Exoplanets?.newCount||0);assert.ok(count>200000);
 assert.ok(lesson().startsWith(flat('<p>В базе «Ковчега» '+count.toLocaleString('ru-RU')+' объект')),'the number of objects is the current size of the catalogue');
 assert.equal(lesson().split('<li>').length,10);assert.ok(lesson().includes('<ul class="tutorial-legend" style="--rows:5">'),'two columns, read top to bottom');
 assert.equal(lesson().split('<svg viewBox="-19 ').length,10);assert.ok(lesson().includes('<svg viewBox="-19 -11 38 22" width="38" height="22"'),'symbols are drawn at the size they have on the map');
 assert.deepEqual(lesson().split('<span>').slice(1).map(part=>part.split('</span>')[0]),
  ['Звёзды','Чёрные дыры','Пульсары','Туманности','Звёздные скопления','Галактики','Квазары','Скопления галактик','Галактические нити'],'the symbols go from the smallest scale to the largest');
 const [size,glyph]=ExpeditionTutorial.galaxyMark(),andromeda=object('andromeda'),model=MapGeometry.model(andromeda),
  outline=MapGeometry.projected(andromeda,{tolerance:model.radius/80,steps:48}).paths[0].points,scale=16/Math.max(...outline.map(q=>Math.abs(q.x)));
 assert.ok(lesson().includes(flat('<svg viewBox="-19 '+-size/2+' 38 '+size+'" width="38" height="'+size+'" aria-hidden="true">'+glyph+'</svg><span>Галактики</span>')));
 assert.ok(glyph.startsWith('<path stroke-width=".9" stroke-dasharray="3 5" d="M'+Math.round(outline[0].x*scale*10)/10+' '+Math.round(outline[0].y*scale*10)/10+'L'),'the galaxy symbol is the map outline of Andromeda');
 assert.equal(glyph.split('M').length-1,1+GalaxyStructure.curves(andromeda.galaxy).length,'with the same rings and arms the map draws inside it');
 assert.ok(size>=22&&size<=38&&size%2===0);
 assert.ok(lesson().split('<span>Галактические нити</span>')[0].split('<svg').at(-1).includes('<path stroke-width=".7" d="M10.3-2.3L'),'filaments are thin solid lines, as on the map');
 assert.equal(lesson().split('<span>Галактические нити</span>')[0].split('<svg').at(-1).split('M').length-1,3,'three crossing axes read as threads, not as one outline');}
assert.deepEqual([1,2,5,11,21,270336].map(n=>ExpeditionTutorial.plural(n,'объект','объекта','объектов')),['объект','объекта','объектов','объектов','объект','объектов']);
assert.deepEqual(ExpeditionTutorial.heldButtons.map(id=>!!$(id).inert),[false,false,false,false,false]);
for(const [step,title,button] of [['search','Поиск','catalogBtn'],['filters','Фильтры','mapFilterBtn'],['follow','Слежение за кораблём','shipBtn'],['theme','Тема оформления','themeBtn'],
  ['library','Бортовая библиотека','libraryBtn'],['restart','Новая экспедиция','resetBtn'],['settings','Настройки','settingsBtn'],['zen','Режим дзен','zenBtn']]){
 assert.equal(space(),true);assert.equal(state.tutorialStep,step);assert.equal($('tutorialTitle').textContent,title);assert.equal(ExpeditionTutorial.tour[step],button);
 assert.equal($('tutorialNext').textContent,'Далее [Пробел]','every top button is only described: '+step);assert.equal($('tutorialAlt').hidden,true);
 assert.equal(lesson().split('<p>').length,2,'one short paragraph per button');assert.equal(Quests.suspended,true);
 assert.deepEqual(ExpeditionTutorial.heldButtons.map(id=>$(id).inert),[true,true,true,true,true],'the buttons revealed by the tour wait for its end');}
assert.equal(space(),true);assert.equal(state.tutorialStep,'quests');assert.equal(Quests.suspended,false);assert.equal($('questBtn').hidden,false);
assert.equal($('tutorialTitle').textContent,'Квесты');assert.equal($('tutorialNext').textContent,'Открыть квесты [Пробел]');
assert.equal($('tutorialAlt').hidden,true,'free flight is offered only next to the list of quests');
assert.equal(lesson().split('<p>').length,2);assert.ok(!lesson().includes('Соседи Солнца'),'the recommendation waits for the list');
assert.deepEqual(state.quests.active,[]);assert.equal(state.quests.starterPending,true);
const atQuests=FlightHistory.snapshot();
{const recommendation='<p>Рекомендуем начать с квеста «Соседи Солнца» и расширять знание о Вселенной постепенно.</p>';
 assert.equal(space(),true);assert.equal(Quests.isOpen,true);assert.equal(Quests.view,null);assert.equal(state.tutorialStep,'quests');
 assert.equal($('tutorialTitle').textContent,'Выберите квест');assert.equal($('tutorialNext').hidden,true);
 assert.equal($('tutorialAlt').hidden,true,'the list only recommends: free flight waits for an opened quest');
 assert.equal(lesson(),flat(recommendation+'<p>Откройте квест в списке, чтобы посмотреть его цели.</p>'));
 const cards=Quests.listHTML(Quests.visitedSet());
 assert.equal(cards.split('is-recommended').length,2);assert.ok(cards.includes(' is-recommended" data-quest-open="'+Quests.starterId+'"'),'the recommended quest is marked in the list');
 const free='<p>Квесты необязательны: чтобы выбирать цели на карте самостоятельно, нажмите «Свободный полёт».</p>';
 Quests.view=Quests.starterId;renderUI();
 assert.equal($('tutorialAlt').hidden,false);assert.equal($('tutorialAlt').textContent,'Свободный полёт');assert.equal($('tutorialNext').hidden,true);
 assert.ok(state.visited.includes('alpha')&&Quests.progress(Quests.quest(Quests.starterId)).done===1);
 assert.equal(lesson(),flat('<p>Чтобы выбрать этот квест, нажмите «Начать квест».</p><p>Одна его цель уже засчитана — Альфа Центавра: «Ковчег» побывал там во время обучения.</p>'+free),'an opened quest names the target credited by the tutorial and no longer repeats the recommendation');
 for(const quest of QUESTS.filter(q=>!Quests.locked(q))){Quests.view=quest.id;renderUI();const seen=quest.steps.filter(step=>Quests.done(step)).map(step=>Quests.name(step));
  assert.equal(lesson().includes('уже засчитана'),seen.length>0,quest.id+' mentions credited targets only when it has them');
  for(const name of seen)assert.ok(lesson().includes(flat(ExpeditionTutorial.typeset(name))),name+' is named in '+quest.id);}
 {const closed=QUESTS.find(q=>Quests.locked(q));assert.ok(closed,'a locked quest exists');Quests.view=closed.id;renderUI();
  assert.equal(lesson(),flat('<p>Этот квест пока закрыт. Вернитесь к списку и выберите другой.</p>'+free));assert.equal($('tutorialAlt').hidden,false);}
 Quests.view=null;Quests.close();renderUI();assert.equal($('tutorialTitle').textContent,'Квесты');assert.equal($('tutorialAlt').hidden,true);
 assert.equal(space(),true);assert.equal(Quests.isOpen,true);assert.equal($('tutorialAlt').hidden,true);
 Quests.view=Quests.starterId;renderUI();assert.equal($('tutorialAlt').hidden,false);
 $('tutorialAlt').onclick();assert.equal(Quests.isOpen,false);assert.equal(state.tutorialStep,'farewell');assert.deepEqual(state.quests.active,[]);assert.equal(state.quests.starterPending,undefined);
 assert.ok(!Quests.listHTML(Quests.visitedSet()).includes('is-recommended'));
 assert.ok(lesson().startsWith('<p>Вы выбрали свободный полёт. Квесты можно открыть в любой момент кнопкой <span class="tutorial-icon" role="img" aria-label="кнопка «Квесты»"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#quest-icon"/></svg></span>.</p>')&&lesson().endsWith('<p>Счастливого пути!</p>'));
 assert.equal($('tutorialNext').textContent,'Начать экспедицию [Пробел]');assert.equal($('tutorialAlt').hidden,true);
 assert.equal(space(),true);assert.equal(state.tutorialStep,null);assert.deepEqual(state.quests.active,[],'free flight starts no quest');
 assert.deepEqual(ExpeditionTutorial.heldButtons.map(id=>$(id).inert),[false,false,false,false,false]);}
{globalThis.sessionStorage=storage();state=restore(atQuests);ExpeditionTutorial.openSession(true);renderUI();assert.equal(state.tutorialStep,'quests');
 const other=QUESTS.find(q=>q.id!==Quests.starterId&&!Quests.locked(q));
 assert.equal(space(),true);assert.equal(Quests.isOpen,true);assert.equal(state.tutorialStep,'quests');
 assert.equal($('tutorialNext').hidden,true);assert.equal(Quests.view,Quests.starterId,'the panel reopens on the quest viewed last');assert.equal($('tutorialAlt').hidden,false);
 Quests.view=null;renderUI();assert.equal($('tutorialAlt').hidden,true);
 assert.equal(Quests.start(other.id),true);assert.equal(state.tutorialStep,'farewell','any quest ends the choice');
 assert.ok(lesson().startsWith(flat('<p>Квест «'+other.title+'» начат. Его цели отмечены на карте флажками.</p>')));
 ExpeditionTutorial.launched({target:'sirius'});assert.equal(state.tutorialStep,null,'an own flight ends the farewell');
 assert.deepEqual(state.quests.active,[other.id],'the starter quest is not added to the chosen one');Quests.close();}
globalThis.sessionStorage=storage();state=restore(atQuests);ExpeditionTutorial.openSession(true);renderUI();
assert.equal(Quests.start(Quests.starterId),true);assert.equal(state.tutorialStep,'farewell');
assert.ok(lesson().startsWith('<p>Квест «Соседи Солнца» начат.'));
globalThis.sessionStorage=storage();state=restore(FlightHistory.snapshot());ExpeditionTutorial.openSession(true);renderUI();assert.equal(state.tutorialStep,'farewell');
$('tutorialNext').onclick();
assert.equal(state.tutorialStep,null);assert.deepEqual(state.quests.active,['neighbours']);assert.equal(state.quests.starterPending,undefined);
assert.deepEqual(ExpeditionTutorial.heldButtons.map(id=>$(id).inert),[false,false,false,false,false]);
state=restore(atQuests);ExpeditionTutorial.setStep('zen');ExpeditionTutorial.finish();
assert.equal(state.tutorialStep,null);assert.deepEqual(state.quests.active,['neighbours']);
`);
{const css=fs.readFileSync('dist/style.css','utf8'),index=fs.readFileSync('dist/index.html','utf8'),
  slots=css.split('#app[data-tutorial-parts~="search"] #questBtn[hidden] { display: grid !important; }')[0].split('}\n').at(-2),
  packed=css.split('#app[data-tutorial-parts~="welcome"] .map-panel { bottom: 0; }\n')[1].split('}\n')[0],
  order=[...index.split('<div class="map-actions">')[1].split('</div>')[0].matchAll(/<button[^>]* id="(\w+)"/g)].map(m=>m[1]);
 if(order.join()!=='shipBtn,themeBtn,questBtn,catalogBtn,mapFilterBtn,libraryBtn,resetBtn,settingsBtn,zenBtn')throw new Error('top buttons: '+order);
 if(!packed.trimEnd().endsWith('{\n  display: none;')||!packed.includes(':not([data-tutorial-parts~="search"]) :is(#catalogBtn, #mapFilterBtn, #shipBtn, #resetBtn, #zenBtn)'))throw new Error('before the button tour the visible top buttons stand side by side');
 if(!slots.trimEnd().endsWith('{\n  visibility: hidden;'))throw new Error('during the tour unrevealed top buttons keep their places');
 for(const id of ['mapFilterBtn','shipBtn','resetBtn','zenBtn','questBtn'])if(!slots.includes('#app[data-tutorial-parts~="search"]:not(')||!slots.includes(' #'+id))throw new Error('no reserved place: '+id);
 if(!css.includes('#app[data-tutorial="collector"] #configureFlightLabel {\n  color: var(--tutorial-ink);'))throw new Error('the collector lesson marks the detailed plan');
 if(!css.includes('.tutorial-copy p { margin: 0; text-wrap: pretty; }')||!css.includes('.tutorial-nowrap { white-space: nowrap; }'))throw new Error('lesson paragraphs avoid stray last words and broken hyphenated words');
 if(!index.includes('<symbol id="quest-icon"'))throw new Error('the farewell draws the quest button icon');}
run(`
console.log('PASS tutorial: Andromeda by supernova, flight time, slow zoom-out to the Universe, flight limit, object legend, top-menu tour, quests and farewell');
`);
