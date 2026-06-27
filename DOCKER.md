# Running PyTrack with Docker on Ubuntu

Run the entire stack (MongoDB + FastAPI backend + React frontend) with one command.

## Prerequisites
Install Docker Engine + the Compose plugin:
```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker $USER   # then log out/in so you can run docker without sudo
```

## Setup
1. From the project root (the folder containing `docker-compose.yml`):
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and set your `EMERGENT_LLM_KEY` (needed for AI breakdown + file uploads).
   Optionally change `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `JWT_SECRET`.

## Run
```bash
docker compose up --build
```
- Frontend: http://localhost:3000
- Backend API: http://localhost:8001/api
- MongoDB: localhost:27017 (data persisted in the `mongo_data` volume)

Log in with the admin credentials from your `.env` (default `admin@pytrack.dev` / `admin123`).

## Common commands
```bash
docker compose up -d --build      # run in the background
docker compose logs -f backend    # follow backend logs
docker compose down               # stop everything (keeps data)
docker compose down -v            # stop and delete the database volume
```

## Notes
- The frontend's `REACT_APP_BACKEND_URL` is baked in at build time. If you change it in `.env`,
  rebuild with `docker compose up --build`.
- AI task breakdown and file uploads call Emergent services and require a valid `EMERGENT_LLM_KEY`.
  Everything else (projects, tasks, kanban, timeline, calendar, time tracking) works fully offline.
- To expose the app on your LAN, set `REACT_APP_BACKEND_URL=http://<your-ubuntu-ip>:8001` in `.env`
  and rebuild.
