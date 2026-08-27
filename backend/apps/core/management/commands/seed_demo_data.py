from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.core.models import ActivityLog, Issue, Project, TeamMember


class Command(BaseCommand):
    help = "Seed the database with demo data for DevFlow & BugSync."

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

        self.stdout.write(self.style.SUCCESS("Seed data created successfully."))