# 05 — Kryteria oceny i jak je spełniamy

Mapa: każde kryterium jury → co w projekcie na nie odpowiada, gdzie to jest, kto pilnuje
i czego jeszcze brakuje. Właściciel całości: **Misza** (product / QA / pitch).

Oznaczenia liczb: **[M]** — z rozmowy z mentorką lub dokumentów Warty (fakt),
**[R]** — wynika z reguł systemu (sprawdzone testami), **[Z]** — założenie do symulacji,
do potwierdzenia u mentorów (pytania 18–22 w 01 §5).

| Kryterium | Max | Gdzie w projekcie | Kto |
|---|---|---|---|
| a. Adekwatność rozwiązania i wdrożenie | 25 | §a niżej; 01 §2–§4; 02; 04 | Misza + wszyscy |
| b. Prototyp i jakość wykonania (MVP) | 25 | 03 (zadania, bramki jakości); demo T30 | Timur, Andrii, Jakub, Ivan |
| c. Innowacyjność i oryginalność | 25 | §c niżej; 04 §2–§4 | Misza + Andrii |
| e. Prezentacja / pitch i Q&A | 25 | §e niżej; 03 T30 | Misza + wszyscy |

---

## a. Adekwatność rozwiązania i wdrożenie (25 pkt)

### a1. Zrozumienie problemu przemysłowego (5 pkt)

**Problem w jednym zdaniu:** laboratorium zakładowe Cementowni Warta (akredytacja
PN-EN ISO/IEC 17025, AB 1119) nadzoruje kilkaset urządzeń, odczynniki i CRM wyłącznie na
papierze, więc specjalista z biura ręcznie pilnuje terminów sprzętu, z którym nie ma
kontaktu, a przeoczenie kosztuje tygodnie lub miesiące i spada na niego [M].

| Element | Co wiemy | Źródło |
|---|---|---|
| Kto | 3 pracownie (wytrzymałościowa, paliw, analityczna); laboranci → brygadzista → specjalista → kierownik | 01 §2.1 |
| Jak jest dziś | naklejki z miesiącem/rokiem, ręczne harmonogramy per pracownia, comiesięczny przegląd, karty ewidencji w segregatorach, nic elektronicznie | 01 §2.1 |
| Dlaczego boli | wzorcowanie zewnętrzne 1 tydz.–2 mies., CRM z zagranicy ~6 mies., zakup przez podpis prezesa; wyniki przepisywane 3 razy, kontrola wyrywkowa | 01 §2.1 |
| Skutki | sprzęt w „okresie bez wzorcowania”, „pusta butelka”, wynik poza zakresem wykryty późno, odpowiedzialność na specjaliście | 01 §2.2 |
| Przyczyny | brak jednego źródła danych; kto pilnuje ≠ kto używa; brak przypomnień z wyprzedzeniem; brak kontroli przy wpisie | 01 §2.2 |
| Kontekst normy | 6.4.8 oznakowanie, 6.4.9 wycofanie, 6.4.10 sprawdzenia pośrednie, 6.4.13 zapisy, 7.5.2 historia, 7.11 system informatyczny | 04 §1 |

Dowód w prezentacji: slajd „Jak jest dziś” ze zdjęciem naklejki i segregatora + cytat
mentorki „jak coś jest niedopilnowane, to potem to spada na mnie”.

### a2. Dopasowanie do specyfiki Cementowni Warta (5 pkt)

| Specyfika Warty [M] | Jak ją odwzorowujemy |
|---|---|
| Kody `121/A` — numer + litera pracowni, numery powtarzają się | unikalna para (pracownia, numer), kod wyświetlany `121/A` (02 §3.2) |
| Naklejki z miesiącem i rokiem | terminy w miesiącach, „ważne do końca miesiąca” (02 §4) |
| Interwały 1–4 lata, różne firmy wzorcujące, wzorcowanie na miejscu (piece, analizatory) | interwał per urządzenie, tryb `EXTERNAL` / `ON_SITE`, firma w zapisie wzorcowania |
| Firma nie ocenia — laboratorium ocenia OK / NIE OK | specjalista zaznacza wynik; „NIE OK” wycofuje sprzęt (17025 6.4.9) |
| Sprawdzenia: temperatura co miesiąc, waga co kwartał | plany sprawdzeń z formularzem (F5) |
| CRM z USA — wyprzedzenie ~6 mies. | wyprzedzenie 1–12 mies. per pozycja (F3) |
| Formularz F-06.00.10 „Zakres badań”, wyd. 16 | 25 parametrów cementu z zakresami (01 §4), kontrola przy wpisie (F9) |
| Telefony służbowe, cyberbezpieczeństwo, etykiety dokumentów | aplikacja Capacitor, serwer w zakładzie możliwy (D4), tokeny odwoływalne, historia zmian |
| Pracownik jednej pracowni nie używa sprzętu innej | zakres pracowni + lista upoważnionych (F7) |
| Kierownik dostaje dokumenty | raport PDF z wykresami i wysyłka do kierownika (F10, F11) |
| Kolory firmowe | navy `#0C3F76` + lime `#8DC63F` w interfejsie (02 §9) |

