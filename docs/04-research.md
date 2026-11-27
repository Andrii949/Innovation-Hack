# 04 — Research: gotowe produkty i wymagania normy

Po co: zanim zbudujemy własny system, sprawdziliśmy (27.11.2026), co już istnieje na rynku,
czego wymaga norma i co warto przejąć. Wnioski wykorzystuje [02-architektura.md](02-architektura.md).

O źródłach: większość opisów produktów pochodzi od producentów (to marketing). Gdy informacja
jest tylko z zestawień typu „Top 10”, piszemy to wprost. Pełna lista linków — sekcja 5.

---

## 1. Wymagania PN-EN ISO/IEC 17025:2018 ważne dla systemu

| Punkt | Co mówi (skrót) | Co to znaczy dla nas |
|---|---|---|
| 6.4.8 | Wyposażenie wymagające wzorcowania albo mające okres ważności jest oznakowane, zakodowane lub inaczej zidentyfikowane tak, żeby użytkownik od razu widział jego status | Etykieta: kod (`121/A`), następny termin MM/RRRR i kod QR; opcjonalnie tag NFC z tym samym linkiem. Skan QR albo zbliżenie telefonu pokazuje aktualny status — QR i NFC to dwa nośniki jednego identyfikatora |
| 6.4.9 | Wyposażenie przeciążone, dające wątpliwe wyniki, uszkodzone lub poza wymaganiami jest wycofywane z użytku, izolowane albo wyraźnie oznakowane, dopóki nie potwierdzi się, że działa poprawnie; laboratorium ocenia skutki i uruchamia procedurę pracy niezgodnej (7.10) | Status „Wycofane”, blokada wpisów, powód wycofania |
| 6.4.10 | Jeżeli do utrzymania zaufania do działania wyposażenia konieczne są **sprawdzenia pośrednie**, przeprowadza się je zgodnie z procedurą | To są „sprawdzenia okresowe” z rozmowy: plan sprawdzeń z formularzem i kryteriami |
| 6.4.13 | Zapisy dla wyposażenia: a) identyfikacja, z wersją oprogramowania i firmware, b) producent, typ, nr seryjny, c) dowód sprawdzenia zgodności z wymaganiami, d) aktualna lokalizacja, e) daty i wyniki wzorcowań, adiustacje, kryteria akceptacji, termin następnego wzorcowania **lub** interwał, f) materiały odniesienia: wyniki, kryteria, daty, okres ważności, g) plan konserwacji i wykonane konserwacje, h) uszkodzenia, awarie, modyfikacje, naprawy | Lista pól karty urządzenia (mapowanie: 02 §3.3) |
| 7.5.2 | Zmiany zapisów technicznych da się prześledzić do poprzednich wersji; zachowuje się oryginał i zmianę, datę, zakres zmiany i osobę | Historia każdej zmiany; zapisów technicznych nie kasujemy |
| 7.11.2 | System zarządzania informacją jest walidowany przed wdrożeniem; każda zmiana, także konfiguracji, jest autoryzowana, udokumentowana i zwalidowana przed użyciem | Zmiany ustawień też trafiają do historii; dostarczamy testy akceptacyjne, które laboratorium może uruchomić |
| 7.11.3 | Ochrona przed nieuprawnionym dostępem, manipulacją i utratą danych; zapis awarii systemu i podjętych działań | Logowanie, role, kopie zapasowe, logi |
| PCA DA-06 | Polityka spójności pomiarowej: wzorcowanie w krajowych instytutach metrologicznych lub laboratoriach akredytowanych (z warunkami), zasady wzorcowań wewnętrznych i CRM. Uwaga: DA-05 to inna polityka (badania biegłości) | Pole „firma wzorcująca” w zapisie wzorcowania; rejestr firm z numerem akredytacji — pomysł na później |
| ILAC-G24 / OIML D 10 (wyd. 2022) | Interwał ponownego wzorcowania ustala laboratorium, głównie na podstawie oceny ryzyka; interwały przegląda się na podstawie historii wzorcowań | Interwał to edytowalne pole urządzenia; automatyczne dobieranie interwałów — poza zakresem |

---

## 2. Gotowe produkty

