import { useEffect, useState } from "react";

type Issue = {
  id: number;
  title: string;
  slug: string;
  status: string;
  priority: string;
  project_name?: string;
  assignee?: number | null;
  assignee_name?: string;
  description?: string;
};

type Project = {
  id: number;
  name: string;
};

type TeamMember = {
  id: number;
  name: string;
  role: string;
  email: string;
  username?: string;
};

type CurrentUser = {
  username: string;
  name: string | null;
  is_staff: boolean;
};

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

const getCsrfToken = () => {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("csrftoken="));

  return cookie ? cookie.split("=")[1] : "";
};

const formatStatus = (value: string) => value.replace(/_/g, " ");

const formatActivityMessage = (entry: {
  actor_name?: string;
  issue_slug?: string;
  issue_title?: string;
  action?: string;
  details?: { from?: string; to?: string };
}) => {
  const actor = entry.actor_name ?? "System";
  const issueRef = entry.issue_slug ?? entry.issue_title ?? "issue";
  const action = entry.action ?? "updated";
  const details = entry.details;

  if (details?.from && details?.to) {
    return `${actor} ${action.toLowerCase()} ${issueRef} from ${formatStatus(details.from)} to ${formatStatus(details.to)}`;
  }

  return `${actor} ${action.toLowerCase()} ${issueRef}`;
};

