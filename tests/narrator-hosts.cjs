const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function runtime(failHost = false) {
 const requests = [], events = [], previews = [];
 const noop = () => {};
 class Context {
  constructor() { this.state='running'; this.currentTime=0; this.destination={}; }
  decodeAudioData(bytes, ok) { const b={duration:0.001}; ok(b); return Promise.resolve(b); }
  createGain() { return {gain:{value:1,cancelScheduledValues:noop,setValueAtTime:noop,linearRampToValueAtTime:noop},connect(){return this;}}; }
  createBufferSource() { return {connect(){return this;}, start(){setTimeout(()=>this.onended?.(),0);},stop:noop}; }
 }
 class Audio { constructor(url){this.url=url;this.paused=false;previews.push(this);} pause(){this.paused=true;} removeAttribute(){} load(){} play(){return Promise.resolve();} }
 const sandbox={window:{addEventListener:noop,AudioContext:Context},document:{addEventListener:noop},Audio,setTimeout,clearTimeout,console,
  fetch:async url=>{requests.push(url); if(failHost && url.includes('/hosts/')) throw Error('missing host');return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};}};
 vm.createContext(sandbox);
 for(const f of ['narrator-hosts','narration','sound']) vm.runInContext(fs.readFileSync(`js/${f}.js`,'utf8'),sandbox);
 const api=vm.runInContext('({Sound,NarratorHosts,NARRATION})',sandbox);
 api.Sound._onEvent((type,data)=>events.push({type,...data}));
 api.Sound.setEnabled(true); api.Sound.setNarrationLevel('full');
 return {...api,requests,events,previews};
}
async function speak(r,pools){await new Promise(resolve=>r.Sound.narrate(pools,resolve,{gapMs:0}));}
test('six static portraits and six opening MP3s are complete, local and distinct',()=>{
 const r=runtime();assert.equal(r.NarratorHosts.hosts.length,6);
 for(const h of r.NarratorHosts.hosts){assert.ok(fs.existsSync(h.avatar));assert.ok(fs.existsSync(h.opening));assert.ok(!h.opening.includes('://'));}
 assert.equal(r.NarratorHosts.openingKey('../victor'),null);
});
test('each narrator replaces only the public greeting, preserving both rule explanations',async()=>{
 for(const host of ['david','victor','aaron','beth','lily','charlotte']){
  const r=runtime();r.Sound.setNarratorHost(host); await speak(r,['intro1','intro2','intro3']);
  assert.ok(r.requests.includes(`assets/audio/hosts/${host}/opening/opening_002.mp3`));
  assert.ok(r.requests.some(x=>/02_[ABC]\.m4a/.test(x)));assert.ok(r.requests.some(x=>/03_[ABC]\.m4a/.test(x)));
 }
});
test('missing host audio falls back to the original greeting and finishes',async()=>{
 const r=runtime(true);r.Sound.setNarratorHost('david');await speak(r,['intro1']);
 assert.ok(r.requests.some(x=>/01_[ABC]\.m4a/.test(x)));assert.equal(r.events.filter(x=>x.type==='clip-start').length,1);
});
test('handoff and night requests are equivalent for every host and never request private host clips',async()=>{
 const snapshots=[];
 for(const host of ['original','david','victor','aaron','beth','lily','charlotte']){
  const r=runtime();r.Sound._setRandom(()=>0);r.Sound.setNarratorHost(host);await speak(r,['handoff','nightFalls']);snapshots.push(r.requests);
 }
 for(const requests of snapshots) assert.deepEqual(requests,snapshots[0]);
});
test('starting a new preview stops the previous one and stop clears the current audio',()=>{
 const r=runtime();r.NarratorHosts.previewHost('david',()=>{});r.NarratorHosts.previewHost('beth',()=>{});
 assert.equal(r.previews[0].paused,true);r.NarratorHosts.stopPreview();assert.equal(r.previews[1].paused,true);
});
