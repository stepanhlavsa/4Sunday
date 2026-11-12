# Ověření verze 1.2 (přímé WTTS)

## Provedeno

- TypeScript: `npm run typecheck` – bez chyb.
- Expo SDK 58: závislosti zarovnány podle `expo/bundledNativeModules.json`; součástí balíčku je nový `package-lock.json`.
- `EXPO_OFFLINE=1 npx expo export --platform all` – vytvořeny balíčky Android, iOS a web. Jde o export JavaScriptu/Hermes, nikoli sestavení APK/IPA.
- Test transportu v Chromium: přihlašovací skrytá pole, cookies mezi požadavky, chybné heslo po platném přihlášení, obnovení vypršené relace, seznam událostí, menu, katalog, následující události, kontrola dostupnosti operací, plánování a přesun do šuplíku.
- Export: binární shoda PDF po rozdělení do zpráv a opětovném sestavení; zachování parametrů odkazu, odmítnutí HTML místo PDF, zamítnutí nedostupné písně, náhled XML bez spuštění vložených skriptů.
- Odmítnutí přihlašovacího formuláře mířícího na cizí doménu před odesláním údajů; filtrování cizích odkazů.
- Webový ukázkový režim při šířce 390 px: navigace, hledání bez diakritiky, rozbalení písně, náhled, přechod do plánování a odhlášení. Bez zachycených běhových chyb JavaScriptu.
- Zdrojový kód mobilu již neobsahuje adresu pomocného PHP API ani nastavení takového serveru. Serverová složka byla odstraněna.

## Změna pořadí – další ověření verze 1.2

- Veřejný JavaScript WTTS nastavuje `rpc.ServiceProxy.__serviceURL` na `server.JSONRPC`. Read-only volání `service_get_methods_with_parameters` potvrzuje signaturu `event_songs_set_order($event_id, $ordered_songs_ids)`.
- Simulovaný RPC: správné parametry a cookies, potvrzení změny následným načtením, přesun beze změny bez zápisu, odmítnutí zastaralého seznamu, duplicitních/chybějících/cizích ID a neznámé události.
- Simulované chyby: HTTP odpověď obsahující HTML, RPC error, result false, potvrzení bez skutečné změny, ztracená odpověď po úspěšném zápisu. Žádné automatické opakování zápisu.
- Ukázkové UI: gesto přetažení pomocí ukazatele i emulovaného dotyku v Chromium změnilo pořadí; ověřeno automatické posouvání u okraje; původní navigace, vyhledávání a exportní náhledy fungují dál.

## Rozsah a omezení

Test transportu používá simulované HTML odpovědi podle struktury dodaného `wtts.php`. Neověřuje aktuální HTML přihlášeného WTTS účtu. Probíhá v Chromium se skutečnými browser cookies, nikoli v Android WebView nebo WKWebView na iPhonu.

Nebylo provedeno živé přihlášení do WTTS, zkušební zápisy do skutečného účtu, běh v Expo Go na fyzických telefonech ani systémové uložení/sdílení PDF na Androidu/iOS. Tyto části je nutné ověřit postupem v README. Případné změny HTML WTTS, nastavení cookies, ochrana proti automatizaci nebo odlišné chování místního WebView mohou vyžadovat úpravu transportu.

Aplikace neimplementuje ukládání editace písní, ani správu příloh; tyto funkce nebyly dokončeny ani v předchozí verzi. Web podporuje pouze ukázku.
