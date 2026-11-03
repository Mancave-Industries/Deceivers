const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function runtime(failHost = false) {
 const requests = [], events = [], previews = [], contexts = [];
 const noop = () => {};
 class Context {
  constructor() { this.state='running'; this.currentTime=0; this.destination={}; this.sampleRate=44100; contexts.push(this); }
  addEventListener(type, fn) { if(type==='statechange') this.onStateChange=fn; }
  resume() { this.state='running'; this.onStateChange?.(); return Promise.resolve(); }
  close() { this.state='closed'; return Promise.resolve(); }
  createBuffer() { return {}; }
  decodeAudioData(bytes, ok) { const b={duration:0.001}; ok(b); return Promise.resolve(b); }
  createGain() { return {gain:{value:1,cancelScheduledValues:noop,setValueAtTime:noop,linearRampToValueAtTime:noop},connect(){return this;}}; }
  createBufferSource() { return {connect(){return this;}, start(){setTimeout(()=>this.onended?.(),0);},stop:noop}; }
 }
 class Audio { constructor(url){this.url=url;this.paused=false;previews.push(this);} pause(){this.paused=true;} removeAttribute(){} load(){} play(){return Promise.resolve();} }
 const audioSession = {type:'ambient'};
 const sandbox={window:{addEventListener:noop,AudioContext:Context},document:{addEventListener:noop},navigator:{audioSession},Audio,setTimeout,clearTimeout,console,
  fetch:async url=>{requests.push(url); if(failHost && url.includes('/hosts/')) throw Error('missing host');return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};}};
 vm.createContext(sandbox);
 for(const f of ['narrator-hosts','narration','sound']) vm.runInContext(fs.readFileSync(`js/${f}.js`,'utf8'),sandbox);
 const api=vm.runInContext('({Sound,NarratorHosts,NARRATION})',sandbox);
 api.Sound._onEvent((type,data)=>events.push({type,...data}));
 api.Sound.setEnabled(true); api.Sound.setNarrationLevel('full');
 return {...api,requests,events,previews,audioSession,contexts};
}
async function speak(r,pools){await new Promise(resolve=>r.Sound.narrate(pools,resolve,{gapMs:0}));}
test('six static portraits and six opening MP3s are complete, local and distinct',()=>{
 const r=runtime();assert.equal(r.NarratorHosts.hosts.length,6);
 for(const h of r.NarratorHosts.hosts){assert.ok(fs.existsSync(h.avatar));assert.ok(fs.existsSync(h.opening));assert.ok(!h.opening.includes('://'));}
 assert.equal(r.NarratorHosts.openingKey('../victor'),null);
});
test('all 174 reviewed public clips exist for each of the six hosts',()=>{
 const r=runtime();const reviewed=JSON.parse(fs.readFileSync('voice-production/reviewed_production_script.json','utf8'));
 const clips=reviewed.clips.filter(c=>c.recording_status==='public_pool_candidate');assert.equal(clips.length,174);
 for(const host of r.NarratorHosts.hosts)for(const clip of clips){
  const key='host:'+host.id+':'+clip.id;
  assert.equal(r.NarratorHosts.clipUrl(key),`assets/audio/hosts/${host.id}/${clip.event}/${clip.id}.mp3`);
  assert.ok(fs.existsSync(r.NarratorHosts.clipUrl(key)),key);
 }
 assert.equal(r.NarratorHosts.clipUrl('host:david:recruit_001'),null);
 assert.equal(r.NarratorHosts.clipUrl('host:../../etc:opening_002'),null);
});
test('each host plays its own approved opening and two rule explanations',async()=>{
 for(const host of ['david','victor','aaron','beth','lily','charlotte']){
  const r=runtime();r.Sound._setRandom(()=>0);r.Sound.setNarratorHost(host);await speak(r,['intro1','intro2','intro3']);
  assert.ok(r.requests.some(url=>url.startsWith(`assets/audio/hosts/${host}/opening/opening_`)),host);
  for(const clip of ['rules_intro_001','rules_intro_002'])assert.ok(r.requests.includes(`assets/audio/hosts/${host}/rules_intro/${clip}.mp3`));
  assert.ok(!r.requests.some(url=>/0[123]_[ABC]\.m4a/.test(url)),host);
 }
});
test('missing selected-host MP3 falls back to the original and completes',async()=>{
 const r=runtime(true);r.Sound.setNarratorHost('david');await speak(r,['intro1']);
 assert.ok(r.requests.some(x=>/01_[ABC]\.m4a/.test(x)));assert.equal(r.events.filter(x=>x.type==='clip-start').length,1);
});
test('public handoffs and night lines are host-specific but never request held/private lines',async()=>{
 for(const host of ['david','victor','aaron','beth','lily','charlotte']){
  const r=runtime();r.Sound._setRandom(()=>0);r.Sound.setNarratorHost(host);await speak(r,['handoff','nightFalls']);
  assert.ok(r.requests.some(x=>x.startsWith(`assets/audio/hosts/${host}/anonymous_handoff/`)));
  assert.ok(r.requests.some(x=>x.startsWith(`assets/audio/hosts/${host}/night_falls/`)));
  assert.ok(r.requests.every(x=>!/(recruit|private|role_reveal)/.test(x)));
  assert.equal(r.events.filter(e=>e.type==='narrate').map(e=>e.pools.join(',')).join('|'),'handoff,nightFalls');
 }
});
test('repeated public events avoid immediate clip repeats where alternatives exist',()=>{
 const r=runtime();for(const pool of ['handoff','nightFalls','murderFirst']){
  let last=null;for(let i=0;i<50;i++){const key=r.NarratorHosts.pickPoolKey('david',pool,()=>0);assert.notEqual(key,last);last=key;}
 }
});
test('starting a new preview stops the previous one and stop clears the current audio',()=>{
 const r=runtime();r.NarratorHosts.previewHost('david',()=>{});r.NarratorHosts.previewHost('beth',()=>{});
 assert.equal(r.previews[0].paused,true);r.NarratorHosts.stopPreview();assert.equal(r.previews[1].paused,true);
});

test('unlockAudio requests Safari playback session instead of silent ambient',async()=>{
 const r=runtime();
 assert.equal(r.audioSession.type,'ambient');
 const unlocked=await r.Sound.unlockAudio();
 assert.equal(unlocked,true);
 assert.equal(r.audioSession.type,'playback');
});

test('audio interrupted halfway through resumes for the next public cue',async()=>{
 const r=runtime();r.Sound.setNarratorHost('david');await speak(r,['intro1']);
 const context=r.contexts.at(-1);
 context.state='interrupted';context.onStateChange?.();
 assert.equal(r.Sound.getAudioStatus().interrupted,true);
 assert.equal(await r.Sound.unlockAudio(),true);
 assert.equal(r.Sound.getAudioStatus().contextState,'running');
 await speak(r,['handoff']);
 assert.ok(r.events.some(e=>e.type==='clip-start' && /host:david:anonymous_handoff_/.test(e.key)));
});

test('Restore Audio recreates a stale context without changing the host',async()=>{
 const r=runtime();r.Sound.setNarratorHost('lily');
 await speak(r,['intro1']);
 const first=r.contexts.at(-1);
 first.state='interrupted';first.onStateChange?.();
 assert.equal(await r.Sound.recoverAudio(),true);
 assert.equal(first.state,'closed');
 assert.notEqual(r.contexts.at(-1),first);
 assert.equal(r.Sound.getAudioStatus().host,'lily');
 await speak(r,['handoff']);
 assert.ok(r.events.some(e=>e.type==='clip-start' && /host:lily:anonymous_handoff_/.test(e.key)));
});
