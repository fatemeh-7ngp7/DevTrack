import { useState } from "react";
import { priorityColor, statusColor } from "@/lib/helpers";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarView({ tasks, onOpen }) {
  const [cursor, setCursor] = useState(new Date());

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const tasksForDay = (d) => {
    const ds = new Date(year, month, d).toDateString();
    return tasks.filter((t) => t.due_date && new Date(t.due_date).toDateString() === ds);
  };

  const todayStr = new Date().toDateString();

  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-mono-jb font-bold tracking-tight">
          {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h3>
        <div className="flex items-center gap-1">
          <button data-testid="cal-prev" onClick={() => setCursor(new Date(year, month - 1, 1))} className="border border-border p-1.5 hover:bg-secondary">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setCursor(new Date())} className="border border-border px-3 py-1.5 text-xs font-mono-jb hover:bg-secondary">today</button>
          <button data-testid="cal-next" onClick={() => setCursor(new Date(year, month + 1, 1))} className="border border-border p-1.5 hover:bg-secondary">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-l border-border">
        {DAYS.map((d) => (
          <div key={d} className="border-r border-b border-border px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-mono-jb">{d}</div>
        ))}
        {cells.map((d, i) => {
          const dayTasks = d ? tasksForDay(d) : [];
          const isToday = d && new Date(year, month, d).toDateString() === todayStr;
          return (
            <div key={i} className={`border-r border-b border-border min-h-[90px] p-1.5 ${d ? "" : "bg-background/40"}`}>
              {d && (
                <>
                  <span className={`text-xs font-mono-jb ${isToday ? "bg-primary text-primary-foreground px-1.5" : "text-muted-foreground"}`}>{d}</span>
                  <div className="space-y-1 mt-1">
                    {dayTasks.slice(0, 4).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onOpen(t)}
                        data-testid={`cal-task-${t.id}`}
                        className="w-full text-left text-[10px] px-1 py-0.5 truncate border-l-2 hover:bg-secondary transition-colors"
                        style={{ borderColor: t.status === "done" ? statusColor("done") : priorityColor(t.priority) }}
                        title={t.title}
                      >
                        <span className={t.status === "done" ? "line-through text-muted-foreground" : ""}>{t.title}</span>
                      </button>
                    ))}
                    {dayTasks.length > 4 && <span className="text-[10px] text-muted-foreground font-mono-jb">+{dayTasks.length - 4}</span>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
