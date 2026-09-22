import { JSDOM } from '/home/user/tools/node_modules/jsdom/lib/api.js';
import fs from 'fs'; import path from 'path';
const dir = process.argv[2] || '/home/user/amin/test';
let html = fs.readFileSync(path.join(dir,'index.html'),'utf8').replace(/<script type="module" src="js\/boot.js[^>]*><\/script>/,'').replace(/<script[^>]*gsi\/client[^>]*><\/script>/,'');
const hash = '#access_token=AT1&expires_in=3600&email=a%40b.c&name=Ali%20Rezaei&picture=https%3A%2F%2Flh3.googleusercontent.com%2Fx&sealed=SEALED1';
const dom = new JSDOM(html,{url:'https://aminchat.github.io/amin/test/'+hash,runScripts:'outside-only',pretendToBeVisual:true});
const w = dom.window; const errs=[];
w.addEventListener('error',e=>errs.push(String(e.error||e.message)));
for (const k of Object.getOwnPropertyNames(w).filter(k=>/^[A-Z]/.test(k)).concat(['window','document','navigator','localStorage','sessionStorage','location','history','HTMLElement','Node','Element','CustomEvent','Event','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','matchMedia','MutationObserver','crypto','TextEncoder','TextDecoder','Blob','URL','FileReader','Image','atob','btoa','DOMParser','IntersectionObserver','ResizeObserver']))
  if (w[k]!==undefined && globalThis[k]===undefined) { try{ Object.defineProperty(globalThis,k,{value:w[k],configurable:true}); }catch{} }
if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},addListener(){}});
globalThis.matchMedia=w.matchMedia; w.scrollTo=()=>{}; w.crypto.subtle ??= globalThis.crypto.subtle;
let calls=[];
globalThis.fetch = w.fetch = async (u,o)=>{ calls.push(String(u)); const s=String(u);
  if (s.includes('/refresh')) return new Response(JSON.stringify({access_token:'AT2',expires_in:3600,email:'a@b.c'}),{status:200,headers:{'content-type':'application/json'}});
  if (s.includes('drive/v3/files?')) return new Response(JSON.stringify({files:[]}),{status:200});
  return new Response('{}',{status:200}); };
process.on('uncaughtException',e=>errs.push('UE '+e.message));
try { await import(path.join(dir,'js/boot.js')); } catch(e){ console.log('IMPORT ERR',e.message); }
await new Promise(r=>setTimeout(r,1800));
const d=w.document; const b=d.getElementById('btnProfile');
console.log('hash',JSON.stringify(w.location.hash),'avatar',b&&b.className, b&&b.innerHTML.slice(0,90));
w.openProfileMenu();
await new Promise(r=>setTimeout(r,300));
const m=d.querySelector('.profile-card'); console.log('profile card', !!m, m&&m.textContent.replace(/\s+/g,' ').slice(0,120));
w.closeModal(); w.openSettingsGoogle(); await new Promise(r=>setTimeout(r,200));
const sr=d.querySelector('.srow .av'); console.log('settings av',!!sr, d.querySelector('.srow .st2')?.textContent);
console.log('errs',errs);
