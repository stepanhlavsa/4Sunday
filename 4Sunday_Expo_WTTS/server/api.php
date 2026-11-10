<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function reply(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function fail(string $message, int $status = 400): never { reply(['ok'=>false, 'error'=>$message], $status); }
try {
    if (!is_file(__DIR__.'/config.php')) fail('Na serveru chybí config.php.', 503);
    $config = require __DIR__.'/config.php';
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        if (!in_array($origin, $config['allowed_origins'], true)) fail('Tato webová doména není povolena.', 403);
        header('Access-Control-Allow-Origin: '.$origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
    }
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Použijte POST JSON.', 405);
    if (!extension_loaded('curl') || !class_exists('DOMDocument')) fail('Server vyžaduje PHP cURL a DOM.', 503);
    define('PRIVATE_DIR', rtrim((string)$config['private_dir'], '/'));
    if (!is_dir(PRIVATE_DIR) && !mkdir(PRIVATE_DIR, 0700, true)) fail('Nelze vytvořit privátní adresář.', 503);
    $root = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '';
    $private = realpath(PRIVATE_DIR);
    if ($root !== '' && ($private === $root || str_starts_with($private, $root.'/'))) fail('Privátní adresář musí být mimo webový kořen.', 503);
    require __DIR__.'/wtts-core.php';
    $raw = file_get_contents('php://input', false, null, 0, 65537);
    if (strlen($raw) > 65536) fail('Příliš velký požadavek.', 413);
    $in = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($in)) fail('Neplatný JSON.');
    $action = (string)($in['action'] ?? '');
    // Bearer token is never sent in query strings or written to logs.
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $token = preg_match('/^Bearer ([a-f0-9]{64})$/D', $auth, $m) ? $m[1] : '';
    if ($action === 'login') {
        // Per-IP login throttle with file locking; trusts REMOTE_ADDR only.
        $f = fopen(PRIVATE_DIR.'/limit-'.hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown'), 'c+');
        if (!$f || !flock($f, LOCK_EX)) throw new RuntimeException('Nelze ověřit limit přihlášení.');
        $attempts = json_decode(stream_get_contents($f), true) ?: [];
        $attempts = array_values(array_filter($attempts, fn($t) => $t > time()-900));
        if (count($attempts) >= 20) { flock($f, LOCK_UN); fclose($f); fail('Příliš mnoho přihlášení. Zkuste to za 15 minut.',429); }
        $attempts[] = time(); rewind($f); ftruncate($f,0); fwrite($f,json_encode($attempts)); flock($f,LOCK_UN); fclose($f);
        $token = bin2hex(random_bytes(32));
    } elseif ($token === '') fail('Přihlaste se prosím.',401);
    session_save_path(PRIVATE_DIR);
    ini_set('session.use_cookies','0');
    ini_set('session.use_strict_mode','0'); // random bearer mapped to a non-public hash, never a client-supplied session ID
    ini_set('session.gc_maxlifetime',(string)$config['session_ttl']);
    session_id(hash('sha256',$token));
    session_start();
    if ($action === 'login') {
        $user = trim((string)($in['username'] ?? ''));
        $pass = (string)($in['password'] ?? '');
        if ($user === '' || $pass === '' || strlen($user)>300 || strlen($pass)>2000) fail('Vyplňte jméno a heslo.');
        $_SESSION['wtts_user']=$user; $_SESSION['wtts_pass']=$pass;
        try { $html = get_authenticated_html(); }
        catch (Throwable $e) { @unlink(cookie_file()); $_SESSION=[]; session_destroy(); fail('Přihlášení nebylo ověřeno. Zkontrolujte údaje a dostupnost WTTS.',401); }
        $_SESSION['expires'] = time()+(int)$config['session_ttl'];
        reply(['ok'=>true,'token'=>$token,'username'=>$user,'menu'=>parse_menu($html)]);
    }
    if (empty($_SESSION['wtts_user']) || ($_SESSION['expires'] ?? 0) < time()) {
        @unlink(cookie_file()); $_SESSION=[]; session_destroy(); fail('Přihlášení vypršelo.',401);
    }
    if ($action === 'logout') { @unlink(cookie_file()); $_SESSION=[]; session_destroy(); reply(['ok'=>true]); }
    $_SESSION['expires'] = time()+(int)$config['session_ttl'];
    $html = get_authenticated_html();
    $menu = parse_menu($html); $events = parse_events($html);
    function positive(array $in, string $key): int {
        $v = filter_var($in[$key] ?? null,FILTER_VALIDATE_INT);
        if (!$v || $v<1) fail('Neplatné ID.');
        return $v;
    }
    function catalog(array $menu): string {
        $url=all_songs_menu_url($menu);
        if (!$url) throw new RuntimeException('V menu WTTS nebyl nalezen katalog písní.');
        return $url;
    }
    function allowed_event(int $eid, array $events): void {
        foreach ($events as $e) if ($e['eid']===$eid && $e['links']['plan']) return;
        foreach (parse_team_events(request_wtts(WTTS_BASE.'?command=list-team-events')['body']) as $e) if ($e['eid']===$eid && $e['plan']) return;
        fail('Událost není dostupná pro plánování.',403);
    }
    function text_preview(string $body): string {
        $xp=xpath_for($body);
        foreach (iterator_to_array($xp->query('//script|//style|//head|//iframe|//object|//embed')) as $n) $n->parentNode?->removeChild($n);
        foreach ($xp->query('//br') as $n) $n->parentNode?->replaceChild($n->ownerDocument->createTextNode("\n"),$n);
        foreach ($xp->query('//p|//div|//tr|//h1|//h2|//h3|//li|//verse|//chorus') as $n) $n->appendChild($n->ownerDocument->createTextNode("\n"));
        return trim(preg_replace('/[ \t]+/u',' ',$xp->document->textContent) ?? '');
    }
    if ($action==='events') reply(['ok'=>true,'events'=>$events,'menu'=>$menu,'username'=>$_SESSION['wtts_user']]);
    if ($action==='songs') {
        $eid=(int)($in['eid'] ?? 0);
        if ($eid) allowed_event($eid,$events);
        $url=$eid ? WTTS_BASE.'?command=list-songs&eid='.$eid : catalog($menu);
        $songs=parse_all_songs(request_wtts($url)['body'],$eid>0);
        reply(['ok'=>true,'songs'=>$songs,'warning'=>$songs ? '' : 'Seznam je prázdný nebo WTTS změnilo strukturu stránky.']);
    }
    if ($action==='team_events') reply(['ok'=>true,'events'=>parse_team_events(request_wtts(WTTS_BASE.'?command=list-team-events')['body'])]);
    if ($action==='activate_team') {
        $path=$in['path'] ?? [];
        if (!is_array($path) || !team_activation_path($menu,$path)) fail('Tým není v aktuálním menu.',403);
        $target=menu_by_path($menu,$path);
        // Prevent a stale menu index from activating a different team.
        if (($target['label'] ?? '') !== ($in['label'] ?? '')) fail('Menu se změnilo. Obnovte seznam týmů.',409);
        request_wtts($target['url'],[CURLOPT_HTTPHEADER=>['Referer: '.WTTS_EVENTS]]);
        reply(['ok'=>true,'message'=>'Požadavek na aktivaci týmu byl odeslán.']);
    }
    if ($action==='schedule') {
        $eid=positive($in,'eid'); $sid=positive($in,'sid'); allowed_event($eid,$events);
        $url=WTTS_BASE.'?command=list-songs&eid='.$eid;
        $found=false;
        foreach (parse_all_songs(request_wtts($url)['body'],true) as $s) if ($s['sid']===$sid && $s['schedule']) $found=true;
        if (!$found) fail('Píseň nelze plánovat.',403);
        request_wtts(WTTS_BASE.'?command=ajax&ajax=toggle-event-song-schedule&eid='.$eid.'&sid='.$sid,
            [CURLOPT_HTTPHEADER=>['X-Requested-With: XMLHttpRequest','Referer: '.$url]]);
        reply(['ok'=>true,'message'=>'Požadavek byl odeslán. Zkontrolujte obnovený plán.']);
    }
    if ($action==='drawer') {
        $sid=positive($in,'sid'); $url=catalog($menu); $found=false;
        foreach (parse_all_songs(request_wtts($url)['body']) as $s) if ($s['sid']===$sid && $s['drawer']) $found=true;
        if (!$found) fail('Píseň není dostupná pro přesun.',403);
        request_wtts(WTTS_BASE.'?command=move-song-to-drawer&sid='.$sid,[CURLOPT_HTTPHEADER=>['Referer: '.$url]]);
        foreach (parse_all_songs(request_wtts($url)['body']) as $s) if ($s['sid']===$sid) fail('WTTS nepotvrdilo přesun.',502);
        reply(['ok'=>true,'message'=>'Píseň byla přesunuta do šuplíku.']);
    }
    if ($action==='team_event') {
        $eid=positive($in,'eid'); $op=(string)($in['operation'] ?? '');
        if (!in_array($op,['toggle','cancel'],true)) fail('Neplatná operace.');
        $found=false;
        foreach (parse_team_events(request_wtts(WTTS_BASE.'?command=list-team-events')['body']) as $e) if ($e['eid']===$eid && $e[$op]) $found=true;
        if (!$found) fail('Operace není dostupná.',403);
        $url=$op==='toggle' ? WTTS_BASE.'?command=ajax&ajax=toggle-event-scheduler&eid='.$eid
            : WTTS_BASE.'?command=cancel-event&eid='.$eid.'&orderby=DT&ordertype=ASC';
        request_wtts($url,[CURLOPT_HTTPHEADER=>['Referer: '.WTTS_BASE.'?command=list-team-events']]);
        reply(['ok'=>true,'message'=>'Požadavek byl odeslán. Zkontrolujte obnovený seznam.']);
    }
    if ($action==='dialog') {
        $sid=positive($in,'sid'); $type=(string)($in['type'] ?? '');
        if (!in_array($type,['attachments','edit-song'],true)) fail('Neplatný náhled.');
        $url=catalog($menu); $found=false;
        foreach (parse_all_songs(request_wtts($url)['body']) as $s) if ($s['sid']===$sid && $s[$type==='attachments' ? 'attachments':'editable']) $found=true;
        if (!$found) fail('Náhled není dostupný.',403);
        $body=request_wtts(WTTS_BASE.'?command=ajax&ajax='.$type.'&sid='.$sid,[CURLOPT_HTTPHEADER=>['X-Requested-With: XMLHttpRequest','Referer: '.$url]])['body'];
        $links=[]; $xp=xpath_for($body);
        foreach ($xp->query('//a[@href]') as $a) if ($u=absolute_url($a->getAttribute('href'))) $links[]=['label'=>trim($a->textContent) ?: 'Odkaz WTTS','url'=>$u];
        reply(['ok'=>true,'text'=>text_preview($body),'links'=>$links]);
    }
    if ($action==='export') {
        $id=positive($in,'id'); $kind=(string)($in['kind'] ?? ''); $format=(string)($in['format'] ?? '');
        if (!in_array($kind,['song','event'],true) || !in_array($format,['PDF','XML'],true)) fail('Neplatný export.');
        $allowed=false;
        foreach ($events as $e) {
            if ($kind==='event' && $e['eid']===$id && $e['links'][strtolower($format)]) $allowed=true;
            if ($kind==='song') foreach ($e['songs'] as $s) if ($s['sid']===$id && $s[strtolower($format)]) $allowed=true;
        }
        if (!$allowed && $kind==='song') foreach (parse_all_songs(request_wtts(catalog($menu))['body']) as $s) if ($s['sid']===$id && !empty($s['actions'][$format])) $allowed=true;
        if (!$allowed) fail('Export není v dostupném seznamu.',403);
        $body=request_wtts(WTTS_BASE.'render-'.$kind.'/'.$format.'/'.$id.'/',[CURLOPT_HTTPHEADER=>['Referer: '.WTTS_EVENTS]])['body'];
        if (strlen($body)>15*1024*1024) fail('Export přesahuje limit 15 MB.',413);
        if ($format==='PDF' && !str_starts_with($body,'%PDF-')) fail('WTTS nevrátilo PDF.',502);
        if ($format==='XML' && (!str_contains($body,'<') || preg_match('~welcome_guest_screen|id=["\']sign-in["\']~i',$body))) fail('WTTS nevrátilo obsah písně.',502);
        // Keep original XML bytes: WTTS may return a mixed HTML/XML fragment.
        reply(['ok'=>true,'base64'=>base64_encode($body),'filename'=>'4sunday-'.$kind.'-'.$id.'.'.strtolower($format),
            'mime'=>$format==='PDF' ? 'application/pdf':'application/octet-stream',
            'text'=>$format==='XML' ? text_preview($body) : '']);
    }
    if ($action==='reorder') fail('Ukládání pořadí není ve zdrojovém PHP ověřeno.',501);
    fail('Neznámá operace.',404);
} catch (JsonException $e) { fail('Neplatný JSON.',400); }
catch (Throwable $e) {
    // Do not log credentials, tokens or upstream pages.
    error_log('4Sunday: request failed ('.get_class($e).')');
    fail('Komunikace s WTTS selhala. Obnovte seznam; při chybě zápisu nejprve ověřte stav na WTTS.',502);
}
