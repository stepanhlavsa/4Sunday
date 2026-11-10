<?php
declare(strict_types=1);
const WTTS_BASE = 'https://www.wtts.org/';
const WTTS_EVENTS = 'https://www.wtts.org/?command=scheduled-events';
// Skutečný endpoint a formát ukládání pořadí musí být ověřeny v Network na WTTS.
const WTTS_RPC_URL = 'https://www.wtts.org/?command=json-rpc';
const WTTS_RPC_VERIFIED = false;

if (!extension_loaded('curl') || !class_exists('DOMDocument')) {
    http_response_code(500);
    exit('Server nemá potřebná rozšíření PHP (cURL a DOM).');
}

function h(?string $s): string {
    return htmlspecialchars($s ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function local_url(): string {
    return strtok($_SERVER['REQUEST_URI'] ?? '/wtts.php', '?') ?: '/wtts.php';
}
function cookie_file(): string {
    // Adresář je v povoleném open_basedir a mimo veřejný webový kořen.
    $dir = PRIVATE_DIR . '/cookies';
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new RuntimeException('Nelze vytvořit adresář pro WTTS cookies.');
        }
    }
    if (!is_writable($dir)) {
        throw new RuntimeException('Adresář pro WTTS cookies není zapisovatelný.');
    }
    return $dir . '/wtts_' . hash('sha256', __DIR__ . session_id()) . '.cookies';
}
function absolute_url(?string $rel): ?string {
    $rel = trim((string)$rel);
    if ($rel === '' || $rel === '#' || preg_match('~^(?:javascript|data):~i', $rel)) return null;
    if (preg_match('~^https?://~i', $rel)) {
        $parts = parse_url($rel);
        if (!$parts || strtolower($parts['host'] ?? '') !== 'www.wtts.org'
            || strtolower($parts['scheme'] ?? '') !== 'https' || isset($parts['user']) || isset($parts['pass']) || (isset($parts['port']) && $parts['port'] !== 443)) return null;
        return $rel;
    }
    if (str_starts_with($rel, '//')) return null;
    if (str_starts_with($rel, '/')) return rtrim(WTTS_BASE, '/') . $rel;
    return WTTS_BASE . $rel;
}
function request_wtts(string $url, array $extra = []): array {
    // Redirects are checked BEFORE connecting; never forward secrets off WTTS.
    for ($redirect = 0; $redirect < 6; $redirect++) {
        if (absolute_url($url) !== $url) throw new RuntimeException('Nepovolená adresa WTTS.');
        $location = '';
        $ch = curl_init($url);
        $options = [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => 35, CURLOPT_CONNECTTIMEOUT => 12,
            CURLOPT_USERAGENT => '4Sunday/1.0', CURLOPT_COOKIEFILE => cookie_file(),
            CURLOPT_COOKIEJAR => cookie_file(), CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_HEADERFUNCTION => static function ($ch, $line) use (&$location) {
                if (stripos($line, 'Location:') === 0) $location = trim(substr($line, 9));
                return strlen($line);
            }];
        curl_setopt_array($ch, array_replace($options, $extra));
        $body = curl_exec($ch);
        if ($body === false) throw new RuntimeException('Spojení s WTTS selhalo: ' . curl_error($ch));
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_setopt($ch, CURLOPT_COOKIELIST, 'FLUSH');
        unset($ch);
        if ($status >= 300 && $status < 400 && $location !== '') {
            $next = absolute_url($location);
            if (!$next) throw new RuntimeException('Nepovolené přesměrování WTTS.');
            $url = $next;
            if (in_array($status, [301,302,303], true)) {
                unset($extra[CURLOPT_POST], $extra[CURLOPT_POSTFIELDS]);
            }
            continue;
        }
        if ($status >= 400) throw new RuntimeException("WTTS vrátilo HTTP $status.");
        return ['body' => (string)$body, 'status' => $status];
    }
    throw new RuntimeException('Příliš mnoho přesměrování WTTS.');
}
function xpath_for(string $html): DOMXPath {
    // PHP 8.5: žádné mb_convert_encoding(..., 'HTML-ENTITIES', ...).
    $previous = libxml_use_internal_errors(true);
    try {
        $dom = new DOMDocument('1.0', 'UTF-8');
        $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
        foreach (iterator_to_array($dom->childNodes) as $node) {
            if ($node->nodeType === XML_PI_NODE) $dom->removeChild($node);
        }
        return new DOMXPath($dom);
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
    }
}
function is_logged_in(string $html): bool {
    if (preg_match('~id=["\']welcome_guest_screen["\']~i', $html)) return false;
    if (preg_match('~id=["\']sign-in["\']~i', $html)) return false;
    if (preg_match('~id=["\']top_menu_user_name["\'][^>]*>\s*Guest\b~i', $html)) return false;
    return str_contains($html, '?command=log-out')
        || (bool)preg_match('~id=["\']top_menu_user_name["\'][^>]*>\s*(?!Guest\b)[^<\s]~i', $html);
}
function login_form(string $html): array {
    $xp = xpath_for($html);
    $form = $xp->query("//form[@id='sign-in' or @name='sign-in']")->item(0);
    if (!$form) $form = $xp->query("//form[.//input[translate(@type,'PASSWORD','password')='password']]")->item(0);
    if (!$form) throw new RuntimeException('WTTS přihlašovací formulář nebyl nalezen.');
    $fields = [];
    $user = null; $pass = null;
    foreach ($xp->query('.//input[@name]', $form) as $input) {
        $name = $input->getAttribute('name');
        $type = strtolower($input->getAttribute('type') ?: 'text');
        if (in_array($type, ['checkbox', 'radio'], true) && !$input->hasAttribute('checked')) continue;
        $fields[$name] = $input->getAttribute('value');
        if (in_array($type, ['text', 'email'], true) && $user === null) $user = $name;
        if ($type === 'password') $pass = $name;
    }
    $user = isset($fields['username_email']) ? 'username_email' : $user;
    $pass = isset($fields['password']) ? 'password' : $pass;
    if (!$user || !$pass) throw new RuntimeException('Nepodařilo se určit pole přihlašovacího formuláře.');
    return ['url' => absolute_url($form->getAttribute('action') ?: '?command=sign-in'),
        'fields' => $fields, 'user' => $user, 'pass' => $pass];
}
function get_authenticated_html(): string {
    // Zachováme pořadí požadavků z původní funkční verze:
    // nejdříve úvodní stránka (cookie + formulář), potom seznam událostí.
    $home = request_wtts(WTTS_BASE)['body'];
    $events = request_wtts(WTTS_EVENTS)['body'];
    if (is_logged_in($events)) return $events;

    $form = login_form($home);
    $fields = $form['fields'];
    $fields[$form['user']] = (string)($_SESSION['wtts_user'] ?? '');
    $fields[$form['pass']] = (string)($_SESSION['wtts_pass'] ?? '');
    // WTTS používá název submit tlačítka pro zpracování přihlášení.
    if (!isset($fields['submit_signin']) || $fields['submit_signin'] === '') {
        $fields['submit_signin'] = 'sign in';
    }
    request_wtts($form['url'], [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($fields),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/x-www-form-urlencoded',
            'Origin: https://www.wtts.org',
            'Referer: https://www.wtts.org/',
            'Expect:'
        ],
    ]);
    $events = request_wtts(WTTS_EVENTS)['body'];
    if (!is_logged_in($events)) {
        throw new RuntimeException('Přihlášení do WTTS se nezdařilo. Zkontrolujte přihlašovací údaje nebo aktuální formulář WTTS.');
    }
    return $events;
}
function class_xpath(string $class): string {
    return "contains(concat(' ', normalize-space(@class), ' '), ' $class ')";
}
function parse_events(string $html): array {
    $xp = xpath_for($html);
    $result = [];
    foreach ($xp->query('//div[' . class_xpath('table_container') . ']') as $container) {
        $titleNode = $xp->query(".//div[" . class_xpath('table_title') . "]", $container)->item(0);
        $links = ['plan' => null, 'pdf' => null, 'xml' => null];
        foreach ($xp->query(".//table[" . class_xpath('table_menubar') . "]//a[@href]", $container) as $a) {
            $url = absolute_url($a->getAttribute('href'));
            if (!$url) continue;
            if (!$links['plan'] && str_contains($url, 'command=list-songs') && str_contains($url, 'eid=')) $links['plan'] = $url;
            if (!$links['pdf'] && str_contains($url, '/render-event/PDF/')) $links['pdf'] = $url;
            if (!$links['xml'] && str_contains($url, '/render-event/XML/')) $links['xml'] = $url;
        }
        $eid = 0;
        foreach ($links as $link) {
            if ($link && (preg_match('~[?&]eid=(\d+)~', $link, $m)
                || preg_match('~/render-event/(?:PDF|XML)/(\d+)(?:/|$|\?)~', $link, $m))) {
                $eid = (int)$m[1]; break;
            }
        }
        if (!$eid) continue;
        $songs = [];
        foreach ($xp->query(".//table[" . class_xpath('centered_list_table') . "]//tr[td]", $container) as $tr) {
            $nameA = $xp->query(".//td[" . class_xpath('td-alligned-left') . "]//a", $tr)->item(0);
            if (!$nameA) continue;
            $name = trim($nameA->textContent);
            $cells = $xp->query('./td', $tr);
            $key = $cells->length >= 4 ? trim($cells->item(3)->textContent) : '';
            $pdf = null; $xml = null;
            foreach ($xp->query('.//a[@href]', $tr) as $a) {
                $url = absolute_url($a->getAttribute('href'));
                if ($url && str_contains($url, '/render-song/PDF/')) $pdf = $url;
                if ($url && str_contains($url, '/render-song/XML/')) $xml = $url;
            }
            $sid = 0;
            if (preg_match('~/render-song/(?:PDF|XML)/(\d+)(?:/|$|\?)~', $pdf ?: ($xml ?: ''), $m)) $sid = (int)$m[1];
            $songs[] = ['sid' => $sid, 'name' => $name, 'key' => $key, 'pdf' => $pdf, 'xml' => $xml];
        }
        $result[] = ['eid' => $eid, 'title' => trim($titleNode?->textContent ?? 'Událost'),
            'links' => $links, 'songs' => $songs];
    }
    return $result;
}
function menu_label_initial_upper(string $label): string {
    $label = trim($label);
    if ($label === '') return $label;
    if (function_exists('mb_substr') && function_exists('mb_strtoupper')) {
        return mb_strtoupper(mb_substr($label, 0, 1, 'UTF-8'), 'UTF-8')
            . mb_substr($label, 1, null, 'UTF-8');
    }
    // Záložní varianta pro ASCII, pokud není nainstalováno mbstring.
    return ucfirst($label);
}
function menu_item(DOMXPath $xp, DOMElement $li): array {
    $a = $xp->query('./a', $li)->item(0);
    $label = $a ? trim($a->textContent) : '';
    if ($label === '') {
        foreach ($li->childNodes as $node) {
            if ($node->nodeType === XML_TEXT_NODE) $label .= ' ' . trim($node->nodeValue);
        }
        $label = trim($label);
    }
    $url = $a ? absolute_url($a->getAttribute('href')) : null;
    if (!$url && $a && preg_match('~[\'"]([^\'"]*\?command=[^\'"]+)[\'"]~', $a->getAttribute('onclick'), $m)) {
        $url = absolute_url($m[1]);
    }
    $children = [];
    foreach ($xp->query('./ul/li', $li) as $child) $children[] = menu_item($xp, $child);
    return ['label' => menu_label_initial_upper($label ?: 'Menu'), 'url' => $url, 'children' => $children];
}
function parse_menu(string $html): array {
    $xp = xpath_for($html);
    $menu = [];
    foreach ($xp->query("//ul[@id='menulistbar']/li") as $li) $menu[] = menu_item($xp, $li);
    return $menu;
}
/** Najde položku podle cesty indexů v aktuálním WTTS menu. */
function menu_by_path(array $menu, array $path): ?array {
    $item = null;
    foreach ($path as $index) {
        if (!is_int($index) || !isset($menu[$index])) return null;
        $item = $menu[$index];
        $menu = $item['children'] ?? [];
    }
    return $item;
}
/** Vyhodnotí pouze větev Tým -> Aktivovat -> konkrétní tým. */
function team_activation_path(array $menu, array $path): bool {
    if (count($path) !== 3) return false;
    $team = menu_by_path($menu, array_slice($path, 0, 1));
    $activate = menu_by_path($menu, array_slice($path, 0, 2));
    $target = menu_by_path($menu, $path);
    $normalize = static function ($value): string {
        $value = trim((string)$value);
        return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
    };
    return $team && $activate && $target
        && in_array($normalize($team['label']), ['tým', 'team'], true)
        && in_array($normalize($activate['label']), ['aktivovat', 'activate'], true)
        && !empty($target['url']);
}
/** Rozpozná položku Písně → Zobrazit všechny podle skutečného menu WTTS. */
function all_songs_menu_url(array $menu): ?string {
    $norm = static function (string $s): string {
        $s = trim(preg_replace('/\s+/u', ' ', $s) ?? $s);
        return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
    };
    foreach ($menu as $root) {
        if (!in_array($norm((string)$root['label']), ['písně', 'pisne', 'songs'], true)) continue;
        foreach (($root['children'] ?? []) as $child) {
            if (in_array($norm((string)$child['label']), ['zobrazit všechny', 'zobrazit vsechny', 'show all', 'show all songs', 'list all'], true)) {
                return $child['url'] ?? null;
            }
        }
    }
    return null;
}
/** Skutečná struktura WTTS ?command=list-songs: název v td[2], tónina v td[3], exporty XML/PDF v td[4..5], přílohy a editace v td[7..8], datum a šuplík v td[9..10]. */
function parse_all_songs(string $html, bool $planning = false): array {
    $xp = xpath_for($html);
    $songs = [];
    foreach ($xp->query('//table[contains(concat(" ", normalize-space(@class), " "), " centered_list_table ")]/tbody/tr') as $tr) {
        $cells = $xp->query('./td', $tr);
        if (!$cells || $cells->length < 8) continue;
        $name = trim(preg_replace('/\s+/u', ' ', $cells->item(1)->textContent) ?? '');
        if ($name === '') continue;
        $key = trim($cells->item(2)->textContent);
        $actions = [];
        foreach (['XML' => 3, 'PDF' => 4] as $format => $index) {
            $a = $xp->query('.//a[@href]', $cells->item($index))->item(0);
            if (!$a) continue;
            $url = absolute_url($a->getAttribute('href'));
            if ($url && preg_match('~^https://www\.wtts\.org/render-song/' . $format . '/[0-9]+/?(?:\?.*)?$~i', $url)) {
                $actions[$format] = $url;
            }
        }
        $sid = 0;
        if (preg_match('~/render-song/(?:PDF|XML)/(\d+)(?:/|$|\?)~', $actions['PDF'] ?? $actions['XML'] ?? '', $m)) $sid = (int)$m[1];
        $attachments = $sid > 0 && (bool)$xp->query('.//a[contains(@onclick, "ajax=attachments")]', $cells->item(6))->length;
        $editable = $sid > 0 && (bool)$xp->query('.//a[contains(@onclick, "ajax=edit-song")]', $cells->item(7))->length;
        $lastPlanned = $cells->length > 8 ? trim($cells->item(8)->textContent) : '';
        $schedule = false;
        $scheduled = false;
        if ($planning && $sid > 0) {
            foreach ($xp->query('.//a[@onclick or @href]', $tr) as $a) {
                $handler = html_entity_decode($a->getAttribute('onclick') . ' ' . $a->getAttribute('href'), ENT_QUOTES | ENT_HTML5, 'UTF-8');
                if (str_contains($handler, 'toggle-event-song-schedule')) {
                    $schedule = true;
                    $scheduled = (bool)preg_match('/(?:unschedule|remove|scheduled|selected|active|checked)/i', $a->getAttribute('class') . ' ' . $a->getAttribute('title'));
                    $lastPlanned = trim($a->textContent) ?: $lastPlanned;
                    break;
                }
            }
        }
        $drawer = $sid > 0 && $cells->length > 9 && (bool)$xp->query('.//a[contains(@onclick, "move-song-to-drawer")]', $cells->item(9))->length;
        $songs[] = ['sid' => $sid, 'name' => $name, 'key' => $key, 'actions' => $actions,
            'attachments' => $attachments, 'editable' => $editable,
            'last_planned' => $lastPlanned, 'drawer' => $drawer, 'schedule' => $schedule, 'scheduled' => $scheduled];
    }
    return $songs;
}

/** Budoucí události z tabulky WTTS list-team-events. */
function parse_team_events(string $html): array {
    $xp = xpath_for($html);
    $result = [];
    foreach ($xp->query('//table[contains(concat(" ",normalize-space(@class)," ")," centered_list_table ")]/tbody/tr') as $tr) {
        $td = $xp->query('./td', $tr);
        if ($td->length < 5) continue;
        $link = $xp->query('.//a[contains(@href,"eid=")]', $td->item(2))->item(0);
        if (!$link || !preg_match('/[?&]eid=(\d+)/', html_entity_decode($link->getAttribute('href')), $m)) continue;
        $eid = (int)$m[1];
        $toggle = $xp->query('.//a[contains(@onclick,"toggle-event-scheduler")]', $td->item(3))->length > 0;
        $cancel = $xp->query('.//a[contains(@onclick,"cancel-event")]', $td->item(4))->length > 0;
        $result[] = ['eid'=>$eid, 'date'=>trim($td->item(1)->textContent),
            'title'=>trim($link->textContent), 'scheduler'=>trim($td->item(3)->textContent),
            'plan'=>absolute_url($link->getAttribute('href')), 'toggle'=>$toggle, 'cancel'=>$cancel];
    }
    return $result;
}

