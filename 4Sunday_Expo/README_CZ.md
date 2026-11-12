# 4Sunday 1.2 – přímé připojení k WTTS

Mobilní aplikace pro Android a iOS v React Native + Expo SDK 58. Komunikuje pouze s `https://www.wtts.org/`. Nepotřebuje pomocný PHP skript, vlastní API, hosting ani přímé připojení do MySQL. PHP funkce provozované samotným WTTS samozřejmě nadále používá.

## Spuštění ve Windows

Rozbalte tuto verzi do **nové složky**, abyste nepřepsali vlastní změny vzhledu. V PowerShellu ve VS Code přejděte do složky `mobile`, která obsahuje `package.json` a `package-lock.json`:

```powershell
cd "D:\Dokumenty\Církev\Vývoj\GitHub\4Sunday\4Sunday-direct\mobile"
npm.cmd ci
npx.cmd expo start --clear
```

Cestu upravte podle umístění rozbaleného ZIPu. Použijte Node.js LTS kompatibilní s Expo SDK 58 a Expo Go pro SDK 58. Telefon i počítač připojte ke stejné síti. QR kód otevřete v Expo Go na Androidu nebo fotoaparátem iPhonu. Na Windows nemusíte mít iOS simulátor; zkoušejte na skutečném iPhonu.

Na přihlašovací obrazovce zadejte **jméno/e-mail a heslo WTTS**. Adresa pomocného API již neexistuje a nic se nenastavuje na hostingu. Pokud je zapnuté „Zapamatovat přihlášení“, uloží se údaje pomocí Expo SecureStore do zabezpečeného úložiště telefonu. Bez této volby zůstanou jen v paměti běžící aplikace. Při odhlášení se uložené údaje odstraní a místní přihlašovací relace obnoví.

Pro samotný náhled vzhledu lze spustit `npm.cmd run web`. **Webová varianta podporuje pouze ukázkový režim.** Přímé přihlášení je určeno Androidu a iOS; prohlížeč na jiné doméně podléhá omezením CORS.

## Jak funguje přímé spojení

Nativní obrazovky zůstávají v React Native. Neviditelná WebView uvnitř aplikace obsahuje malý vlastní dokument s výchozí adresou WTTS. Slouží pro HTTPS požadavky, cookies a rozbor HTML pomocí DOMParser. Není to pomocná webová stránka hostovaná někde jinde: dokument je součástí aplikace.

Přihlašování vychází z dodaného `wtts.php`: načte formulář, převezme jeho skrytá pole, odešle údaje na WTTS a ověří přihlášenou stránku. Další požadavky používají stejnou relaci. Při explicitním přihlášení se nejprve ukončí stará relace, aby stará cookie nemohla zamaskovat chybné heslo.

HTML získané z WTTS se nezobrazuje ani nespouští jako program. Aplikace z něj vybere údaje, menu a povolené odkazy. PDF/XML stahuje podle odkazů nalezených na WTTS, včetně jejich parametrů; PDF předává systémovému sdílení pro uložení nebo tisk. Limit jednoho staženého výstupu je 8 MiB. Po uzavření sdílení se dočasná kopie z cache odstraní.

## Funkce

- Přihlášení, volitelné zapamatování údajů a odhlášení.
- Naplánované události, jejich písně a tóniny.
- Katalog písní a hledání bez ohledu na diakritiku.
- PDF jednotlivé písně i zpěvníku, pokud WTTS příslušný odkaz poskytuje.
- Textový náhled XML a sdílení původního výstupu.
- Menu a aktivace týmu podle aktuálního menu WTTS.
- Plánování/odebrání písně, přesun do šuplíku, změna plánujícího a zrušení události podle dostupných oprávnění. Zápisy vyžadují potvrzení v aplikaci.
- Informativní náhled příloh a editace. Ukládání editace a správa příloh nejsou implementovány.

Ostatní položky menu se otevírají na WTTS v externím prohlížeči, který má vlastní přihlášení. CAPTCHA a další interaktivní ověření při loginu nejsou podporovány.

Po síťové chybě při zápisu aplikace požadavek sama neopakuje. Nejprve obnovte seznam a ověřte, zda WTTS změnu provedlo.

