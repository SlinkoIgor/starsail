import fs from 'node:fs';
const harness=fs.readFileSync('tests/verify-map.mjs','utf8').split('\nrun(`')[0]
 .replace('devicePixelRatio:1,addEventListener(){}','devicePixelRatio:1,addEventListener(type,handler){(this.listeners??={})[type]=handler;}')+'\nexport {run};';
const {run}=await import('data:text/javascript,'+encodeURIComponent(harness));
run(`
function space(options={}){
 let consumed=false;
 window.listeners.keydown({key:' ',code:'Space',target:{closest:()=>null},preventDefault(){consumed=true;},...options});
 return consumed;
}
function assertSolarView(){
 const sun=screen(object('sol'));
 assert.equal(cam.span,SOLAR_CAMERA_SPAN);
 assert.ok(Math.abs(sun.x-width/2)<1e-6);
 assert.ok(Math.abs(sun.y-cameraViewportHeight()/2)<1e-6);
}
assertSolarView();
assert.equal($('infoDialog').open,false,'the first visit needs no reset confirmation');
assert.equal(state.selected,'sol');
assert.deepEqual(state.quests.active,[]);
assert.equal(Quests.nextTarget(),null);
assert.equal($('questCount').hidden,true);
const firstTutorial=FlightHistory.snapshot();
const earthOrbit=OrbitalMotion.planets.find(q=>q.name==='ЗЕМЛЯ');
const physicalEarth=()=>OrbitalMotion.vector(earthOrbit,OrbitalMotion.phase(earthOrbit));
function assertOnEarth(){
 assert.equal(Space.distance(state.ship,{p3:physicalEarth()}),0);
 assert.deepEqual(FlightView.ship(),OrbitalMotion.planetPoint(earthOrbit,OrbitalMotion.phase(earthOrbit)));
}
assert.equal(object('planet-ЗЕМЛЯ')?.navigable,undefined);
assert.ok($('tutorialText').innerHTML.includes('</p><p>Экспедиция стартует с Земли. '));
assert.equal($('shipLocationFrom').textContent,'Стоянка · Земля');
const turns=[];ctx.rotate=angle=>turns.push(angle);
for(const years of [0,.25,.5]){
 Simulation.tick(years);assertOnEarth();
 MapLabels.begin();OrbitalMotion.draw();drawShip(0);MapLabels.draw();
 const pair=['ship','planet-ЗЕМЛЯ'].map(key=>MapLabels.placed.filter(q=>q.key===key));
 assert.ok(pair.every(q=>q.length===1),'both labels appear exactly once');
 assert.equal(MapLabels.overlaps(pair[0][0],pair[1][0]),false);
 assert.ok(pair.every(([q])=>Math.hypot(q.x-screen(state.ship).x,q.y-screen(state.ship).y)<90));
}
assert.deepEqual(turns,[0,0,0],'a ship parked on Earth keeps its resting heading while the planet moves');
state.selected='planet-МАРС';drawShip(0);assert.equal(turns.pop(),0,'a planet is not a heading target');
state.selected='proxima';drawShip(0);assert.notEqual(turns.pop(),0,'a flight target still turns the ship');
state.selected='sol';delete ctx.rotate;
assert.notDeepEqual(state.ship.p3,firstTutorial.ship.p3);
state=restore(firstTutorial);assertOnEarth();
assert.equal(speed,.1);assert.equal(paused,false);
assert.equal($('timeSlider').value,'1');
assert.equal(state.startYear,new Date().getFullYear());
assert.equal($('shipClock').textContent,String(state.startYear));
assert.equal($('earthClock').textContent,String(state.startYear));
assert.equal($('app').dataset.tutorial,'welcome');assert.equal($('tutorialCard').hidden,false);
assert.equal($('tutorialTitle').textContent,'Добро пожаловать на «Ковчег»');assert.equal($('tutorialNext').textContent,'Начать обучение (Пробел)');
assert.equal($('skipTutorial').hidden,false);
Notices.render('Проверка связи.');renderUI();
assert.equal($('toast').textContent,'Проверка связи.');assert.equal($('tutorialCard').hidden,false);
const storage = () => {
 const data = new Map();
 return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
};
globalThis.sessionStorage=storage();
globalThis.localStorage=storage();
ExpeditionTutorial.openSession(false);
assert.equal(state.tutorialStep,'welcome');
assert.equal(ExpeditionTutorial.allows('zoom'),false);
const solarLimit=SolarView.limit(),solarFrame=()=>{
 const sun=screen(object('sol'));
 assert.ok(Math.abs(sun.x-width/2)<1e-6&&Math.abs(sun.y-cameraViewportHeight()/2)<1e-6,'the Sun stays centred at the limit');
 for(const q of OrbitalMotion.planets)for(let n=0;n<72;n++){
  const p=screen(OrbitalMotion.planetPoint(q,n/72*2*Math.PI));
  assert.ok(p.x>0&&p.x<width&&p.y>0&&p.y<cameraViewportHeight(),q.name+' orbit fits in the widest tutorial view');
 }
};
assert.ok(solarLimit>SOLAR_CAMERA_SPAN&&solarLimit<zoomStops.at(-1).span);
assert.equal(clampCameraSpan(1e9),solarLimit);
zoomAtPointer({preventDefault(){},deltaY:220,clientX:40,clientY:60});
assert.ok(cam.span>SOLAR_CAMERA_SPAN&&cam.span<solarLimit,'the first tutorial steps allow zooming out');
{const sun=screen(object('sol'));assert.ok(sun.x>0&&sun.x<width&&sun.y>0&&sun.y<cameraViewportHeight());}
for(let i=0;i<40;i++)zoomAtPointer({preventDefault(){},deltaY:220,clientX:40,clientY:60});
assert.equal(cam.span,solarLimit);solarFrame();
goCamera(cam.x+1,cam.y+1,1e6);assert.equal(cameraGoal.span,solarLimit);cam={...cameraGoal};cameraGoal=null;solarFrame();
for(let i=0;i<60;i++)zoomAtPointer({preventDefault(){},deltaY:-220,clientX:width/2,clientY:cameraViewportHeight()/2});
assert.equal(cam.span,minimumCameraSpan());
goCamera(...Object.values(centeredCamera(MapLayout.project(object('sol')),SOLAR_CAMERA_SPAN)));cam={...cameraGoal};cameraGoal=null;assertSolarView();
$('menu').hidden=false;assert.equal(space(),false);assert.equal(state.tutorialStep,'welcome');
$('menu').hidden=true;assert.equal(space(),true);
assert.equal($('tutorialNext').textContent,'Далее (Пробел)');assert.equal(paused,false);
assert.equal(space({repeat:true}),true);assert.equal(space({shiftKey:true}),false);
assert.equal(state.tutorialStep,'time');assert.equal($('skipTutorial').hidden,true);
setTimeRate(10);ExpeditionTutorial.openSession(true);
assert.equal(state.timeScale,10,'resuming the first step keeps the selected rate');
assert.equal(space(),true);
assert.equal(state.tutorialStep,'clocks');assert.equal($('app').dataset.tutorial,'clocks');
assert.match($('tutorialText').innerHTML,/13,8 млрд лет/);assert.equal($('tutorialText').innerHTML.split('<p>').length,4);
assert.equal(SolarView.limit(),solarLimit,'the limit holds until the scale step');
state=restore(FlightHistory.snapshot());ExpeditionTutorial.openSession(true);
assert.equal(state.tutorialStep,'clocks');assert.equal(state.timeScale,10);assert.deepEqual(state.quests.active,[]);
for(const step of ['zoom','mass','acceleration','velocity','dilation','destination']){
 $('tutorialNext').onclick();
 assert.equal(state.tutorialStep,step);assert.equal($('skipTutorial').hidden,true);
 assert.ok($('app').dataset.tutorialParts.split(' ').includes('clocks'));
 assert.ok(ExpeditionTutorial.allows('zoom'));
 assert.equal(SolarView.limit(),null);assert.ok(clampCameraSpan(1e99)>=zoomStops.at(-1).span);
}
ExpeditionTutorial.openSession(true);
assert.equal(state.tutorialStep,'destination','refresh in the same session resumes the current step');
assert.ok(cameraGoal && ExpeditionTutorial.target(object('proxima')));
cam = {...cameraGoal};
for (const id of ['sol','proxima']) {
 const p=screen(object(id));assert.ok(p.x>0&&p.x<width&&p.y>0&&p.y<height,id+' fits in the tutorial overview');
}
state=restore(FlightHistory.snapshot());
assert.equal(space(),false);assert.equal(state.tutorialStep,'destination');
state.flightSetup={...FlightSetup.defaults(),engine:false,sail:true,collector:true};
const savedOptions=JSON.stringify(state.flightSetup);
select('proxima');assert.equal($('app').dataset.tutorial,'propulsion');
assert.equal(ExpeditionTutorial.target(object('proxima')),false);
for(const id of ['arrivalProper','arrivalEarth']){
 const duration=$(id).textContent;assert.ok(duration && duration!=='—');assert.ok($('tutorialText').innerHTML.includes(duration));
}
assert.equal($('tutorialTitle').textContent,'Расстояние и время в пути');
assert.ok($('tutorialText').innerHTML.includes('До Проксимы '+$('targetDistance').textContent+'.'));
assert.deepEqual(state.quests.active,[],'selecting the star is still part of the tutorial');
const guided=FlightSetup.read();
assert.ok(guided.engine && !guided.sail && !guided.collector && !guided.burst && guided.brakeEngine && guided.brakeSail);
assert.equal(space(),true);assert.equal(state.tutorialStep,'launch');assert.equal(space(),false);
assert.match($('tutorialText').innerHTML,/Выберите темп 1× — тогда перелёт займёт около [0-9]+ секунд/);
assert.equal($('tutorialText').innerHTML.split('<p>').length,2,'the launch hint is one paragraph');assert.equal(state.flight,null);
assertOnEarth();
$('launchBtn').onclick();assert.equal($('tutorialCard').hidden,true);
const departure=physicalEarth(),departureOnMap=OrbitalMotion.planetPoint(earthOrbit,OrbitalMotion.phase(earthOrbit));
assert.deepEqual(state.flight.from.p3,departure);
assert.deepEqual(FlightView.at(state.flight,0),departureOnMap);
assert.equal($('shipLocationFrom').textContent,'Земля');
assert.equal(state.flight.distance,Space.distance(state.flight.from,object('proxima')));
assert.ok(state.flight.mission.setup.engine && !state.flight.mission.setup.sail);
assert.equal(JSON.stringify(state.flightSetup),savedOptions);
assert.equal(state.flight.target,'proxima');assert.equal(state.tutorialStep,'flight');
assert.deepEqual(Quests.activeIds,[]);assert.equal(Quests.flightStory(),null);assert.equal(state.quests.starterPending,true);
const guidedFlight=FlightHistory.snapshot();
globalThis.sessionStorage=storage();state=restore(guidedFlight);ExpeditionTutorial.openSession(true);renderUI();
assert.equal(state.tutorialStep,'flight');assert.equal(Quests.flightStory(),null);
Simulation.tick(.2);assert.notDeepEqual(physicalEarth(),departure);
assert.deepEqual(FlightView.at(state.flight,0),departureOnMap,'the departure point stays fixed');
FlightHistory.cancel();assertOnEarth();assert.equal(state.tutorialStep,'launch');assert.equal(Quests.suspended,true);
$('launchBtn').onclick();Simulation.tick(state.flight.mission.proper*1.00001);renderUI();
assert.equal(state.current,'proxima');assert.equal(state.tutorialStep,'flight');
assert.equal(Quests.pending,null);assert.deepEqual(state.quests.active,[]);assert.equal($('tutorialNext').textContent,'Завершить обучение');
assert.equal($('tutorialText').innerHTML,'<p>Вы у Проксимы Центавра. В карточке звезды — время в пути: на борту прошло меньше, чем на Земле.</p>');
$('tutorialNext').onclick();assert.equal(state.tutorialStep,null);assert.deepEqual(state.quests.active,['neighbours']);
assert.equal(state.quests.starterPending,undefined);
// An already airborne tutorial from the old launch behaviour can resume on update.
state=restore({...guidedFlight,tutorialStep:null,quests:{...Quests.blank(),active:['neighbours']}});
globalThis.sessionStorage=storage();ExpeditionTutorial.openSession(true);renderUI();
assert.equal(state.tutorialStep,'flight');assert.equal(Quests.flightStory(),null);
ExpeditionTutorial.finish();state=restore(FlightHistory.snapshot());ExpeditionTutorial.openSession(true);
assert.equal(state.tutorialStep,null,'explicitly leaving during the flight survives reload');
setTimeRate(0);
const oldExpedition=state,oldFlight=state.flight,number=state.expedition;
$('startTutorial').onclick();assert.equal($('infoDialog').open,true);
assert.ok($('dialogContent').innerHTML.includes('<h2>Начать обучение?</h2><p>Текущий прогресс будет сброшен.</p>'));
$('closeDialog').onclick();
assert.equal(state,oldExpedition);assert.equal(state.flight,oldFlight);assert.equal(state.tutorialStep,null);
$('startTutorial').onclick();$('confirmReset').onclick();
assert.equal($('infoDialog').open,false);assertSolarView();assertOnEarth();
assert.equal(state.expedition,number+1);assert.equal(state.flight,null);assert.equal(state.phase,'idle');
assert.equal(state.proper,0);assert.equal(state.earth,0);assert.equal(state.matter,Rocket.initialFuel);
assert.deepEqual(state.flightHistory,[]);assert.deepEqual(state.visited,['sol']);assert.deepEqual(state.itinerary,[]);
assert.equal(speed,.1);assert.equal(paused,false);assert.equal(state.timeScale,.1);assert.equal(state.tutorialStep,'welcome');
assert.equal($('mapTitle').textContent,'Солнечная система');assert.equal($('expeditionNumber').textContent,String(number+1).padStart(2,'0'));
state=restore(FlightHistory.snapshot());ExpeditionTutorial.openSession(true);assert.equal(state.expedition,number+1);assertOnEarth();
$('skipTutorial').onclick();assert.equal(state.tutorialStep,null);assert.equal($('tutorialCard').hidden,true);
assert.deepEqual(state.quests.active,['neighbours']);
ExpeditionTutorial.openSession(false);assert.equal(state.tutorialStep,null,'the profile has already seen the introduction');
$('startTutorial').onclick();$('confirmReset').onclick();globalThis.sessionStorage=storage();
ExpeditionTutorial.openSession(true);assert.equal(state.tutorialStep,null,'a new session ignores an unfinished old step');
$('resetBtn').onclick();$('confirmReset').onclick();
assert.equal(state.expedition,number+3);assert.equal(state.tutorialStep,null);assert.deepEqual(state.ship.p3,object('sol').p3);assertSolarView();assert.equal(speed,1);
assert.deepEqual(state.quests.active,['neighbours']);
ExpeditionTutorial.openSession(true);assert.equal(state.tutorialStep,null);
$('startTutorial').onclick();$('confirmReset').onclick();assert.equal(state.tutorialStep,'welcome');assert.equal(state.expedition,number+4);assertOnEarth();
assert.equal($('startTutorial').textContent,'Отключить обучение');$('startTutorial').onclick();
assert.equal(state.tutorialStep,null);assert.equal($('infoDialog').open,false);assert.equal(state.expedition,number+4);
assert.equal($('startTutorial').textContent,'Начать обучение');
state=restore(firstTutorial);
$('skipTutorial').onclick();
assert.equal(state.flight,null);assert.deepEqual(state.quests.active,['neighbours']);
assert.equal(Quests.nextTarget().step.id,'proxima');assert.equal($('questCount').hidden,false);
state=restore(firstTutorial);globalThis.sessionStorage=storage();
ExpeditionTutorial.openSession(true);
assert.equal(state.tutorialStep,null);assert.deepEqual(state.quests.active,['neighbours'],'returning after closing the tutorial tab activates the deferred quest');
state=restore(firstTutorial);assert.equal(Quests.start('neighbours'),false);$('skipTutorial').onclick();
assert.deepEqual(state.quests.active,['neighbours'],'the deferred starter quest activates when the tutorial ends');
state=restore({...initial(),quests:Quests.blank()});
$('startTutorial').onclick();$('confirmReset').onclick();$('skipTutorial').onclick();assert.deepEqual(state.quests.active,['neighbours']);
const legacy=initial();delete legacy.tutorialStep;delete legacy.startYear;legacy.timeScale=.5;
const migrated=restore(legacy);
assert.equal(migrated.tutorialStep,null);assert.equal(migrated.timeScale,.1);
assert.equal(migrated.startYear,new Date().getFullYear());
state=restore({...initial(),startYear:1999,proper:3.4,earth:5.8,universeElapsed:5.8});renderUI();
assert.equal($('shipClock').textContent,'2002');assert.equal($('earthClock').textContent,'2004');
assert.equal($('universeClock').textContent,fmt(INITIAL_UNIVERSE_AGE+5,0));
state=initial();paused=true;speed=100;Simulation.debt=0;Simulation.wallDebt=0;
for(const rate of [.1,1,10,100,1000]){
 setTimeRate(rate);assert.equal(speed,rate);assert.equal(paused,false);assert.equal($('timeSlider').value,String(TIME_RATES.indexOf(rate)));
 const start=state.proper;Simulation.advance(.1);assert.ok(Math.abs(state.proper-start-rate*.1)<1e-8);
 setTimeRate(0);assert.equal(paused,true);assert.equal(speed,rate);assert.equal($('timeSlider').value,'0');
 const stopped=state.proper;Simulation.advance(10);assert.equal(state.proper,stopped);assert.equal(state.paused,true);assert.equal(state.timeScale,rate);
}
const saved=JSON.parse(JSON.stringify(state));state=restore(saved);paused=!!state.paused;speed=state.timeScale;updateTimeControl();assert.equal(paused,true);assert.equal(speed,1000);assert.equal($('timeSlider').value,'0');
setTimeRate(10);assert.equal(paused,false);assert.equal(speed,10);assert.equal($('timeSlider').value,'3');
setTimeRate(123);assert.equal(speed,10);assert.equal(paused,false);
setTimeRate(0);assert.equal(paused,true);assert.equal(speed,10);
setTimeRate(.1);assert.equal($('timeSlider').value,'1');assert.equal($('timeRate').textContent,'1 с = 0,1 года на борту');assert.equal(state.timeScale,.1);
setTimeRate(0);assert.equal(speed,.1);assert.equal(state.timeScale,.1);assert.equal(state.paused,true);
console.log('PASS time rail: 0 pauses, positive rates resume, clocks follow selected tempo, previous rate persists and invalid rates are ignored');
`);
