export const STATUSES = [
  { id: "backlog", label: "BACKLOG", color: "#A3A3A3" },
  { id: "todo", label: "TODO", color: "#3B82F6" },
  { id: "in_progress", label: "IN PROGRESS", color: "#F59E0B" },
  { id: "done", label: "DONE", color: "#22C55E" },
];

export const PRIORITIES = [
  { id: "urgent", label: "URGENT", color: "#EF4444" },
  { id: "high", label: "HIGH", color: "#F59E0B" },
  { id: "medium", label: "MEDIUM", color: "#3B82F6" },
  { id: "low", label: "LOW", color: "#A3A3A3" },
];

export const priorityColor = (p) => (PRIORITIES.find((x) => x.id === p) || PRIORITIES[2]).color;
export const statusColor = (s) => (STATUSES.find((x) => x.id === s) || STATUSES[1]).color;
export const statusLabel = (s) => (STATUSES.find((x) => x.id === s) || STATUSES[1]).label;

export function fmtDuration(seconds) {
  if (!seconds) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function isOverdue(iso) {
  if (!iso) return false;
  return new Date(iso) < new Date(new Date().toDateString());
}

// minimal markdown -> html (headings, bold, italic, inline code, lists, line breaks)
export function renderMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/^[-*] (.*)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
  html = html.replace(/\n/g, "<br/>");
  return html;
}
