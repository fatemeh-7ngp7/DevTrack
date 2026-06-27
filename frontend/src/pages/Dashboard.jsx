import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { fmtDuration, fmtDate, priorityColor, PRIORITIES } from "@/lib/helpers";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { CheckCircle2, Clock, FolderKanban, ListTodo, Timer, AlertTriangle } from "lucide-react";

function Stat({ icon: Icon, label, value, sub, testid }) {
  return (
    <div data-testid={testid} className="border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">{label}</span>
        <Icon size={16} className="text-primary" />
      </div>
      <div className="font-mono-jb text-3xl font-extrabold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1 font-mono-jb">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard/stats").then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  if (!stats)
    return <div className="p-8 font-mono-jb text-muted-foreground animate-pulse">[ loading dashboard... ]</div>;

  const priorityData = PRIORITIES.map((p) => ({
    name: p.label, value: stats.by_priority[p.id] || 0, color: p.color,
  })).filter((d) => d.value > 0);

  return (
    <div className="p-6 lg:p-8 fade-up">
      <header className="mb-8">
        <h1 className="font-mono-jb text-3xl sm:text-4xl font-extrabold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm font-mono-jb mt-1">// overview of all your work</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Stat icon={FolderKanban} label="Projects" value={stats.total_projects} testid="stat-projects" />
        <Stat icon={ListTodo} label="Tasks" value={stats.total_tasks} sub={`${stats.in_progress_tasks} in progress`} testid="stat-tasks" />
        <Stat icon={CheckCircle2} label="Completed" value={stats.done_tasks} sub={`${stats.completion_rate}% done`} testid="stat-done" />
        <Stat icon={Timer} label="Tracked" value={fmtDuration(stats.total_time_seconds)} testid="stat-time" />
        <Stat icon={Clock} label="Completion" value={`${stats.completion_rate}%`} testid="stat-rate" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        {/* Trend */}
        <div className="lg:col-span-2 border border-border bg-card p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb mb-4">Completed (last 7 days)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats.trend}>
              <CartesianGrid stroke="#262626" strokeDasharray="3 3" />
              <XAxis dataKey="day" stroke="#A3A3A3" fontSize={11} fontFamily="JetBrains Mono" />
              <YAxis stroke="#A3A3A3" fontSize={11} allowDecimals={false} fontFamily="JetBrains Mono" />
              <Tooltip contentStyle={{ background: "#141414", border: "1px solid #262626", borderRadius: 0, fontFamily: "JetBrains Mono", fontSize: 12 }} />
              <Line type="monotone" dataKey="completed" stroke="#F59E0B" strokeWidth={2} dot={{ fill: "#F59E0B", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Priority breakdown */}
        <div className="border border-border bg-card p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb mb-4">By Priority</h2>
          {priorityData.length === 0 ? (
            <p className="text-muted-foreground text-sm font-mono-jb">No tasks yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {priorityData.map((d, i) => <Cell key={i} fill={d.color} stroke="#0A0A0A" />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#141414", border: "1px solid #262626", borderRadius: 0, fontFamily: "JetBrains Mono", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Time by project */}
        <div className="border border-border bg-card p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb mb-4">Time by Project (min)</h2>
          {stats.time_by_project.length === 0 ? (
            <p className="text-muted-foreground text-sm font-mono-jb">No time tracked yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.time_by_project}>
                <CartesianGrid stroke="#262626" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#A3A3A3" fontSize={10} fontFamily="JetBrains Mono" />
                <YAxis stroke="#A3A3A3" fontSize={11} fontFamily="JetBrains Mono" />
                <Tooltip contentStyle={{ background: "#141414", border: "1px solid #262626", borderRadius: 0, fontFamily: "JetBrains Mono", fontSize: 12 }} cursor={{ fill: "#ffffff10" }} />
                <Bar dataKey="minutes" fill="#F59E0B" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Upcoming */}
        <div className="border border-border bg-card p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb mb-4">Upcoming Due</h2>
          {stats.upcoming.length === 0 ? (
            <p className="text-muted-foreground text-sm font-mono-jb">Nothing due. You're clear.</p>
          ) : (
            <div className="space-y-2" data-testid="upcoming-list">
              {stats.upcoming.map((t) => (
                <Link
                  key={t.id}
                  to={`/projects/${t.project_id}`}
                  className="flex items-center justify-between border border-border/60 px-3 py-2 hover:bg-secondary transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 shrink-0" style={{ background: priorityColor(t.priority) }} />
                    <span className="text-sm truncate">{t.title}</span>
                  </div>
                  <span className="text-xs font-mono-jb text-muted-foreground shrink-0 flex items-center gap-1">
                    <AlertTriangle size={12} /> {fmtDate(t.due_date)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
