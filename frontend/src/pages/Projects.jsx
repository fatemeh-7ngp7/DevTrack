import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, FolderKanban, Trash2 } from "lucide-react";

const COLORS = ["#F59E0B", "#22C55E", "#3B82F6", "#EF4444", "#A855F7", "#EC4899"];

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", color: COLORS[0] });

  const load = async () => {
    const { data } = await api.get("/projects");
    setProjects(data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) return;
    const { data } = await api.post("/projects", { ...form, status: "active" });
    setProjects([{ ...data }, ...projects]);
    setForm({ name: "", description: "", color: COLORS[0] });
    setOpen(false);
    toast.success("Project created");
  };

  const remove = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    await api.delete(`/projects/${id}`);
    setProjects(projects.filter((p) => p.id !== id));
    toast.success("Project deleted");
  };

  return (
    <div className="p-6 lg:p-8 fade-up">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-mono-jb text-3xl sm:text-4xl font-extrabold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-sm font-mono-jb mt-1">// {projects.length} active workspace(s)</p>
        </div>
        <button
          data-testid="new-project-button"
          onClick={() => setOpen(true)}
          className="bg-primary text-primary-foreground font-mono-jb font-bold text-sm px-4 py-2.5 flex items-center gap-2 hover:bg-[#D97706] transition-colors"
        >
          <Plus size={16} /> NEW PROJECT
        </button>
      </header>

      {loading ? (
        <p className="font-mono-jb text-muted-foreground animate-pulse">[ loading... ]</p>
      ) : projects.length === 0 ? (
        <div className="border border-border bg-card flex flex-col items-center justify-center py-24 text-center">
          <FolderKanban size={40} className="text-muted-foreground mb-4" />
          <p className="font-mono-jb text-lg">No projects yet</p>
          <p className="text-muted-foreground text-sm mb-6">Create your first project to start tracking.</p>
          <button
            onClick={() => setOpen(true)}
            className="bg-primary text-primary-foreground font-mono-jb font-bold text-sm px-4 py-2 hover:bg-[#D97706] transition-colors"
          >
            + Create Project
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="projects-grid">
          {projects.map((p) => {
            const pct = p.task_count ? Math.round((p.done_count / p.task_count) * 100) : 0;
            return (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                data-testid={`project-card-${p.id}`}
                className="group border border-border bg-card p-5 hover:border-primary/60 transition-colors relative"
              >
                <div className="w-8 h-1 mb-4" style={{ background: p.color }} />
                <h2 className="font-mono-jb text-lg font-bold tracking-tight truncate">{p.name}</h2>
                <p className="text-muted-foreground text-sm mt-1 line-clamp-2 min-h-[2.5rem]">
                  {p.description || "No description"}
                </p>
                <div className="mt-4">
                  <div className="flex justify-between text-xs font-mono-jb text-muted-foreground mb-1">
                    <span>{p.done_count}/{p.task_count} tasks</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1 bg-secondary w-full">
                    <div className="h-full transition-all" style={{ width: `${pct}%`, background: p.color }} />
                  </div>
                </div>
                <button
                  data-testid={`delete-project-${p.id}`}
                  onClick={(e) => remove(e, p.id)}
                  className="absolute top-4 right-4 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border rounded-none">
          <DialogHeader>
            <DialogTitle className="font-mono-jb">New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Name</label>
              <input
                data-testid="project-name-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full mt-1 bg-transparent border border-border rounded-none px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="API Gateway Rewrite"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Description</label>
              <textarea
                data-testid="project-description-input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full mt-1 bg-transparent border border-border rounded-none px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px]"
                placeholder="Migrate the monolith routes to FastAPI..."
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Color</label>
              <div className="flex gap-2 mt-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-6 h-6 transition-transform ${form.color === c ? "ring-2 ring-offset-2 ring-offset-card ring-white scale-110" : ""}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <button
              data-testid="create-project-submit"
              onClick={create}
              className="bg-primary text-primary-foreground font-mono-jb font-bold text-sm px-4 py-2 hover:bg-[#D97706] transition-colors"
            >
              CREATE
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
