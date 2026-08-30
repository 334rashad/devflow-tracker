# Portfolio / LinkedIn Blurb

Short-form versions of the project story for a portfolio site, resume, or LinkedIn post. See [WALKTHROUGH.md](WALKTHROUGH.md) for the full spoken interview version.

## One-liner (resume bullet)

Built DevFlow & BugSync, a full-stack engineering issue tracker (Django REST Framework + React/TypeScript) with scoped team permissions, a complete audit trail, and delivery-health analytics — deployed with environment-based configuration for Render.

## Short version (LinkedIn post, ~90 seconds to read)

I just shipped **DevFlow & BugSync** — a full-stack engineering issue tracker built to feel like a real internal platform tool, not another to-do app.

What it does:
- Tracks issues with full CRUD, status workflow, assignment, and priority.
- Scopes visibility by team membership, not just by login — a `TeamMember` profile (not the raw `User`) drives what each person can see.
- Logs every meaningful change — status, assignee, title, description, priority, project, due date — to a real audit trail.
- Surfaces delivery-health analytics: workflow distribution, priority mix, blocked/overdue counts, and per-project completion rate.
- Lets staff create teammate accounts directly from the dashboard, with the login account and product profile created together.

Stack: Django 5 + Django REST Framework on the backend, React + TypeScript + Vite on the frontend, session auth with CSRF, SQLite locally with Postgres support for deployment, and a Vitest/RTL test suite on the frontend.

The part I'm proudest of isn't a single feature — it's the permission model. Every endpoint that touches issue data (the list, the dashboard stats, and the analytics) filters through one shared scoping function, so there's no place in the codebase where "who can see what" can quietly drift out of sync.

Code, screenshots, and a full architecture write-up: <your-repo-link-here>

## Tags

`#Django` `#React` `#TypeScript` `#DjangoRESTFramework` `#FullStackDevelopment` `#SoftwareEngineering` `#WebDevelopment`
