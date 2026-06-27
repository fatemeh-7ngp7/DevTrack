from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import json
import logging
import uuid
import bcrypt
import jwt
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import (
    FastAPI, APIRouter, HTTPException, Depends, Request, Response,
    UploadFile, File, Header, Query,
)
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel, Field, EmailStr

from emergentintegrations.llm.chat import LlmChat, UserMessage

# --- Object storage ---
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "pytrack"
_storage_key = None


def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init",
                         json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# --- DB ---
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
KANBAN_STATUSES = ["backlog", "todo", "in_progress", "done"]


# --- Auth helpers ---
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh",
               "exp": datetime.now(timezone.utc) + timedelta(days=30)}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=False,
                        samesite="lax", max_age=604800, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=False,
                        samesite="lax", max_age=2592000, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# --- Models ---
class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: str = "Developer"


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class ProjectInput(BaseModel):
    name: str
    description: str = ""
    color: str = "#F59E0B"
    status: str = "active"


class TaskInput(BaseModel):
    project_id: str
    parent_id: Optional[str] = None
    title: str
    description: str = ""
    status: str = "todo"
    priority: str = "medium"
    due_date: Optional[str] = None
    tags: List[str] = []
    estimate_minutes: int = 0
    blocked_by: List[str] = []


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    tags: Optional[List[str]] = None
    estimate_minutes: Optional[int] = None
    blocked_by: Optional[List[str]] = None
    project_id: Optional[str] = None
    order: Optional[int] = None


class ReorderItem(BaseModel):
    id: str
    status: str
    order: int


class ReorderInput(BaseModel):
    items: List[ReorderItem]


class AIGenerateInput(BaseModel):
    prompt: str
    count: int = 6


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- Auth routes ---
@api.post("/auth/register")
async def register(data: RegisterInput, response: Response):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {"email": email, "password_hash": hash_password(data.password),
           "name": data.name, "role": "user", "created_at": now_iso()}
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    access = create_access_token(uid, email)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"user": {"id": uid, "email": email, "name": data.name, "role": "user"},
            "access_token": access}


@api.post("/auth/login")
async def login(data: LoginInput, response: Response):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    uid = str(user["_id"])
    access = create_access_token(uid, email)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"user": {"id": uid, "email": email, "name": user.get("name", ""),
                     "role": user.get("role", "user")}, "access_token": access}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        access = create_access_token(payload["sub"], payload.get("email", ""))
        response.set_cookie("access_token", access, httponly=True, secure=False,
                            samesite="lax", max_age=604800, path="/")
        return {"access_token": access}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


# --- Projects ---
@api.get("/projects")
async def list_projects(user: dict = Depends(get_current_user)):
    projects = await db.projects.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for p in projects:
        tasks = await db.tasks.find({"project_id": p["id"]}, {"_id": 0, "status": 1}).to_list(2000)
        p["task_count"] = len(tasks)
        p["done_count"] = len([t for t in tasks if t.get("status") == "done"])
    return projects


@api.post("/projects")
async def create_project(data: ProjectInput, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], **data.model_dump(),
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.projects.insert_one(doc)
    doc.pop("_id", None)
    doc["task_count"] = 0
    doc["done_count"] = 0
    return doc


