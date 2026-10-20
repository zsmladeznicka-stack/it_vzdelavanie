# Vzdelávanie učiteľov – webová aplikácia

Učiteľ sa prihlási školským Google účtom (@koharysuli.sk). Potom postupne pozerá videá. Po každom videu nasleduje test a na konci aplikácia vygeneruje osvedčenie na jeho meno.

- Video sa nedá pretáčať dopredu ani zrýchliť.
- Pri prepnutí karty, minimalizácii alebo prechode do iného okna sa video pozastaví.
- Ďalšie video sa odomkne až po splnení testu (aspoň 80 %). Neúspešný test sa dá opakovať.
- Testy nemajú časový limit.
- Celé vzdelávanie treba dokončiť do **24 hodín od prvého prihlásenia**. Priebeh sa ukladá, takže v rámci tohto času možno prestať a pokračovať. Po uplynutí termínu sa už pokračovať nedá.
- Server zaznamenáva pozretý čas podľa reálne uplynutého času. Video sa preto nedá „dopozerať“ rýchlejšie, ani keď niekto obíde prehrávač.
- Správne odpovede sú len v tabuľke, prehliadač ich nikdy nedostane.

## Ako to funguje

| Časť | Kde beží | Súbory |
|---|---|---|
| Webová stránka | GitHub Pages (zadarmo) | `index.html`, `app.js`, `style.css`, `config.js`, `demo-api.js` |
| Server a údaje | Google Apps Script + Google tabuľka | `apps-script/Code.gs` |
| Videá | YouTube („Nezverejnené“) | – |

Kým nie je vyplnené `API_URL` v `config.js`, aplikácia beží v **ukážkovom režime**. V ňom sa dá vyskúšať bez Google prihlásenia, s krátkymi ukážkovými videami.

---

## Nasadenie krok za krokom

### 1. Videá na YouTube
1. Nahrajte videá na YouTube a ako viditeľnosť zvoľte **Nezverejnené** (Unlisted).
2. Pri každom videu nechajte zapnuté **Povoliť vkladanie** (Allow embedding).
3. Z adresy `https://www.youtube.com/watch?v=XXXXXXXXXXX` si poznačte ID videa, teda časť za `v=`.
4. Poznačte si aj dĺžku videa v **sekundách** (napr. 1:25:30 = 5130).

### 2. Google tabuľka a Apps Script
1. Prihláste sa školským účtom a vytvorte novú Google tabuľku, napr. „Kurz – administrácia“.
2. Otvorte **Rozšírenia → Apps Script**.
3. Obsah súboru `Code.gs` nahraďte obsahom `apps-script/Code.gs` z tohto projektu.
4. Názov školy a vzdelávania sú v `CONFIG` už vyplnené. Prípadne upravte `PASS_PERCENT` (hranica úspešnosti) a `HOURS_LIMIT` (časový limit). `CLIENT_ID` doplníte v kroku 3.
5. Uložte, hore vyberte funkciu **setup** a kliknite **Spustiť**. Povoľte požadované oprávnenia.
   V tabuľke vzniknú hárky:
   - **Videa**: poradie, názov, YouTube ID, dĺžka v sekundách
   - **Otazky**: číslo videa, otázka, možnosti A–D (C a D môžu byť prázdne), správna odpoveď (písmeno)
   - **Priebeh**: tu priebežne vidíte, kto koľko pozrel a ako dopadli testy
   - **Osvedcenia**: zoznam vydaných osvedčení s číslami
   - **Ucastnici**: čas prvého prihlásenia a termín ukončenia každého učiteľa
   - **Nastavenia**: `Vzdelávanie aktívne` = `1` (učitelia môžu začať) alebo `0` (učitelia vidia úvodnú stránku a návod, ale videá ani testy nespustia a 24-hodinové okno sa im nezačne počítať). Administrátori (`ADMINS`) môžu aplikáciu používať aj pri `0`. Zmena sa prejaví hneď.
6. Hárky **Videa** a **Otazky** prepíšte vlastnými údajmi. Ukážkové riadky zmažte.

> Video sa ráta ako dopozerané, keď učiteľ pozrel aspoň **98 %** jeho dĺžky (nastavenie `WATCH_PERCENT` v `CONFIG`). Až potom sa zobrazí tlačidlo na test.

