const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const app = express();
const PORT = 3000;

// Umożliwia komunikację między serwerem a stroną HTML
app.use(cors());

(async () => {
    console.log('Uruchamianie instancji przeglądarki w tle...');
    const browser = await chromium.launch();
    console.log('Przeglądarka gotowa.');

    app.get('/api/timetable', async (req, res) => {
        const { stopId } = req.query;
        console.log(`Otrzymano zapytanie dla przystanku o ID: ${stopId}`);

        if (!stopId) {
            console.warn("Zapytanie nie zawierało parametru 'stopId'.");
            return res.status(400).send("Błąd: Brak parametru 'stopId'.");
        }

        const url = `http://odjazdy.zdmikp.bydgoszcz.pl/panels/0/full.aspx?stop=${stopId}`;
        console.log(`Budowanie URL do ZDMiKP: ${url}`);

        const page = await browser.newPage();
        try {
            console.log(`Otwieranie strony dla przystanku ${stopId}...`);
            await page.goto(url);

            // Na podstawie dostarczonego kodu HTML, używamy poprawnego selektora.
            // Szukamy tabeli z klasą 'tablePanel' wewnątrz diva 'ctl00_UpdatePanel1'.
            const tableSelector = 'div#ctl00_UpdatePanel1 table.tablePanel';
            console.log(`Oczekiwanie na pojawienie się tabeli: ${tableSelector}`);
            await page.waitForSelector(tableSelector, { timeout: 10000 });

            // Czekamy, aż w tabeli pojawi się przynajmniej jeden wiersz z danymi.
            // To jest gwarancja, że dynamiczna treść została załadowana.
            await page.waitForSelector(`${tableSelector} tbody tr`, { timeout: 5000 });
            console.log('Tabela z danymi załadowana.');

            // Pobieramy kod HTML znalezionej tabeli.
            const timetableHTML = await page.$eval(tableSelector, (table) => table.outerHTML);
            
            res.send(timetableHTML);

        } catch (error) {
            console.error(`Błąd podczas pobierania danych z Playwright: ${error.message}`);
            if (error.name === 'TimeoutError') {
                res.send("<p>Brak odjazdów w najbliższym czasie.</p>");
            } else {
                res.status(500).send(`Błąd serwera podczas pobierania danych: ${error.message}`);
            }
        } finally {
            await page.close();
            console.log(`Zakończono obsługę zapytania dla przystanku ${stopId}.`);
        }
    });

    app.listen(PORT, () => {
        console.log(`Serwer JavaScript nasłuchuje na http://localhost:${PORT}`);
    });
})();