### a3. Łatwość integracji z procesami Warty (5 pkt)

Zasada: **system zastępuje papier, nie zmienia procesu**.

| Proces dziś [M] | Po wdrożeniu | Zmiana dla ludzi |
|---|---|---|
| Comiesięczny przegląd harmonogramów | powiadomienie przychodzi samo, tabela per pracownia | mniej pracy |
| Naklejka na urządzeniu | ta sama naklejka + kod QR (druk z systemu) | brak |
| Karta ewidencji w segregatorze | wpis z telefonu po skanie QR | wpis zamiast długopisu |
| Świadectwo wzorcowania (papier) | wpis błędu i niepewności + skan | jak dziś + skan |
| Zakup: oferta → zapotrzebowanie → podpis prezesa | **bez zmian** — system daje sygnał wcześniej | brak |
| Wyniki w arkuszach Excel | mechanizm kontroli zakresu przy wpisie (F9) | czerwony komunikat |
| Start z papieru | przy dodaniu urządzenia wpisujemy ostatnie wzorcowanie z naklejki (02 §3.2) | jednorazowo |

Technicznie: Docker na serwerze w zakładzie albo w chmurze (02 §11), istniejące telefony,
role jak w organizacji (laborant, specjalista, kierownik). Otwarte: logowanie firmowe (SSO),
dystrybucja aplikacji przez dział IT (pyt. 13 w 01).

### a4. Koszty i zasoby wdrożenia (5 pkt)

**Licencje — 0 zł.** Cały stos jest open source: FastAPI (MIT), PostgreSQL (PostgreSQL
License), React, shadcn/ui, Tailwind (MIT), Capacitor (MIT), Typst i Caddy (Apache-2.0).
Komercyjne LIMS-y i programy do wzorcowania mają ceny tylko na zapytanie (04 §2).

| Pozycja | Koszt | Uwagi |
|---|---|---|
| Konto Apple Developer (iOS) | 99 USD / rok | potrzebne do TestFlight i dystrybucji |
| Konto Google Play (Android) | 25 USD jednorazowo | albo instalacja APK przez dział IT — 0 zł |
| Push (Firebase Cloud Messaging) | 0 zł | opcjonalny kanał |
| Serwer | istniejąca infrastruktura IT [Z: 2 vCPU, 4 GB RAM, 50 GB dysku] | jedno laboratorium, kilkadziesiąt osób |
| Telefony | 0 zł | telefony służbowe już są [M] |
| Etykiety QR | arkusze naklejek [Z: kilkaset sztuk] | drukowane z systemu |

| Zasoby ludzkie | Szacunek | Kto |
|---|---|---|
| Dopracowanie MVP do produkcji (SSO, testy, poprawki po pilotażu) | [Z: 20–30 osobodni] | zespół IT / dostawca |
| Walidacja systemu przed użyciem (17025 7.11.2) | [Z: 2–3 dni] | laboratorium + pakiet testów (T29) |
| Przeniesienie danych z naklejek | [Z: 400 pozycji × 3 min ≈ 20 h] | specjaliści |
| Szkolenie | [Z: 1 h na osobę] | specjalista prowadzi |
| Utrzymanie | [Z: 1–2 dni / mies.] | dział IT |

Pilotaż proponujemy w jednej pracowni (analitycznej), potem pozostałe dwie.

### a5. Symulacja mierzalnych efektów — KPI (5 pkt)

**Efekty pewne — wynikają z reguł systemu [R]** (sprawdzone testami w 03):