### 3. Google prihlásenie (Client ID)
1. Otvorte https://console.cloud.google.com/ (školským účtom) a vytvorte nový projekt.
2. **APIs & Services → OAuth consent screen**: typ používateľa **Internal**. Aplikáciu potom uvidia len účty @koharysuli.sk. Vyplňte názov a kontaktný e-mail.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://zsmladeznicka-stack.github.io`
4. Skopírujte **Client ID** (končí na `.apps.googleusercontent.com`) a vložte ho:
   - do `CONFIG.CLIENT_ID` v Apps Scripte,
   - do `GOOGLE_CLIENT_ID` v súbore `config.js`.

> Ak správca Google Workspace školy blokuje aplikácie tretích strán, musí v Admin konzole povoliť tento Client ID (Bezpečnosť → Prístup k API a ovládanie aplikácií).

### 4. Zverejnenie servera (Apps Script)
1. V Apps Scripte kliknite **Nasadiť → Nové nasadenie → typ: Webová aplikácia**.
   - Spustiť ako: **Ja**
   - Kto má prístup: **Ktokoľvek**. Nebojte sa, overenie školského účtu robí samotný skript.
2. Skopírujte URL webovej aplikácie (končí na `/exec`) a vložte ju do `API_URL` v `config.js`.

> Po každej zmene `Code.gs` treba ísť do **Nasadiť → Spravovať nasadenia → upraviť (ceruzka) → Verzia: Nová verzia**. URL zostane rovnaká. Zmeny v tabuľke (videá, otázky) sa prejavia hneď a nové nasadenie nepotrebujú.

### 5. Zverejnenie stránky na GitHub Pages
1. Repozitár: https://github.com/zsmladeznicka-stack/it_vzdelavanie
2. Nahrajte doň súbory projektu (**Add file → Upload files**).
3. **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
4. O minútu bude stránka dostupná na https://zsmladeznicka-stack.github.io/it_vzdelavanie/.

### Vlastná adresa: https://vzdelavanie.koharysuli.sk
- **DNS (Websupport, hlavný účet školy):** záznam `CNAME`, názov `vzdelavanie`, cieľ `zsmladeznicka-stack.github.io`.
- **GitHub:** Settings → Pages → Custom domain `vzdelavanie.koharysuli.sk`, zapnuté **Enforce HTTPS** (súbor `CNAME` v repozitári sa nesmie zmazať).
- **Google Cloud Console:** v Authorized JavaScript origins musí byť `https://vzdelavanie.koharysuli.sk`.

Hotovo. Tento odkaz pošlete učiteľom.

---

## Časté otázky

**Dá sa test opakovať?** Áno, neobmedzene. Do tabuľky sa zapisuje počet pokusov aj najlepšie skóre.

**Čo ak učiteľ zavrie prehliadač uprostred videa?** Pri ďalšom prihlásení pokračuje od miesta, kde skončil (s presnosťou na približne 20 sekúnd), ak ešte neuplynulo 24 hodín od prvého prihlásenia.

**Čo ak učiteľ nestihne termín?** Aplikácia mu oznámi, že vzdelávanie už nemožno dokončiť. Ak mu chcete dať nový termín, v hárku **Ucastnici** zmažte jeho riadok. Nových 24 hodín sa začne rátať od ďalšieho prihlásenia. Ak má začať úplne odznova, zmažte aj jeho riadky v hárku **Priebeh**.

**Platí osvedčenie aj po termíne?** Áno. Kto stihol splniť všetky testy včas, osvedčenie si môže zobraziť a stiahnuť aj neskôr.

**Ako overím pravosť osvedčenia?** Číslo osvedčenia je uvedené v hárku **Osvedcenia** spolu s menom a dátumom.

**Ako vynulujem priebeh učiteľa?** Zmažte jeho riadky v hárkoch **Priebeh** a **Ucastnici**. Ak treba, zmažte aj riadok v hárku **Osvedcenia**.

**Hranice ochrany:** Obmedzenia v prehliadači zastavia bežného používateľa. Minimalizácii okna sa zabrániť nedá, video sa iba pozastaví. Server navyše zaručuje, že video nemožno „pozrieť“ rýchlejšie, než trvá. Technicky zdatný človek by však mohol nechať video bežať napríklad stlmené na druhej obrazovke.
