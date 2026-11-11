/** Self-contained JS executed ONLY in the app-owned, off-screen WebView.
 * No fetched HTML is ever inserted into this document or executed.
 * Keep this as a string: Metro/Babel must not rewrite injected functions.
 */
export const WORKER = String.raw`
(function () {
  'use strict';
  const BASE = 'https://www.wtts.org/';
  const EVENTS = BASE + '?command=scheduled-events';
  let user = null;
  let inFlight = false;
  function fault(message, status) { const e = new Error(message); e.status = status || 400; throw e; }
  function safe(value) {
    try {
      if (!value || !String(value).trim() || String(value).trim().startsWith('#')) return null;
      const u = new URL(String(value).trim(), BASE);
      if (u.origin !== 'https://www.wtts.org' || u.username || u.password) return null;
      return u.href;
    } catch (_) { return null; }
  }
  function doc(html) { return new DOMParser().parseFromString(html, 'text/html'); }
  function txt(node) { return (node ? node.textContent : '').replace(/\s+/g, ' ').trim(); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
  function logged(html) {
    const d = doc(html);
    if (d.querySelector('#welcome_guest_screen, #sign-in')) return false;
    const name = txt(d.querySelector('#top_menu_user_name'));
    return name ? !/^Guest\b/i.test(name) : !!d.querySelector('a[href*="command=log-out"]');
  }
  function loginForm(html) {
    const d = doc(html);
    const form = d.querySelector('form#sign-in, form[name="sign-in"]') || Array.from(d.querySelectorAll('form')).find(f => f.querySelector('input[type="password"]'));
    if (!form) fault('Přihlašovací formulář WTTS nebyl nalezen.');
    const fields = {}; let name = null; let pass = null;
    form.querySelectorAll('input[name]').forEach(i => {
      const type = (i.getAttribute('type') || 'text').toLowerCase();
      if (['checkbox','radio'].includes(type) && !i.hasAttribute('checked')) return;
      fields[i.name] = i.getAttribute('value') || '';
      if (['text','email'].includes(type) && !name) name = i.name;
      if (type === 'password') pass = i.name;
    });
    name = Object.hasOwn(fields,'username_email') ? 'username_email' : name;
    pass = Object.hasOwn(fields,'password') ? 'password' : pass;
    const url = safe(form.getAttribute('action') || '?command=sign-in');
    if (!name || !pass || !url) fault('Neplatný nebo změněný přihlašovací formulář WTTS.');
    return {fields, name, pass, url};
  }
  async function net(url, options) {
    if (!safe(url)) fault('Nepovolená adresa.');
    options = options || {};
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch(url, {
        method: options.body === undefined ? 'GET' : 'POST',
        credentials: 'include', cache: 'no-store', signal: controller.signal,
        headers: options.body === undefined ? (options.ajax ? {'X-Requested-With':'XMLHttpRequest'} : {}) : {'Content-Type':'application/x-www-form-urlencoded'},
        body: options.body, redirect: 'follow',
      });
      if (!safe(response.url)) fault('WTTS přesměrovalo požadavek mimo povolený server.');
      if (!response.ok) fault('WTTS vrátilo HTTP ' + response.status + '.', response.status);
      // Limit both declared and streamed size. 8 MiB includes full PDF/XML bytes.
      const max = 8 * 1024 * 1024;
      if (Number(response.headers.get('content-length')) > max) fault('Výstup přesahuje limit 8 MB.', 413);
      let bytes;
      if (response.body && response.body.getReader) {
        const reader=response.body.getReader();const chunks=[];let size=0;
        while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>max){await reader.cancel();fault('Výstup přesahuje limit 8 MB.',413);}chunks.push(part.value);}
        bytes=new Uint8Array(size);let offset=0;chunks.forEach(c=>{bytes.set(c,offset);offset+=c.length;});
      } else {
        bytes=new Uint8Array(await response.arrayBuffer());
        if(bytes.length>max)fault('Výstup přesahuje limit 8 MB.',413);
      }
      return options.binary ? bytes : new TextDecoder('utf-8').decode(bytes);
    } catch(e) {
      if(e.name === 'AbortError') fault('WTTS neodpovědělo včas. U změn nejprve obnovte seznam; požadavek mohl být proveden.', 408);
      if(e.status)throw e;
      fault('Spojení s WTTS selhalo. Ověřte internet a dostupnost webu. U zápisu nejprve obnovte stav.', 502);
    } finally { clearTimeout(timer); }
  }
  async function authenticate(auth, force) {
    if (!auth || !auth.username || !auth.password) fault('Zadejte přihlašovací údaje.',401);
    // Force logout before new credentials, including a different password for the same name.
    // Never let a previously authenticated cookie make a wrong password appear valid.
    if (force || user !== auth.username) {
      await net(BASE + '?command=log-out'); user = null;
    }
    const home=await net(BASE); let html=await net(EVENTS);
    if (!force && user === auth.username && logged(html)) return html;
    const f=loginForm(home); f.fields[f.name]=auth.username; f.fields[f.pass]=auth.password;
    if (!f.fields.submit_signin) f.fields.submit_signin='sign in';
    await net(f.url,{body:new URLSearchParams(f.fields).toString()});
    html=await net(EVENTS);
    if (!logged(html)) {user=null;fault('Přihlášení do WTTS se nezdařilo. Ověřte údaje; případné CAPTCHA nebo další ověření tato verze nepodporuje.',401);}
    user=auth.username; return html;
  }
  function menuItem(li) {
    const a=li.querySelector(':scope > a');
    let label=a ? txt(a) : Array.from(li.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim();
    let url=a ? safe(a.getAttribute('href')) : null;
    if(!url && a){const m=(a.getAttribute('onclick')||'').match(/['"]([^'"]*\?command=[^'"]+)['"]/);if(m)url=safe(m[1]);}
    label=label ? label.charAt(0).toLocaleUpperCase('cs')+label.slice(1) : 'Menu';
    return {label,url,children:Array.from(li.querySelectorAll(':scope > ul > li')).map(menuItem)};
  }
  function parseMenu(html){return Array.from(doc(html).querySelectorAll('#menulistbar > li')).map(menuItem);}
  function atPath(menu,path){let item=null;for(const i of path){if(!Number.isInteger(i)||i<0||!menu[i])return null;item=menu[i];menu=item.children;}return item;}
  function activation(menu,path){return Array.isArray(path)&&path.length===3&&['tym','team'].includes(norm(atPath(menu,path.slice(0,1))?.label))&&['aktivovat','activate'].includes(norm(atPath(menu,path.slice(0,2))?.label))&&!!atPath(menu,path)?.url;}
  function catalogUrl(menu){
    for(const root of menu)if(['pisne','songs'].includes(norm(root.label)))for(const child of root.children)if(['zobrazit vsechny','show all','show all songs','list all'].includes(norm(child.label))&&child.url)return child.url;
    fault('V menu WTTS nebyl nalezen katalog písní.');
  }
  function idFrom(url,type){const m=String(url||'').match(new RegExp('/render-'+type+'/(?:PDF|XML)/(\\d+)(?:/|$|\\?)','i'));return m?Number(m[1]):0;}
  function parseEvents(html){
    return Array.from(doc(html).querySelectorAll('div.table_container')).map(c=>{
      const links={plan:null,pdf:null,xml:null};
      c.querySelectorAll('table.table_menubar a[href]').forEach(a=>{const u=safe(a.getAttribute('href'));if(!u)return;if(u.includes('command=list-songs')&&u.includes('eid='))links.plan=links.plan||u;if(u.includes('/render-event/PDF/'))links.pdf=links.pdf||u;if(u.includes('/render-event/XML/'))links.xml=links.xml||u;});
      const eid=Number(links.plan ? new URL(links.plan).searchParams.get('eid') : 0)||idFrom(links.pdf||links.xml,'event');
      const songs=Array.from(c.querySelectorAll('table.centered_list_table tr')).map(tr=>{
        const a=tr.querySelector('td.td-alligned-left a');if(!a)return null;
        let pdf=null,xml=null;tr.querySelectorAll('a[href]').forEach(link=>{const u=safe(link.getAttribute('href'));if(u?.includes('/render-song/PDF/'))pdf=u;if(u?.includes('/render-song/XML/'))xml=u;});
        return {sid:idFrom(pdf||xml,'song'),name:txt(a),key:txt(tr.querySelectorAll(':scope > td')[3]),pdf,xml};
      }).filter(Boolean);
      return {eid,title:txt(c.querySelector('.table_title'))||'Událost',links,songs};
    }).filter(e=>e.eid>0);
  }
  function parseSongs(html,planning){
    return Array.from(doc(html).querySelectorAll('table.centered_list_table > tbody > tr')).map(tr=>{
      const td=tr.querySelectorAll(':scope > td');if(td.length<6||!txt(td[1]))return null;
      const actions={};[['XML',3],['PDF',4]].forEach(([format,i])=>{const u=safe(td[i]?.querySelector('a[href]')?.getAttribute('href'));if(u&&new RegExp('^https://www\\.wtts\\.org/render-song/'+format+'/[0-9]+/?(?:\\?.*)?$','i').test(u))actions[format]=u;});
      const sid=idFrom(actions.PDF||actions.XML,'song');
      const scheduleLink=planning ? Array.from(tr.querySelectorAll('a')).find(a=>((a.getAttribute('onclick')||'')+' '+(a.getAttribute('href')||'')).includes('toggle-event-song-schedule')) : null;
      return {sid,name:txt(td[1]),key:txt(td[2]),actions,
        attachments:!!(sid&&td[6]?.querySelector('a[onclick*="ajax=attachments"]')),
        editable:!!(sid&&td[7]?.querySelector('a[onclick*="ajax=edit-song"]')),
        drawer:!!(sid&&td[9]?.querySelector('a[onclick*="move-song-to-drawer"]')),
        last_planned:txt(scheduleLink)||txt(td[8]),schedule:!!(sid&&scheduleLink)};
    }).filter(Boolean);
  }
  function parseTeam(html){
    return Array.from(doc(html).querySelectorAll('table.centered_list_table > tbody > tr')).map(tr=>{
      const td=tr.querySelectorAll(':scope > td');if(td.length<5)return null;
      const a=td[2].querySelector('a[href*="eid="]');const url=safe(a?.getAttribute('href'));const eid=url?Number(new URL(url).searchParams.get('eid')):0;
      if(!eid)return null;
      return {eid,date:txt(td[1]),title:txt(a),scheduler:txt(td[3]),plan:url,toggle:!!td[3].querySelector('a[onclick*="toggle-event-scheduler"]'),cancel:!!td[4].querySelector('a[onclick*="cancel-event"]')};
    }).filter(Boolean);
  }
  function preview(html){
    const d=doc(html);d.querySelectorAll('script,style,head,iframe,object,embed').forEach(n=>n.remove());
    d.querySelectorAll('br').forEach(n=>n.replaceWith(d.createTextNode('\n')));
    d.querySelectorAll('p,div,tr,h1,h2,h3,li,verse,chorus').forEach(n=>n.append(d.createTextNode('\n')));
    return d.body.textContent.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  }
  function positive(value){if(!Number.isSafeInteger(value)||value<1)fault('Neplatné ID.');return value;}
  async function permittedEvent(eid,events){
    if(events.some(e=>e.eid===eid&&e.links.plan))return;
    if(parseTeam(await net(BASE+'?command=list-team-events')).some(e=>e.eid===eid&&e.plan))return;
    fault('Událost není dostupná pro plánování.',403);
  }
  async function page(url){const h=await net(url);if(!logged(h))fault('WTTS požaduje nové přihlášení.',401);return h;}
  async function changed(url,options){const body=await net(url,options);const d=doc(body);if(d.querySelector('#welcome_guest_screen,#sign-in'))fault('Relace vypršela. Obnovte přihlášení.',401);return body;}
  function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));return btoa(s);}
  async function dispatch(action,auth,p){
    p=p||{};
    if(action==='logout'){try{await net(BASE+'?command=log-out');}finally{user=null;}return {ok:true};}
    if(action==='login'){const html=await authenticate(auth,true);return {ok:true,username:auth.username,menu:parseMenu(html)};}
    const html=await authenticate(auth,false),events=parseEvents(html),menu=parseMenu(html);
    if(action==='events')return {ok:true,events,menu,username:auth.username};
    if(action==='songs'){
      const eid=p.eid?positive(p.eid):0;if(eid)await permittedEvent(eid,events);
      const url=eid?BASE+'?command=list-songs&eid='+eid:catalogUrl(menu);
      const songs=parseSongs(await page(url),!!eid);
      return {ok:true,songs,warning:songs.length?'':'Seznam je prázdný nebo se změnila struktura WTTS.'};
    }
    if(action==='team_events')return {ok:true,events:parseTeam(await page(BASE+'?command=list-team-events'))};
    if(action==='activate_team'){
      if(!activation(menu,p.path))fault('Tým není dostupný.',403);
      const item=atPath(menu,p.path);if(item.label!==p.label)fault('Menu se změnilo. Obnovte seznam týmů.',409);
      await changed(item.url);return {ok:true,message:'Požadavek na aktivaci týmu byl odeslán.'};
    }
    if(action==='schedule'){
      const eid=positive(p.eid),sid=positive(p.sid);await permittedEvent(eid,events);
      const url=BASE+'?command=list-songs&eid='+eid;
      if(!parseSongs(await page(url),true).some(s=>s.sid===sid&&s.schedule))fault('Píseň nelze plánovat.',403);
      await changed(BASE+'?command=ajax&ajax=toggle-event-song-schedule&eid='+eid+'&sid='+sid,{ajax:true});
      return {ok:true,message:'Požadavek byl odeslán. Zkontrolujte obnovený plán.'};
    }
    if(action==='drawer'){
      const sid=positive(p.sid),url=catalogUrl(menu);
      if(!parseSongs(await page(url)).some(s=>s.sid===sid&&s.drawer))fault('Píseň nelze přesunout.',403);
      await changed(BASE+'?command=move-song-to-drawer&sid='+sid);
      if(parseSongs(await page(url)).some(s=>s.sid===sid))fault('WTTS nepotvrdilo přesun.',502);
      return {ok:true,message:'Píseň byla přesunuta do šuplíku.'};
    }
    if(action==='team_event'){
      const eid=positive(p.eid),op=p.operation;if(!['toggle','cancel'].includes(op))fault('Neplatná operace.');
      if(!parseTeam(await page(BASE+'?command=list-team-events')).some(e=>e.eid===eid&&e[op]))fault('Operace není dostupná.',403);
      const url=op==='toggle'?BASE+'?command=ajax&ajax=toggle-event-scheduler&eid='+eid:BASE+'?command=cancel-event&eid='+eid+'&orderby=DT&ordertype=ASC';
      await changed(url,{ajax:op==='toggle'});return {ok:true,message:'Požadavek byl odeslán. Zkontrolujte obnovený seznam.'};
    }
    if(action==='dialog'){
      const sid=positive(p.sid),type=p.type;if(!['attachments','edit-song'].includes(type))fault('Neplatný náhled.');
      if(!parseSongs(await page(catalogUrl(menu))).some(s=>s.sid===sid&&s[type==='attachments'?'attachments':'editable']))fault('Náhled není dostupný.',403);
      const body=await changed(BASE+'?command=ajax&ajax='+type+'&sid='+sid,{ajax:true});
      const links=Array.from(doc(body).querySelectorAll('a[href]')).map(a=>({label:txt(a)||'Odkaz WTTS',url:safe(a.getAttribute('href'))})).filter(l=>l.url);
      return {ok:true,text:preview(body),links};
    }
    if(action==='export'){
      const id=positive(p.id),kind=p.kind,format=p.format;
      if(!['song','event'].includes(kind)||!['PDF','XML'].includes(format))fault('Neplatný export.');
      let url=null;
      for(const e of events){if(kind==='event'&&e.eid===id)url=e.links[format.toLowerCase()];if(kind==='song')for(const s of e.songs)if(s.sid===id)url=s[format.toLowerCase()];}
      if(!url&&kind==='song'){const s=parseSongs(await page(catalogUrl(menu))).find(s=>s.sid===id);url=s?.actions[format];}
      if(!url)fault('Export není dostupný.',403);
      const bytes=await net(url,{binary:true});const header=new TextDecoder().decode(bytes.subarray(0,512));
      if(format==='PDF'&&!header.startsWith('%PDF-'))fault('WTTS nevrátilo PDF. Obnovte přihlášení.',502);
      const text=format==='XML'?new TextDecoder('utf-8').decode(bytes):'';
      if(format==='XML'&&(!text.includes('<')||doc(text).querySelector('#sign-in,#welcome_guest_screen')))fault('WTTS nevrátilo obsah písně.',502);
      return {ok:true,base64:base64(bytes),filename:'4sunday-'+kind+'-'+id+'.'+format.toLowerCase(),mime:format==='PDF'?'application/pdf':'application/octet-stream',text:format==='XML'?preview(text):''};
    }
    if(action==='reorder')fault('Ukládání pořadí nebylo ve vzorovém PHP ověřeno.',501);
    fault('Neznámá operace.',404);
  }
  function send(id,result){
    const json=JSON.stringify(result),size=60000,total=Math.ceil(json.length/size);
    for(let i=0;i<total;i++)window.ReactNativeWebView.postMessage(JSON.stringify({type:'part',id,index:i,total,text:json.slice(i*size,(i+1)*size)}));
  }
  window.__fourSundayRun=async function(message){
    if(!message||typeof message.id!=='string')return;
    if(inFlight){send(message.id,{ok:false,error:'Již probíhá jiný požadavek.',status:409});return;}
    inFlight=true;
    try{send(message.id,await dispatch(message.action,message.auth,message.params));}
    catch(e){send(message.id,{ok:false,error:e.message||'Operace selhala.',status:e.status||500});}
    finally{inFlight=false;}
  };
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
})();
`;
export const BRIDGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src https://www.wtts.org; base-uri 'none'; form-action 'none'"></head><body><script>${WORKER}</script></body></html>`;
