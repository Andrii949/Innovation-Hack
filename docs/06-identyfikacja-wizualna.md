# Identyfikacja wizualna aplikacji laboratoryjnej

Punktem odniesienia jest publiczna strona [Cementowni Warta S.A.](https://www.wartasa.com.pl/).
Komponenty robocze korzystają z shadcn/ui. Panel łączy kolory i typografię Warty z układem
dostosowanym do obsługi urządzeń i pomiarów.

| Element | Reguła |
| --- | --- |
| Tło | Jasny szary `#F3F3F4`; białe karty, formularze i pasek nagłówka. |
| Granat | `#0F3F76` dla podstawowych przycisków i nagłówków, `#04243E` dla ciemnego tła. |
| Zieleń | `#8DC63F` dla oznaczeń, podkreśleń i pasma w zakresie. Na zielonym tle stosujemy ciemny tekst. |
| Wykresy | Granatowa seria, przerywane linie progów, czerwony znacznik przekroczenia i licznik poza progiem. |
| Krój | Open Sans z polskimi znakami. Plik kroju i licencja OFL są w `frontend/public/fonts/`. |
| Nawigacja | Sekcje z boku na szerokim ekranie, obok siebie nad treścią na wąskim. Konto, wybór roli w podglądzie i powiadomienia są w prawym górnym rogu. |

## Najważniejsze akcje

- **Pracownik** otwiera kartę przez NFC, QR lub w rejestrze. Widzi stan i historię;
  upoważniony pracownik może zapisać przewidziane sprawdzenie okresowe i powiązać wynik z urządzeniem.
- **Specjalista** wybiera **Zarejestruj wzorcowanie** w górnej części karty urządzenia i przepisuje
  świadectwo wystawione przez firmę wzorcującą. Może załączyć skan i użyć OCR, jeśli serwer ma
  skonfigurowanego dostawcę. Decyzję OK/NOK zapisuje specjalista. Termin oblicza API.
- **Kierownik** zatwierdza plan wysyłki na wzorcowanie z własnego konta. Plan i świadectwo są
  osobnymi zapisami. Wybrane wyniki może weryfikować, a raporty przeglądać w PDF.

Podgląd z przełączaniem testowych kont wymaga `VITE_REVIEW_PASSWORD` oraz odrębnej bazy z danymi
startowymi. Zwykły panel korzysta z logowania i uprawnień zapisanych w API.
