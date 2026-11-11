<?php
// Run: php tests/core.php (PHP >=8.1, cURL and DOM). No real WTTS requests.
require __DIR__.'/../server/wtts-core.php';
function check($condition,$message){if(!$condition)throw new RuntimeException($message);echo "PASS $message\n";}
check(absolute_url('https://evil.example/file')===null,'external host denied');
check(absolute_url('//evil.example')===null,'protocol relative URL denied');
check(absolute_url('javascript:alert(1)')===null,'script URL denied');
check(absolute_url('https://user@www.wtts.org/')===null,'userinfo denied');
check(absolute_url('https://www.wtts.org:444/')===null,'nonstandard port denied');
check(absolute_url('/render-song/PDF/601/')===WTTS_BASE.'render-song/PDF/601/','relative URL accepted');
check(!is_logged_in('<form id="sign-in"></form>'),'guest detected');
check(is_logged_in('<a href="?command=log-out">Logout</a>'),'authenticated marker');
$menu=parse_menu('<ul id="menulistbar"><li><a>Tým</a><ul><li><a>Aktivovat</a><ul><li><a href="?command=activate-team&amp;tid=2">Kapela</a></li></ul></li></ul></li></ul>');
check(team_activation_path($menu,[0,0,0]),'team activation path');
check(!team_activation_path($menu,[0,1,0]),'invalid team rejected');
$catalog='<table class="centered_list_table"><tbody><tr><td>1</td><td>Píseň &amp; chvála</td><td>D</td><td><a href="/render-song/XML/601/">XML</a></td><td><a href="/render-song/PDF/601">PDF</a></td><td></td><td><a onclick="ajax=attachments">A</a></td><td><a onclick="ajax=edit-song">E</a></td><td>10.11.</td><td><a onclick="move-song-to-drawer">D</a></td></tr></tbody></table>';
$songs=parse_all_songs($catalog);
check(count($songs)===1 && $songs[0]['sid']===601,'catalog ID without trailing slash');
check($songs[0]['name']==='Píseň & chvála' && $songs[0]['key']==='D','UTF8 and entities');
check($songs[0]['attachments'] && $songs[0]['editable'] && $songs[0]['drawer'],'catalog capabilities');
check(parse_all_songs('<table class="centered_list_table"><tbody><tr><td>short</td></tr></tbody></table>')===[],'short row ignored');
$events='<div class="table_container"><div class="table_title">Neděle</div><table class="table_menubar"><tr><td><a href="?command=list-songs&amp;eid=7">Plán</a><a href="/render-event/PDF/7/">PDF</a></td></tr></table><table class="centered_list_table"><tr><td>1</td><td class="td-alligned-left"><a>Píseň</a></td><td></td><td>D</td><td><a href="/render-song/PDF/601/">PDF</a></td></tr></table></div>';
$parsed=parse_events($events);
check(count($parsed)===1 && $parsed[0]['eid']===7 && $parsed[0]['songs'][0]['sid']===601,'event and song extraction');
echo "All fixture tests passed.\n";
