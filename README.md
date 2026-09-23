# WAHA Group Reminder

A small JavaScript service for scheduling WhatsApp group reminders through WAHA. It runs the app, MySQL, and WAHA in Docker and uses WIB (`Asia/Jakarta`) for every time entered in the interface.

## What it does

- Sends to WhatsApp groups that the connected number has already joined
- Supports one-time, daily, weekdays (Monday to Friday), and weekly schedules
- Stores reminder state and delivery history in MySQL
- Retries failed scheduled sends and recovers work left in progress after a restart
- Uses WAHA's `NOWEB` engine
- Provides a responsive light and dark web interface

## Start

Requirements: Docker Desktop with Docker Compose.

1. Review the generated secrets in `.env`. Replace them before exposing either service outside your computer.
2. Build and start the stack:

   ```powershell
   docker compose up -d --build
   ```

3. Open the WAHA dashboard at <http://localhost:3000>. Sign in with `WAHA_DASHBOARD_USERNAME` and `WAHA_DASHBOARD_PASSWORD` from `.env`.
4. Create or start the session named `default`, then scan its QR code with WhatsApp. Wait until the session is `WORKING`.
5. Open the reminder console at <http://localhost:8080>. Sign in with `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `.env`.
6. Select a group, repeat rule, first send time, and message. All form times are WIB.

The browser may cache Basic Authentication credentials. Use a private window when testing a different administrator account.

## Schedule behavior

| Option | Behavior |
| --- | --- |
| One time | Sends once, then becomes `sent` |
| Daily | Sends every day at the selected WIB time |
| Weekdays | Sends Monday through Friday at the selected WIB time |
| Weekly | Sends every seven days from the selected date |

Dates are converted to UTC before storage. Recurring dates are calculated in `Asia/Jakarta`, so the displayed local time remains stable.

## Useful commands

```powershell
docker compose ps
docker compose logs -f app waha
npm test
docker compose exec -T app npm run test:smoke
npm run test:ui
docker compose down
```

`docker compose down` stops the services but keeps MySQL and WAHA data in Docker volumes. Add `-v` only if you intentionally want to erase those volumes.

## Configuration

Copy `.env.example` to `.env` for a new installation and replace every placeholder. The important values are:

- `APP_TIMEZONE=Asia/Jakarta`
- `WAHA_SESSION=default`
- `WAHA_URL=http://waha:3000`
- `MYSQL_HOST=mysql`
- `SCHEDULER_INTERVAL_SECONDS=10`

The app and WAHA ports bind to `127.0.0.1` by default. If you put them behind a reverse proxy, add HTTPS and access controls before making them reachable from another machine.

## Project layout

- `src/services/scheduler.js`: claims due reminders, sends them, and records results
- `src/services/waha.js`: WAHA session, group, and message API calls
- `src/services/reminders.js`: validation and reminder CRUD
- `src/db/migration.sql`: MySQL schema
- `public/`: browser interface
- `tests/`: time and input validation tests
- `scripts/`: API and browser smoke tests

