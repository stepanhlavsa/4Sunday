import type { EventItem, Song, TeamEvent, MenuItem } from './api';
export const demoSongs:Song[]=[
 {sid:1,name:'Nová píseň',key:'D',actions:{PDF:'demo',XML:'demo'},last_planned:'10. 11. 2026'},
 {sid:2,name:'Společně před Tebou',key:'G',actions:{PDF:'demo',XML:'demo'},last_planned:'3. 11. 2026'},
 {sid:3,name:'Světlo na cestě',key:'C',actions:{PDF:'demo',XML:'demo'},last_planned:''},
];
export const demoEvents:EventItem[]=[{eid:1,title:'Nedělní shromáždění · 15. 11. 2026',links:{plan:'demo',pdf:'demo',xml:'demo'},songs:demoSongs.map(s=>({...s,pdf:'demo',xml:'demo'}))}];
export const demoTeam:TeamEvent[]=[{eid:1,title:'Nedělní shromáždění',date:'15. 11. 2026',scheduler:'Ukázkový tým',plan:'demo',toggle:false,cancel:false}];
export const demoMenu:MenuItem[]=[{label:'Tým',url:null,children:[{label:'Aktivovat',url:null,children:[{label:'Ukázkový tým',url:null,children:[]}]}]}];
