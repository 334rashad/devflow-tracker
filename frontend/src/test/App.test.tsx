import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);

const issuePayload = {
  count: 1,
  next: null,
  results: [
    {
      id: 1,
      title: "Fix flaky auth refresh flow",
      slug: "fix-flaky-auth-refresh-flow",
      status: "todo",
      priority: "high",
      project: 1,
      project_name: "Platform Reliability",
      assignee: null,
      assignee_name: null,
      description: "",
    },
  ],
};

const emptyAnalytics = {
  status_distribution: [],
  priority_distribution: [],
  project_health: [],
  workload: [],
  risks: { blocked_issues: 0, overdue_issues: 0, completion_rate: 0 },
};

function mockFetchRoutes(routes: Record<string, () => Promise<Response>>) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const key = Object.keys(routes).find((route) => url.includes(route.split(" ")[1]) && (route.split(" ")[0] === method));
    if (key) return routes[key]();
    throw new Error(`Unmocked request: ${method} ${url}`);
  });
}

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an error message when login fails", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchRoutes({
        "GET /auth/login/": () => jsonResponse({ authenticated: false }),
        "POST /auth/login/": () =>
          jsonResponse({ authenticated: false, error: "Invalid username or password." }, 401),
      }),
    );

    render(<App />);

    await screen.findByRole("heading", { name: /sign in to your engineering workspace/i });

    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText("Invalid username or password.")).toBeInTheDocument();
  });

  it("loads the dashboard and shows a seeded issue after a successful login", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchRoutes({
        "GET /auth/login/": () => jsonResponse({ authenticated: false }),
        "POST /auth/login/": () =>
          jsonResponse({ authenticated: true, user: { id: 1, username: "ava", name: "Ava Chen", is_staff: false } }),
        "GET /issues/1/": () => jsonResponse(issuePayload.results[0]),
        "GET /issues/": () => jsonResponse(issuePayload),
        "GET /dashboard/": () => jsonResponse({ open_issues: 1, blocked_issues: 0, in_progress_issues: 0, projects: 1 }),
        "GET /activity/": () => jsonResponse({ results: [] }),
        "GET /projects/": () => jsonResponse({ results: [{ id: 1, name: "Platform Reliability", key: "platform", description: "Keep services reliable.", owner: 1, owner_name: "Ava Chen", members: [1] }] }),
        "GET /team-members/": () => jsonResponse({ results: [] }),
        "GET /analytics/": () => jsonResponse(emptyAnalytics),
      }),
    );

    render(<App />);

    await userEvent.type(await screen.findByLabelText(/username/i), "ava");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    await screen.findByRole("heading", { name: /issue queue/i });
    expect(await screen.findAllByText("Fix flaky auth refresh flow")).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: /platform.*keep services reliable/i })).toBeInTheDocument();
  });

  it("requires a title and project before creating an issue", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchRoutes({
        "GET /auth/login/": () => jsonResponse({ authenticated: false }),
        "POST /auth/login/": () =>
          jsonResponse({ authenticated: true, user: { id: 1, username: "ava", name: "Ava Chen", is_staff: false } }),
        "GET /issues/": () => jsonResponse({ count: 0, next: null, results: [] }),
        "GET /dashboard/": () => jsonResponse({ open_issues: 0, blocked_issues: 0, in_progress_issues: 0, projects: 0 }),
        "GET /activity/": () => jsonResponse({ results: [] }),
        "GET /projects/": () => jsonResponse({ results: [] }),
        "GET /team-members/": () => jsonResponse({ results: [] }),
        "GET /analytics/": () => jsonResponse(emptyAnalytics),
      }),
    );

    render(<App />);

    await userEvent.type(await screen.findByLabelText(/username/i), "ava");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    await userEvent.click(await screen.findByRole("button", { name: /new issue/i }));
    await userEvent.click(screen.getByRole("button", { name: /create issue/i }));

    expect(await screen.findByText("A title and project are required.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Issue title")).toBeInTheDocument();
    });
  });

  it("shows project management controls to staff users", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchRoutes({
        "GET /auth/login/": () => jsonResponse({ authenticated: false }),
        "POST /auth/login/": () =>
          jsonResponse({ authenticated: true, user: { id: 1, username: "admin", name: "Admin", is_staff: true } }),
        "GET /issues/": () => jsonResponse({ count: 0, next: null, results: [] }),
        "GET /dashboard/": () => jsonResponse({ open_issues: 0, blocked_issues: 0, in_progress_issues: 0, projects: 1 }),
        "GET /activity/": () => jsonResponse({ results: [] }),
        "GET /projects/": () => jsonResponse({ results: [{ id: 1, name: "Platform Reliability", key: "platform", description: "Keep services reliable.", owner: 1, owner_name: "Ava Chen", members: [1] }] }),
        "GET /team-members/": () => jsonResponse({ results: [{ id: 1, name: "Ava Chen", role: "Lead", email: "ava@example.com" }] }),
        "GET /analytics/": () => jsonResponse(emptyAnalytics),
      }),
    );

    render(<App />);

    await userEvent.type(await screen.findByLabelText(/username/i), "admin");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    await userEvent.click(await screen.findByRole("button", { name: /new project/i }));

    expect(screen.getByText("Project members")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create project/i })).toBeInTheDocument();
  });

  it("shows scoped project detail after selecting a project", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchRoutes({
        "GET /auth/login/": () => jsonResponse({ authenticated: false }),
        "POST /auth/login/": () =>
          jsonResponse({ authenticated: true, user: { id: 1, username: "ava", name: "Ava Chen", is_staff: false } }),
        "GET /issues/": () => jsonResponse(issuePayload),
        "GET /issues/1/": () => jsonResponse(issuePayload.results[0]),
        "GET /dashboard/": () => jsonResponse({ open_issues: 1, blocked_issues: 0, in_progress_issues: 0, projects: 1 }),
        "GET /activity/": () => jsonResponse({ results: [] }),
        "GET /projects/": () => jsonResponse({ results: [{ id: 1, name: "Platform Reliability", key: "platform", description: "Keep services reliable.", owner: 1, owner_name: "Ava Chen", members: [1] }] }),
        "GET /team-members/": () => jsonResponse({ results: [{ id: 1, name: "Ava Chen", role: "Lead", email: "ava@example.com" }] }),
        "GET /analytics/": () => jsonResponse(emptyAnalytics),
      }),
    );

    render(<App />);

    await userEvent.type(await screen.findByLabelText(/username/i), "ava");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    await userEvent.click(await screen.findByRole("button", { name: /platform reliability.*keep services reliable/i }));

    expect(await screen.findByRole("heading", { name: "Platform Reliability" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Platform Reliability issues" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Project activity" })).toBeInTheDocument();
    expect(screen.getByText("1 total issues")).toBeInTheDocument();
  });
});