export default function App() {
  const [stats, setStats] = useState<{ [key: string]: number | string }>({});
  const [issues, setIssues] = useState<Issue[]>([]);
  const [activity, setActivity] = useState<Array<Record<string, unknown>>>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const [createError, setCreateError] = useState("");
  const [draftIssue, setDraftIssue] = useState({
    title: "",
    description: "",
    project: "",
    priority: "medium",
    assignee: "",
  });
  const [isManagingTeam, setIsManagingTeam] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [draftMember, setDraftMember] = useState({
    name: "",
    role: "",
    email: "",
    login_username: "",
    password: "",
  });

  const fetchJson = async (input: string, init: RequestInit = {}) => {
    const response = await fetch(`${apiBase}${input}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (response.status === 401 || response.status === 403) {
      setIsAuthenticated(false);
      throw new Error("Session expired or unauthorized.");
    }

    return response;
  };

  const normalizeList = <T,>(payload: unknown): T[] => {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && typeof payload === "object" && "results" in payload) {
      const results = (payload as { results?: T[] }).results;
      return Array.isArray(results) ? results : [];
    }
    return [];
  };

  const loadData = async () => {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (status !== "all") query.set("status", status);
    if (priority !== "all") query.set("priority", priority);

    const issueQuery = query.toString() ? `?${query.toString()}` : "";

    setLoading(true);
    try {
      const [issuesRes, statsRes, activityRes, projectsRes, teamMembersRes] = await Promise.all([
        fetchJson(`/issues/${issueQuery}`),
        fetchJson(`/dashboard/`),
        fetchJson(`/activity/?page_size=5`),
        fetchJson(`/projects/`),
        fetchJson(`/team-members/`),
      ]);

      const issuesPayload = await issuesRes.json();
      const statsPayload = await statsRes.json();
      const activityPayload = await activityRes.json();
      const projectsPayload = await projectsRes.json();
      const teamMembersPayload = await teamMembersRes.json();

      const nextIssues = normalizeList<Issue>(issuesPayload);
      const nextProjects = normalizeList<Project>(projectsPayload);
      setIssues(nextIssues);
      setStats(statsPayload ?? {});
      setActivity(normalizeList<Record<string, unknown>>(activityPayload));
      setProjects(nextProjects);
      setTeamMembers(normalizeList<TeamMember>(teamMembersPayload));
      setDraftIssue((current) =>
        current.project || nextProjects.length === 0
          ? current
          : { ...current, project: String(nextProjects[0].id) },
      );

      if (!selectedIssueId || !nextIssues.some((issue: Issue) => issue.id === selectedIssueId)) {
        setSelectedIssueId(nextIssues[0]?.id ?? null);
      }
    } catch (error) {
      console.error("Failed to load DevFlow data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const bootstrapSession = async () => {
      try {
        const response = await fetch(`${apiBase}/auth/login/`, {
          credentials: "include",
        });

        if (response.ok) {
          const payload = await response.json();
          if (payload.authenticated) {
            setIsAuthenticated(true);
            setCurrentUser(payload.user ?? null);
          }
        }
      } catch (error) {
        console.warn("Session bootstrap not available yet.", error);
      }
    };

    bootstrapSession();
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const response = await fetch(`${apiBase}/auth/login/`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.authenticated) {
        throw new Error(payload.error ?? "Failed to sign in.");
      }

      setIsAuthenticated(true);
      setCurrentUser(payload.user ?? null);
      await loadData();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to sign in.");
      setIsAuthenticated(false);
      setCurrentUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadData();
  }, [search, status, priority, isAuthenticated]);

  useEffect(() => {
    if (!selectedIssueId || !isAuthenticated) {
      setSelectedIssue(null);
      return;
    }

    async function loadIssue() {
      try {
        const response = await fetchJson(`/issues/${selectedIssueId}/`);
        const issue = await response.json();
        setSelectedIssue(issue);
      } catch (error) {
        console.error("Failed to load issue detail", error);
      }
    }

    loadIssue();
  }, [selectedIssueId, isAuthenticated]);

  const updateIssue = async (changes: Partial<Issue>) => {
    if (!selectedIssue) return;

    try {
      const response = await fetchJson(`/issues/${selectedIssue.id}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify(changes),
      });

      const updated = await response.json();
      setSelectedIssue((current) => (current ? { ...current, ...updated } : current));
      setIssues((current) => current.map((issue) => (issue.id === updated.id ? { ...issue, ...updated } : issue)));

      const refreshedActivity = await fetchJson(`/activity/?page_size=5`);
      const nextActivity = await refreshedActivity.json();
      setActivity(normalizeList<Record<string, unknown>>(nextActivity));
    } catch (error) {
      console.error("Failed to update issue", error);
    }
  };

  const createIssue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError("");

    if (!draftIssue.title.trim() || !draftIssue.project) {
      setCreateError("A title and project are required.");
      return;
    }

    try {
      const response = await fetchJson(`/issues/`, {
        method: "POST",
        headers: { "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({
          title: draftIssue.title.trim(),
          description: draftIssue.description.trim(),
          project: Number(draftIssue.project),
          priority: draftIssue.priority,
          assignee: draftIssue.assignee ? Number(draftIssue.assignee) : null,
        }),
      });
      const created = await response.json();
      setIssues((current) => [created, ...current]);
      setSelectedIssueId(created.id);
      setDraftIssue((current) => ({ ...current, title: "", description: "", assignee: "" }));
      setIsCreatingIssue(false);
      await loadData();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create issue.");
    }
  };

  const createTeamMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMemberError("");

    if (Object.values(draftMember).some((value) => !value.trim())) {
      setMemberError("Complete every field to create a member account.");
      return;
    }

    try {
      const response = await fetchJson(`/team-members/`, {
        method: "POST",
        headers: { "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify(draftMember),
      });
      const created = await response.json();
      setTeamMembers((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
      setDraftMember({ name: "", role: "", email: "", login_username: "", password: "" });
      setIsManagingTeam(false);
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Failed to create the member account.");
    }
  };

  const issueList = Array.isArray(issues) ? issues : [];
  const activityList = Array.isArray(activity) ? activity : [];

  const statCards = [
    { label: "Open issues", value: stats.open_issues ?? 0, delta: "live queue" },
    { label: "Blocked", value: stats.blocked_issues ?? 0, delta: "needs review" },
    { label: "In progress", value: stats.in_progress_issues ?? 0, delta: "active work" },
    { label: "Projects", value: stats.projects ?? 0, delta: "tracked" },
  ];
  const memberWorkload = teamMembers.map((member) => ({
    ...member,
    activeIssues: issues.filter((issue) => issue.assignee === member.id && issue.status !== "done").length,
  }));

  if (!isAuthenticated) {
    return (
      <main className="app-shell auth-shell">
        <div className="auth-card surface">
          <p className="eyebrow">DevFlow & BugSync</p>
          <h1>Sign in to your engineering workspace</h1>
          <form onSubmit={handleLogin} className="auth-form">
            <label>
              Username
              <input value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {authError ? <p className="auth-error">{authError}</p> : null}

            <button type="submit" disabled={authLoading}>
              {authLoading ? "Signing in..." : "Log in"}
            </button>
          </form>

          <p className="auth-hint">Demo account: admin / admin123</p>
        </div>
      </main>
    );
  }

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
            <div className="section-actions">
              <span>{issueList.length} items</span>
              <button type="button" className="command-button" onClick={() => setIsCreatingIssue((current) => !current)}>
                {isCreatingIssue ? "Close" : "New issue"}
              </button>
            </div>
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

          {isCreatingIssue ? (
            <form className="issue-form" onSubmit={createIssue}>
              <input
                value={draftIssue.title}
                onChange={(event) => setDraftIssue((current) => ({ ...current, title: event.target.value }))}
                placeholder="Issue title"
              />
              <div className="issue-form-grid">
                <select
                  value={draftIssue.project}
                  onChange={(event) => setDraftIssue((current) => ({ ...current, project: event.target.value }))}
                >
                  <option value="">Select project</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
                <select
                  value={draftIssue.priority}
                  onChange={(event) => setDraftIssue((current) => ({ ...current, priority: event.target.value }))}
                >
                  <option value="low">Low priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="high">High priority</option>
                  <option value="critical">Critical priority</option>
                </select>
                <select
                  value={draftIssue.assignee}
                  onChange={(event) => setDraftIssue((current) => ({ ...current, assignee: event.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </div>
              <textarea
                value={draftIssue.description}
                onChange={(event) => setDraftIssue((current) => ({ ...current, description: event.target.value }))}
                placeholder="Add context, acceptance criteria, or the observed behavior..."
              />
              {createError ? <p className="auth-error">{createError}</p> : null}
              <button className="command-button" type="submit">Create issue</button>
            </form>
          ) : null}

          <div className="issue-list">
            {loading ? (
              <p className="empty-state">Loading issues…</p>
            ) : issueList.length === 0 ? (
              <p className="empty-state">No issues match the current filter.</p>
            ) : (
              issueList.map((issue: Issue) => (
                <button
                  key={issue.id}
                  type="button"
                  className={`issue-row ${selectedIssueId === issue.id ? "active" : ""}`}
                  onClick={() => setSelectedIssueId(issue.id)}
                >
                  <div>
                    <strong>{issue.slug}</strong>
                    <p>{issue.title}</p>
                    <small>{issue.project_name ?? "Platform"}</small>
                  </div>
                  <div className="issue-meta">
                    <span>{formatStatus(issue.status)}</span>
                    <span>{issue.priority}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </article>

        <article className="surface detail-panel">
          <div className="section-header">
            <h2>Issue detail</h2>
            <span>{selectedIssue ? "Live" : "Idle"}</span>
          </div>

          {selectedIssue ? (
            <div className="detail-card">
              <div className="detail-header">
                <div>
                  <p className="detail-label">{selectedIssue.slug}</p>
                  <h3>{selectedIssue.title}</h3>
                </div>
                <span className="detail-badge">{selectedIssue.priority}</span>
              </div>

              <div className="detail-meta">
                <span>{selectedIssue.project_name ?? "Platform"}</span>
                <span>{selectedIssue.assignee_name ?? "Unassigned"}</span>
              </div>

              <p className="detail-description">
                {selectedIssue.description || "No additional description provided."}
              </p>

              <div className="detail-actions">
                <label>
                  Status
                  <select
                    value={selectedIssue.status}
                    onChange={(event) => updateIssue({ status: event.target.value })}
                  >
                    <option value="todo">Todo</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </select>
                </label>
                <label>
                  Assignee
                  <select
                    value={selectedIssue.assignee ?? ""}
                    onChange={(event) => updateIssue({ assignee: event.target.value ? Number(event.target.value) : null })}
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </select>
                </label>
              </div>
            </div>
          ) : (
            <p className="empty-state">Select an issue to review details and update its workflow.</p>
          )}
        </article>

        <article className="surface">
          <div className="section-header">
            <h2>Activity feed</h2>
            <span>Team timeline</span>
          </div>
          <ul className="activity-list">
            {activityList.length === 0 ? (
              <li>No activity yet.</li>
            ) : (
              activityList.map((item) => {
                const entry = item as {
                  id: number;
                  actor_name?: string;
                  issue_slug?: string;
                  issue_title?: string;
                  action?: string;
                  details?: { from?: string; to?: string };
                };

                return <li key={entry.id}>{formatActivityMessage(entry)}</li>;
              })
            )}
          </ul>
        </article>

        {currentUser?.is_staff ? (
          <article className="surface team-panel">
            <div className="section-header">
              <h2>Team workload</h2>
              <button type="button" className="command-button" onClick={() => setIsManagingTeam((current) => !current)}>
                {isManagingTeam ? "Close" : "Add member"}
              </button>
            </div>

            {isManagingTeam ? (
              <form className="issue-form" onSubmit={createTeamMember}>
                <div className="issue-form-grid member-form-grid">
                  <input value={draftMember.name} onChange={(event) => setDraftMember((current) => ({ ...current, name: event.target.value }))} placeholder="Full name" />
                  <input value={draftMember.role} onChange={(event) => setDraftMember((current) => ({ ...current, role: event.target.value }))} placeholder="Role" />
                  <input type="email" value={draftMember.email} onChange={(event) => setDraftMember((current) => ({ ...current, email: event.target.value }))} placeholder="Work email" />
                  <input value={draftMember.login_username} onChange={(event) => setDraftMember((current) => ({ ...current, login_username: event.target.value }))} placeholder="Login username" />
                  <input type="password" value={draftMember.password} onChange={(event) => setDraftMember((current) => ({ ...current, password: event.target.value }))} placeholder="Temporary password" />
                </div>
                {memberError ? <p className="auth-error">{memberError}</p> : null}
                <button className="command-button" type="submit">Create member account</button>
              </form>
            ) : null}

            <div className="workload-list">
              {memberWorkload.map((member) => (
                <div className="workload-row" key={member.id}>
                  <div><strong>{member.name}</strong><small>{member.role}</small></div>
                  <span>{member.activeIssues} active</span>
                </div>
              ))}
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}
