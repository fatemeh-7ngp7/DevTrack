import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, FolderKanban, Terminal, LogOut } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/projects", label: "Projects", icon: FolderKanban, testid: "nav-projects" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-16 lg:w-60 border-r border-border flex flex-col shrink-0">
        <div className="h-16 flex items-center gap-2 px-4 border-b border-border">
          <Terminal className="text-primary shrink-0" size={20} />
          <span className="font-mono-jb font-extrabold tracking-tight hidden lg:inline">PyTrack</span>
        </div>
        <nav className="flex-1 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                data-testid={item.testid}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 text-sm font-mono-jb transition-colors border-l-2 ${
                    isActive
                      ? "border-primary bg-secondary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`
                }
              >
                <Icon size={18} className="shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-border p-4">
          <div className="hidden lg:block mb-3">
            <p className="text-xs font-mono-jb truncate">{user?.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
          </div>
          <button
            data-testid="logout-button"
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-destructive transition-colors font-mono-jb"
          >
            <LogOut size={16} />
            <span className="hidden lg:inline">Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
