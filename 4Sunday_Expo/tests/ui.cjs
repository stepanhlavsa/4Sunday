const {chromium:pw}=require('playwright');
(async()=>{const fs=require('node:fs');const path=require('node:path');const server=require('node:http').createServer((req,res)=>{let name=path.resolve(__dirname,'../mobile/dist','.'+(req.url==='/'?'/index.html':req.url));if(!name.startsWith(path.resolve(__dirname,'../mobile/dist')+'/')){res.writeHead(403);res.end();return;}try{res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(name));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(8877,'127.0.0.1',r));const browser=await pw.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8877');await page.getByRole('button',{name:'Prohlédnout ukázku bez přihlášení'}).click();await page.getByText('Nedělní plán',{exact:true}).waitFor();
const handles=()=>page.locator('[aria-label^="Přesunout píseň"]');
const before=await handles().evaluateAll(nodes=>nodes.map(x=>x.getAttribute('aria-label')));
const first=await handles().nth(0).boundingBox(),second=await handles().nth(1).boundingBox();
await page.mouse.move(first.x+20,first.y+first.height/2);await page.mouse.down();
await page.mouse.move(second.x+20,second.y+second.height/2+20,{steps:15});await page.mouse.up();
await page.getByText('Ukázka: pořadí bylo změněno pouze v aplikaci.',{exact:true}).waitFor();
const after=await handles().evaluateAll(nodes=>nodes.map(x=>x.getAttribute('aria-label')));
if(after[0]!==before[1]||after[1]!==before[0])throw Error('Drag reorder failed '+JSON.stringify(after));
console.log('PASS: pointer drag changes song order.');
const touch=await page.context().newCDPSession(page);
const box=await handles().first().boundingBox();
await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+20,y:box.y+box.height/2}]});
await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+20,y:735}]});
await page.waitForTimeout(1200);
await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
const last=await handles().evaluateAll(nodes=>nodes.map(x=>x.getAttribute('aria-label')));
if(last[2]!==after[0])throw Error('Touch/edge scroll failed '+JSON.stringify(last));
console.log('PASS: touch drag with edge autoscroll.');


await page.getByRole('tab').filter({hasText:'Písně'}).click();await page.getByLabel('Vyhledat píseň').fill('svetlo');await page.getByText('Světlo na cestě',{exact:true}).waitFor();if(await page.getByText('Nová píseň',{exact:true}).count())throw Error('Filter failed');
await page.getByText('Světlo na cestě',{exact:true}).click();await page.getByRole('button',{name:'Text / XML',exact:true}).click();await page.getByText(/Demonstrační režim:/).waitFor();await page.getByRole('button',{name:'Zavřít',exact:true}).click();
await page.getByRole('tab').filter({hasText:'Události'}).click();await page.getByRole('button',{name:'Plánovat písně →',exact:true}).click();await page.getByText('Událost č. 1',{exact:true}).waitFor();
await page.getByRole('tab').filter({hasText:'Menu'}).click();await page.getByRole('button',{name:'Ukončit ukázku'}).click();await page.getByRole('button',{name:'Pokračovat',exact:true}).click();await page.getByRole('button',{name:'Přihlásit se →',exact:true}).waitFor();
if(errors.length)throw Error(errors.join('\n'));console.log('PASS: demo, navigation, search without diacritics, XML preview, planning navigation, logout; no runtime errors.');await browser.close();server.close();})().catch(e=>{console.error(e);process.exit(1)});
