import { useState } from "react";
import { STATUSES, priorityColor, fmtDate, fmtDuration, isOverdue } from "@/lib/helpers";
import { Clock, Calendar, GitBranch, Timer, Lock, Paperclip } from "lucide-react";

function TaskCard({ task, subCount, subDone, blocked, attachCount, onOpen, onDragStart, onDropOn }) {
  const [over, setOver] = useState(false);
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.stopPropagation(); setOver(false); onDropOn(e, task); }}
      onClick={() => onOpen(task)}
      data-testid={`kanban-card-${task.id}`}
      className={`border bg-background p-3 cursor-pointer hover:border-primary/60 hover:bg-secondary/40 transition-colors ${over ? "border-t-2 border-t-primary" : "border-border"} ${task.timer_started_at ? "border-l-2 border-l-primary tracking-active" : ""}`}
    >
      <div className="flex items-start gap-2">
        <span className="w-1 h-4 shrink-0 mt-0.5" style={{ background: priorityColor(task.priority) }} />
        <p className="text-sm leading-tight flex-1">{task.title}</p>
        {blocked && <Lock size={12} className="text-destructive shrink-0 mt-0.5" />}
      </div>
      {task.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 pl-3">
          {task.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[10px] font-mono-jb bg-secondary px-1.5 py-0.5 text-muted-foreground">#{t}</span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 mt-2 pl-3 text-[11px] font-mono-jb text-muted-foreground">
        {task.due_date && (
          <span className={`flex items-center gap-1 ${isOverdue(task.due_date) && task.status !== "done" ? "text-destructive" : ""}`}>
            <Calendar size={11} /> {fmtDate(task.due_date)}
          </span>
        )}
        {subCount > 0 && <span className="flex items-center gap-1"><GitBranch size={11} /> {subDone}/{subCount}</span>}
        {attachCount > 0 && <span className="flex items-center gap-1"><Paperclip size={11} /> {attachCount}</span>}
        {task.time_spent_seconds > 0 && <span className="flex items-center gap-1"><Clock size={11} /> {fmtDuration(task.time_spent_seconds)}</span>}
        {task.timer_started_at && <Timer size={11} className="text-primary" />}
      </div>
    </div>
  );
}

export default function KanbanBoard({ tasks, allTasks, onOpen, onReorder }) {
  const [dragOver, setDragOver] = useState(null);

  const onDragStart = (e, id) => e.dataTransfer.setData("taskId", id);

  const buildReorder = (draggedId, status, beforeTaskId) => {
    const dragged = tasks.find((t) => t.id === draggedId);
    if (!dragged) return;
    const col = tasks
      .filter((t) => t.status === status && t.id !== draggedId)
      .sort((a, b) => a.order - b.order);
    const idx = beforeTaskId ? col.findIndex((t) => t.id === beforeTaskId) : col.length;
    const insertAt = idx === -1 ? col.length : idx;
    col.splice(insertAt, 0, { ...dragged, status });
    onReorder(col.map((t, i) => ({ id: t.id, status, order: i })));
  };

  const onDropColumn = (e, status) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("taskId");
    setDragOver(null);
    if (id) buildReorder(id, status, null);
  };

  const onDropOnCard = (e, targetTask) => {
    const id = e.dataTransfer.getData("taskId");
    if (id && id !== targetTask.id) buildReorder(id, targetTask.status, targetTask.id);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-0 border-t border-l border-border">
      {STATUSES.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.id).sort((a, b) => a.order - b.order);
        return (
          <div
            key={col.id}
            onDragOver={(e) => { e.preventDefault(); setDragOver(col.id); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => onDropColumn(e, col.id)}
            data-testid={`kanban-column-${col.id}`}
            className={`border-r border-b border-border min-h-[60vh] transition-colors ${dragOver === col.id ? "bg-secondary/40" : ""}`}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-card z-10">
              <span className="font-mono-jb text-xs font-bold tracking-wider flex items-center gap-2">
                <span className="w-2 h-2" style={{ background: col.color }} />
                {col.label}
              </span>
              <span className="font-mono-jb text-xs text-muted-foreground">{colTasks.length}</span>
            </div>
            <div className="p-2 space-y-2">
              {colTasks.map((t) => {
                const subs = allTasks.filter((s) => s.parent_id === t.id);
                const blocked = (t.blocked_by || []).some(
                  (bid) => { const b = allTasks.find((x) => x.id === bid); return b && b.status !== "done"; });
                return (
                  <TaskCard
                    key={t.id}
                    task={t}
                    subCount={subs.length}
                    subDone={subs.filter((s) => s.status === "done").length}
                    blocked={blocked}
                    attachCount={t.attachment_count || 0}
                    onOpen={onOpen}
                    onDragStart={onDragStart}
                    onDropOn={onDropOnCard}
                  />
                );
              })}
              {colTasks.length === 0 && (
                <p className="text-center text-xs text-muted-foreground font-mono-jb py-8">empty</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
