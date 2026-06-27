import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import TaskDialog from "@/components/TaskDialog";
import KanbanBoard from "@/components/KanbanBoard";
import CalendarView from "@/components/CalendarView";
import TimelineView from "@/components/TimelineView";
import {
  STATUSES, PRIORITIES, priorityColor, statusColor, statusLabel,
  fmtDate, fmtDuration, isOverdue,
} from "@/lib/helpers";
import {
  ArrowLeft, Plus, Sparkles, ChevronRight, ChevronDown, Calendar, Clock,
  Loader2, Search, X, Lock,
} from "lucide-react";

function ListRow({ task, subtasks, blocked, onOpen, onToggle, onOpenSub }) {
  const [expanded, setExpanded] = useState(false);
  const done = task.status === "done";
  return (
    <div className="border-b border-border">
      <div data-testid={`list-row-${task.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 transition-colors group">
        {subtasks.length > 0 ? (
          <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground shrink-0">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : <span className="w-4 shrink-0" />}
        <input type="checkbox" checked={done} onChange={() => onToggle(task)} className="accent-primary shrink-0" data-testid={`list-check-${task.id}`} />
        <button onClick={() => onOpen(task)} className="flex-1 text-left min-w-0 flex items-center gap-1.5">
          {blocked && <Lock size={12} className="text-destructive shrink-0" />}
          <span className={`text-sm truncate ${done ? "line-through text-muted-foreground" : ""}`}>{task.title}</span>
        </button>
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          {task.tags?.slice(0, 2).map((t) => (
            <span key={t} className="text-[10px] font-mono-jb bg-secondary px-1.5 py-0.5 text-muted-foreground">#{t}</span>
          ))}
          {task.time_spent_seconds > 0 && (
            <span className="text-[11px] font-mono-jb text-muted-foreground flex items-center gap-1"><Clock size={11} />{fmtDuration(task.time_spent_seconds)}</span>
          )}
          {task.due_date && (
            <span className={`text-[11px] font-mono-jb flex items-center gap-1 ${isOverdue(task.due_date) && !done ? "text-destructive" : "text-muted-foreground"}`}>
              <Calendar size={11} />{fmtDate(task.due_date)}
            </span>
          )}
          <span className="text-[10px] font-mono-jb px-1.5 py-0.5 uppercase" style={{ color: priorityColor(task.priority) }}>{task.priority}</span>
          <span className="w-16 text-[10px] font-mono-jb uppercase text-right" style={{ color: statusColor(task.status) }}>{statusLabel(task.status)}</span>
        </div>
      </div>
      {expanded && subtasks.map((s) => (
        <div key={s.id} className="flex items-center gap-3 pl-14 pr-4 py-2 bg-background/40 border-t border-border/50">
          <input type="checkbox" checked={s.status === "done"} onChange={() => onToggle(s)} className="accent-primary" />
          <button onClick={() => onOpenSub(s)} className="flex-1 text-left">
            <span className={`text-sm ${s.status === "done" ? "line-through text-muted-foreground" : ""}`}>{s.title}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [dialog, setDialog] = useState({ open: false, task: null, parentId: null });
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiCount, setAiCount] = useState(6);
  const [aiBusy, setAiBusy] = useState(false);
  const [filters, setFilters] = useState({ q: "", priority: "all", status: "all", tag: "all" });

  const loadTasks = useCallback(async () => {
    const { data } = await api.get(`/projects/${id}/tasks`);
    setTasks(data);
  }, [id]);

  useEffect(() => {
    api.get(`/projects/${id}`).then(({ data }) => setProject(data)).catch(() => {});
    api.get("/projects").then(({ data }) => setProjects(data)).catch(() => {});
    loadTasks();
  }, [id, loadTasks]);

  const subsOf = (tid) => tasks.filter((t) => t.parent_id === tid);
  const isBlocked = (t) => (t.blocked_by || []).some((bid) => {
    const b = tasks.find((x) => x.id === bid); return b && b.status !== "done";
  });

  const allTags = [...new Set(tasks.flatMap((t) => t.tags || []))].sort();

  const matches = (t) => {
    if (filters.q && !t.title.toLowerCase().includes(filters.q.toLowerCase())) return false;
    if (filters.priority !== "all" && t.priority !== filters.priority) return false;
    if (filters.status !== "all" && t.status !== filters.status) return false;
    if (filters.tag !== "all" && !(t.tags || []).includes(filters.tag)) return false;
    return true;
  };
  const topTasks = tasks.filter((t) => !t.parent_id);
  const filteredTop = topTasks.filter(matches);
  const filterActive = filters.q || filters.priority !== "all" || filters.status !== "all" || filters.tag !== "all";

  const onSaved = (task) => {
    setTasks((prev) => {
      const exists = prev.find((t) => t.id === task.id);
      if (task.project_id !== id) return prev.filter((t) => t.id !== task.id);
      return exists ? prev.map((t) => (t.id === task.id ? task : t)) : [...prev, task];
    });
  };
  const onDeleted = (tid) => setTasks((prev) => prev.filter((t) => t.id !== tid && t.parent_id !== tid));

  const onReorder = async (items) => {
    setTasks((prev) => prev.map((t) => {
      const it = items.find((x) => x.id === t.id);
      return it ? { ...t, status: it.status, order: it.order } : t;
    }));
    await api.post("/tasks/reorder", { items });
  };

  const toggleDone = async (task) => {
    const { data } = await api.put(`/tasks/${task.id}`, { status: task.status === "done" ? "todo" : "done" });
    onSaved(data);
  };

  const runAI = async () => {
    setAiBusy(true);
    try {
      const { data } = await api.post(`/projects/${id}/ai-generate`, { prompt: aiPrompt, count: Number(aiCount) });
      await loadTasks();
      toast.success(`Generated ${data.created} item(s)`);
      setAiOpen(false);
      setAiPrompt("");
    } catch {
      toast.error("AI generation failed. Try again.");
    }
    setAiBusy(false);
  };

  if (!project) return <div className="p-8 font-mono-jb text-muted-foreground animate-pulse">[ loading... ]</div>;
  const done = topTasks.filter((t) => t.status === "done").length;

  return (
    <div className="p-6 lg:p-8 fade-up">
      <Link to="/projects" data-testid="back-to-projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary font-mono-jb mb-4">
        <ArrowLeft size={14} /> projects
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-2 h-8" style={{ background: project.color }} />
            <h1 className="font-mono-jb text-3xl sm:text-4xl font-extrabold tracking-tight">{project.name}</h1>
          </div>
          {project.description && <p className="text-muted-foreground text-sm mt-2 max-w-2xl">{project.description}</p>}
          <p className="text-xs font-mono-jb text-muted-foreground mt-2">{done}/{topTasks.length} top-level tasks complete</p>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid="ai-generate-button" onClick={() => setAiOpen(true)}
            className="border border-primary text-primary font-mono-jb font-bold text-sm px-4 py-2.5 flex items-center gap-2 hover:bg-primary hover:text-primary-foreground transition-colors">
            <Sparkles size={16} /> AI BREAKDOWN
          </button>
          <button data-testid="new-task-button" onClick={() => setDialog({ open: true, task: null, parentId: null })}
            className="bg-primary text-primary-foreground font-mono-jb font-bold text-sm px-4 py-2.5 flex items-center gap-2 hover:bg-[#D97706] transition-colors">
            <Plus size={16} /> NEW TASK
          </button>
        </div>
      </header>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 border border-border bg-card p-2">
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <Search size={15} className="text-muted-foreground" />
          <input
            data-testid="search-input"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="search tasks..."
            className="bg-transparent text-sm w-full focus:outline-none font-mono-jb"
          />
        </div>
        <select data-testid="filter-status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="bg-secondary border border-border rounded-none px-2 py-1.5 text-xs font-mono-jb focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="all">ALL STATUS</option>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select data-testid="filter-priority" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
          className="bg-secondary border border-border rounded-none px-2 py-1.5 text-xs font-mono-jb focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="all">ALL PRIORITY</option>
          {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select data-testid="filter-tag" value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
          className="bg-secondary border border-border rounded-none px-2 py-1.5 text-xs font-mono-jb focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="all">ALL TAGS</option>
          {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
        </select>
        {filterActive && (
          <button data-testid="clear-filters" onClick={() => setFilters({ q: "", priority: "all", status: "all", tag: "all" })}
            className="text-xs font-mono-jb text-muted-foreground hover:text-destructive flex items-center gap-1">
            <X size={12} /> clear
          </button>
        )}
      </div>

      <Tabs defaultValue="list">
        <TabsList className="bg-card border border-border rounded-none p-0 h-auto flex-wrap">
          <TabsTrigger value="list" data-testid="tab-list" className="font-mono-jb rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2">LIST</TabsTrigger>
          <TabsTrigger value="kanban" data-testid="tab-kanban" className="font-mono-jb rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2">KANBAN</TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline" className="font-mono-jb rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2">TIMELINE</TabsTrigger>
          <TabsTrigger value="calendar" data-testid="tab-calendar" className="font-mono-jb rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2">CALENDAR</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          {topTasks.length === 0 ? (
            <EmptyTasks onAdd={() => setDialog({ open: true, task: null, parentId: null })} onAI={() => setAiOpen(true)} />
          ) : filteredTop.length === 0 ? (
            <div className="border border-border bg-card py-12 text-center text-sm text-muted-foreground font-mono-jb">No tasks match your filters.</div>
          ) : (
            <div className="border-t border-x border-border bg-card" data-testid="list-view">
              {filteredTop.map((t) => (
                <ListRow key={t.id} task={t} subtasks={subsOf(t.id)} blocked={isBlocked(t)}
                  onOpen={(task) => setDialog({ open: true, task, parentId: null })}
                  onOpenSub={(task) => setDialog({ open: true, task, parentId: t.id })}
                  onToggle={toggleDone} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="kanban" className="mt-4">
          <KanbanBoard tasks={filteredTop} allTasks={tasks}
            onOpen={(task) => setDialog({ open: true, task, parentId: null })}
            onReorder={onReorder} />
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <TimelineView tasks={[...filteredTop, ...tasks.filter((t) => t.parent_id)]}
            onOpen={(task) => setDialog({ open: true, task, parentId: task.parent_id })} />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <CalendarView tasks={tasks.filter(matches)} onOpen={(task) => setDialog({ open: true, task, parentId: task.parent_id })} />
        </TabsContent>
      </Tabs>

      {dialog.open && (
        <TaskDialog
          open={dialog.open}
          onClose={() => setDialog({ open: false, task: null, parentId: null })}
          task={dialog.task}
          projectId={id}
          parentId={dialog.parentId}
          allTasks={tasks}
          projects={projects}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onReload={loadTasks}
        />
      )}

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="bg-card border-border rounded-none">
          <DialogHeader>
            <DialogTitle className="font-mono-jb flex items-center gap-2"><Sparkles size={18} className="text-primary" /> AI Task Breakdown</DialogTitle>
            <DialogDescription className="sr-only">Generate tasks with AI</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Claude will break this project into actionable tasks with subtasks. Add optional focus below.</p>
            <textarea data-testid="ai-prompt-input" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
              className="w-full bg-transparent border border-border rounded-none px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary min-h-[90px]"
              placeholder="e.g. Focus on the auth module and database schema first" />
            <div className="flex items-center gap-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Tasks</label>
              <input data-testid="ai-count-input" type="number" min="1" max="15" value={aiCount} onChange={(e) => setAiCount(e.target.value)}
                className="w-20 bg-secondary border border-border rounded-none px-3 py-1.5 text-sm font-mono-jb focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <button data-testid="ai-run-button" onClick={runAI} disabled={aiBusy}
              className="w-full bg-primary text-primary-foreground font-mono-jb font-bold text-sm py-2.5 flex items-center justify-center gap-2 hover:bg-[#D97706] transition-colors disabled:opacity-60">
              {aiBusy ? <><Loader2 size={16} className="animate-spin" /> GENERATING...</> : <><Sparkles size={16} /> GENERATE TASKS</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyTasks({ onAdd, onAI }) {
  return (
    <div className="border border-border bg-card flex flex-col items-center justify-center py-20 text-center">
      <p className="font-mono-jb text-lg">No tasks yet</p>
      <p className="text-muted-foreground text-sm mb-6 mt-1">Add a task manually or let AI break it down.</p>
      <div className="flex gap-2">
        <button onClick={onAdd} className="bg-primary text-primary-foreground font-mono-jb font-bold text-sm px-4 py-2 hover:bg-[#D97706] transition-colors">+ New Task</button>
        <button onClick={onAI} className="border border-primary text-primary font-mono-jb font-bold text-sm px-4 py-2 flex items-center gap-2 hover:bg-primary hover:text-primary-foreground transition-colors">
          <Sparkles size={14} /> AI Breakdown
        </button>
      </div>
    </div>
  );
}
