import { useEffect, useState } from "react";

type Issue = {
  id: number;
  title: string;
  slug: string;
  status: string;
  priority: string;
  project?: number;
  project_name?: string;
  assignee?: number | null;
  assignee_name?: string;
  description?: string;
  due_date?: string | null;
};

type Project = {
  id: number;
  name: string;
  key: string;
  description: string;
  owner: number;
  owner_name: string;
  members: number[];
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

type AnalyticsEntry = {
  status?: string;
  priority?: string;
  count: number;
};

type DeliveryAnalytics = {
  status_distribution: AnalyticsEntry[];
  priority_distribution: AnalyticsEntry[];
  project_health: Array<{ project: string; total_issues: number; blocked_issues: number; completion_rate: number }>;
  workload: Array<{ member: string; active_issues: number }>;
  risks: { blocked_issues: number; overdue_issues: number; completion_rate: number };
};

const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
const apiBase = (() => {
  if (!configuredApiBase) return `http://${window.location.hostname}:8000/api`;

  const configuredUrl = new URL(configuredApiBase);
  if (configuredUrl.hostname === "localhost" || configuredUrl.hostname === "127.0.0.1") {
    configuredUrl.hostname = window.location.hostname;
  }
  return configuredUrl.toString().replace(/\/$/, "");
})();

const getCsrfToken = () => {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("csrftoken="));

  return cookie ? cookie.split("=")[1] : "";
};

const formatStatus = (value: string) => value.replace(/_/g, " ");

