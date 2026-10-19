# Vzdelávanie učiteľov – webová aplikácia

Učiteľ sa prihlási školským Google účtom (@koharysuli.sk). Potom postupne pozerá videá. Po každom videu nasleduje test a na konci aplikácia vygeneruje osvedčenie na jeho meno.

- Video sa nedá pretáčať dopredu ani zrýchliť.
- Pri prepnutí karty, minimalizácii alebo prechode do iného okna sa video pozastaví.
- Ďalšie video sa odomkne až po splnení testu (aspoň 80 %). Neúspešný test sa dá opakovať.
- Priebeh sa ukladá do Google tabuľky, takže učiteľ môže pokračovať aj o niekoľko dní.
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
4. Hore v `CONFIG` vyplňte `SCHOOL_NAME` a `COURSE_NAME`. Prípadne upravte `PASS_PERCENT` a `QUIZ_MINUTES`. `CLIENT_ID` doplníte v kroku 3.
5. Uložte, hore vyberte funkciu **setup** a kliknite **Spustiť**. Povoľte požadované oprávnenia.
   V tabuľke vzniknú hárky:
   - **Videa**: poradie, názov, YouTube ID, dĺžka v sekundách
   - **Otazky**: číslo videa, otázka, možnosti A–D (C a D môžu byť prázdne), správna odpoveď (písmeno)
   - **Priebeh**: tu priebežne vidíte, kto koľko pozrel a ako dopadli testy
   - **Osvedcenia**: zoznam vydaných osvedčení s číslami
6. Hárky **Videa** a **Otazky** prepíšte vlastnými údajmi. Ukážkové riadky zmažte.

> Dĺžku videa zadajte presne alebo zaokrúhlite **nadol**. Video sa ráta ako dopozerané, keď učiteľovi chýba menej ako 15 sekúnd do konca.

### 3. Google prihlásenie (Client ID)
1. Otvorte https://console.cloud.google.com/ (školským účtom) a vytvorte nový projekt.
2. **APIs & Services → OAuth consent screen**: typ používateľa **Internal**. Aplikáciu potom uvidia len účty @koharysuli.sk. Vyplňte názov a kontaktný e-mail.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://VAS-GITHUB-UCET.github.io`
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
1. Na https://github.com vytvorte nový repozitár, napr. `kurz-ucitelia`.
2. Nahrajte doň súbory projektu (**Add file → Upload files**).
3. **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
4. O minútu bude stránka dostupná na `https://VAS-GITHUB-UCET.github.io/kurz-ucitelia/`.

Hotovo. Tento odkaz pošlete učiteľom.

---

## Časté otázky

**Dá sa test opakovať?** Áno, neobmedzene. Do tabuľky sa zapisuje počet pokusov aj najlepšie skóre.

**Čo ak učiteľ zavrie prehliadač uprostred videa?** Pri ďalšom prihlásení pokračuje od miesta, kde skončil (s presnosťou na približne 20 sekúnd).

**Ako overím pravosť osvedčenia?** Číslo osvedčenia je uvedené v hárku **Osvedcenia** spolu s menom a dátumom.

**Ako vynulujem priebeh učiteľa?** V hárku **Priebeh** zmažte jeho riadky. Ak treba, zmažte aj riadok v hárku **Osvedcenia**.

**Hranice ochrany:** Obmedzenia v prehliadači zastavia bežného používateľa. Minimalizácii okna sa zabrániť nedá, video sa iba pozastaví. Server navyše zaručuje, že video nemožno „pozrieť“ rýchlejšie, než trvá. Technicky zdatný človek by však mohol nechať video bežať napríklad stlmené na druhej obrazovke.
