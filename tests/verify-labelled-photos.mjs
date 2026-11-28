import fs from 'node:fs';
import assert from 'node:assert/strict';
const harness=fs.readFileSync('tests/verify-map.mjs','utf8').split('\nrun(`')[0]+'\nexport {context,run};';
const {context,run}=await import('data:text/javascript,'+encodeURIComponent(harness)+'#labelled-photos');
context.URL=URL;
const registry=JSON.parse(fs.readFileSync('data-tools/sky-sources/labelled-variants.json'));
const frozen=new Map(['media-astropix.json','media-webb.json'].flatMap(name=>JSON.parse(fs.readFileSync('data-tools/sky-sources/'+name)).records).map(p=>[p.id,p]));
const articles=new Map(JSON.parse(fs.readFileSync('data-tools/sky-sources/wikipedia.json')).records.filter(r=>r.media).map(r=>[r.media.id,r.media]));
const index=run('SKY_PHOTO_INDEX'),wiki=run('WIKIPEDIA_INDEX'),hosts=run('SkyPhotos.labelHosts');
const shipped={},shippedWiki={};
for(const entry of Object.values(index.files))Object.assign(shipped,JSON.parse(fs.readFileSync('dist/'+entry.url.split('?')[0])).photos);
for(const entry of Object.values(wiki.files))Object.assign(shippedWiki,JSON.parse(fs.readFileSync('dist/'+entry.url.split('?')[0])).photos);
const fields=['title','url','source','credit','rights','archive','archiveLabel'],pick=l=>Object.fromEntries(fields.map(k=>[k,l[k]]));

assert.equal(registry.version,1);
assert.ok(registry.records.length>=15,'a rule for the whole collection, not one replaced picture');
assert.ok(registry.feedRecords>=9000&&registry.pagesRead>100&&registry.candidates>registry.records.length,'candidates were measured, not assumed');
for(const method of ['astropix-release-twin','publisher-page-link'])assert.ok(registry.records.some(r=>r.evidence.method===method),method);
const owners=new Set();
for(const r of registry.records){
 const l=r.labelled,e=r.evidence,clean=r.collection==='wikipedia'?articles.get(r.photo):frozen.get(r.photo);
 assert.ok(clean,'the clean frame is a frozen record: '+r.photo);
 assert.ok(/annotat|labell?ed/i.test(l.title)&&!/unannotated|unlabell?ed/i.test(l.title),'the publisher calls the frame labelled: '+r.photo);
 assert.ok(l.url.startsWith('https://')&&hosts.includes(new URL(l.url).hostname)&&l.source.startsWith('https://')&&l.credit&&l.rights,r.photo);
 assert.notEqual(l.url,clean.url);
 assert.ok(l.archive.startsWith('https://')&&l.archiveLabel,'the catalogue page of the labelled frame is known: '+r.photo);
 assert.equal(l.archiveLabel==='AstroPix',e.method==='astropix-release-twin');
 assert.ok(e.hashDistance<=12&&e.colourDifference<=10,'both pixel measures are inside the published thresholds: '+r.photo);
 assert.ok(Math.abs(e.labelledSize[0]/e.labelledSize[1]/(e.cleanSize[0]/e.cleanSize[1])-1)<=.01,'the same proportions: '+r.photo);
 const owner=r.collection+' '+l.url;assert.ok(!owners.has(owner),'one labelled frame replaces one clean frame: '+l.url);owners.add(owner);
}
for(const s of registry.skipped){
 assert.ok(['publisher-not-identified','different-proportions','different-frame','smaller-frame','frame-unavailable','another-variant-is-closer','labelled-frame-replaces-another-photo'].includes(s.reason),s.reason);
 assert.ok(!registry.records.some(r=>r.photo===s.photo&&r.labelled.source===s.candidate),'a rejected candidate is not shown: '+s.photo);
}
for(const reason of ['different-proportions','different-frame'])assert.ok(registry.skipped.some(s=>s.reason===reason&&s.hashDistance>=0),'a wider field or a crop is measured and left out: '+reason);
assert.ok(registry.skipped.some(s=>s.photo==='astropix-esahubble-heic1415c'&&s.reason==='different-proportions'),'an annotated wide field is not a labelled version of its detail');