| KPI | Dziś [M] | Z systemem [R] | Test |
|---|---|---|---|
| Wyprzedzenie alertu o wzorcowaniu przy wyprzedzeniu L mies. | „zależy od pamięci”, przegląd raz w miesiącu | alert od 1. dnia miesiąca (termin − L) do końca miesiąca terminu = **L+1 pełnych miesięcy** (L=1 → ok. 2 mies.; pokrywa najwolniejszą firmę: 2 mies.) | T02 |
| Wyniki poza zakresem wykryte przy wpisie | kontrola wyrywkowa | **100%** (każdy wpis sprawdzany) | T14 |
| Zmiany zapisów odtwarzalne (kto, kiedy, co) | papier | **100%** | T04 |
| Wpis sprawdzenia przez nieupoważnionego / dla wycofanego sprzętu | możliwy | **0** (API odrzuca) | T11 |
| Dostęp do historii urządzenia | wyjście do segregatora | skan QR → karta, wydruk PDF | T24, T31 |

**Efekty szacowane — model z założeniami [Z]** (liczby podmienimy na dane od mentorów):

| Pozycja | Założenie | Dziś | Z systemem | Oszczędność |
|---|---|---|---|---|
| Przegląd harmonogramów | 3 pracownie × 12 mies. [M]; 1 h na przegląd [Z] → 10 min [Z] | 36 h/rok | 6 h/rok | **30 h/rok** |
| Szukanie zapisów w segregatorach | 5 razy w tygodniu × 10 min [Z] → 1 min [Z] | 43 h/rok | 4 h/rok | **39 h/rok** |
| Wzorcowania w roku | 400 urządzeń [Z, „kilkaset” M] / średnio 2 lata [Z, 1–4 lata M] | 200 terminów do upilnowania ręcznie | 200 alertów z wyprzedzeniem | 0 przeoczeń [cel] |

Razem ok. **70 h/rok** pracy specjalistów [Z] — bez kosztów przeoczeń (wzorcowanie awaryjne,
powtórzone badania, przestój), których dziś nikt nie liczy. Zadanie T35 liczy te KPI
skryptem na danych demo i — po wdrożeniu — na danych rzeczywistych.

---

## b. Prototyp i jakość wykonania (25 pkt)

**Stopień zaawansowania (15 pkt)** — co pokazujemy działające (03, priorytety P0/P1):

| Funkcja | Zadania | Demo |
|---|---|---|
| F1–F2 rejestr, harmonogram, grafik | T08, T12, T20, T21 | przeglądarka |
| F3 powiadomienia | T15, T20 | dzwonek po przeliczeniu workera |
| F4 wzorcowanie + karta PDF | T10, T21, T31 | przeglądarka + PDF |
| F5–F7 QR, sprawdzenie, uprawnienia | T09, T11, T23, T24 | telefon (Android, iOS) |
| F8 odczynniki | T13, T22, T25 | telefon + przeglądarka |
| F9 kontrola zakresu | T03, T14, T22 | czerwony wynik SO₃ |
| F10–F11 wykresy, raport dla kierownika | T32, T33, T34 | PDF z wykresem u kierownika |

**Działa i jest spójne (10 pkt):**

- jedno źródło terminów (`DueItem`) dla tabeli, powiadomień i telefonu (02 §4.4);
- jeden kod frontendu dla przeglądarki i telefonów (Capacitor);
- bramki jakości w CI: `ruff`, `ty`, `pytest`, `bun lint`, `bun check`, `cap:sync` (AGENTS.md);
- testy reguł, które najłatwiej zepsuć (daty, liczby z przecinkiem, uprawnienia, duplikaty);
- serwer testowy z HTTPS, dane demo, testy e2e, nagranie zapasowe (T27, T18, T28, T30).

---

## c. Innowacyjność i oryginalność (25 pkt)

**Unikalność podejścia (15 pkt):**

1. **Terminy liczone, nie wpisywane** — status nie może się zestarzeć jak naklejka.
2. **Wyprzedzenie per pozycja (1–12 mies.)** dopasowane do czasu realizacji firmy / dostawy.
3. **Telefon w pracowni:** skan QR → karta → wpis w 3 krokach; uprawnienia z karty ewidencji.
4. **Konfiguracja zamiast kodu:** pracownie, formularze, zakresy, reguły powiadomień —
   wdrożenie w innym laboratorium akredytowanym bez programisty.