### 2.1 LIMS dla cementowni

| Produkt | Co oferuje (wg producenta) | Uwagi |
|---|---|---|
| ABB Ability™ Knowledge Manager — LIMS | Wyniki analiz, trendy, SPC, alarmy; surowce i paliwa; automatyzacja laboratorium „od kamieniołomu do ciężarówki” | System produkcyjny dla dużych zakładów |
| FLSmidth QCX (QCX/Manager, RoboLab, AutoSampling, BlendExpert) | „Production LIMS” jako baza automatyki laboratorium; automatyczne pobieranie, transport i analiza próbek | Nastawiony na próbki i automatykę, nie na nadzór nad sprzętem |
| KRITI LIMS | Webowy, konfigurowalny LIMS dla cementu, betonu i materiałów budowlanych; wersja w chmurze; producent deklaruje uruchomienie w 3 dni robocze | — |
| Oxmaint | LIMS połączony z systemem utrzymania ruchu (CMMS); śledzenie wzorcowań; przekroczenia jakości zamieniane na zlecenia serwisowe | — |
| iFactory | Warstwa integrująca laboratorium z produkcją, nie samodzielny LIMS | — |

### 2.2 Polskie systemy z modułem wyposażenia lub odczynników

| Produkt | Wyposażenie i wzorcowanie | Odczynniki |
|---|---|---|
| CleverLAB (PRYM-SOFT) | LIMS „no-code” zgodny z 17025; moduł „Kontrola metrologiczna”: wzorcowania, sprawdzenia, przeglądy z terminami i świadectwami | Obszar „Odczynniki, wzorce i mikrobiologia” |
| LABSystem (Petrosoft) | Moduł „Aparatura i Urządzenia”: monitoruje terminy legalizacji, wzorcowań i przeglądów, wysyła powiadomienia | — |
| Kotrak LIMS | Automatyczne pilnowanie harmonogramów wzorcowania; ISO 17025, GLP, GMP, FDA 21 CFR Part 11 | — |
| JMB Lab | LIMS na zamówienie; rejestr wzorcowań, kalibracji i przeglądów | Magazyn odczynników: stany, daty ważności, numery serii, zużycie |
| PROLAB-3 (INFORM-TECH) | Aparatura pomiarowa, wzorce, personel; zgodność z 17025 (artykuł bez daty) | — |
| LabMaster LIMS | Zgodny z PN-EN ISO/IEC 17025:2018-02; modyfikacje pod klienta | — |
| LabStorm | Wzorcowania, naprawy, konserwacje; alerty przed serwisem | — |
| MIKROTEST | Program metrologiczny: baza przyrządów, statusy, etykiety, interwały; także nadzór nad wyposażeniem jako usługa | — |

Żaden z nich nie podaje publicznie cen.

### 2.3 Programy do zarządzania wzorcowaniem

| Produkt | Co oferuje | Cena |
|---|---|---|
| GAGEtrak (CyberMetrics) | Instalacja na Windows; tabela mapująca funkcje na punkty 17025; ścieżka audytu w dodatku „FDA Compliance Manager” | Na zapytanie; wersja Lite ok. 29 USD za stanowisko miesięcznie (wg Capterra, za ToolLedger) |
| Qualer → MasterControl Asset Excellence | Chmura; przypomnienia, cyfrowe świadectwa, silnik niepewności do pracy wg 17025 | Na zapytanie |
| Beamex CMX | Na własnym serwerze lub w chmurze firmy; wyniki z kalibratorów Beamex trafiają bez przepisywania | Na zapytanie; dla dużych firm z kalibratorami Beamex |

Porównania tych programów pochodzą głównie od konkurencyjnych producentów.

### 2.4 Inwentaryzacja odczynników

| Produkt | Co oferuje | Pewność |
|---|---|---|
| LabCollector (AgileBio) | Alerty stanu magazynowego i dostępności; alert ważności N dni przed datą; prognoza wyczerpania z historii zużycia; alerty na ekranie lub e-mailem; alerty konserwacji sprzętu | Dokumentacja producenta |
| Labguru | Partie i daty ważności, alerty niskiego stanu, powiązanie z zakupami | Z zestawień |
| Quartzy | Alerty ważności i niskiego stanu, kody kreskowe | Tylko z zestawień, niepotwierdzone u producenta |
| SciNote, Labstep | Partie, alerty niskiego stanu lub ważności; etykiety QR (Labstep) | Z zestawień |

