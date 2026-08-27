const stats = [
  { label: "Open issues", value: "18", delta: "+4 this week" },
  { label: "Avg. cycle time", value: "2.8d", delta: "-0.6d" },
  { label: "Blocked items", value: "3", delta: "needs attention" },
  { label: "Sprint health", value: "84%", delta: "on track" },
];

const issues = [
  { key: "BUG-214", title: "Fix flaky auth refresh flow", status: "In Review", priority: "High" },
  { key: "FEAT-118", title: "Add team velocity dashboard", status: "In Progress", priority: "Medium" },
  { key: "BUG-203", title: "Resolve stale metrics cache", status: "Blocked", priority: "Critical" },
];

const activity = [
  "Mia moved BUG-214 to In Review",
  "Omar added a comment to FEAT-118",
  "Sam linked a production incident to BUG-203",
];

export default function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">DevFlow & BugSync</p>
          <h1>Engineering visibility that feels like a real internal platform.</h1>
          <p className="hero-copy">
            Track issues, measure delivery health, and surface team activity in one polished workspace.
          </p>
        </div>
        <div className="hero-panel">
          <div className="status-pill">Live demo ready</div>
          <div className="panel-grid">
            {stats.map((stat) => (
              <article key={stat.label} className="stat-card">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                <small>{stat.delta}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="content-grid">
        <article className="surface">
          <div className="section-header">
            <h2>Top issues</h2>
            <span>Priority driven queue</span>
          </div>
          <div className="issue-list">
            {issues.map((issue) => (
              <div key={issue.key} className="issue-row">
                <div>
                  <strong>{issue.key}</strong>
                  <p>{issue.title}</p>
                </div>
                <div className="issue-meta">
                  <span>{issue.status}</span>
                  <span>{issue.priority}</span>
                </div>
              </div>
            ))}
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
