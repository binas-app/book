# Digitale Binas

Een statische pagina met een Mozilla PDF.js-viewer voor de Binas-tabellen, gecombineerd met een snelle inhoudsopgave aan de linkerzijde.

## Functionaliteit
- Mozilla's standaard PDF.js-viewer wordt ingeladen naast het linkermenu.
- Zoek door de inhoudsopgave om snel naar een tabel te springen; klikken opent direct de juiste pagina.
- Open de viewer in een nieuw tabblad via de knop rechtsboven.

## Projectstructuur
- `index.html` – Pagina-opbouw met zijbalk en ingesloten Mozilla PDF.js-viewer.
- `styles.css` – Opmaak, kleuren en lay-out van de viewer, navigatie en knoppen.
- `script.js` – Logica voor de navigatie, zoekfunctie, zijbalkbediening en het koppelen van de inhoudsopgave aan de PDF-viewer.
- `navigation-data.json` – Dataset voor de inhoudsopgave (secties, tabellen en subtabel-items).
- `favicon.png` – Favicon in de rootmap.

## Gebruik
1. Open `index.html` in een moderne browser.
2. Klik op de gewenste tabel in de inhoudsopgave links om direct naar de juiste pagina in het PDF.js-venster te springen.
3. Gebruik desgewenst de knop **Open viewer in nieuw tabblad** om de PDF los te bekijken.

## Techniek
- [PDF.js](https://mozilla.github.io/pdf.js/) wordt lokaal gehost (`pdfjs/web/viewer.html`) en laadt `Binas.pdf` via een relatief pad, zodat de browser geen CORS-fout geeft.
- De inhoudsopgave wordt asynchroon opgehaald uit `navigation-data.json` en geïntegreerd in de navigatieboom.
- Inloggen verloopt via Firebase Authentication (Google of e-maillink); favorieten van ingelogde gebruikers worden gesynchroniseerd via Firestore.

## Ontwikkelen
- Pas de stijl aan in `styles.css`.
- Wijzig of breid de inhoud uit in `navigation-data.json`.
- De belangrijkste event-handling en renderlogica staat in `script.js`.
