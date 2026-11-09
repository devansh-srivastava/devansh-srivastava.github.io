'use strict';
function physicalStrokes(strokes,aspect){return strokes.map(s=>s.map(p=>[p[0]*aspect,p[1]]));}
function simplify(strokes){
  return strokes.map(s=>{
    if(s.length<3)return s;
    const out=[s[0]];for(let i=1;i<s.length-1;i++){const a=out[out.length-1],b=s[i];if(Math.hypot(b[0]-a[0],b[1]-a[1])>.004)out.push(b);}
    out.push(s[s.length-1]);return out;
  });
}
const $ = id => document.getElementById(id);
const palette = {paper:'#f3ede3',ink:'#453c48',purple:'#7849ef',muted:'#857985',lavender:'#e6ddf1'};
let owner = {name:'Devansh',strokes:[]};
const signaturePayload = new URLSearchParams(location.hash.slice(1)).get('pact');
function validStrokes(strokes) {
  return Array.isArray(strokes) && strokes.length <= 100 && strokes.every(s => Array.isArray(s) && s.length <= 1200 && s.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 1)));
}
if(signaturePayload && signaturePayload.length < 120000) {
  try {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(signaturePayload))));
    if(typeof parsed.name === 'string' && parsed.name.trim() && parsed.name.length <= 25 && validStrokes(parsed.strokes) && (parsed.aspect===undefined || (Number.isFinite(parsed.aspect) && parsed.aspect>=.1 && parsed.aspect<=20))) owner = parsed;
  } catch (_) { /* A damaged link falls back to the typed signature. */ }
}
let currentScreen = null, lastFocus = null, resultBlob = null, resultUrl = null;
function show(id) {
  if(!currentScreen) lastFocus = document.activeElement;
  document.querySelectorAll('.screen').forEach(el => { el.hidden = true; el.classList.remove('active'); });
  const screen = $(id);
  if(screen) {
    screen.hidden = false; screen.classList.add('active'); currentScreen = id;
    document.body.style.overflow = 'hidden';
    document.querySelector('.page').inert = true;
    requestAnimationFrame(() => {
      screen.querySelector('button,a,input')?.focus({preventScroll:true});
      friendPad.resize(); ownerPad.resize();
    });
  } else {
    currentScreen = null; document.body.style.overflow = '';
    document.querySelector('.page').inert = false;
    lastFocus?.focus({preventScroll:true});
  }
}
function fitSignature(strokes,x,y,w,h) {
  const points=strokes.flat();if(!points.length)return {strokes:[],x,y,w,h};
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const p of points){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}
  const sw=Math.max(maxX-minX,.001),sh=Math.max(maxY-minY,.001);
  const scale=Math.min(w/sw,h/sh);
  return {strokes:strokes.map(s=>s.map(p=>[(p[0]-minX)/sw,(p[1]-minY)/sh])),x,y:y+(h-sh*scale)/2,w:sw*scale,h:sh*scale};
}
function paintFitted(ctx,strokes,x,y,w,h,color,lineWidth) {
  const f=fitSignature(strokes,x,y,w,h);paintStrokes(ctx,f.strokes,f.x,f.y,f.w,f.h,color,lineWidth);
}
function copyStrokes(s){return s.map(stroke=>stroke.map(p=>[...p]));}
function paintStrokes(ctx, strokes, x, y, w, h, color=palette.purple, lineWidth=2.1) {
  ctx.save(); ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=lineWidth; ctx.lineCap='round'; ctx.lineJoin='round';
  for(const stroke of strokes) {
    if(!stroke.length) continue;
    ctx.beginPath(); ctx.moveTo(x+stroke[0][0]*w,y+stroke[0][1]*h);
    for(let i=1;i<stroke.length;i++) ctx.lineTo(x+stroke[i][0]*w,y+stroke[i][1]*h);
    if(stroke.length===1) {ctx.arc(x+stroke[0][0]*w,y+stroke[0][1]*h,lineWidth/2,0,Math.PI*2);ctx.fill();} else ctx.stroke();
  }
  ctx.restore();
}
function makePad(id, ghost, onChange) {
  const canvas=$(id), ctx=canvas.getContext('2d'); let strokes=[], active=null, pointer=null; let aspect=1;
  function bounds(){const w=canvas.clientWidth,h=canvas.clientHeight;const bw=Math.min(w,h*aspect),bh=bw/aspect;return {x:(w-bw)/2,y:(h-bh)/2,w:bw,h:bh};}
  function changed() { $(ghost).hidden=strokes.length>0; onChange?.(); }
  function redraw() {
    const ratio=Math.min(devicePixelRatio || 1,3); const w=canvas.clientWidth, h=canvas.clientHeight;
    if(!w || !h) return;
    canvas.width=Math.round(w*ratio); canvas.height=Math.round(h*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,w,h);
    const b=bounds();paintStrokes(ctx,strokes,b.x,b.y,b.w,b.h); changed();
  }
  function point(e) {
    const r=canvas.getBoundingClientRect();
    const rotated=id==='friend-pad' && matchMedia('(orientation: portrait)').matches;
    const x=rotated ? (e.clientY-r.top)/r.height : (e.clientX-r.left)/r.width;
    const y=rotated ? (r.right-e.clientX)/r.width : (e.clientY-r.top)/r.height;
    const b=bounds();const nx=(x*canvas.clientWidth-b.x)/b.w,ny=(y*canvas.clientHeight-b.y)/b.h;
    return [Math.max(0,Math.min(1,nx)),Math.max(0,Math.min(1,ny))].map(n=>Math.round(n*10000)/10000);
  }
  canvas.addEventListener('pointerdown',e=>{
    if(pointer!==null || (e.pointerType==='mouse' && e.button!==0)) return;
    if(strokes.length>=100) return;
    e.preventDefault(); pointer=e.pointerId; canvas.setPointerCapture(pointer);
    if(!strokes.length)aspect=canvas.clientWidth/canvas.clientHeight; active=[point(e)]; strokes.push(active); redraw();
  });
  canvas.addEventListener('pointermove',e=>{
    if(pointer!==e.pointerId || !active || active.length>=1200) return;
    e.preventDefault(); const p=point(e), last=active[active.length-1];
    if(Math.hypot(p[0]-last[0],p[1]-last[1])>.001){active.push(p);redraw();}
  });
  function stop(e) {if(e.pointerId===pointer){pointer=null;active=null;changed();}}
  canvas.addEventListener('pointerup',stop); canvas.addEventListener('pointercancel',stop); canvas.addEventListener('lostpointercapture',stop);
  new ResizeObserver(redraw).observe(canvas);
  return {resize:redraw,clear(){strokes=[];active=null;pointer=null;redraw();changed();},set(s,a=1){strokes=copyStrokes(s);aspect=a;redraw();changed();},get aspect(){return aspect;},get strokes(){return strokes;},get signed(){return strokes.some(s=>s.length>=3);}};
}
const friendPad=makePad('friend-pad','friend-ghost',()=>{$('submit').disabled=!friendPad.signed;});
const ownerPad=makePad('owner-pad','owner-ghost');
function signatureImage(strokes,aspect=1) {
  const c=document.createElement('canvas');c.width=900;c.height=240;
  paintFitted(c.getContext('2d'),physicalStrokes(strokes,aspect),0,0,900,240,palette.purple,4);
  return c.toDataURL('image/png');
}
function updateOwner() {
  const target=$('owner-sign-display');target.replaceChildren();
  if(owner.strokes.some(s=>s.length>=3)) {
    const img=new Image();img.src=signatureImage(owner.strokes,owner.aspect || 1);img.alt=owner.name+'’s drawn signature';img.className='owner-sig';target.append(img);
    $('owner-sign-label').textContent=owner.name.toUpperCase();
  } else {
    const el=document.createElement('div');el.className='typed-sig';el.textContent=owner.name;target.append(el);
    $('owner-sign-label').textContent=owner.name.toUpperCase()+' · TYPED SIGNATURE';
  }
}
document.querySelector('.scroll').addEventListener('click',e=>{e.preventDefault();$('the-note').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
updateOwner();
$('yes').onclick=()=>{updateOwner();$('sign-status').textContent='a little scribble makes it official.';show('sign-screen');};
$('no').onclick=()=>show('no-screen');
$('no-back').onclick=()=>show(null);
$('sign-back').onclick=()=>show(null);
$('clear-friend').onclick=()=>friendPad.clear();
$('edit').onclick=()=>{$('sign-status').textContent='a little scribble makes it official.';show('sign-screen');};
$('personalise').onclick=()=>{$('owner-name').value=owner.name;ownerPad.set(owner.strokes,owner.aspect || 1);$('setup-status').textContent='';show('setup-screen');};
$('setup-back').onclick=()=>show(null);
$('clear-owner').onclick=()=>ownerPad.clear();
$('save-owner').onclick=async()=>{
  const name=$('owner-name').value.trim();
  if(!name){$('setup-status').textContent='Add your name first.';$('owner-name').focus();return;}
  owner={name,strokes:simplify(ownerPad.strokes),aspect:ownerPad.aspect};updateOwner();
  const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(owner))));
  if(encoded.length>=120000){$('setup-status').textContent='That signature is a little too detailed. Please clear it and try a simpler one.';return;}
  const url=new URL(location.href);url.hash='pact='+encodeURIComponent(encoded);
  history.replaceState(null,'',url);
  try{await navigator.clipboard.writeText(url.href);$('setup-status').textContent='Saved. Your personalised link is copied.';}
  catch(_){$('setup-status').textContent='Saved. Copy the address from your browser to send it.';}
};
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
async function createKeepsake() {
  if(document.fonts) await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,2500))]);
  const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1125;
  const c=canvas.getContext('2d');c.fillStyle=palette.paper;c.fillRect(0,0,1800,1125);
  c.fillStyle=palette.lavender;c.beginPath();c.ellipse(1750,220,250,330,-.3,0,Math.PI*2);c.fill();
  c.strokeStyle='#d7cdc8';c.lineWidth=2;roundRect(c,38,38,1724,1049,20);c.stroke();
  c.fillStyle=palette.muted;c.font='500 17px "DM Sans",sans-serif';c.fillText('ALMOST SIX YEARS IN.',110,115);
  c.fillStyle=palette.purple;c.font='32px "Caveat",cursive';c.fillText('a little pact, between us.',1320,120);
  c.fillStyle=palette.ink;c.font='500 103px "Playfair Display",Georgia,serif';c.fillText('the',110,270);
  c.fillStyle=palette.purple;c.font='italic 500 124px "Playfair Display",Georgia,serif';c.fillText('constant',290,270);
  c.fillStyle=palette.ink;c.font='500 103px "Playfair Display",Georgia,serif';c.fillText('pact.',850,270);
  c.strokeStyle=palette.purple;c.lineWidth=2.5;c.beginPath();c.moveTo(300,294);c.quadraticCurveTo(560,278,810,291);c.stroke();
  c.fillStyle=palette.ink;c.font='400 29px "DM Sans",sans-serif';
  ['For the good news, the bad days,','and the absolutely unnecessary updates.','Here’s to keeping each other in the loop,','making room for each other,','and talking things out when life gets messy.'].forEach((line,i)=>c.fillText(line,110,390+i*48));
  c.fillStyle=palette.purple;c.font='41px "Caveat",cursive';c.fillText('officially each other’s constant.',110,690);
  const ownDrawn=owner.strokes.some(s=>s.length>=3);
  if(ownDrawn)paintFitted(c,physicalStrokes(owner.strokes,owner.aspect || 1),115,760,660,170,palette.purple,4.5);
  else {c.fillStyle=palette.purple;c.font='76px "Caveat",cursive';c.fillText(owner.name,130,875,620);}
  paintFitted(c,physicalStrokes(friendPad.strokes,friendPad.aspect),985,760,660,170,palette.purple,4.5);
  c.strokeStyle='#bdb1c5';c.lineWidth=2;c.beginPath();c.moveTo(110,943);c.lineTo(780,943);c.moveTo(980,943);c.lineTo(1650,943);c.stroke();
  c.fillStyle=palette.muted;c.font='500 18px "DM Sans",sans-serif';c.fillText(owner.name.toUpperCase()+(ownDrawn?'':' · TYPED SIGNATURE'),110,982,670);c.fillText('YOUR CONSTANT',980,982);
  const date=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric'}).format(new Date());
  c.font='400 16px "DM Sans",sans-serif';c.fillText('SIGNED '+date.toUpperCase(),110,1040);
  c.fillStyle=palette.purple;c.font='27px "Caveat",cursive';c.fillText('you + me',1510,1040);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image could not be created.')),'image/png'));
}
function celebrate(){
  const root=$('confetti');root.replaceChildren();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  for(let i=0;i<32;i++){const el=document.createElement('i');el.style.left=Math.random()*100+'%';el.style.animationDelay=Math.random()*.5+'s';el.style.background=[palette.purple,'#ba9fe3','#d6bdd0'][i%3];el.style.transform='rotate('+Math.random()*180+'deg)';root.append(el);}
  setTimeout(()=>root.replaceChildren(),3200);
}
$('submit').onclick=async()=>{
  if(!friendPad.signed)return;
  $('submit').disabled=true;$('sign-status').textContent='making your little keepsake…';
  try{
    resultBlob=await createKeepsake();if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=URL.createObjectURL(resultBlob);
    $('keepsake').src=resultUrl;$('download').href=resultUrl;$('result-status').textContent='';show('result-screen');celebrate();
  }catch(_){$('sign-status').textContent='Couldn’t make the image. Please try submitting again.';}
  finally{$('submit').disabled=!friendPad.signed;}
};
$('share').onclick=async()=>{
  if(!resultBlob)return;
  const file=new File([resultBlob],'our-constant-pact.png',{type:'image/png'});
  if(navigator.canShare?.({files:[file]})){
    try{await navigator.share({files:[file],title:'Our constant pact'});$('result-status').textContent='Your keepsake is ready.';}
    catch(e){if(e.name!=='AbortError')$('result-status').textContent='Use Download, or press and hold the picture to save it.';}
  }else{$('result-status').textContent='Tap Download, or press and hold the picture to save it.';}
};
document.addEventListener('keydown',e=>{if(e.key==='Escape' && currentScreen)show(null);});