let attached=0;
for(const r of registry.records.filter(r=>r.collection!=='wikipedia')){
 const p=shipped[r.photo];if(!p)continue;attached++;
 assert.deepEqual(p.labelled,pick(r.labelled),'the builder attaches the registry record unchanged: '+r.photo);
 assert.equal(p.url,frozen.get(r.photo).url,'the clean frame stays in the data: '+r.photo);
}
assert.ok(attached>=15);
assert.equal(Object.values(shipped).filter(p=>p.labelled).length,attached,'no labelled frame without a registry record');
const wikiRecords=registry.records.filter(r=>r.collection==='wikipedia');
assert.ok(wikiRecords.some(r=>r.photo==='wiki-54f5ebaef039d3da'),'the Wikipedia lead image of Alpha Centauri is covered');
for(const r of wikiRecords)if(shippedWiki[r.photo]){assert.deepEqual(shippedWiki[r.photo].labelled,{...pick(r.labelled),instrument:r.labelled.publisherName,band:'иллюстрация статьи Википедии'});assert.equal(shippedWiki[r.photo].url,articles.get(r.photo).url);}
assert.equal(Object.values(shippedWiki).filter(p=>p.labelled).length,wikiRecords.filter(r=>shippedWiki[r.photo]).length);

context.labelledShipped=shipped;context.labelledWiki=shippedWiki;
run(`
for(const [id,p] of Object.entries(labelledShipped)){const publisher=SkyPhotos.publisher(id);if(!SkyPhotos.cache.has(publisher))SkyPhotos.cache.set(publisher,{});SkyPhotos.cache.get(publisher)[id]=p;}
for(const [id,p] of Object.entries(labelledWiki)){const shard=Wikipedia.shard(id);if(!Wikipedia.cache.has(shard))Wikipedia.cache.set(shard,{});Wikipedia.cache.get(shard)[id]=p;}
const annotated='https://cdn.eso.org/images/screen/eso1629f.jpg';
for(const id of ['astropix-eso-eso1629i','astropix-eso-potw2622a','astropix-eso-eso1106c','astropix-eso-eso1002e','astropix-esahubble-heic1415a','astropix-esahubble-potw1425a']){
 const p=labelledShipped[id],shown=SkyGuide.labelled(p);
 assert.ok(SkyPhotos.validPhoto(id,SkyPhotos.publisher(id),p),'a record with a labelled twin stays valid: '+id);
 assert.equal(shown.id,id,'the gallery slide keeps its identity: '+id);
 assert.deepEqual([shown.url,shown.title,shown.source,shown.credit,shown.rights],[p.labelled.url,p.labelled.title,p.labelled.source,p.labelled.credit,p.labelled.rights]);
 assert.deepEqual([shown.archive,shown.archiveLabel,shown.instrument,shown.band],[p.labelled.archive,p.labelled.archiveLabel,p.instrument,p.band]);
 assert.equal(shown.clean,p.url);assert.ok(shown.description.startsWith(p.description)&&shown.description.endsWith(' Показана версия издателя с подписями на кадре.'));
 assert.equal(p.labelled.url===shown.url&&p.url!==shown.url,true,'the stored record is not rewritten');
}
{const plain=Object.values(labelledShipped).find(p=>!p.labelled);assert.equal(SkyGuide.labelled(plain),plain,'a frame without a labelled twin is shown as before');}
{const p=labelledShipped['astropix-eso-eso1629i'],l=p.labelled;
 assert.equal(SkyPhotos.validLabelled(undefined),true);assert.equal(SkyPhotos.validLabelled(l),true);
 for(const bad of [{...l,url:'https://example.org/eso1629f.jpg'},{...l,url:l.url.replace('https:','http:')},{...l,url:l.url.replace('.jpg','.svg')},{...l,source:'http://www.eso.org/'},{...l,credit:''},{...l,rights:''},{...l,title:''},{...l,archive:'ftp://www.eso.org/'},{...l,archiveLabel:''},{}])
  assert.equal(SkyPhotos.validLabelled(bad),false,JSON.stringify(bad));
 assert.equal(SkyPhotos.validPhoto(p.id,'eso',{...p,labelled:{...l,url:'https://example.org/a.jpg'}}),false,'a foreign host cannot arrive through a labelled twin');
 const w=labelledWiki['wiki-54f5ebaef039d3da'];assert.equal(Wikipedia.valid(w.id,w),true);
 assert.equal(Wikipedia.valid(w.id,{...w,labelled:{...w.labelled,url:'https://example.org/a.jpg'}}),false);}
{const o=object('proxima'),gallery=SkyGuide.gallery(o),clean=labelledShipped['astropix-eso-eso1629i'].url;
 assert.ok(SkyPhotos.ids(o).includes('astropix-eso-eso1629i'));
 assert.ok(gallery.includes('data-photo-src="'+annotated+'" data-photo-clean="'+SkyGuide.escape(clean)+'"'),'Proxima: the labelled frame is shown, the clean one is the fallback');
 assert.ok(!gallery.includes('data-photo-src="'+SkyGuide.escape(clean)+'"'));
 assert.ok(gallery.includes('<strong>The sky around Alpha Centauri and Proxima Centauri (annotated)</strong>')&&gallery.includes('href="https://www.eso.org/public/images/eso1629f/"'));
 assert.ok(!gallery.includes('https://www.astropix.org/image/eso/eso1629i'),'the archive link follows the shown frame');}
{const shown=SkyGuide.labelled(labelledShipped['astropix-eso-eso1106c']);assert.equal(shown.archive,'https://www.astropix.org/image/eso/eso1106d');assert.equal(shown.archiveLabel,'AstroPix');}
{const o=object('alpha'),gallery=SkyGuide.gallery(o),clean=labelledWiki['wiki-54f5ebaef039d3da'].url;
 assert.ok(Wikipedia.ids(o).includes('wiki-54f5ebaef039d3da'));
 assert.ok(gallery.includes('data-photo-src="'+annotated+'" data-photo-clean="'+SkyGuide.escape(clean)+'"'),'Alpha Centauri: the Wikipedia frame gives way to the labelled ESO frame');
 assert.ok(!gallery.includes('data-photo-src="'+SkyGuide.escape(clean)+'"'));
 const figure=gallery.slice(gallery.indexOf('data-photo="wiki-54f5ebaef039d3da"')).split('</figure>')[0];
 assert.ok(figure.includes('ESO · иллюстрация статьи Википедии')&&!figure.includes('Wikimedia Commons'),'the caption names the publisher of the shown frame');
 assert.ok(figure.includes('<a href="https://www.eso.org/public/images/eso1629f/" target="_blank" rel="noopener">ESO ↗</a>')&&figure.includes('Права: Creative Commons Attribution 4.0 International License'));
 assert.equal(SkyGuide.media(o).filter(p=>p.url===annotated).length,1);
 assert.equal(SkyGuide.media(o).length,new Set(SkyGuide.media(o).map(p=>p.url)).size,'no duplicate frames');}
{const o=object('hyg-27253'),media=SkyGuide.media(o),twin=media.find(p=>p.id==='astropix-eso-eso1024e'),other=media.find(p=>p.id==='astropix-eso-eso1024a');
 assert.ok(twin&&other,'both clean frames of Beta Pictoris stay in the gallery');
 assert.ok(twin.clean&&/annotated/.test(twin.title)&&!other.clean,'one labelled frame replaces one clean frame, not both');}
assert.ok(String(SkyGuide.mount).includes("const clean=photo.dataset?.photoClean;if(clean&&photo.getAttribute('src')!==clean){delete photo.dataset.photoClean;photo.src=clean;}else settled(true);"),'a labelled frame that fails to load falls back to the clean frame');
`);
console.log('PASS labelled photographs: '+registry.records.length+' publisher-labelled twins measured against their clean frames, '+attached+' shown by the archive gallery and '+wikiRecords.length+' through Wikipedia, rejected candidates recorded, clean fallback');