## Přetahování písní v plánu

V záložce **Plán** chyťte píseň za úchyt **☰** vlevo a přetáhněte ji nahoru nebo dolů v rámci stejné události. Není potřeba dlouhé podržení ani tlačítko Uložit. U okraje seznamu se obsah automaticky posouvá. Běžným tažením po kartě lze dál posouvat stránku; tlačítka PDF/XML zůstávají funkční.

Po puštění se odešle nové pořadí přímo na WTTS. Aplikace před zápisem porovná původní pořadí s aktuálním plánem a po zápisu znovu ověří uložené pořadí. Při chybě se pokusí načíst skutečný stav. Pokud se ani to nepodaří, zobrazí původní pořadí a upozornění; stiskněte **Obnovit** před dalším přesunem. Síťový výpadek sám o sobě neznamená, že WTTS změnu neprovedlo.

Přesun mezi událostmi není podporován. U seznamu s méně než dvěma písněmi nebo s nejednoznačnými ID nejsou úchyty dostupné. Dostupnost zápisu dále určuje oprávnění účtu na WTTS. V ukázkovém režimu se mění pouze lokální pořadí.

Technicky jde o POST JSON na `https://www.wtts.org/server.JSONRPC` s metodou `event_songs_set_order` a parametry `[event_id, ordered_songs_ids]`. Adresa a signatura byly ověřeny ve veřejném JavaScriptu WTTS a jeho seznamu RPC metod. Starší pomocný PHP skript uváděl neověřenou adresu `?command=json-rpc`; aplikace ji nepoužívá.

## Úpravy kódu

- `mobile/App.tsx`: obrazovky a styly; soubor je rozformátovaný pro čitelnost.
- `mobile/src/workerSource.ts`: přímé požadavky, přihlášení a parsování WTTS.
- `mobile/src/TransportHost.native.tsx`: místní WebView a přenos zpráv do React Native.
- `mobile/src/DraggableSongs.tsx`: dotykové přetahování a automatické posouvání plánu.
- `mobile/src/bridge.ts`: spojení obrazovek s transportem.
- `mobile/src/api.ts`: rozhraní požadavků a SecureStore; název souboru neznamená externí API.
- `mobile/src/files.ts`: ukládání a sdílení exportů.
- `mobile/src/demo.ts`: ukázková data.

Soubor `workerSource.ts` záměrně obsahuje JavaScript jako řetězec `String.raw`: WebView jej spouští přímo, bez změn kompilátorem Metro. Při změně HTML struktury WTTS bude potřeba upravit selektory zde. Nejde o veřejné stabilní JSON API.

## Ověření

```powershell
cd mobile
npm.cmd run typecheck
npx.cmd expo export --platform all
```

Automatický test transportu používá Chromium a **simulované odpovědi WTTS**, nikoli skutečný účet. Pro jeho samostatné spuštění:

```powershell
cd ..\tests
npm.cmd ci
npx.cmd playwright install chromium
node worker.cjs
# Po vytvoření webového exportu lze ověřit i dotykové přetažení v Chromium:
node ui.cjs
```

Nejprve musí být instalovány také závislosti ve složce `mobile`. Testy se nepřipojují ke skutečnému WTTS a nepoužívají vaše údaje. Podrobný rozsah a neověřené části jsou v `VALIDACE.md`.

## První zkouška na telefonu

1. Přihlaste se a porovnejte tým, seznam událostí a několik písní s webem WTTS.
2. Vyhledejte píseň, stáhněte PDF a otevřete uložený soubor. Ověřte textový náhled.
3. Zavřete a znovu spusťte aplikaci; ověřte zapamatování přihlášení.
4. Odhlaste se. Zkuste chybné heslo a potom správné.
5. Na vhodné testovací události přesuňte píseň za úchyt ☰. Ověřte pořadí po stisku Obnovit i přímo na webu WTTS. Pak ověřte také plánování.
6. Stejný postup proveďte zvlášť na Androidu a iOS, zejména kvůli cookies WebView a sdílení souborů.

Živé přihlášení a běh na skutečných mobilních zařízeních nebyly při přípravě tohoto balíčku ověřeny. Úspěšné automatické testy ani export nejsou jejich náhradou.