@api.get("/projects/{project_id}")
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "user_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@api.put("/projects/{project_id}")
async def update_project(project_id: str, data: ProjectInput, user: dict = Depends(get_current_user)):
    res = await db.projects.update_one(
        {"id": project_id, "user_id": user["id"]},
        {"$set": {**data.model_dump(), "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return await db.projects.find_one({"id": project_id}, {"_id": 0})


@api.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    await db.projects.delete_one({"id": project_id, "user_id": user["id"]})
    await db.tasks.delete_many({"project_id": project_id, "user_id": user["id"]})
    return {"ok": True}


# --- Tasks ---
def serialize_task(t: dict) -> dict:
    t.pop("_id", None)
    return t


@api.get("/projects/{project_id}/tasks")
async def project_tasks(project_id: str, user: dict = Depends(get_current_user)):
    tasks = await db.tasks.find({"project_id": project_id, "user_id": user["id"]}, {"_id": 0}).sort("order", 1).to_list(5000)
    return tasks


@api.post("/tasks")
async def create_task(data: TaskInput, user: dict = Depends(get_current_user)):
    count = await db.tasks.count_documents({"project_id": data.project_id, "status": data.status})
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], **data.model_dump(),
           "time_spent_seconds": 0, "timer_started_at": None, "order": count,
           "completed_at": now_iso() if data.status == "done" else None,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.tasks.insert_one(doc)
    return serialize_task(doc)


@api.put("/tasks/{task_id}")
async def update_task(task_id: str, data: TaskUpdate, user: dict = Depends(get_current_user)):
    existing = await db.tasks.find_one({"id": task_id, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if "status" in update:
        if update["status"] == "done" and existing.get("status") != "done":
            update["completed_at"] = now_iso()
        elif update["status"] != "done":
            update["completed_at"] = None
    update["updated_at"] = now_iso()
    await db.tasks.update_one({"id": task_id}, {"$set": update})
    return serialize_task(await db.tasks.find_one({"id": task_id}))


@api.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    await db.tasks.delete_one({"id": task_id, "user_id": user["id"]})
    await db.tasks.delete_many({"parent_id": task_id, "user_id": user["id"]})
    return {"ok": True}


@api.post("/tasks/{task_id}/timer/start")
async def start_timer(task_id: str, user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id, "user_id": user["id"]})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.tasks.update_one({"id": task_id}, {"$set": {"timer_started_at": now_iso()}})
    return serialize_task(await db.tasks.find_one({"id": task_id}))


@api.post("/tasks/{task_id}/timer/stop")
async def stop_timer(task_id: str, user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id, "user_id": user["id"]})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    started = task.get("timer_started_at")
    add = 0
    if started:
        delta = datetime.now(timezone.utc) - datetime.fromisoformat(started)
        add = int(delta.total_seconds())
    new_total = task.get("time_spent_seconds", 0) + add
    await db.tasks.update_one({"id": task_id},
                              {"$set": {"time_spent_seconds": new_total, "timer_started_at": None}})
    return serialize_task(await db.tasks.find_one({"id": task_id}))


# --- Reorder & Attachments ---
@api.post("/tasks/reorder")
async def reorder_tasks(data: ReorderInput, user: dict = Depends(get_current_user)):
    for item in data.items:
        await db.tasks.update_one(
            {"id": item.id, "user_id": user["id"]},
            {"$set": {"status": item.status, "order": item.order, "updated_at": now_iso()}})
    return {"ok": True}


@api.post("/tasks/{task_id}/attachments")
async def upload_attachment(task_id: str, file: UploadFile = File(...),
                            user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id, "user_id": user["id"]})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    content_type = file.content_type or "application/octet-stream"
    try:
        result = put_object(path, data, content_type)
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=502, detail="Upload failed")
    doc = {
        "id": str(uuid.uuid4()), "task_id": task_id, "user_id": user["id"],
        "storage_path": result["path"], "original_filename": file.filename,
        "content_type": content_type, "size": result.get("size", len(data)),
        "is_deleted": False, "created_at": now_iso(),
    }
    await db.files.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api.get("/tasks/{task_id}/attachments")
async def list_attachments(task_id: str, user: dict = Depends(get_current_user)):
    files = await db.files.find(
        {"task_id": task_id, "user_id": user["id"], "is_deleted": False}, {"_id": 0}).to_list(200)
    return files


@api.delete("/attachments/{attachment_id}")
async def delete_attachment(attachment_id: str, user: dict = Depends(get_current_user)):
    await db.files.update_one({"id": attachment_id, "user_id": user["id"]},
                              {"$set": {"is_deleted": True}})
    return {"ok": True}


