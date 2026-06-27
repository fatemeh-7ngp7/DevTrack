import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { STATUSES, PRIORITIES, fmtDuration, renderMarkdown } from "@/lib/helpers";
import {
  Play, Square, Trash2, Plus, Eye, Pencil, X, Lock, Paperclip,
  Upload, FileText, Loader2, FolderInput,
} from "lucide-react";

const empty = {
  title: "", description: "", status: "todo", priority: "medium",
  due_date: "", tags: [], estimate_minutes: 0, blocked_by: [],
};

export default function TaskDialog({ open, onClose, task, projectId, parentId, allTasks, projects, onSaved, onDeleted, onReload }) {
  const isEdit = !!task;
  const [form, setForm] = useState(empty);
  const [tagInput, setTagInput] = useState("");
  const [preview, setPreview] = useState(false);
  const [subInput, setSubInput] = useState("");
  const [now, setNow] = useState(Date.now());
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title, description: task.description || "",
        status: task.status, priority: task.priority,
        due_date: task.due_date ? task.due_date.slice(0, 10) : "",
        tags: task.tags || [], estimate_minutes: task.estimate_minutes || 0,
        blocked_by: task.blocked_by || [],
      });
      api.get(`/tasks/${task.id}/attachments`).then(({ data }) => setAttachments(data)).catch(() => setAttachments([]));
    } else {
      setForm(empty);
      setAttachments([]);
    }
    setPreview(false);
  }, [task, open]);

  useEffect(() => {
    if (!task?.timer_started_at) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [task?.timer_started_at]);

  const subtasks = (allTasks || []).filter((t) => t.parent_id === task?.id);
  const depOptions = (allTasks || []).filter((t) => !t.parent_id && t.id !== task?.id);
  const isTopLevel = !parentId && !(task && task.parent_id);

  const liveSeconds = () => {
    let s = task?.time_spent_seconds || 0;
    if (task?.timer_started_at) s += Math.floor((now - new Date(task.timer_started_at).getTime()) / 1000);
    return s;
  };

  const save = async () => {
    if (!form.title.trim()) return;
    const payload = {
      ...form,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      estimate_minutes: Number(form.estimate_minutes) || 0,
    };
    if (isEdit) {
      const { data } = await api.put(`/tasks/${task.id}`, payload);
      onSaved(data);
      toast.success("Task updated");
    } else {
      const { data } = await api.post("/tasks", { ...payload, project_id: projectId, parent_id: parentId || null });
      onSaved(data);
      toast.success("Task created");
    }
    onClose();
  };

  const del = async () => {
    await api.delete(`/tasks/${task.id}`);
    onDeleted(task.id);
    toast.success("Task deleted");
    onClose();
  };

  const toggleTimer = async () => {
    const ep = task.timer_started_at ? "stop" : "start";
    const { data } = await api.post(`/tasks/${task.id}/timer/${ep}`);
    onSaved(data);
  };

  const moveProject = async (newPid) => {
    const { data } = await api.put(`/tasks/${task.id}`, { project_id: newPid });
    toast.success("Task moved to another project");
    onSaved(data);
    onClose();
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) setForm({ ...form, tags: [...form.tags, t] });
    setTagInput("");
  };

  const toggleDep = (id) => {
    const has = form.blocked_by.includes(id);
    setForm({ ...form, blocked_by: has ? form.blocked_by.filter((x) => x !== id) : [...form.blocked_by, id] });
  };

  const addSubtask = async () => {
    const title = subInput.trim();
    if (!title) return;
    await api.post("/tasks", { project_id: projectId, parent_id: task.id, title, status: "todo", priority: "medium" });
    setSubInput("");
    toast.success("Subtask added");
    onReload && onReload();
  };
  const toggleSub = async (sub) => {
    await api.put(`/tasks/${sub.id}`, { status: sub.status === "done" ? "todo" : "done" });
    onReload && onReload();
  };
  const delSub = async (id) => { await api.delete(`/tasks/${id}`); onReload && onReload(); };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post(`/tasks/${task.id}/attachments`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAttachments((prev) => [...prev, data]);
      toast.success("File uploaded");
    } catch {
      toast.error("Upload failed");
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const delAttachment = async (id) => {
    await api.delete(`/attachments/${id}`);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const fileUrl = (a) => `${process.env.REACT_APP_BACKEND_URL}/api/files/${a.id}/download?auth=${localStorage.getItem("pytrack_token")}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border rounded-none max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono-jb flex items-center gap-2">
            {parentId && <span className="text-primary text-xs">SUBTASK</span>}
            {isEdit ? "Edit Task" : parentId ? "New Subtask" : "New Task"}
          </DialogTitle>
          <DialogDescription className="sr-only">Task editor</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <input
            data-testid="task-title-input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full bg-transparent border border-border rounded-none px-3 py-2 text-base font-mono-jb focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Task title"
            autoFocus
          />

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Notes (markdown)</label>
              <button onClick={() => setPreview(!preview)} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 font-mono-jb">
                {preview ? <Pencil size={12} /> : <Eye size={12} />} {preview ? "edit" : "preview"}
              </button>
            </div>
            {preview ? (
              <div className="markdown-body border border-border px-3 py-2 text-sm min-h-[100px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(form.description) }} />
            ) : (
              <textarea
                data-testid="task-description-input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-transparent border border-border rounded-none px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary min-h-[100px]"
                placeholder="## Acceptance criteria&#10;- `endpoint` returns 200..."
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Status</label>
              <select data-testid="task-status-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full mt-1 bg-secondary border border-border rounded-none px-3 py-2 text-sm font-mono-jb focus:outline-none focus:ring-1 focus:ring-primary">
                {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Priority</label>
              <select data-testid="task-priority-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full mt-1 bg-secondary border border-border rounded-none px-3 py-2 text-sm font-mono-jb focus:outline-none focus:ring-1 focus:ring-primary">
                {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Due date</label>
              <input data-testid="task-due-input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full mt-1 bg-secondary border border-border rounded-none px-3 py-2 text-sm font-mono-jb focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Estimate (min)</label>
              <input data-testid="task-estimate-input" type="number" min="0" value={form.estimate_minutes} onChange={(e) => setForm({ ...form, estimate_minutes: e.target.value })}
                className="w-full mt-1 bg-secondary border border-border rounded-none px-3 py-2 text-sm font-mono-jb focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Tags</label>
            <div className="flex gap-2 mt-1">
              <input data-testid="task-tag-input" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                className="flex-1 bg-transparent border border-border rounded-none px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="add tag + Enter" />
              <button onClick={addTag} className="border border-border px-3 hover:bg-secondary"><Plus size={14} /></button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {form.tags.map((t) => (
                <span key={t} className="text-xs font-mono-jb bg-secondary px-2 py-0.5 flex items-center gap-1">
                  {t}<button onClick={() => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })}><X size={11} /></button>
                </span>
              ))}
            </div>
          </div>

          {/* Dependencies */}
          {isTopLevel && depOptions.length > 0 && (
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb flex items-center gap-1"><Lock size={12} /> Blocked by (dependencies)</label>
              <div className="border border-border mt-1 max-h-32 overflow-y-auto" data-testid="dependency-list">
                {depOptions.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-secondary/50 cursor-pointer border-b border-border/40 last:border-0">
                    <input type="checkbox" checked={form.blocked_by.includes(d.id)} onChange={() => toggleDep(d.id)} className="accent-primary" data-testid={`dep-check-${d.id}`} />
                    <span className="truncate flex-1">{d.title}</span>
                    <span className="text-[10px] font-mono-jb text-muted-foreground uppercase">{d.status}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Time tracking */}
          {isEdit && (
            <div className="border border-border p-3 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Time tracked</p>
                <p className={`font-mono-jb text-xl font-bold ${task.timer_started_at ? "text-primary" : ""}`} data-testid="task-time-display">{fmtDuration(liveSeconds())}</p>
              </div>
              <button data-testid="task-timer-toggle" onClick={toggleTimer}
                className={`flex items-center gap-2 font-mono-jb font-bold text-sm px-4 py-2 transition-colors ${task.timer_started_at ? "bg-destructive text-white tracking-active" : "bg-primary text-primary-foreground hover:bg-[#D97706]"}`}>
                {task.timer_started_at ? <><Square size={14} /> STOP</> : <><Play size={14} /> START</>}
              </button>
            </div>
          )}

          {/* Attachments */}
          {isEdit && (
            <div className="border border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb flex items-center gap-1"><Paperclip size={12} /> Attachments ({attachments.length})</p>
                <button data-testid="upload-attachment-button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="text-xs font-mono-jb text-primary flex items-center gap-1 hover:underline disabled:opacity-50">
                  {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} upload
                </button>
                <input ref={fileRef} type="file" className="hidden" onChange={onUpload} data-testid="attachment-file-input" />
              </div>
              <div className="space-y-2" data-testid="attachment-list">
                {attachments.map((a) => {
                  const isImg = (a.content_type || "").startsWith("image/");
                  return (
                    <div key={a.id} className="flex items-center gap-2 border border-border/50 p-2 group/att">
                      {isImg ? (
                        <a href={fileUrl(a)} target="_blank" rel="noreferrer">
                          <img src={fileUrl(a)} alt={a.original_filename} className="w-10 h-10 object-cover border border-border" />
                        </a>
                      ) : <FileText size={20} className="text-muted-foreground shrink-0" />}
                      <a href={fileUrl(a)} target="_blank" rel="noreferrer" className="text-sm truncate flex-1 hover:text-primary">{a.original_filename}</a>
                      <span className="text-[10px] font-mono-jb text-muted-foreground">{Math.round((a.size || 0) / 1024)}KB</span>
                      <button onClick={() => delAttachment(a.id)} className="opacity-0 group-hover/att:opacity-100 text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                    </div>
                  );
                })}
                {attachments.length === 0 && <p className="text-xs text-muted-foreground font-mono-jb">No files attached.</p>}
              </div>
            </div>
          )}

          {/* Subtasks */}
          {isEdit && !task.parent_id && (
            <div className="border border-border p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb mb-2">Subtasks ({subtasks.filter((s) => s.status === "done").length}/{subtasks.length})</p>
              <div className="space-y-1 mb-2" data-testid="subtask-list">
                {subtasks.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 group/sub text-sm">
                    <input type="checkbox" checked={s.status === "done"} onChange={() => toggleSub(s)} className="accent-primary" data-testid={`subtask-check-${s.id}`} />
                    <span className={s.status === "done" ? "line-through text-muted-foreground flex-1" : "flex-1"}>{s.title}</span>
                    <button onClick={() => delSub(s.id)} className="opacity-0 group-hover/sub:opacity-100 text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input data-testid="subtask-input" value={subInput} onChange={(e) => setSubInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSubtask())}
                  className="flex-1 bg-transparent border border-border rounded-none px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="add subtask + Enter" />
                <button data-testid="add-subtask-button" onClick={addSubtask} className="border border-border px-3 hover:bg-secondary"><Plus size={14} /></button>
              </div>
            </div>
          )}

          {/* Move to project */}
          {isEdit && isTopLevel && projects && projects.length > 1 && (
            <div className="border border-border p-3">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb flex items-center gap-1"><FolderInput size={12} /> Move to project</label>
              <select data-testid="move-project-select" value={task.project_id} onChange={(e) => e.target.value !== task.project_id && moveProject(e.target.value)}
                className="w-full mt-1 bg-secondary border border-border rounded-none px-3 py-2 text-sm font-mono-jb focus:outline-none focus:ring-1 focus:ring-primary">
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          {isEdit ? (
            <button data-testid="delete-task-button" onClick={del} className="text-destructive text-sm font-mono-jb flex items-center gap-1 hover:underline"><Trash2 size={14} /> Delete</button>
          ) : <span />}
          <button data-testid="save-task-button" onClick={save} className="bg-primary text-primary-foreground font-mono-jb font-bold text-sm px-5 py-2 hover:bg-[#D97706] transition-colors">{isEdit ? "SAVE" : "CREATE"}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