const formatApiError = (payload: unknown, fallback: string) => {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    const messages = Object.values(payload as Record<string, unknown>).flatMap((value) =>
      Array.isArray(value) ? value.map(String) : [String(value)],
    );
    if (messages.length > 0) return messages.join(" ");
  }
  return fallback;
};

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
  const [analytics, setAnalytics] = useState<DeliveryAnalytics | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [issuesPage, setIssuesPage] = useState(1);
  const [issuesCount, setIssuesCount] = useState(0);
  const [hasMoreIssues, setHasMoreIssues] = useState(false);
  const [loadingMoreIssues, setLoadingMoreIssues] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const [createError, setCreateError] = useState("");
  const [isEditingIssue, setIsEditingIssue] = useState(false);
  const [editError, setEditError] = useState("");
  const [editIssue, setEditIssue] = useState({
    title: "",
    description: "",
    project: "",
    priority: "medium",
    assignee: "",
    due_date: "",
  });
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
  const [isManagingProject, setIsManagingProject] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [projectDraft, setProjectDraft] = useState({
    id: null as number | null,
    name: "",
    key: "",
    description: "",
    owner: "",
    members: [] as number[],
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
    if (projectId !== "all") query.set("project", projectId);

    const issueQuery = query.toString() ? `?${query.toString()}` : "";

    setLoading(true);
    try {
      const projectQuery = projectId === "all" ? "" : `?project=${projectId}`;
      const activityQuery = projectId === "all" ? "?page_size=5" : `?project=${projectId}&page_size=5`;
      const [issuesRes, statsRes, activityRes, projectsRes, teamMembersRes, analyticsRes] = await Promise.all([
        fetchJson(`/issues/${issueQuery}`),
        fetchJson(`/dashboard/`),
        fetchJson(`/activity/${activityQuery}`),
        fetchJson(`/projects/`),
        fetchJson(`/team-members/`),
        fetchJson(`/analytics/${projectQuery}`),
      ]);

      const issuesPayload = await issuesRes.json();
      const statsPayload = await statsRes.json();
      const activityPayload = await activityRes.json();
      const projectsPayload = await projectsRes.json();
      const teamMembersPayload = await teamMembersRes.json();
      const analyticsPayload = await analyticsRes.json();

      const nextIssues = normalizeList<Issue>(issuesPayload);
      const nextProjects = normalizeList<Project>(projectsPayload);
      setIssues(nextIssues);
      setIssuesPage(1);
      setIssuesCount(typeof issuesPayload?.count === "number" ? issuesPayload.count : nextIssues.length);
      setHasMoreIssues(Boolean(issuesPayload?.next));
      setStats(statsPayload ?? {});
      setActivity(normalizeList<Record<string, unknown>>(activityPayload));
      setProjects(nextProjects);
      setTeamMembers(normalizeList<TeamMember>(teamMembersPayload));
      setAnalytics(analyticsPayload);
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

  const loadMoreIssues = async () => {
    const nextPage = issuesPage + 1;
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (status !== "all") query.set("status", status);
    if (priority !== "all") query.set("priority", priority);
    if (projectId !== "all") query.set("project", projectId);
    query.set("page", String(nextPage));

    setLoadingMoreIssues(true);
    try {
      const response = await fetchJson(`/issues/?${query.toString()}`);
      const payload = await response.json();
      const nextIssues = normalizeList<Issue>(payload);
      setIssues((current) => [...current, ...nextIssues]);
      setIssuesPage(nextPage);
      setHasMoreIssues(Boolean(payload?.next));
    } catch (error) {
      console.error("Failed to load more issues", error);
    } finally {
      setLoadingMoreIssues(false);
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
      } finally {
        setIsAuthenticated((current) => current ?? false);
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
  }, [search, status, priority, projectId, isAuthenticated]);

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
      await loadData();
      return updated as Issue;
    } catch (error) {
      console.error("Failed to update issue", error);
      throw error;
    }
  };

  const beginEditingIssue = () => {
    if (!selectedIssue) return;
    setEditError("");
    setEditIssue({
      title: selectedIssue.title,
      description: selectedIssue.description ?? "",
      project: String(selectedIssue.project ?? ""),
      priority: selectedIssue.priority,
      assignee: selectedIssue.assignee ? String(selectedIssue.assignee) : "",
      due_date: selectedIssue.due_date ?? "",
    });
    setIsEditingIssue(true);
  };

  const saveIssueEdits = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedIssue || !editIssue.title.trim() || !editIssue.project) {
      setEditError("A title and project are required.");
      return;
    }

    try {
      await updateIssue({
        title: editIssue.title.trim(),
        description: editIssue.description.trim(),
        project: Number(editIssue.project),
        priority: editIssue.priority,
        assignee: editIssue.assignee ? Number(editIssue.assignee) : null,
        due_date: editIssue.due_date || null,
      });
      setIsEditingIssue(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to save issue changes.");
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
      if (!response.ok) {
        throw new Error(formatApiError(created, "Failed to create the member account."));
      }
      setTeamMembers((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
      setDraftMember({ name: "", role: "", email: "", login_username: "", password: "" });
      setIsManagingTeam(false);
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Failed to create the member account.");
    }
  };

  const beginCreatingProject = () => {
    setProjectError("");
    setProjectDraft({
      id: null,
      name: "",
      key: "",
      description: "",
      owner: teamMembers[0] ? String(teamMembers[0].id) : "",
      members: [],
    });
    setIsManagingProject(true);
  };

  const beginEditingProject = (project: Project) => {
    setProjectError("");
    setProjectDraft({
      id: project.id,
      name: project.name,
      key: project.key,
      description: project.description,
      owner: String(project.owner),
      members: project.members,
    });
    setIsManagingProject(true);
  };

  const toggleProjectMember = (memberId: number) => {
    setProjectDraft((current) => ({
      ...current,
      members: current.members.includes(memberId)
        ? current.members.filter((id) => id !== memberId)
        : [...current.members, memberId],
    }));
  };

  const saveProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProjectError("");
    if (!projectDraft.name.trim() || !projectDraft.key.trim() || !projectDraft.owner) {
      setProjectError("A name, key, and owner are required.");
      return;
    }

    try {
      const response = await fetchJson(projectDraft.id ? `/projects/${projectDraft.id}/` : "/projects/", {
        method: projectDraft.id ? "PATCH" : "POST",
        headers: { "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({
          name: projectDraft.name.trim(),
          key: projectDraft.key.trim().toLowerCase(),
          description: projectDraft.description.trim(),
          owner: Number(projectDraft.owner),
          members: projectDraft.members,
        }),
      });
      const saved = await response.json();
      if (!response.ok) throw new Error(formatApiError(saved, "Failed to save the project."));

      setIsManagingProject(false);
      selectProject(String(saved.id));
      await loadData();
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Failed to save the project.");
    }
  };

  const handleLogout = async () => {
    try {
      await fetchJson(`/auth/logout/`, {
        method: "POST",
        headers: { "X-CSRFToken": getCsrfToken() },
      });
    } catch (error) {
      console.error("Failed to end session", error);
    } finally {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setSelectedIssueId(null);
      setSelectedIssue(null);
      setIssues([]);
      setActivity([]);
      setAnalytics(null);
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
    activeIssues: analytics?.workload.find((entry) => entry.member === member.name)?.active_issues ?? 0,
  }));
  const maxStatusCount = Math.max(...(analytics?.status_distribution.map((entry) => entry.count) ?? [1]), 1);
  const maxPriorityCount = Math.max(...(analytics?.priority_distribution.map((entry) => entry.count) ?? [1]), 1);
  const selectedProject = projectId === "all" ? null : projects.find((project) => project.id === Number(projectId));

  const selectProject = (nextProjectId: string) => {
    setProjectId(nextProjectId);
    setSelectedIssueId(null);
    setDraftIssue((current) => ({ ...current, project: nextProjectId === "all" ? current.project : nextProjectId }));
  };

  if (isAuthenticated === null) {
    return (
      <main className="app-shell auth-shell">
        <div className="auth-card surface session-loading">Restoring your workspace...</div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="app-shell auth-shell">
        <div className="auth-card surface">
          <p className="eyebrow">DevFlow & BugSync</p>
          <h1>Sign in to your engineering workspace</h1>
          <form onSubmit={handleLogin} className="auth-form">
            <label>
              Username
              <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {authError ? <p className="auth-error">{authError}</p> : null}

            <button type="submit" disabled={authLoading}>
              {authLoading ? "Signing in..." : "Log in"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="session-bar">
        <span>Signed in as <strong>{currentUser?.username}</strong>{currentUser?.is_staff ? " (admin)" : ""}</span>
        <button type="button" className="text-button" onClick={handleLogout}>Log out</button>
      </div>
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
            <h2>{selectedProject ? `${selectedProject.name} issues` : "Issue queue"}</h2>
            <div className="section-actions">
              <span>{issuesCount} total</span>
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
            <select value={projectId} onChange={(event) => selectProject(event.target.value)} aria-label="Filter by project">
              <option value="all">All projects</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
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
              <p className="empty-state">
                {search || status !== "all" || priority !== "all"
                  ? "No issues match your search or filters. Try clearing them."
                  : "No issues yet. Use \"New issue\" to create the first one."}
              </p>
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

          {hasMoreIssues ? (
            <button type="button" className="command-button load-more-button" onClick={loadMoreIssues} disabled={loadingMoreIssues}>
              {loadingMoreIssues ? "Loading…" : `Load more (${issueList.length} of ${issuesCount})`}
            </button>
          ) : null}
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
                <div className="detail-header-actions">
                  <span className={`detail-badge priority-${selectedIssue.priority}`}>{selectedIssue.priority}</span>
                  <button type="button" className="text-button" onClick={beginEditingIssue}>Edit</button>
                </div>
              </div>

              {isEditingIssue ? (
                <form className="issue-form detail-edit-form" onSubmit={saveIssueEdits}>
                  <label>Title<input value={editIssue.title} onChange={(event) => setEditIssue((current) => ({ ...current, title: event.target.value }))} /></label>
                  <label>Description<textarea value={editIssue.description} onChange={(event) => setEditIssue((current) => ({ ...current, description: event.target.value }))} /></label>
                  <div className="issue-form-grid">
                    <label>Project<select value={editIssue.project} onChange={(event) => setEditIssue((current) => ({ ...current, project: event.target.value }))}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                    <label>Priority<select value={editIssue.priority} onChange={(event) => setEditIssue((current) => ({ ...current, priority: event.target.value }))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
                    <label>Due date<input type="date" value={editIssue.due_date} onChange={(event) => setEditIssue((current) => ({ ...current, due_date: event.target.value }))} /></label>
                  </div>
                  <label>Assignee<select value={editIssue.assignee} onChange={(event) => setEditIssue((current) => ({ ...current, assignee: event.target.value }))}><option value="">Unassigned</option>{teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
                  {editError ? <p className="auth-error">{editError}</p> : null}
                  <div className="form-actions"><button type="button" className="text-button" onClick={() => setIsEditingIssue(false)}>Cancel</button><button className="command-button" type="submit">Save changes</button></div>
                </form>
              ) : <>
                <div className="detail-meta">
                  <span>{selectedIssue.project_name ?? "Platform"}</span>
                  <span>{selectedIssue.assignee_name ?? "Unassigned"}</span>
                  <span>{selectedIssue.due_date ? `Due ${selectedIssue.due_date}` : "No due date"}</span>
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
              </>}
            </div>
          ) : (
            <p className="empty-state">Select an issue to review details and update its workflow.</p>
          )}
        </article>
        <article className="surface project-panel">
          <div className="section-header">
            <div>
              <h2>Projects</h2>
              <span>{selectedProject ? `${selectedProject.name} selected` : "Accessible workspaces"}</span>
            </div>
            {selectedProject ? (
              <button type="button" className="text-button" onClick={() => selectProject("all")}>Show all</button>
            ) : null}
            {currentUser?.is_staff ? (
              <button type="button" className="command-button" onClick={beginCreatingProject}>New project</button>
            ) : null}
          </div>
          {isManagingProject ? (
            <form className="issue-form project-form" onSubmit={saveProject}>
              <div className="form-actions project-form-actions">
                <strong>{projectDraft.id ? "Edit project" : "New project"}</strong>
                <button type="button" className="text-button" onClick={() => setIsManagingProject(false)}>Cancel</button>
              </div>
              <div className="issue-form-grid">
                <label>Name<input value={projectDraft.name} onChange={(event) => setProjectDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                <label>Key<input value={projectDraft.key} onChange={(event) => setProjectDraft((current) => ({ ...current, key: event.target.value }))} placeholder="platform" /></label>
                <label>Owner<select value={projectDraft.owner} onChange={(event) => setProjectDraft((current) => ({ ...current, owner: event.target.value }))}><option value="">Select owner</option>{teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
              </div>
              <label>Description<textarea value={projectDraft.description} onChange={(event) => setProjectDraft((current) => ({ ...current, description: event.target.value }))} /></label>
              <fieldset className="member-selector">
                <legend>Project members</legend>
                <div>{teamMembers.map((member) => <label key={member.id}><input type="checkbox" checked={projectDraft.members.includes(member.id)} onChange={() => toggleProjectMember(member.id)} />{member.name}</label>)}</div>
              </fieldset>
              {projectError ? <p className="auth-error">{projectError}</p> : null}
              <button className="command-button" type="submit">{projectDraft.id ? "Save project" : "Create project"}</button>
            </form>
          ) : null}
          <div className="project-list">
            {projects.length === 0 ? (
              <p className="empty-state">No accessible projects yet.</p>
            ) : (
              projects.map((project) => {
                const health = analytics?.project_health.find((entry) => entry.project === project.name);
                const isSelected = project.id === Number(projectId);
                return (
                  <div
                    key={project.id}
                    className={`project-card ${isSelected ? "active" : ""}`}
                  >
                    <button type="button" className="project-select" onClick={() => selectProject(String(project.id))}>
                      <div className="project-card-header">
                        <strong>{project.name}</strong>
                        <span>{project.key}</span>
                      </div>
                      <p>{project.description || "No project description provided."}</p>
                      <div className="project-card-meta">
                        <span>Owner: {project.owner_name}</span>
                        <span>{project.members.length} members</span>
                      </div>
                      <div className="project-card-health">
                        <span>{health?.total_issues ?? 0} issues</span>
                        <strong>{health?.completion_rate ?? 0}% complete</strong>
                        {health?.blocked_issues ? <em>{health.blocked_issues} blocked</em> : null}
                      </div>
                    </button>
                    {currentUser?.is_staff ? (
                      <button type="button" className="project-edit" onClick={() => beginEditingProject(project)}>Edit project</button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </article>

        {selectedProject ? (
          <article className="surface project-detail-panel">
            <div className="section-header">
              <div>
                <h2>{selectedProject.name}</h2>
                <span>{selectedProject.key} project detail</span>
              </div>
              {currentUser?.is_staff ? (
                <button type="button" className="command-button" onClick={() => beginEditingProject(selectedProject)}>Edit members</button>
              ) : null}
            </div>
            <p className="project-detail-description">{selectedProject.description || "No project description provided."}</p>
            <div className="project-detail-meta">
              <span>Owner: {selectedProject.owner_name}</span>
              <span>{issuesCount} total issues</span>
              <span>{analytics?.risks.completion_rate ?? 0}% complete</span>
            </div>
            <div className="project-detail-grid">
              <div>
                <h3>Member workload</h3>
                <div className="workload-list">
                  {memberWorkload.filter((member) => member.id === selectedProject.owner || selectedProject.members.includes(member.id)).map((member) => (
                    <div className="workload-row" key={member.id}>
                      <div><strong>{member.name}</strong><small>{member.role}</small></div>
                      <span>{member.activeIssues} active</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3>Project activity</h3>
                <ul className="activity-list">
                  {activityList.length === 0 ? <li>No project activity yet.</li> : activityList.map((item) => {
                    const entry = item as { id: number; actor_name?: string; issue_slug?: string; issue_title?: string; action?: string; details?: { from?: string; to?: string } };
                    return <li key={entry.id}>{formatActivityMessage(entry)}</li>;
                  })}
                </ul>
              </div>
            </div>
          </article>
        ) : null}

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

        {analytics ? (
          <article className="surface analytics-panel">
            <div className="section-header">
              <h2>Delivery health</h2>
              <span>{analytics.risks.completion_rate}% complete</span>
            </div>
            <div className="risk-summary">
              <div><strong>{analytics.risks.blocked_issues}</strong><span>Blocked</span></div>
              <div><strong>{analytics.risks.overdue_issues}</strong><span>Overdue</span></div>
              <div><strong>{analytics.risks.completion_rate}%</strong><span>Completed</span></div>
            </div>
            <div className="analytics-grid">
              <div>
                <h3>Workflow</h3>
                <div className="distribution-list">
                  {analytics.status_distribution.map((entry) => (
                    <div className="distribution-row" key={entry.status}>
                      <span>{formatStatus(entry.status ?? "")}</span>
                      <div className="metric-track"><i style={{ width: `${entry.count / maxStatusCount * 100}%` }} /></div>
                      <strong>{entry.count}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3>Priority mix</h3>
                <div className="distribution-list">
                  {analytics.priority_distribution.map((entry) => (
                    <div className="distribution-row" key={entry.priority}>
                      <span>{formatStatus(entry.priority ?? "")}</span>
                      <div className="metric-track priority-track"><i style={{ width: `${entry.count / maxPriorityCount * 100}%` }} /></div>
                      <strong>{entry.count}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="project-health-list">
              {analytics.project_health.map((project) => (
                <div className="project-health-row" key={project.project}>
                  <div><strong>{project.project}</strong><small>{project.total_issues} issues{project.blocked_issues ? `, ${project.blocked_issues} blocked` : ""}</small></div>
                  <span>{project.completion_rate}% complete</span>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        {currentUser?.is_staff ? (
          <article className="surface team-panel">
            <div className="section-header">
              <h2>Team workload</h2>
              <button type="button" className="command-button" onClick={() => setIsManagingTeam((current) => !current)}>
                {isManagingTeam ? "Close" : "Add member"}
              </button>
            </div>

            {isManagingTeam ? (
              <form className="issue-form" onSubmit={createTeamMember} autoComplete="off">
                <div className="issue-form-grid member-form-grid">
                  <label>Full name<input value={draftMember.name} onChange={(event) => setDraftMember((current) => ({ ...current, name: event.target.value }))} placeholder="Jordan Lee" /></label>
                  <label>Role<input value={draftMember.role} onChange={(event) => setDraftMember((current) => ({ ...current, role: event.target.value }))} placeholder="QA Engineer" /></label>
                  <label>Work email<input type="email" autoComplete="off" value={draftMember.email} onChange={(event) => setDraftMember((current) => ({ ...current, email: event.target.value }))} placeholder="jordan@company.com" /></label>
                  <label>Login username<input name="new-member-username" autoComplete="new-password" value={draftMember.login_username} onChange={(event) => setDraftMember((current) => ({ ...current, login_username: event.target.value }))} placeholder="jordan.lee" /></label>
                  <label>Temporary password<input type="password" name="new-member-password" autoComplete="new-password" value={draftMember.password} onChange={(event) => setDraftMember((current) => ({ ...current, password: event.target.value }))} placeholder="At least 8 characters" /></label>
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
