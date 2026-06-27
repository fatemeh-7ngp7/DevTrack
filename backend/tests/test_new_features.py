"""Iteration 2: backend tests for reorder, blocked_by, file attachments, move project."""
import os
import io
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "http://localhost:8001"
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@pytrack.dev", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def two_projects(headers):
    p1 = requests.post(f"{API}/projects", json={"name": "TEST_iter2_A", "color": "#888"}, headers=headers).json()
    p2 = requests.post(f"{API}/projects", json={"name": "TEST_iter2_B", "color": "#888"}, headers=headers).json()
    yield p1, p2
    requests.delete(f"{API}/projects/{p1['id']}", headers=headers)
    requests.delete(f"{API}/projects/{p2['id']}", headers=headers)


def _mk_task(headers, pid, title, **kw):
    r = requests.post(f"{API}/tasks", json={"project_id": pid, "title": title, "status": "todo", "priority": "medium", **kw}, headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()


class TestReorder:
    def test_reorder_persists_status_and_order(self, headers, two_projects):
        p1, _ = two_projects
        t1 = _mk_task(headers, p1["id"], "TEST_r1")
        t2 = _mk_task(headers, p1["id"], "TEST_r2")
        payload = {"items": [
            {"id": t1["id"], "status": "in_progress", "order": 1},
            {"id": t2["id"], "status": "done", "order": 0},
        ]}
        r = requests.post(f"{API}/tasks/reorder", json=payload, headers=headers)
        assert r.status_code in (200, 204), r.text
        # Verify persistence
        lst = requests.get(f"{API}/projects/{p1['id']}/tasks", headers=headers).json()
        by_id = {t["id"]: t for t in lst}
        assert by_id[t1["id"]]["status"] == "in_progress"
        assert by_id[t2["id"]]["status"] == "done"


class TestBlockedBy:
    def test_set_blocked_by(self, headers, two_projects):
        p1, _ = two_projects
        dep = _mk_task(headers, p1["id"], "TEST_dep")
        main = _mk_task(headers, p1["id"], "TEST_main")
        r = requests.put(f"{API}/tasks/{main['id']}", json={"blocked_by": [dep["id"]]}, headers=headers)
        assert r.status_code == 200, r.text
        assert dep["id"] in r.json().get("blocked_by", [])
        # GET to ensure persistence
        lst = requests.get(f"{API}/projects/{p1['id']}/tasks", headers=headers).json()
        fetched = next(t for t in lst if t["id"] == main["id"])
        assert dep["id"] in fetched["blocked_by"]


class TestMoveProject:
    def test_move_task_between_projects(self, headers, two_projects):
        p1, p2 = two_projects
        t = _mk_task(headers, p1["id"], "TEST_mv")
        r = requests.put(f"{API}/tasks/{t['id']}", json={"project_id": p2["id"]}, headers=headers)
        assert r.status_code == 200
        assert r.json()["project_id"] == p2["id"]
        # Task absent from p1, present in p2
        in_p1 = [x["id"] for x in requests.get(f"{API}/projects/{p1['id']}/tasks", headers=headers).json()]
        in_p2 = [x["id"] for x in requests.get(f"{API}/projects/{p2['id']}/tasks", headers=headers).json()]
        assert t["id"] not in in_p1
        assert t["id"] in in_p2


class TestAttachments:
    def test_upload_list_download_delete(self, headers, two_projects):
        p1, _ = two_projects
        t = _mk_task(headers, p1["id"], "TEST_att")
        files = {"file": ("hello.txt", io.BytesIO(b"hello world iter2"), "text/plain")}
        r = requests.post(f"{API}/tasks/{t['id']}/attachments", files=files, headers=headers)
        assert r.status_code in (200, 201), r.text
        att = r.json()
        assert att["original_filename"] == "hello.txt"
        # List
        lst = requests.get(f"{API}/tasks/{t['id']}/attachments", headers=headers).json()
        assert any(a["id"] == att["id"] for a in lst)
        # Download via query-param token
        tok = headers["Authorization"].split()[1]
        dl = requests.get(f"{API}/files/{att['id']}/download?auth={tok}")
        assert dl.status_code == 200
        assert dl.content == b"hello world iter2"
        # Delete (soft)
        d = requests.delete(f"{API}/attachments/{att['id']}", headers=headers)
        assert d.status_code in (200, 204)
        lst2 = requests.get(f"{API}/tasks/{t['id']}/attachments", headers=headers).json()
        assert not any(a["id"] == att["id"] for a in lst2)
