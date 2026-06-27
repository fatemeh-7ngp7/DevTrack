import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiErrorDetail } from "@/lib/api";
import { Terminal, ArrowRight } from "lucide-react";

const AUTH_BG = "https://images.pexels.com/photos/12623752/pexels-photo-12623752.jpeg";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("admin@pytrack.dev");
  const [password, setPassword] = useState("admin123");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name || "Developer");
      navigate("/");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left: form */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm fade-up">
          <div className="flex items-center gap-2 mb-10">
            <Terminal className="text-primary" size={22} />
            <span className="font-mono-jb text-xl font-extrabold tracking-tight">PyTrack</span>
          </div>
          <h1 className="font-mono-jb text-3xl sm:text-4xl font-extrabold tracking-tight mb-1">
            {mode === "login" ? "Sign in." : "Create account."}
          </h1>
          <p className="text-muted-foreground text-sm mb-8 font-mono-jb">
            // your specialized project workspace
          </p>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Name</label>
                <input
                  data-testid="register-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full mt-1 bg-transparent border border-border rounded-none px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="Developer"
                />
              </div>
            )}
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Email</label>
              <input
                data-testid="login-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 bg-transparent border border-border rounded-none px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                placeholder="you@dev.io"
                required
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono-jb">Password</label>
              <input
                data-testid="login-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full mt-1 bg-transparent border border-border rounded-none px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div data-testid="auth-error" className="text-destructive text-xs font-mono-jb border border-destructive/40 px-3 py-2">
                {error}
              </div>
            )}

            <button
              data-testid="auth-submit-button"
              type="submit"
              disabled={busy}
              className="group w-full bg-primary text-primary-foreground font-mono-jb font-bold py-2.5 text-sm flex items-center justify-center gap-2 hover:bg-[#D97706] transition-colors disabled:opacity-50"
            >
              {busy ? "..." : mode === "login" ? "SIGN IN" : "REGISTER"}
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </form>

          <button
            data-testid="auth-toggle-mode"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            className="mt-6 text-xs text-muted-foreground hover:text-primary transition-colors font-mono-jb"
          >
            {mode === "login" ? "// no account? register →" : "// have an account? sign in →"}
          </button>
        </div>
      </div>

      {/* Right: image */}
      <div className="hidden lg:block relative border-l border-border">
        <img src={AUTH_BG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10">
          <p className="font-mono-jb text-2xl font-bold leading-snug">
            Track projects.<br />Break down tasks.<br />
            <span className="text-primary">Ship faster.</span>
          </p>
          <p className="text-muted-foreground text-sm mt-3 font-mono-jb">
            Kanban · Calendar · Time tracking · AI breakdown
          </p>
        </div>
      </div>
    </div>
  );
}
