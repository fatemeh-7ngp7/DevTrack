import { priorityColor, statusColor } from "@/lib/helpers";
import { Lock } from "lucide-react";

const DAY = 86400000;
const DAY_WIDTH = 44;

function dayStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export default function TimelineView({ tasks, onOpen }) {
  const top = tasks.filter((t) => !t.parent_id);

  const spans = top.map((t) => {
    const start = dayStart(t.created_at);
    let end;
    if (t.due_date) end = dayStart(t.due_date);
    else {
      const estDays = Math.max(1, Math.ceil((t.estimate_minutes || 0) / (60 * 8)));
      end = start + estDays * DAY;
    }
    if (end < start) end = start;
    return { task: t, start, end };
  });

  if (spans.length === 0)
    return (
      <div className="border border-border bg-card flex items-center justify-center py-20">
        <p className="text-muted-foreground text-sm font-mono-jb">No tasks to show on the timeline.</p>
      </div>
    );

  const minDate = dayStart(Math.min(...spans.map((s) => s.start)));
  const maxDate = dayStart(Math.max(...spans.map((s) => s.end)));
  const totalDays = Math.max(1, Math.round((maxDate - minDate) / DAY) + 1);
  const today = dayStart(Date.now());
  const todayOffset = Math.round((today - minDate) / DAY);

  const ticks = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(minDate + i * DAY);
    ticks.push({ i, label: d.getDate(), isWeekStart: d.getDay() === 1, month: d.toLocaleDateString("en-US", { month: "short" }) });
  }

  return (
    <div className="border border-border bg-card overflow-x-auto" data-testid="timeline-view">
      <div style={{ minWidth: Math.max(totalDays * DAY_WIDTH + 220, 600) }}>
        {/* Header */}
        <div className="flex border-b border-border sticky top-0 bg-card z-10">
          <div className="w-[220px] shrink-0 px-3 py-2 border-r border-border">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Task</span>
          </div>
          <div className="flex relative">
            {ticks.map((t) => (
              <div key={t.i} className="shrink-0 text-center border-r border-border/40 py-2" style={{ width: DAY_WIDTH }}>
                <div className="text-[10px] text-muted-foreground font-mono-jb">{t.isWeekStart || t.label === 1 ? t.month : ""}</div>
                <div className="text-[11px] font-mono-jb">{t.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="relative">
          {todayOffset >= 0 && todayOffset < totalDays && (
            <div className="absolute top-0 bottom-0 w-px bg-primary/60 z-0"
                 style={{ left: 220 + todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }} />
          )}
          {spans.map(({ task, start, end }) => {
            const left = Math.round((start - minDate) / DAY) * DAY_WIDTH;
            const width = Math.max((Math.round((end - start) / DAY) + 1) * DAY_WIDTH - 4, DAY_WIDTH - 4);
            const blocked = (task.blocked_by || []).some((bid) => {
              const b = tasks.find((x) => x.id === bid); return b && b.status !== "done";
            });
            const done = task.status === "done";
            const color = done ? statusColor("done") : priorityColor(task.priority);
            return (
              <div key={task.id} className="flex border-b border-border hover:bg-secondary/30 transition-colors">
                <button
                  onClick={() => onOpen(task)}
                  data-testid={`timeline-label-${task.id}`}
                  className="w-[220px] shrink-0 px-3 py-2.5 border-r border-border text-left truncate flex items-center gap-1.5"
                >
                  {blocked && <Lock size={11} className="text-destructive shrink-0" />}
                  <span className={`text-sm truncate ${done ? "line-through text-muted-foreground" : ""}`}>{task.title}</span>
                </button>
                <div className="relative flex-1 py-2.5">
                  <button
                    onClick={() => onOpen(task)}
                    data-testid={`timeline-bar-${task.id}`}
                    className="absolute h-5 top-1.5 flex items-center px-2 hover:brightness-110 transition-all"
                    style={{ left, width, background: color, opacity: done ? 0.5 : 1 }}
                    title={task.title}
                  >
                    <span className="text-[10px] font-mono-jb text-black truncate">{task.title}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
