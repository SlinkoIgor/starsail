import fs from 'node:fs';
const harness=fs.readFileSync('tests/verify-map.mjs','utf8').split('\nrun(`')[0]+'\nexport {run};';const {run}=await import('data:text/javascript,'+encodeURIComponent(harness));
run(`{
OrbitalArrival.enabled=true;state=initial();Cosmology.sync(state);
let c=FlightSetup.read();assert.equal(c.arrivalFuelPercent,50);assert.ok(!c.sail&&!c.collector&&!c.burst&&c.engine);assert.equal(state.departureMode,'engine');
for(const percent of [0,35,65]){state.flightSetup=FlightSetup.normalize({sail:true,collector:true,arrivalFuelPercent:percent});state=restore(JSON.parse(JSON.stringify(state)));assert.equal(FlightSetup.preferred().arrivalFuelPercent,percent);}
state=initial();state.flightSetup=FlightSetup.normalize({sail:true,collector:true,burst:true,dump:true,arrivalFuelPercent:65});state.current='boss-wall';state.ship=Space.point(object(state.current).p3);const helperHost=object(state.current),helper=ExtendedCatalog.pin({...ExtendedCatalog.arrivalStar(helperHost),id:'legacy-policy-star',p3:V3.add(helperHost.p3,[.12,0,0])});state.selected=helper.id;Cosmology.sync(state);FlightSetup.sync();
const pref=JSON.stringify(state.flightSetup);c=FlightSetup.read();assert.ok(c.engine&&!c.sail&&!c.collector&&!c.burst&&!c.dump);assert.equal(state.departureMode,'engine');assert.equal(c.arrivalFuelPercent,65);
const p=MissionPlanner.preview();assert.ok(p.valid,p.reason);assert.ok(p.setup.engine&&!p.setup.sail&&!p.setup.burst);renderUI();assert.equal($('launchBtn').disabled,false);
FlightBuilder.open();assert.ok(FlightBuilder.draft.engine&&!FlightBuilder.draft.sail&&!FlightBuilder.draft.burst);assert.equal($('setupSail').disabled,true);assert.equal($('setupCollector').disabled,true);assert.equal($('setupEngine').checked,true);assert.equal($('launchConfigured').disabled,false);FlightBuilder.apply();assert.equal(JSON.stringify(state.flightSetup),pref);
state.current='alpha';state.ship=Space.point(object('alpha').p3);FlightSetup.sync();c=FlightSetup.read();assert.ok(c.sail&&c.collector&&c.burst&&c.dump);assert.equal(state.departureMode,'burst');
state.destroyed.push('alpha');assert.ok(FlightSetup.read().engine&&!FlightSetup.read().sail);assert.equal(JSON.stringify(state.flightSetup),pref);
state=initial();state.expansion=false;state.current='bode';state.ship=Space.point(object('bode').p3);state.selected='alpha';state.matter=.0002;state.flightSetup=FlightSetup.normalize({sail:true,collector:true,arrivalFuelPercent:65});const capHost=object('bode'),capStar=ExtendedCatalog.pin({...ExtendedCatalog.arrivalStar(capHost),id:'legacy-cap-star',p3:V3.add(capHost.p3,[.12,0,0])});state.selected=capStar.id;
const capped=MissionPlanner.preview();assert.ok(capped.valid,capped.reason);assert.equal(capped.requestedArrivalFuelPercent,65);assert.ok(capped.reserveLimited&&capped.setup.arrivalFuelPercent<65);assert.equal(FlightSetup.preferred().arrivalFuelPercent,65);
FlightBuilder.open();FlightBuilder.apply();assert.equal(FlightSetup.preferred().arrivalFuelPercent,65);const target=state.selected;launch();assert.ok(state.flight);assert.ok(state.flight.mission.setup.engine&&!state.flight.mission.setup.burst);const active=JSON.stringify(state.flight.mission);state=restore(JSON.parse(JSON.stringify(state)));assert.equal(JSON.stringify(state.flight.mission),active);Simulation.tick(FlightEstimate.get().proper);assert.equal(state.current,target);assert.equal(FlightSetup.read().arrivalFuelPercent,65);assert.ok(FlightSetup.read().sail&&FlightSetup.read().collector&&!FlightSetup.read().burst);
const old={...initial(),version:12,current:'boss-wall',flightSetup:FlightSetup.normalize({engine:true,arrivalFuelPercent:0}),transferSetup:{starId:'old-helper',setup:FlightSetup.normalize({sail:true,collector:true,arrivalFuelPercent:35})}};state=restore(old);assert.equal(state.version,13);assert.equal(state.transferSetup,null);assert.equal(FlightSetup.preferred().arrivalFuelPercent,35);assert.ok(FlightSetup.preferred().sail);assert.equal(object(state.current).parentObject,'boss-wall');assert.ok(FlightSetup.read().sail);
console.log('PASS new defaults, explicit reserves including zero, automatic engine fallback, coherent card/builder/launch, preserved optics and reserve preferences, capped short trip, active-plan migration and old helper restore');
}`);