5. **Zgodność z 17025 wbudowana:** pola 6.4.13, historia 7.5.2, wycofanie 6.4.9, raport
   walidacji 7.11.2 (T29), druk PDF jako zapis (T31).

**Wartość dodana i przewaga (10 pkt)** — na podstawie 04:

| | Dziś w Warcie [M] | Gotowe LIMS / programy (04 §2) | Nasze rozwiązanie |
|---|---|---|---|
| Zakres | papier | pełny LIMS: próbki, zlecenia, sprawozdania | dokładnie nadzór nad sprzętem, odczynnikami i zakresami |
| Cena | — | na zapytanie | licencje 0 zł (a4) |
| Telefon w pracowni | brak | rzadko, zwykle stanowisko PC | od pierwszego dnia (Android + iOS) |
| Start | — | projekt wdrożeniowy | dane z naklejek, Docker na serwerze w zakładzie |
| Dopasowanie | — | konfiguracja przez dostawcę | konfiguracja przez specjalistę |

---

## e. Prezentacja / pitch i Q&A (25 pkt)

| Podkryterium (5 pkt każde) | Jak to pokrywamy | Kto |
|---|---|---|
| Czytelność i logika (problem → rozwiązanie → korzyści) | struktura niżej | Misza |
| Wartość biznesowa i wykonalność | slajdy kosztów (a4) i KPI (a5); „licencje 0 zł, 70 h/rok” | Misza, Andrii |
| Czas i atrakcyjność | demo na żywo: telefon + przeglądarka; nagranie zapasowe | Jakub, Ivan |
| Zaangażowanie całego zespołu | każdy mówi swoją część | wszyscy |
| Odpowiedzi na pytania | lista pytań i odpowiedzi niżej, próba Q&A | wszyscy |

**Struktura (czas do potwierdzenia — pyt. 22):**

| Część | Treść | Kto (propozycja) |
|---|---|---|
| 1. Problem | papier, naklejki, cytat mentorki, skutki (a1) | Misza |
| 2. Rozwiązanie | idea w jednym zdaniu, role, 11 funkcji w jednym obrazku | Misza |
| 3. Demo — biuro | harmonogram, dzwonek, wpis wzorcowania, raport PDF | Jakub, Andrii |
| 4. Demo — pracownia | skan QR, sprawdzenie poza zakresem, brak uprawnień | Ivan |
| 5. Technologia i bezpieczeństwo | architektura, 17025, serwer w zakładzie | Timur |
| 6. Koszty i KPI | a4, a5 | Andrii, Misza |
| 7. Wdrożenie i dalej | pilotaż w jednej pracowni, 02 §14 | Misza |

**Pytania jury, na które musimy mieć odpowiedź:**

| Pytanie | Odpowiedź — gdzie |
|---|---|
| Dlaczego nie kupić gotowego LIMS? | 04 §4, tabela w §c |
| Ile to kosztuje i kto to utrzyma? | §a4 |
| Skąd wiecie, że oszczędzimy czas? | §a5 — pewne [R] vs szacowane [Z] |
| Czy to przejdzie audyt PCA? | 04 §1, 02 §12, raport walidacji T29 |
| Co, jeśli na pracowni nie ma sieci? | 02 §13 — serwer testowy, offline w 02 §14 |
| Czy dane są bezpieczne? | 02 §12 (HTTPS, Argon2, tokeny odwoływalne, historia) |
| Czy pracownicy będą tego używać? | wpis szybszy niż papier, 3 kroki, bez codziennego liczenia zużycia [M] |
| Jak to działa w innym laboratorium? | §c pkt 4 — konfiguracja |

---

## Luki do zamknięcia

| Luka | Kryterium | Kto | Zadanie |
|---|---|---|---|
| Liczby [Z] w a4 i a5 — potwierdzić u mentorów | a4, a5 | Misza | pyt. 18–21 w 01, T36 |
| Skrypt KPI na danych | a5, b | Ivan | T35 |
| Wykresy i raport dla kierownika | a2, b | Andrii, Jakub | T32–T34 |
| Limit czasu prezentacji | e | Misza | pyt. 22 w 01 |
| Próba generalna z Q&A | e | wszyscy | T30 |
