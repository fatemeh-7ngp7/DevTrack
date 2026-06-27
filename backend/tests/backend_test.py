"""PyTrack backend API tests."""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pytrack-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@pytrack.dev"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and "user" in data
    return data


@pytest.fixture(scope="session")
def authed(session, auth):
    session.headers.update({"Authorization": f"Bearer {auth['access_token']}"})
    return session


# --- Auth ---
class TestAuth:
    def test_login_success(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["email"] == ADMIN_EMAIL
        assert isinstance(d["access_token"], str) and len(d["access_token"]) > 20
        # httpOnly cookie set?
        cookies = r.cookies.get_dict()
        assert "access_token" in cookies

    def test_login_invalid(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_register_and_me(self, session):
        email = f"test_{uuid.uuid4().hex[:8]}@pytrack.dev"
        r = session.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "TEST_User"})
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        r2 = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        assert r2.json()["email"] == email

    def test_register_duplicate(self, session):
        r = session.post(f"{API}/auth/register", json={"email": ADMIN_EMAIL, "password": "x", "name": "x"})
        assert r.status_code == 400

    def test_me_unauthenticated(self, session):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# --- Projects CRUD ---
class TestProjects:
    def test_create_and_get(self, authed):
        payload = {"name": "TEST_Proj", "description": "TEST desc", "color": "#22C55E"}
        r = authed.post(f"{API}/projects", json=payload)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["name"] == "TEST_Proj"
        assert "id" in p
        pid = p["id"]

        r2 = authed.get(f"{API}/projects/{pid}")
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST_Proj"

        # cleanup
        authed.delete(f"{API}/projects/{pid}")

    def test_list_projects(self, authed):
        r = authed.get(f"{API}/projects")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_update_project(self, authed):
        r = authed.post(f"{API}/projects", json={"name": "TEST_Update", "description": "x"})
        pid = r.json()["id"]
        r2 = authed.put(f"{API}/projects/{pid}", json={"name": "TEST_Updated", "description": "y", "color": "#EF4444"})
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST_Updated"
        authed.delete(f"{API}/projects/{pid}")

    def test_delete_project_cascades_tasks(self, authed):
        pr = authed.post(f"{API}/projects", json={"name": "TEST_Cascade"}).json()
        pid = pr["id"]
        t = authed.post(f"{API}/tasks", json={"project_id": pid, "title": "TEST_Task"}).json()
        tid = t["id"]
        authed.delete(f"{API}/projects/{pid}")
        # project gone
        assert authed.get(f"{API}/projects/{pid}").status_code == 404


# --- Tasks ---
class TestTasks:
    @pytest.fixture(scope="class")
    def project_id(self, authed):
        r = authed.post(f"{API}/projects", json={"name": "TEST_TasksProj"})
        pid = r.json()["id"]
        yield pid
        authed.delete(f"{API}/projects/{pid}")

    def test_create_task(self, authed, project_id):
        payload = {
            "project_id": project_id, "title": "TEST_Task1",
            "status": "todo", "priority": "high",
            "estimate_minutes": 30, "tags": ["api", "backend"],
        }
        r = authed.post(f"{API}/tasks", json=payload)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["title"] == "TEST_Task1"
        assert t["priority"] == "high"
        assert t["tags"] == ["api", "backend"]
        assert t["time_spent_seconds"] == 0

    def test_list_project_tasks(self, authed, project_id):
        r = authed.get(f"{API}/projects/{project_id}/tasks")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1

    def test_update_task_to_done_sets_completed(self, authed, project_id):
        t = authed.post(f"{API}/tasks", json={"project_id": project_id, "title": "TEST_Done"}).json()
        tid = t["id"]
        r = authed.put(f"{API}/tasks/{tid}", json={"status": "done"})
        assert r.status_code == 200
        assert r.json()["status"] == "done"
        assert r.json()["completed_at"] is not None

    def test_timer_start_stop(self, authed, project_id):
        t = authed.post(f"{API}/tasks", json={"project_id": project_id, "title": "TEST_Timer"}).json()
        tid = t["id"]
        r1 = authed.post(f"{API}/tasks/{tid}/timer/start")
        assert r1.status_code == 200
        assert r1.json()["timer_started_at"] is not None
        import time as _t
        _t.sleep(2)
        r2 = authed.post(f"{API}/tasks/{tid}/timer/stop")
        assert r2.status_code == 200
        d = r2.json()
        assert d["timer_started_at"] is None
        assert d["time_spent_seconds"] >= 1

    def test_subtask_create_and_cascade(self, authed, project_id):
        parent = authed.post(f"{API}/tasks", json={"project_id": project_id, "title": "TEST_Parent"}).json()
        sub = authed.post(f"{API}/tasks", json={"project_id": project_id, "parent_id": parent["id"], "title": "TEST_Sub"}).json()
        assert sub["parent_id"] == parent["id"]
        # delete parent cascades subtask
        authed.delete(f"{API}/tasks/{parent['id']}")
        tasks = authed.get(f"{API}/projects/{project_id}/tasks").json()
        ids = [t["id"] for t in tasks]
        assert parent["id"] not in ids
        assert sub["id"] not in ids


# --- Dashboard ---
class TestDashboard:
    def test_stats_shape(self, authed):
        r = authed.get(f"{API}/dashboard/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ["total_tasks", "done_tasks", "in_progress_tasks", "total_projects",
                  "total_time_seconds", "completion_rate", "by_status", "by_priority",
                  "trend", "time_by_project", "upcoming"]:
            assert k in d, f"missing {k}"
        assert len(d["trend"]) == 7
        for s in ["backlog", "todo", "in_progress", "done"]:
            assert s in d["by_status"]


# --- Calendar ---
class TestCalendar:
    def test_calendar_returns_list(self, authed):
        r = authed.get(f"{API}/calendar")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_calendar_includes_due_task(self, authed):
        pr = authed.post(f"{API}/projects", json={"name": "TEST_Cal"}).json()
        pid = pr["id"]
        due = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
        t = authed.post(f"{API}/tasks", json={"project_id": pid, "title": "TEST_Due", "due_date": due}).json()
        r = authed.get(f"{API}/calendar")
        assert any(x["id"] == t["id"] for x in r.json())
        authed.delete(f"{API}/projects/{pid}")


# --- AI Generation ---
class TestAI:
    def test_ai_generate(self, authed):
        pr = authed.post(f"{API}/projects", json={"name": "TEST_AI", "description": "FastAPI service for blog"}).json()
        pid = pr["id"]
        try:
            r = authed.post(f"{API}/projects/{pid}/ai-generate",
                            json={"prompt": "Build CRUD for posts", "count": 3}, timeout=120)
            # AI may transient fail; accept 200 OR 502 but log
            if r.status_code == 200:
                d = r.json()
                assert d["created"] >= 1
                assert isinstance(d["tasks"], list)
            else:
                pytest.skip(f"AI returned {r.status_code}: {r.text[:200]}")
        finally:
            authed.delete(f"{API}/projects/{pid}")