@api.get("/files/{attachment_id}/download")
async def download_attachment(attachment_id: str, authorization: str = Header(None),
                              auth: str = Query(None)):
    token = None
    auth_header = authorization or (f"Bearer {auth}" if auth else None)
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    record = await db.files.find_one(
        {"id": attachment_id, "user_id": payload["sub"], "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, content_type = get_object(record["storage_path"])
    return Response(content=data, media_type=record.get("content_type", content_type),
                    headers={"Content-Disposition": f'inline; filename="{record["original_filename"]}"'})


# --- Dashboard ---
@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    tasks = await db.tasks.find({"user_id": user["id"]}, {"_id": 0}).to_list(10000)
    projects = await db.projects.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    total = len(tasks)
    done = len([t for t in tasks if t.get("status") == "done"])
    in_progress = len([t for t in tasks if t.get("status") == "in_progress"])
    total_time = sum(t.get("time_spent_seconds", 0) for t in tasks)

    by_status = {s: len([t for t in tasks if t.get("status") == s]) for s in KANBAN_STATUSES}
    by_priority = {p: len([t for t in tasks if t.get("priority") == p])
                   for p in ["urgent", "high", "medium", "low"]}

    # Completion over last 7 days
    today = datetime.now(timezone.utc).date()
    trend = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        cnt = len([t for t in tasks if t.get("completed_at") and
                   datetime.fromisoformat(t["completed_at"]).date() == day])
        trend.append({"day": day.strftime("%a"), "completed": cnt})

    # Time per project
    time_by_project = []
    for p in projects:
        secs = sum(t.get("time_spent_seconds", 0) for t in tasks if t.get("project_id") == p["id"])
        if secs > 0:
            time_by_project.append({"name": p["name"], "minutes": round(secs / 60, 1)})

    # Upcoming due tasks
    upcoming = sorted(
        [t for t in tasks if t.get("due_date") and t.get("status") != "done"],
        key=lambda x: x["due_date"])[:5]

    return {
        "total_tasks": total, "done_tasks": done, "in_progress_tasks": in_progress,
        "total_projects": len(projects), "total_time_seconds": total_time,
        "completion_rate": round((done / total) * 100) if total else 0,
        "by_status": by_status, "by_priority": by_priority,
        "trend": trend, "time_by_project": time_by_project, "upcoming": upcoming,
    }


@api.get("/calendar")
async def calendar(user: dict = Depends(get_current_user)):
    tasks = await db.tasks.find(
        {"user_id": user["id"], "due_date": {"$ne": None}}, {"_id": 0}).to_list(5000)
    return [t for t in tasks if t.get("due_date")]


# --- AI Task Generation ---
@api.post("/projects/{project_id}/ai-generate")
async def ai_generate(project_id: str, data: AIGenerateInput, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"id": project_id, "user_id": user["id"]}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    system_msg = (
        "You are a senior engineering project planner. Given a project description, "
        "break it down into clear, actionable tasks for a backend Python developer. "
        "Return ONLY valid JSON, no markdown fences, no prose. "
        "Format: {\"tasks\": [{\"title\": str, \"description\": str, "
        "\"priority\": \"low|medium|high|urgent\", \"estimate_minutes\": int, "
        "\"tags\": [str], \"subtasks\": [{\"title\": str, \"description\": str}]}]}. "
        f"Generate approximately {data.count} top-level tasks. Keep titles concise."
    )
    chat = LlmChat(
        api_key=os.environ["EMERGENT_LLM_KEY"],
        session_id=f"aigen-{project_id}-{uuid.uuid4()}",
        system_message=system_msg,
    ).with_model("anthropic", "claude-sonnet-4-6")

    prompt = f"Project: {project['name']}\nDescription: {project.get('description','')}\nFocus: {data.prompt}"
    try:
        reply = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.error(f"AI generation failed: {e}")
        raise HTTPException(status_code=502, detail="AI generation failed. Try again.")

    text = reply.strip()
    if text.startswith("```"):
        text = text.split("```")[1] if "```" in text else text
        if text.startswith("json"):
            text = text[4:]
    try:
        parsed = json.loads(text)
    except Exception:
        start, end = text.find("{"), text.rfind("}")
        parsed = json.loads(text[start:end + 1]) if start != -1 else {"tasks": []}

    created = []
    base_order = await db.tasks.count_documents({"project_id": project_id, "status": "todo"})
    for idx, t in enumerate(parsed.get("tasks", [])):
        task_doc = {
            "id": str(uuid.uuid4()), "user_id": user["id"], "project_id": project_id,
            "parent_id": None, "title": t.get("title", "Untitled"),
            "description": t.get("description", ""), "status": "todo",
            "priority": t.get("priority", "medium") if t.get("priority") in ["low", "medium", "high", "urgent"] else "medium",
            "due_date": None, "tags": t.get("tags", []) or [],
            "estimate_minutes": int(t.get("estimate_minutes", 0) or 0),
            "time_spent_seconds": 0, "timer_started_at": None, "order": base_order + idx,
            "completed_at": None, "created_at": now_iso(), "updated_at": now_iso(),
            "blocked_by": [],
        }
        await db.tasks.insert_one(dict(task_doc))
        created.append(serialize_task(task_doc))
        for sidx, st in enumerate(t.get("subtasks", []) or []):
            sub = {
                "id": str(uuid.uuid4()), "user_id": user["id"], "project_id": project_id,
                "parent_id": task_doc["id"], "title": st.get("title", "Untitled"),
                "description": st.get("description", ""), "status": "todo",
                "priority": "medium", "due_date": None, "tags": [],
                "estimate_minutes": 0, "time_spent_seconds": 0, "timer_started_at": None,
                "order": sidx, "completed_at": None,
                "created_at": now_iso(), "updated_at": now_iso(), "blocked_by": [],
            }
            await db.tasks.insert_one(dict(sub))
            created.append(serialize_task(sub))
    return {"created": len(created), "tasks": created}


# --- Startup ---
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@pytrack.dev").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email, "password_hash": hash_password(admin_password),
            "name": "Admin", "role": "admin", "created_at": now_iso()})
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password)}})


@api.get("/")
async def root():
    return {"message": "PyTrack API"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown():
    client.close()
