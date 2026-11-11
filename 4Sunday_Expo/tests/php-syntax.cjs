const fs=require('node:fs');const path=require('node:path');const Engine=require('../mobile/node_modules/php-parser');
const parser=new Engine({parser:{version:'8.3'}});
for(const file of fs.readdirSync(path.join(__dirname,'../server')).filter(x=>x.endsWith('.php'))){parser.parseCode(fs.readFileSync(path.join(__dirname,'../server',file),'utf8'));console.log('Syntax OK:',file);}
