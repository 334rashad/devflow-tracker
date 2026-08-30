from datetime import timedelta
import random

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.text import slugify

from apps.core.models import ActivityLog, Issue, Project, TeamMember


class Command(BaseCommand):
    help = "Seed the database with demo data for DevFlow & BugSync."

    def add_arguments(self, parser):
        parser.add_argument(
            "--count",
            type=int,
            default=0,
            help="Number of extra randomly generated issues to create in addition to the curated demo set.",
        )

    def handle(self, *args, **options):
        lead, _ = TeamMember.objects.get_or_create(
            email="lead@devflow.local",
            defaults={"name": "Ava Chen", "role": "Engineering Lead"},
        )
        designer, _ = TeamMember.objects.get_or_create(
            email="design@devflow.local",
            defaults={"name": "Noah Patel", "role": "Product Designer"},
        )
        backend, _ = TeamMember.objects.get_or_create(
            email="backend@devflow.local",
            defaults={"name": "Mina Ortiz", "role": "Backend Engineer"},
        )

        platform, _ = Project.objects.get_or_create(
            key="platform",
            defaults={
                "name": "Platform Reliability",
                "description": "Keep the engineering toolchain stable and observable.",
                "owner": lead,
            },
        )
        analytics, _ = Project.objects.get_or_create(
            key="analytics",
            defaults={
                "name": "Delivery Analytics",
                "description": "Surface engineering health metrics for the team.",
                "owner": lead,
            },
        )

        seed_issues = [
            (platform, "BUG-214", "Fix flaky auth refresh flow", Issue.Status.IN_REVIEW, Issue.Priority.HIGH, backend),
            (platform, "BUG-203", "Resolve stale metrics cache", Issue.Status.BLOCKED, Issue.Priority.CRITICAL, backend),
            (analytics, "FEAT-118", "Add team velocity dashboard", Issue.Status.IN_PROGRESS, Issue.Priority.MEDIUM, designer),
            (analytics, "FEAT-125", "Create release trend chart", Issue.Status.TODO, Issue.Priority.LOW, None),
        ]

        created_issues = []
        for project, slug, title, status, priority, assignee in seed_issues:
            issue, _ = Issue.objects.update_or_create(
                slug=slug,
                defaults={
                    "project": project,
                    "title": title,
                    "description": f"Seeded issue for {slug}.",
                    "status": status,
                    "priority": priority,
                    "assignee": assignee,
                    "due_date": timezone.localdate() + timedelta(days=7),
                },
            )
            created_issues.append(issue)

        ActivityLog.objects.get_or_create(
            issue=created_issues[0],
            action="Moved to review",
            defaults={"actor": lead, "details": {"from": "in_progress", "to": "in_review"}},
        )
        ActivityLog.objects.get_or_create(
            issue=created_issues[1],
            action="Blocked by stale cache invalidation",
            defaults={"actor": backend, "details": {"severity": "high"}},
        )
        ActivityLog.objects.get_or_create(
            issue=created_issues[2],
            action="Dashboard wireframe approved",
            defaults={"actor": designer, "details": {"status": "ready"}},
        )

        extra_count = options["count"]
        if extra_count > 0:
            self.create_bulk_issues(extra_count, [platform, analytics], [lead, designer, backend])

        self.stdout.write(self.style.SUCCESS("Seed data created successfully."))

    def create_bulk_issues(self, count, projects, members):
        subjects = [
            "search index", "billing webhook", "auth refresh", "release pipeline", "cache layer",
            "notification queue", "onboarding flow", "rate limiter", "export job", "dashboard widget",
            "session store", "audit log", "file upload", "email digest", "permission check",
        ]
        verbs = [
            "Fix flaky", "Improve", "Investigate", "Refactor", "Add monitoring for",
            "Optimize", "Stabilize", "Document", "Harden", "Clean up",
        ]
        statuses = list(Issue.Status)
        priorities = list(Issue.Priority)

        existing_slugs = set(Issue.objects.values_list("slug", flat=True))
        today = timezone.localdate()
        bulk_issues = []

        for index in range(count):
            title = f"{random.choice(verbs)} {random.choice(subjects)} #{index + 1}"
            base_slug = slugify(title)[:130] or f"issue-{index + 1}"
            slug = base_slug
            suffix = 2
            while slug in existing_slugs:
                slug = f"{base_slug[:120]}-{suffix}"
                suffix += 1
            existing_slugs.add(slug)

            bulk_issues.append(
                Issue(
                    project=random.choice(projects),
                    title=title,
                    slug=slug,
                    description=f"Auto-generated demo issue #{index + 1} for load testing the dashboard.",
                    status=random.choice(statuses),
                    priority=random.choice(priorities),
                    assignee=random.choice(members + [None]),
                    due_date=today + timedelta(days=random.randint(-10, 30)),
                )
            )

        Issue.objects.bulk_create(bulk_issues)
        self.stdout.write(self.style.SUCCESS(f"Created {count} additional demo issues."))