### 2.5 Open source — możliwa baza

| Produkt | Co ma | Czego brakuje / koszt |
|---|---|---|
| SENAITE (Python/Plone, GPLv2) | Pełny LIMS; świadectwa wzorcowania i historia konserwacji przyrządów, kontrola QC, interwał certyfikacji, status „nieaktualny” | Cały LIMS na platformie Plone — dużo więcej niż potrzebujemy |
| Snipe-IT (PHP, AGPL-3.0) | Etykiety z QR prowadzącym do karty; interwał audytu i data następnego audytu, co noc e-mail z listą; pełna historia zasobu | Konserwacje to pojedyncze wpisy, bez cykli; brak odczynników |
| ERPNext / Frappe (GPL) | Quality Inspection: min/max → automatycznie „Rejected”; Asset Maintenance: zadania z cyklem i wymaganym certyfikatem; Auto Reorder: próg → zapotrzebowanie; Notification: „Days Before” dla pola daty i powiadomienia w aplikacji | Cały ERP: ciężka instalacja, długa nauka; alerty sprawdzane raz dziennie |
| Odoo | Quality: pomiar z normą i tolerancją min/max | Moduł Quality tylko w płatnej wersji Enterprise; do Community są moduły firm trzecich |

### 2.6 NFC i OCR — technika, nie produkt

