import { useEffect, useState } from "react";

type Issue = {
  id: number;
  title: string;
  slug: string;
  status: string;
  priority: string;
  project_name?: string;
  assignee_name?: string;
  description?: string;
};

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

const formatStatus = (value: string) => value.replace(/_/g, " ");

export default function App() {
  const [stats, setStats] = useState<{ [key: string]: number | string }>({});
  const [issues, setIssues] = useState<Issue[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (status !== "all") query.set("status", status);
    if (priority !== "all") query.set("priority", priority);

    const requestUrl = `${apiBase}/issues/?${query.toString()}`;

    async function loadData() {
      setLoading(true);
      try {
        const [issuesRes, statsRes] = await Promise.all([
          fetch(requestUrl),
          fetch(`${apiBase}/dashboard/`),
        ]);

        const issuesPayload = await issuesRes.json();
        const statsPayload = await statsRes.json();

        setIssues(issuesPayload.results ?? issuesPayload);
        setStats(statsPayload);
      } catch (error) {
        console.error("Failed to load DevFlow data", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [search, status, priority]);

  const statCards = [
    { label: "Open issues", value: stats.open_issues ?? 0, delta: "live queue" },
    { label: "Blocked", value: stats.blocked_issues ?? 0, delta: "needs review" },
    { label: "In progress", value: stats.in_progress_issues ?? 0, delta: "active work" },
    { label: "Projects", value: stats.projects ?? 0, delta: "tracked" },
  ];

  const activity = [
    "Ava moved BUG-214 to In Review",
    "Omar added a comment to FEAT-118",
    "Sam linked a production incident to BUG-203",
  ];

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">DevFlow & BugSync</p>
          <h1>Engineering visibility that feels like a real internal platform.</h1>
          <p className="hero-copy">
            Track issues, filter by status, and measure delivery health in one operational workspace.
          </p>
        </div>
        <div className="hero-panel">
          <div className="status-pill">Live demo ready</div>
          <div className="panel-grid">
            {statCards.map((stat) => (
              <article key={stat.label} className="stat-card">
                <span>{stat.label}</span>
                <strong>{String(stat.value)}</strong>
                <small>{stat.delta}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="content-grid">
        <article className="surface">
          <div className="section-header">
            <h2>Issue queue</h2>
            <span>{issues.length} items</span>
          </div>

          <div className="filters">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search issues..."
            />
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="todo">Todo</option>
              <option value="in_progress">In Progress</option>
              <option value="in_review">In Review</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
            </select>
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="all">All priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div className="issue-list">
            {loading ? (
              <p className="empty-state">Loading issues…</p>
            ) : issues.length === 0 ? (
              <p className="empty-state">No issues match the current filter.</p>
            ) : (
              issues.map((issue: Issue) => (
                <div key={issue.id} className="issue-row">
                  <div>
                    <strong>{issue.slug}</strong>
                    <p>{issue.title}</p>
                    <small>{issue.project_name ?? "Platform"}</small>
                  </div>
                  <div className="issue-meta">
                    <span>{formatStatus(issue.status)}</span>
                    <span>{issue.priority}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="surface">
          <div className="section-header">
            <h2>Activity feed</h2>
            <span>Team timeline</span>
          </div>
          <ul className="activity-list">
            {activity.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
