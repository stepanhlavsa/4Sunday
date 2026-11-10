# 4Sunday – React Native + Expo

Mobilní rozhraní pro WTTS podle přiloženého `wtts(3).php`. Balíček obsahuje **zdrojový projekt**, nikoliv APK/IPA. Expo aplikace má vlastní nativní obrazovky, není to WebView obal webu.

## Architektura

Telefon / web → HTTPS JSON → `server/api.php` na vašem hostingu → HTTPS + uživatelské cookies → `www.wtts.org`.

PHP zůstává jako prostředník: poskytuje již známé parsování HTML, přihlášení a ověřování dostupnosti operací. Mobil nemusí parsovat HTML a webová verze může využít stejné API. Na wtts.org se nic neinstaluje ani nemění. Pro tuto verzi není potřeba MySQL ani jiná databáze. Uživatel má přístup podle svého účtu WTTS.

## Nejrychlejší spuštění ukázky na Windows

Rozbalte archiv do **nového adresáře**, například `D:\Dokumenty\Církev\Vývoj\GitHub\4Sunday-native`. Původní projekt zatím nepřepisujte. Pracovní adresář je `mobile` (obsahuje package.json).

```powershell
cd "D:\Dokumenty\Církev\Vývoj\GitHub\4Sunday-native\mobile"
npm.cmd ci
npx.cmd expo start
```

Pokud rozbalovací nástroj vložil ještě složku `4Sunday`, přidejte ji do cesty. Ve správném adresáři vrátí `Test-Path .\package.json` hodnotu `True`.

V Expo Go naskenujte QR kód. Telefon a počítač musí být na stejné síti. Stiskem `w` otevřete web. Tlačítko **Prohlédnout ukázku bez přihlášení** zobrazí fiktivní data bez kontaktování WTTS. Ukázkové názvy nejsou obsah stažený z WTTS; export a změny v demo režimu nejsou skutečné.

Projekt je sestaven s Expo SDK 57, React 19.2.3 a React Native 0.86.3. Použijte Node.js LTS vyhovující závislostem (ověřeno s Node 24.22.1). Pokud Expo Go hlásí jinou podporovanou verzi SDK, použijte odpovídající Expo Go nebo vlastní development build. Nepřepisujte jednotlivé verze React/React Native libovolně; jsou svázané s Expo SDK.

## Nasazení PHP API pro skutečná data

1. Na svém HTTPS hostingu vytvořte samostatnou veřejnou složku, například `/4sunday/`.
2. Nahrajte `server/api.php` a `server/wtts-core.php`.
3. Zkopírujte `server/config.example.php` jako `config.php` do stejné složky.
4. V config.php upravte `private_dir` na skutečnou **absolutní cestu mimo veřejný webový kořen**, dostupnou PHP v rámci open_basedir. Příklad pro hosting z dodaného PHP: `/home/www/ac-usti.cz/4sunday_private`. Cestu potvrďte podle svého hostingu. PHP musí mít právo vytvářet a zapisovat soubory.
5. Hosting potřebuje PHP >=8.1, rozšíření cURL a DOM, ideálně mbstring, podporu PHP sessions a odchozí HTTPS přístup k www.wtts.org. Doporučené limity pro větší exporty: memory_limit alespoň 128 MB, odpovídající časový limit požadavků hostingu (např. 180 s).
6. V přihlašovací obrazovce aplikace zadejte celou adresu, například `https://vase-domena.cz/4sunday/api.php`. Nezadávejte přímo adresu wtts.org ani původního wtts.php.
7. Zadejte své skutečné přihlašovací údaje WTTS. Uživatelé zadávají vlastní účty, nikoli přístup do MySQL.

Volitelně můžete zkopírovat `mobile/.env.example` na `mobile/.env` a upravit `EXPO_PUBLIC_API_URL`. Potom restartujte Expo. V proměnných EXPO_PUBLIC nikdy nemají být hesla ani tajné klíče.

Otevření api.php v prohlížeči zobrazí JSON chybu „Použijte POST JSON.“ – to je očekávané, API není HTML stránka.

### Webová verze

Do `allowed_origins` v config.php přidejte přesné adresy webové aplikace (schéma + host + port, bez cesty), například `http://localhost:8081` při vývoji a `https://app.vase-domena.cz` pro provoz. Pokud přistupujete z LAN adresy, přidejte i její konkrétní origin. Žádné `*`. Android/iOS bez hlavičky Origin nepotřebují CORS.

```powershell
npx.cmd expo start --web
```

Na webu se token ukládá jen v paměti; po obnovení stránky je nutné nové přihlášení. Výstup `npx.cmd expo export --platform web` lze hostovat jako statický web. PHP API zůstává na PHP hostingu.

### Authorization hlavička na hostingu

Pokud se přihlášení podaří a následující požadavky vracejí 401, ověřte, že hosting předává hlavičku `Authorization` do PHP (`HTTP_AUTHORIZATION` nebo `REDIRECT_HTTP_AUTHORIZATION`). Na některých Apache/FastCGI hostinzích je třeba nastavení od poskytovatele nebo pravidlo v .htaccess. Nezapínejte Basic Auth nad stejným endpointem – využíval by stejnou hlavičku.

## Funkce a meze