| Temat | Co wiadomo | Wniosek |
|---|---|---|
| Tagi NFC | Etykiety NTAG (ISO/IEC 14443-A) mieszczą rekord NDEF URI; telefon czyta go bez aplikacji (Android; nowsze iPhone'y w tle) albo w aplikacji przez Core NFC / reader mode | Ten sam link co QR — brak nowego API i nowych uprawnień |
| Zapis tagów | NDEF zapisuje się aplikacją typu NFC Tools albo własnym ekranem; tag można zablokować przed zapisem | W demo wystarczy zewnętrzna aplikacja; zapis w systemie — P2 |
| OCR/LLM | modele multimodalne (np. Qwen-VL, GPT-4o, Claude) przyjmują obraz strony i zwracają JSON; jakość zależy od skanu i promptu, a błędne lub zmyślone pola są realne | tylko szkic pól, walidacja i zatwierdzenie przez człowieka; oryginał skanu zostaje zapisem (7.5.2) |
| Dokumenty wielostronicowe | dostawcy różnią się obsługą PDF; bezpieczniej renderować strony do PNG i wysyłać obrazy | limit stron (5), `pdftoppm`, timeout |

---

## 3. Co przejmujemy (wzorce)

| Wzorzec | Gdzie widziany | U nas |
|---|---|---|
| Następny termin = ostatnie zdarzenie + interwał | Snipe-IT (audyt → następny audyt), ERPNext (cykl konserwacji) | Następne wzorcowanie = miesiąc ze świadectwa + częstotliwość |
| Alert „N przed terminem” ustawiany dla pozycji | LabCollector (N dni przed ważnością), ERPNext (Days Before) | Wyprzedzenie 1–12 miesięcy dla każdego urządzenia i odczynnika |
| Min/max → automatyczna flaga | ERPNext Quality Inspection, Odoo Measure | Kontrola zakresu wyników i pól sprawdzeń |
| Próg minimalny → alert | LabCollector, ERPNext (reorder level) | „Mało odczynnika” |
| QR prowadzi do karty | Snipe-IT | QR na etykiecie otwiera kartę urządzenia |
| Drugi nośnik identyfikatora (NFC) | praktyka asset management; tagi NDEF | Tag NFC z tym samym linkiem co QR; QR zostaje, bo nie wymaga naklejki elektronicznej |
| OCR/LLM jako szkic, nie zapis | rozwiązania do faktur i świadectw | Pola proponowane przez model, zatwierdza admin; dostawca i model w historii |
| Status liczony z dat | SENAITE („out of date”) | Status urządzenia liczony, nie wpisywany ręcznie |
| Ścieżka audytu | GAGEtrak (dodatek), SENAITE; wymóg 7.5.2 | Historia każdej zmiany |
| Powiadomienia w aplikacji obok e-maila | ERPNext (System Notification) | Dzwonek w aplikacji + opcjonalnie push i e-mail |

---

## 4. Wniosek: dlaczego własna aplikacja [T]

1. LIMS-y (także polskie) obejmują dużo więcej: próbki, zlecenia, sprawozdania. Laboratorium
   startuje z papieru, a potrzebuje nadzoru nad wyposażeniem i odczynnikami.
2. Ceny są tylko na zapytanie — nie da się ich porównać w czasie hackathonu.
3. Żaden darmowy system nie ma wszystkiego: Snipe-IT nie ma cykli ani odczynników, Odoo Quality
   jest płatne, ERPNext to cały ERP, SENAITE to cały LIMS.
4. Co możemy pokazać jako przewagę: prosty telefon w pracowni (skan QR albo zbliżenie NFC → wpis),
   wyprzedzenie ustawiane dla każdej pozycji, konfiguracja zamiast kodu (inne laboratoria
   akredytowane), OCR świadectwa jako szkic zatwierdzany przez człowieka i zapisy zgodne
   z 6.4.13 i 7.5.2 od pierwszego dnia.

---

## 5. Źródła

**Norma i wytyczne**

- 6.4.13: [SADCAS F 60(b)](https://www.sadcas.org/sites/default/files/2024-02/SADCAS_F_60b_-_Technical_Requirements_ISO_IEC-17025_-_2017_[Issue_3].pdf), [Perry Johnson — working document](https://www.pjlabs.com/downloads/LF-56-17025-2017-AOAC.pdf), [CalibrationOS — 17025 clause 6.4](https://calibrationos.com/learn/iso-17025-6-4-equipment-requirements)
- 6.4.9, 6.4.10, 7.5.2: [NATA — gap analysis](https://nata.com.au/files/2021/05/17025-2017-Gap-analysis.pdf), [NATA — assessment worksheet](https://nata.com.au/files/2021/05/ISO-IEC-17025_assessment_worksheet.pdf)
- 6.4.10 po polsku: [omówienie normy (rafalszrajnert.pl)](https://www.rafalszrajnert.pl/norma-iso-17025/), [PCA DAB-18](https://www.pca.gov.pl/storage/file/core_files/2023/9/18/0b0edfa956ecf28488685e32eb7bcf0f/dab-18_2.pdf), [Thermonext — nadzór nad wyposażeniem](https://thermonext.pl/poradniki/nadzor-wyposazenia-pomiarowego-iso-17025)
- 7.11.2: [LabWare — ISO 17025 LIMS requirements](http://www.labware.com/blog/iso-17025-lims-requirements), [NLA — software validation in ISO 17025](http://www.nla.org.za/webfiles/conferences/2018/Proceedings/Manuscripts/Wednesday,%2010%20October%202018/W306%20-%20Software%20validation%20for%20ISO%2017025.pdf), [Assotic — digitalised systems in 17025 labs](https://www.assotic.it/wp-content/uploads/2024/10/Guidelines-for-the-management-of-digitalised-systems-in-laboratories-accredited-to-ISO-IEC-17025.pdf)
- PCA: [DA-06 wyd. 8](https://www.pca.gov.pl/storage/file/core_files/2024/1/5/42ad7ea1f83882cbb8003b2613eaddbb/da-06_8_wcag.pdf), [DA-06 wyd. 9 (projekt)](https://www.pca.gov.pl/storage/file/core_files/2024/12/4/ac10b9776b4f8cda9c3283473e072f0d/da-06_9_projekt_p5.pdf), [DA-05 wyd. 10](https://www.pca.gov.pl/storage/file/core_files/2025/1/8/54c0bf3adbd7c2f819df9060a2c05265/DA-05_10_WCAG.pdf)
- Interwały: [ILAC-G24 / OIML D 10:2022](https://www.oiml.org/en/files/pdf_d/d010-e22.pdf), [wydanie 2007](https://www.isobudgets.com/pdf/calibration-interval-analysis/ILAC-G24-2007-guidelines-for-the-determination-of-calibration-intervals-of-measuring-instruments.pdf)

**LIMS dla cementu**

- [ABB Ability — LIMS](https://new.abb.com/cement/systems-and-solutions/operation-management/knowledge-manager/lims), [FLSmidth — LIMS are key to Industry 4.0](https://www.flsmidth-cement.com/cement-hub/posts/lims-are-key-to-industry-4.0), [The Cement Lab and Industry 4.0](https://cementproducts.com/2024/12/03/the-cement-lab-and-industry-4-0/), [KRITI LIMS](https://www.kritilims.com/Cement_lab.html), [Oxmaint](https://oxmaint.com/industries/cement-plant/cement-laboratory-management-digital-lims), [iFactory](https://ifactoryapp.com/industries/cement-plant/cement-laboratory-management-digital-lims)

**Polskie systemy**

- [CleverLAB](https://cleverlab.pl/), [LABSystem (Petrosoft)](https://petrosoft.pl/oprogramowanie-do-zarzadzania-laboratorium/), [Kotrak LIMS](https://kotrak.com/pl/oferta/system-lims/), [JMB Lab](https://jmblab.com/system-lims/), [PROLAB-3](https://laboratoria.net/technologie/3205.html), [LabMaster](https://labmaster.pl/), [LabStorm](https://lab-storm.com/en/), [MIKROTEST](https://www.mikrotest.pl/index.php/oprogramowanie-metrologiczne-nadzor-wyposazeniem-bazy-przyrzadow-szacowanie-niepewnosci), [NIS — założenia programu do nadzoru wyposażenia](https://nis.com.pl/zalozenia-do-opracowania-efektywnego-programu-do-nadzoru-wyposazenia-pomiarowego-i-badawczego/)

**Wzorcowanie i odczynniki**

- [ToolLedger — porównanie programów do wzorcowania](https://toolledger.com/compare/calibration-software/), [Axiospec — porównanie](https://axiospec.com/compare/best-calibration-management-software)
- [LabCollector — Reagents & Supplies](https://labcollector.com/support/knowledge-base/category/modules/reagentsupplies/), [LabCollector — podręcznik funkcji](https://www.labcollector.com/media/features_manual_lc.pdf), [Scispot — zestawienie programów do inwentaryzacji](https://www.scispot.com/blog/top-lab-inventory-tracking-software-solutions)

**NFC i OCR**

- NFC: [Android — NFC basics](https://developer.android.com/develop/connectivity/nfc/nfc), [Apple — Core NFC](https://developer.apple.com/documentation/corenfc), [NFC Forum — NDEF](https://nfc-forum.org/what-is-nfc/)
- OCR/LLM: [Qwen2.5-VL](https://github.com/QwenLM/Qwen2.5-VL), [OpenAI — vision](https://platform.openai.com/docs/guides/images), [Anthropic — vision](https://docs.anthropic.com/en/docs/build-with-claude/vision)

**Open source**

- [SENAITE — funkcje](https://www.senaite.com/features/), [senaite.core na PyPI](https://pypi.org/project/senaite.core/), [senaite.core — CHANGES](https://github.com/senaite/senaite.core/blob/2.x/CHANGES.rst)
- [Snipe-IT — funkcje](https://snipeitapp.com/product), [Itefy — porównanie ze Snipe-IT (konkurent)](https://www.itefy.com/compare/snipe-it-alternative)
- [ERPNext — Asset Maintenance](https://docs.frappe.io/erpnext/user/manual/en/asset-maintenance), [ERPNext — Notification](https://docs.frappe.io/erpnext/user/manual/en/notifications), [ERPNext — Item (reorder)](https://docs.erpnext.com/docs/v13/user/manual/en/stock/item), [ERPNext — Quality Inspection](https://cloud.casesolved.co.uk/erpnext/en/quality-inspection)
- [Odoo — Quality control points](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/quality/quality_management/quality_control_points.html), [Odoo Community vs Enterprise](https://carbon.ms/learn/odoo-community-vs-enterprise)
