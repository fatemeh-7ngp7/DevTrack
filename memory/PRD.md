# PyTrack — Personal Project Tracker (PRD)

## Original Problem Statement
A personal, advanced/specialized "Todo-but-much-more" project tracker for a backend Python developer.

## User Choices
- Structure: Projects → Tasks → Subtasks (3 levels)
- Task fields: status, priority, due date, tags, time tracking/estimates, markdown notes
- Views: List + Kanban + Calendar + Dashboard with stats + Timeline/Gantt
- Auth: JWT (email/password)
- AI: task generation via Claude Sonnet 4.6 (Emergent LLM key)

## Architecture
- Backend: FastAPI + MongoDB (motor). All routes under /api. JWT auth (Bearer token in localStorage + httpOnly cookies). Object storage via Emergent integration for attachments.
- Frontend: React 19 + Tailwind + shadcn/ui. Dark terminal/developer theme (JetBrains Mono + IBM Plex Sans, amber accent). Recharts for dashboard.
- AI: emergentintegrations LlmChat (anthropic/claude-sonnet-4-6).

## Implemented (2026-06-27)
- Auth: register/login/logout/me/refresh; seeded admin admin@pytrack.dev / admin123.
- Projects: CRUD with color, progress, task counts.
- Tasks/Subtasks: CRUD, status (backlog/todo/in_progress/done), priority (urgent/high/medium/low), due date, tags, estimate, markdown notes w/ preview.
- Time tracking: start/stop timer accumulating per task.
- Views: Dashboard (stats, completion trend, priority pie, time-by-project, upcoming), List (expandable subtasks), Kanban (drag reorder within/between columns), Calendar (month grid), Timeline/Gantt.
- AI breakdown: generate tasks + subtasks from project description.
- Filters & search: by text, priority, status, tag.
- Task dependencies: blocked_by with lock indicators.
- Move task between projects.
- File attachments: upload/list/delete + image thumbnails (object storage).

## Test Status
- Iteration 1 & 2 passed: 22/22 backend, all frontend flows. Reports in /app/test_reports/.

## Backlog (P1/P2)
- Drag-to-reorder full UI polish (cross-project drag), recurring tasks, reminders/notifications, export (CSV/Markdown), saved filter views, task comments.

## Next Tasks
- Deploy for permanent 24/7 access (Deploy button).
- Optional enhancements from backlog per user feedback.