run(`{
 const matchMedia=window.matchMedia;
 try {
  window.matchMedia=()=>({matches:true});
  state=initial();state.expansion=false;state.selected='alpha';paused=true;
  const preference=JSON.stringify(state.flightSetup),check=c=>assert.ok(c.engine&&c.sail&&c.collector&&!c.dump&&c.brakeEngine&&c.brakeSail&&c.collectGas);
  check(FlightSetup.read());assert.equal(FlightSetup.read().burst,false,'the mobile preset never explodes the Sun');
  const source=object('alpha');
  const c=MissionPlanner.legSetup({...state.flightSetup,engine:false,dump:true},source,new Set());
  check(c);assert.equal(c.burst,true,'queued departures also use all available propulsion');
  const used=MissionPlanner.legSetup(c,source,new Set(['alpha']));
  assert.ok(used.engine&&!used.sail&&!used.collector&&!used.burst&&!used.dump);
  assert.equal(FlightSetup.departure(c,null).sail,false,'no optical departure without a star');
  assert.equal(JSON.stringify(state.flightSetup),preference,'mobile resolution leaves desktop preferences intact');
  const oldRect=$('flightCard').getBoundingClientRect,oldWidth=width,oldHeight=height,oldHud=hudHeight;
  $('flightCard').getBoundingClientRect=()=>({left:0,top:272,width:844,height:118});width=844;height=390;hudHeight=0;
  const viewport=routeViewport();assert.equal(viewport.top,64);assert.ok(viewport.bottom<272&&viewport.right>750,'landscape routes stay above the full-width card');
  $('flightCard').getBoundingClientRect=oldRect;width=oldWidth;height=oldHeight;hudHeight=oldHud;
  launch();assert.ok(state.flight?.mission.valid);check(state.flight.mission.setup);
  paused=true;
  const flying=JSON.stringify([state.flight,state.ship,state.matter,state.proper,state.earth]);
  state=restore(JSON.parse(JSON.stringify(state)));
  assert.equal(JSON.stringify([state.flight,state.ship,state.matter,state.proper,state.earth]),flying,'mobile flight restores exactly');
  window.matchMedia=()=>({matches:false});
  const active=JSON.stringify(FlightSetup.read());
  window.matchMedia=()=>({matches:true});
  assert.equal(JSON.stringify(FlightSetup.read()),active,'changing screen size cannot change an active setup');
  Simulation.tick(FlightEstimate.get().proper*1.00001);
  assert.equal(state.current,'alpha');check(FlightSetup.read());assert.equal(FlightSetup.read().burst,true);
  assert.equal(JSON.stringify(state.flightSetup),preference);
  window.matchMedia=()=>({matches:false});
  assert.ok(!FlightSetup.read().sail&&!FlightSetup.read().collector,'desktop regains its existing choices');
  console.log('PASS mobile automatic propulsion, Solar and remnant fallback, queued setup, real arrival, exact reload and desktop preferences');
 } finally { window.matchMedia=matchMedia; }
}`);

run(`{
 const capture=canvas.setPointerCapture;
 canvas.setPointerCapture=()=>{};
 const touch=(pointerId,x,y,timeStamp=100)=>({pointerId,pointerType:'touch',clientX:x,clientY:y,timeStamp});
 try {
  state=initial();paused=true;cam={x:2,y:3,span:24};followShip=true;
  MapTouch.points.clear();MapTouch.pinch=null;MapPointer.bounds=null;
  assert.equal(MapTouch.start(touch(1,100,200)),false);
  assert.equal(MapTouch.start(touch(2,200,200)),true);
  assert.equal(followShip,false);assert.equal(pointer.down,false);
  const anchor=world(150,200);
  MapTouch.move(touch(2,300,200));
  assert.equal(cam.span,12,'doubling finger distance zooms in twice');
  const shifted=world(200,200);
  assert.ok(Math.hypot(anchor.x-shifted.x,anchor.y-shifted.y)<1e-12,'pinch midpoint keeps the same map point');
  for (const [limit, past, back] of [[zoomStops.at(-1).span, 150, 155], [SOLAR_CAMERA_SPAN, 350, 345]]) {
    goCamera(cam.x,cam.y,limit,true);
    MapTouch.move(touch(2,past,200));
    assert.equal(cam.span,limit,'pinch stops at the same limit as the scale rail');
    MapTouch.move(touch(2,back,200));
    assert.ok(limit===SOLAR_CAMERA_SPAN ? cam.span>limit : cam.span<limit,'reversing the gesture leaves the limit immediately');
  }
  assert.equal(MapTouch.end(touch(2,300,200)),true);
  assert.ok(pointer.down&&pointer.moved&&pointer.id===1,'remaining finger continues a drag without selecting a target');
  MapTouch.end(touch(1,100,200));
  assert.equal(MapTouch.points.size,0);
  MapTouch.lastTap=null;
  assert.equal(MapTouch.doubleTap(touch(1,100,200,100),'alpha'),false);
  assert.equal(MapTouch.doubleTap(touch(1,104,202,300),'alpha'),true);
  assert.equal(MapTouch.doubleTap(touch(1,104,202,320),'alpha'),false,'a third tap is not a second launch');
  assert.equal(MapTouch.doubleTap(touch(1,104,202,800),'alpha'),false,'separate taps do not launch');
  assert.equal(MapTouch.doubleTap(touch(1,104,202,900),'sirius'),false,'different targets do not launch');
  console.log('PASS two-finger anchored zoom, remaining-finger drag, tap suppression and explicit timed double tap');
 } finally { canvas.setPointerCapture=capture;MapTouch.points.clear();MapTouch.pinch=MapTouch.lastTap=null;pointer.down=false; }
}`);
