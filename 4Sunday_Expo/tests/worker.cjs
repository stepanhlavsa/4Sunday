// Install dependencies in mobile and tests, then run in tests: npm test
// Install browser first: npx playwright install chromium
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const req=createRequire(path.resolve(__dirname,'../mobile/package.json'));
const ts=req('typescript');
const lib={exports:{}};
new Function('exports',ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../mobile/src/workerSource.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(lib.exports);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const opts={headless:true};
 if(process.env.CHROMIUM_MODULE){const bin=require(process.env.CHROMIUM_MODULE).default;opts.executablePath=await bin.executablePath();opts.args=bin.args;}
 const browser=await chromium.launch(opts);
 try {
 const page=await browser.newPage();
 const base='https://www.wtts.org/';let signed=false,evil=false,badPdf=false,removed=false,posts=0,toggles=0;const requests=[];
 const menu='<ul id="menulistbar"><li><a>Písně</a><ul><li><a href="?command=list-songs">Zobrazit všechny</a></li></ul></li><li><a>Tým</a><ul><li><a>Aktivovat</a><ul><li><a href="?command=activate-team&tid=3">Chvály</a></li></ul></li></ul></li></ul>';
 const top='<b id="top_menu_user_name">Stepan</b>'+menu;
 const login=()=>'<form id="sign-in" action="'+(evil?'https://evil.invalid/steal':'?command=sign-in')+'"><input name="csrf" type="hidden" value="nonce"><input name="username_email"><input type="password" name="password"></form>';
 const events=top+'<div class="table_container"><h2 class="table_title">Neděle</h2><table class="table_menubar"><tr><td><a href="?command=list-songs&eid=7">Plán</a><a href="/render-event/PDF/7/?keep=1">PDF</a></td></tr></table><table class="centered_list_table"><tr><td>1</td><td class="td-alligned-left"><a>Chvála</a></td><td><a href="/render-song/XML/11/">XML</a><a href="/render-song/PDF/11/?transpose=2">PDF</a></td><td>D</td></tr></table></div>';
 let order=[11,12,13],rpcMode='ok',rpcCalls=0;
 const eventPage=()=>events.replace(/<table class="centered_list_table">[\s\S]*?<\/table>/, '<table class="centered_list_table">'+order.map(sid=>'<tr><td>1</td><td class="td-alligned-left"><a>Chvála</a></td><td><a href="/render-song/XML/'+sid+'/">XML</a><a href="/render-song/PDF/'+sid+'/?transpose=2">PDF</a></td><td>D</td></tr>').join('')+'</table>');
 const catalog=()=>top+'<table class="centered_list_table"><tbody>'+(!removed?'<tr><td>1</td><td>Chvála</td><td>D</td><td><a href="/render-song/XML/11/">XML</a></td><td><a href="/render-song/PDF/11/?transpose=2">PDF</a></td><td></td><td><a onclick="ajax=attachments">Přílohy</a></td><td><a onclick="ajax=edit-song">Editovat</a></td><td><a onclick="toggle-event-song-schedule">Ano</a></td><td><a onclick="move-song-to-drawer">Šuplík</a></td></tr>':'')+'</tbody></table>';
 const pdf=Buffer.concat([Buffer.from('%PDF-1.4\n'),Buffer.alloc(100000,137)]);
 await page.addInitScript(()=>{window.messages=[];window.ReactNativeWebView={postMessage:m=>window.messages.push(JSON.parse(m))};});
 let initial=true;
 await page.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());requests.push(r.url());assert.equal(u.origin,'https://www.wtts.org');
  if(initial&&r.isNavigationRequest()){initial=false;return route.fulfill({contentType:'text/html',body:lib.exports.BRIDGE_HTML});}
  const cmd=u.searchParams.get('command');let body='',headers={};
  if(cmd==='log-out'){signed=false;headers['set-cookie']='session=; Max-Age=0; Secure; Path=/';body=login();}
  else if(cmd==='sign-in'){
   posts++;const fields=new URLSearchParams(r.postData());assert.equal(fields.get('csrf'),'nonce');assert.equal(fields.get('submit_signin'),'sign in');
   signed=fields.get('username_email')==='stepan'&&fields.get('password')==='správné';headers['set-cookie']='session='+(signed?'valid':'invalid')+'; Secure; HttpOnly; Path=/';body=signed?top:login();
  } else if(!signed)body=login();
  else {
   assert.match(r.headers().cookie||'',/session=valid/);
   if(u.pathname==='/server.JSONRPC'){
    rpcCalls++;assert.equal(r.headers()['content-type'],'application/json');
    const payload=JSON.parse(r.postData());assert.equal(payload.method,'event_songs_set_order');assert.equal(payload.params[0],7);
    if(rpcMode==='ok'||rpcMode==='lost')order=payload.params[1];
    if(rpcMode==='lost')return route.abort('failed');
    body=rpcMode==='html'?'<html>Error</html>':JSON.stringify({id:1,result:rpcMode==='false'?false:null,error:rpcMode==='error'?{code:403,message:'Denied'}:null});
   }
   else if(cmd==='scheduled-events')body=eventPage();
   else if(cmd==='list-songs')body=catalog();
   else if(cmd==='list-team-events')body=top+'<table class="centered_list_table"><tbody><tr><td>1</td><td>12.11.</td><td><a href="?command=list-songs&eid=7">Neděle</a></td><td><a onclick="toggle-event-scheduler">Já</a></td><td><a onclick="cancel-event">Zrušit</a></td></tr></tbody></table>';
   else if(cmd==='move-song-to-drawer'){removed=true;body=top;}
   else if(cmd==='ajax'){if(u.searchParams.get('ajax')==='toggle-event-song-schedule')toggles++;body='<div>Příloha<script>window.HACKED=true</script><a href="https://evil.invalid">evil</a><a href="/file/1">Soubor</a></div>';}
   else if(u.pathname.includes('/PDF/'))return route.fulfill({contentType:'application/pdf',body:badPdf?Buffer.from('<html>error</html>'):pdf});
   else if(u.pathname.includes('/XML/'))body='<div>Chvála<br>Další řádek</div><script>window.HACKED=true</script>';
   else body=top;
  }
  await route.fulfill({contentType:'text/html; charset=utf-8',body,headers});
 });
 await page.goto(base);
 let id=0;
 async function call(action,params={},password='správné'){
  const n=String(++id);await page.evaluate(async m=>{await window.__fourSundayRun(m);},{id:n,action,params,auth:{username:'stepan',password}});
  return page.evaluate(n=>JSON.parse(window.messages.filter(x=>x.id===n).sort((a,b)=>a.index-b.index).map(x=>x.text).join('')),n);
 }
 assert.equal((await call('login')).ok,true);
 const e=await call('events');assert.equal(e.events[0].eid,7);assert.equal(e.events[0].songs[0].sid,11);assert.equal(e.events[0].songs[0].key,'D');assert.equal(posts,1);
 const reorder=(next,previous=order.slice(),eid=7)=>call('reorder',{eid,order:next,previousOrder:previous});
 assert.equal((await reorder([13,11,12])).ok,true);assert.deepEqual(order,[13,11,12]);assert.equal(rpcCalls,1);
 assert.equal((await reorder([13,11,12])).ok,true);assert.equal(rpcCalls,1); // no-op
 assert.equal((await reorder([11,12,13],[11,12,13])).status,409); // stale client
 assert.equal((await reorder([11,11,13])).status,400);
 assert.equal((await reorder([11,12,999])).status,400);
 assert.equal((await reorder([11,12])).status,400);
 assert.equal((await reorder([11,12,13],order,999)).status,403);assert.equal(rpcCalls,1);
 for(const mode of ['html','error','false','ignored']){rpcMode=mode;assert.equal((await reorder([11,12,13])).ok,false);}
 rpcMode='lost';const count=rpcCalls;assert.equal((await reorder([11,12,13])).ok,false);assert.equal(rpcCalls,count+1); // no retry
 assert.deepEqual((await call('events')).events[0].songs.map(x=>x.sid),[11,12,13]); // saved despite transport failure
 rpcMode='ok';
 const songs=await call('songs',{eid:7});assert.equal(songs.songs[0].schedule,true);assert.equal(songs.songs[0].attachments,true);
 assert.equal((await call('team_events')).events[0].toggle,true);
 const file=await call('export',{kind:'song',id:11,format:'PDF'});assert.equal(file.ok,true);assert.deepEqual(Buffer.from(file.base64,'base64'),pdf);assert.ok(requests.some(x=>x.endsWith('/render-song/PDF/11/?transpose=2')));
 const xml=await call('export',{kind:'song',id:11,format:'XML'});assert.ok(xml.text.includes('Další řádek'));assert.ok(!xml.text.includes('HACKED'));assert.equal(await page.evaluate(()=>window.HACKED),undefined);
 badPdf=true;assert.equal((await call('export',{kind:'song',id:11,format:'PDF'})).ok,false);badPdf=false;
 assert.equal((await call('export',{kind:'song',id:999,format:'PDF'})).status,403);
 assert.equal((await call('schedule',{eid:7,sid:999})).status,403);assert.equal(toggles,0);
 assert.equal((await call('schedule',{eid:7,sid:11})).ok,true);assert.equal(toggles,1);
 const dialog=await call('dialog',{sid:11,type:'attachments'});assert.equal(dialog.links.length,1);assert.ok(!dialog.text.includes('HACKED'));
 assert.equal((await call('activate_team',{path:[1,0,0],label:'jiný'})).status,409);
 assert.equal((await call('activate_team',{path:[1,0,0],label:'Chvály'})).ok,true);
 assert.equal((await call('drawer',{sid:11})).ok,true);assert.equal((await call('songs')).songs.length,0);
 assert.equal((await call('login',{},'špatné')).status,401);
 evil=true;const before=posts;assert.equal((await call('login')).ok,false);assert.equal(posts,before);evil=false;
 assert.equal((await call('login')).ok,true);
 signed=false;assert.equal((await call('events')).ok,true); // expired session reauth
 assert.equal((await call('logout')).ok,true);assert.equal(signed,false);
 console.log('PASS: reorder persistence, no-op, stale state, duplicate/missing/foreign IDs, RPC errors/false/HTML, read-back mismatch, lost response without retry; login, cookies, hidden fields, wrong password, expired session, events, menu, catalog, planning permissions, drawer, binary PDF chunks, XML, safe links, hostile form, invalid PDF, logout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