| Funkce | Stav |
|---|---|
| Přihlášení k WTTS, obnova relace | Implementováno podle dodaného PHP |
| Zapamatování relace na Android/iOS | Token v Expo SecureStore; heslo se v telefonu trvale neukládá |
| Naplánované události a jejich písně | Nativní obrazovka |
| Katalog písní, hledání bez diakritiky | Nativní seznam s rozbalovacími akcemi |
| PDF písně / celé události | Stažení přes API, systémové sdílení; na webu download |
| XML písně / události | Textový náhled a původní soubor ke sdílení |
| Plánovat / odebrat píseň | Existující WTTS toggle, potvrzení před odesláním |
| Přepínání týmu | Podle aktuálního menu Tým → Aktivovat |
| Následující události | Zobrazení, změna plánujícího, zrušení s potvrzením |
| Přesun do šuplíku | Potvrzení a následná kontrola zmizení z katalogu |
| Přílohy a editace | Pouze bezpečný textový náhled; odkazy do prohlížeče |
| Ostatní menu WTTS | Externí prohlížeč, případně nové přihlášení |
| Změna pořadí písní | Nepodporována: zdroj má WTTS_RPC_VERIFIED=false |
| Skutečná editace / upload příloh | Nepodporováno ani ve zdrojovém PHP |
| Offline práce, sdílená vlastní DB | Není součástí této verze |

XML na WTTS může obsahovat HTML a více kořenových elementů. Zachováváme původní bajty; neslibujeme validní XML dokument ani přesnou grafickou sazbu v textovém náhledu. Pro sazbu včetně akordů používejte PDF.

Přílohy se zobrazují jako text + odkazy. Nejde o přihlášený prohlížeč v aplikaci; externí prohlížeč nesdílí WTTS cookies ze serveru a může vyžadovat nové přihlášení.

## Přihlašování a serverová data

- Telefon posílá jméno/heslo jednorázově vlastnímu HTTPS API. API je předá WTTS.
- Pro opakované přihlášení k WTTS API uchovává heslo v privátní PHP session na serveru, stejně jako původní PHP. Není to hash hesla: pro odeslání WTTS je potřebná původní hodnota. Tento adresář musí být dostupný pouze účtu hostingu, nesmí být ve veřejném webu nebo veřejné záloze.
- Náhodný 256bitový bearer token identifikuje relaci. Na serveru se používá hash tokenu jako ID session. Token se neposílá v URL ani logu. Odhlášení odstraní session a cookies.
- Relace vyprší po 7 dnech bez aktivity (nastavitelné). Hosting ji může vyčistit dříve. Potom se přihlaste znovu.
- Při nedostupném serveru lze z telefonu odhlásit lokálně; serverová relace vyprší automaticky.
- API znovu ověřuje dostupnost ID a funkcí vůči přihlášenému WTTS. CORS sám o sobě není autentizace.
- Přihlášení má limit 20 pokusů za 15 minut na IP; uživatelé na stejné síti limit sdílí.
- Provozní údržba: zajistěte mazání starých PHP session souborů, cookies a `limit-*` souborů v privátním adresáři, např. hostingovým cronem po 8 dnech od poslední změny. PHP garbage collector odstraňuje sessions, ne všechny doprovodné cookie soubory.
- Endpoint přijímá jen známé operace; nedovoluje klientovi zadat libovolnou URL serverového požadavku.
- U změn plánování / plánujícího se výsledek načte znovu; hláška „požadavek odeslán“ neznamená nezávislé potvrzení aplikačního výsledku WTTS. Při timeoutu **nejprve obnovte stav**, neopakujte ihned toggle, který mohl již proběhnout.

## Struktura a úpravy

- `mobile/App.tsx`: obrazovky, formuláře, potvrzovací dialogy a navigace.
- `mobile/src/api.ts`: HTTPS JSON, timeout, bezpečné uložení tokenu.
- `mobile/src/files.ts`: PDF/XML sdílení a webové stahování.
- `mobile/src/demo.ts`: výhradně demonstrační data.
- `server/wtts-core.php`: parsování a přihlášení odvozené z dodaného wtts(3).php; navíc validace přesměrování před odesláním, kontroly krátkých řádků a URL.
- `server/api.php`: autorizované operace pro mobilní klient.
- `tests/core.php`: fixture testy parseru a omezení odkazů bez kontaktování WTTS.

Používá se vlastní vstup `mobile/index.js`, nikoliv Expo Router. Nekopírujte samotný App.tsx do projektu, jehož `main` je `expo-router/entry`, a neočekávejte, že se automaticky zobrazí. Nejjednodušší je použít celý dodaný `mobile` projekt. Při integraci do starého projektu zálohujte změny, nastavte main na index.js a přeneste i závislosti a src.

## Ověření a test na hostingu

Lokální kontroly jsou popsány v `VALIDACE.md`. Testy bez skutečného WTTS nenahrazují integrační zkoušku.

```powershell
cd mobile
npm.cmd run typecheck
npx.cmd expo export --platform all
```

Pokud máte PHP CLI s DOM a cURL:

```powershell
php tests/core.php
```

Po nasazení doporučený postup: přihlášení → seznam událostí → katalog a hledání → PDF → XML → přepnutí týmu → teprve potom na testovací události plánování/odebrání. Zrušení skutečné události neprovádějte jen pro ověření aplikace. Následně vyzkoušejte odhlášení, restart aplikace, opětovné přihlášení a obnovení po výpadku sítě.

Za změny HTML nebo AJAX rozhraní WTTS je nutné upravit parser/API. Automatické přihlášení předpokládá stejný formulář bez dodatečného CAPTCHA/MFA jako ve vašem PHP souboru.
