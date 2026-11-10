# Ověření dodaného projektu

Provedeno při přípravě balíčku:

- TypeScript: `tsc --noEmit` – bez chyb.
- Expo SDK 57: `expo export --platform all` – úspěšné bundly pro Android, iOS a web. Toto není sestavení instalačního APK/IPA ani test na telefonu.
- PHP syntaktická kontrola souborů API, jádra a konfigurace pomocí php-parser – bez chyb.
- PHP fixture testy `tests/core.php` spuštěné v PHP WebAssembly runtime: všech 15 kontrol prošlo (URL, přihlášení, menu týmů, katalog, diakritika, krátké řádky, události).
- Chromium / Playwright, šířka 390 px: ukázkový režim, navigace, hledání bez diakritiky, rozbalení písně, náhled XML, otevření plánování, odhlášení – prošlo bez JavaScriptových runtime chyb.
- Vizuální kontrola obrazovky plánu na mobilní šířce.

Neověřeno:

- Skutečné přihlášení a HTML současného WTTS (nebyly poskytnuty přihlašovací údaje).
- Živé změny plánování, týmu, přesun do šuplíku a rušení událostí.
- Skutečné PDF/XML exporty z WTTS a nativní dialog sdílení na fyzickém Androidu/iPhonu.
- Nasazení PHP na konkrétní hosting, jeho open_basedir, oprávnění, timeouty a předávání Authorization.

Aplikace je připravený zdrojový základ pro integrační ověření na vašem hostingu. Výsledky lokálních testů nejsou potvrzením kompatibility s případnými změnami živého WTTS.
