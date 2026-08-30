# DevFlow & BugSync

DevFlow & BugSync is an internal engineering workspace for tracking issue delivery, team workload, and release risk. It combines a scoped issue queue with delivery-health analytics, staff account management, and an audit timeline for workflow changes.

## Highlights

- Session-authenticated React dashboard backed by Django REST Framework.
- Team-scoped issue access for regular users and full organization access for staff.
- Search, status and priority filters, issue creation, assignment, and complete issue editing.
- Activity history for creation, status, assignee, title, description, priority, project, and due-date changes.
- Delivery-health analytics for workflow distribution, priority mix, workload, project completion, blocked work, and overdue work.
- Staff-only team management that creates a Django login account and linked product profile together.

## Screenshots

**Dashboard, issue queue, activity feed, delivery health, and team workload**

![Dashboard overview](docs/screenshots/dashboard-overview.png)

**Editing an issue's title, description, project, priority, due date, and assignee**

![Issue edit form](docs/screenshots/issue-edit.png)

**Delivery-health analytics: workflow distribution, priority mix, and project completion**

![Delivery health analytics](docs/screenshots/delivery-health.png)

**Session-authenticated sign-in**

![Login screen](docs/screenshots/login-screen.png)

## Stack

- Backend: Django 5, Django REST Framework, django-filter, drf-spectacular.
- Frontend: React 18, TypeScript, Vite.
- Database: SQLite for local development, PostgreSQL supported through Docker Compose.

## Architecture

```text
React + Vite (localhost:5173)
		  |
		  | session cookie + CSRF token
		  v
Django REST API (localhost:8000/api)
		  |
		  v
SQLite locally / PostgreSQL in Docker
```

The Django `User` is the authentication account. A `TeamMember` is the application profile linked one-to-one to a user and used for issue assignment and scoped visibility.

## Run Locally

Prerequisites: Python 3.12+ and Node.js 20+.

```powershell
git clone <your-repository-url>
cd devflow-tracker
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python backend\manage.py migrate
python backend\manage.py seed_demo_data
python backend\manage.py createsuperuser
```

In a second terminal:

```powershell
cd devflow-tracker\frontend
npm install
npm run dev
```

Start the backend in the first terminal:

```powershell
python backend\manage.py runserver
```

Open the dashboard at http://localhost:5173 and the API documentation at http://localhost:8000/api/docs/.

## Demo Flow

1. Sign in with the superuser you created, or use the existing local demo account `admin` / `admin123` when available.
2. Create a new issue, assign it, and change its status.
3. Open the issue detail panel to edit title, priority, due date, project, or description.
4. Check the activity feed and delivery-health panel to see the workflow updates reflected in the product.
5. As staff, use **Team workload** to create a member and their frontend login account.

## Access Model

- Staff users can see all work, manage member accounts, and access Django Admin at http://localhost:8000/admin/.
- Team members see issues assigned to them or in projects they own.
- To switch frontend users, use the dashboard **Log out** control. Django Admin shares the same backend session, so use a private browser window or separate profile when testing two accounts simultaneously.

## Optional PostgreSQL

Start the local database container:

```powershell
docker compose up -d db
```

Then update `.env`:

```dotenv
DATABASE_URL=postgres://devflow:devflow@localhost:5432/devflow
POSTGRES_DB=devflow
POSTGRES_USER=devflow
POSTGRES_PASSWORD=devflow
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

Run migrations again after changing databases.

## Environment Variables

Copy `.env.example` to `.env` for local configuration. In a deployed environment, set `DEBUG=0`, use a strong unique `SECRET_KEY`, and set `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, and `VITE_API_BASE_URL` to the deployed URLs.

## Validation

```powershell
python backend\manage.py test apps.core.tests
cd frontend
npm run build
```

## Interview Walkthrough

A short, spoken explanation of this project, written the way I'd actually say it out loud.

> I built DevFlow & BugSync to model something I've seen in every engineering org I've worked in: a team drowning in issue trackers that show *what* is broken but never *how healthy delivery actually is*. So instead of another CRUD to-do app, I built a scoped issue tracker with a real permission model, a full audit trail, and delivery analytics on top of it — the kind of internal tool a platform team would actually own.
>
> On the backend, it's Django and Django REST Framework. The core design decision was separating **authentication** from **identity**. A Django `User` only handles login — it doesn't know about roles, workload, or ownership. A `TeamMember` is the actual product identity, linked one-to-one to a user, and every permission decision in the app is built on top of that link. Staff users see the whole organization; everyone else only sees issues they're assigned to or projects they own. That scoping isn't just applied to the issue list — the dashboard stats and the analytics endpoint reuse the exact same queryset function, because I've been burned before by dashboards that quietly leaked data other users shouldn't see.
>
> Every meaningful state change — status, assignee, title, description, priority, project, due date — writes an `ActivityLog` entry with a before-and-after value. That wasn't a requirement I was handed; I added it because in real engineering teams, "who changed what and why" is exactly the question that comes up during an incident retro, and I wanted the data model to answer that without extra tooling.
>
> On the frontend, it's React with TypeScript and Vite, talking to the API over session auth with CSRF protection — no token soup, just the same cookie-based auth Django gives you for free, wired up correctly on both sides. The trickiest real bug I hit was a stale-session UX issue: the dashboard would flash the login screen before restoring an existing session. I fixed that by treating "checking the session" as its own third state, separate from authenticated and unauthenticated, which is a small pattern, but it's the difference between an app that feels broken and one that feels intentional.
>
> If I kept building this, the next thing I'd add is role-based permissions beyond staff and non-staff — project-level leads who can manage their own team without full admin access — and I'd move the analytics aggregation into a materialized view or a scheduled job once issue volume made live aggregation too slow. I also documented the environment configuration and the Docker Postgres path so this isn't just a "works on my machine" project — someone else can clone it, set one `.env` file, and be looking at real seeded data in under five minutes.
>
> What I'd want an interviewer to take away: I don't just implement the ticket in front of me — I think about access control, auditability, and the next three people who'll touch this code, and I build accordingly.
