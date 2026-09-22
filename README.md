# Wyckoff 24/7 worker

Stały worker Node.js dla Oracle Always Free. Vercel pozostaje tylko panelem.

## Wariant bez karty

`github_scan.mjs` i `.github/workflows/wyckoff.yml` pozwalają uruchamiać skan co 15 minut w publicznym repozytorium GitHub Actions i zapisywać wynik do `public/wyckoff-alerts.json`. To nie jest tick-by-tick WebSocket, ale nie wymaga Oracle ani weryfikacji płatności i pasuje do zamkniętych świec M15/H1/H4/D1. GitHub może opóźnić harmonogram, a publiczne workflow są wyłączane po długim braku aktywności repozytorium — trzeba raz na jakiś czas wykonać commit.

Po każdym skanie powstaje też `public/health.json`. Workflow `health.yml` sprawdza co 30 minut, czy plik nie jest starszy niż 35 minut i czy ostatni skan nie zgłosił błędu. Test ręczny: GitHub → Actions → Wyckoff scanner → Run workflow; potem sprawdź pliki `public/wyckoff-alerts.json` i `public/health.json` oraz log zadania.

```bash
npm install
cp .env.example .env
npm start
```

Publiczny panel powinien pobierać `/alerts` z workera przez bezpieczny reverse proxy lub chroniony URL. Nie wystawiaj SQLite ani endpointu bez autoryzacji w Internecie. Obecny worker ma warstwę danych i wstępny filtr sweepu; pełny silnik `wyckoff_scanner/engine.py` wymaga uruchomienia w środowisku Python albo portu do JavaScript przed produkcyjnym użyciem.

## Oracle

Skrypt `deploy/oracle-setup.sh` przygotowuje Node.js, a `deploy/wyckoff-worker.service` uruchamia workera po restarcie i przywraca go po awarii. Po skopiowaniu plików:

```bash
sudo cp deploy/wyckoff-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now wyckoff-worker
sudo systemctl status wyckoff-worker
```
