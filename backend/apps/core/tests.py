from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.core.models import ActivityLog, Issue, Project, TeamMember


class IssueApiTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="ava", password="secret123")
        self.member = TeamMember.objects.create(
            user=self.user,
            name="Ava Chen",
            role="Lead",
            email="ava@devflow.local",
        )
        self.project = Project.objects.create(name="Platform", key="platform", owner=self.member)
        self.issue = Issue.objects.create(
            project=self.project,
            title="Fix flaky auth refresh flow",
            slug="fix-flaky-auth-refresh-flow",
            description="Auth refresh triggers duplicate calls under load.",
            status=Issue.Status.IN_REVIEW,
            priority=Issue.Priority.HIGH,
            assignee=self.member,
        )
        Issue.objects.create(
            project=self.project,
            title="Improve deployment dashboard",
            slug="improve-deployment-dashboard",
            description="Add release metrics to the dashboard.",
            status=Issue.Status.TODO,
            priority=Issue.Priority.MEDIUM,
            assignee=self.member,
        )
        self.client.force_authenticate(user=self.user)

    def test_issue_search_filters_by_keyword(self):
        response = self.client.get(reverse("issue-list"), {"search": "auth"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["title"], self.issue.title)

    def test_issue_filter_filters_by_status(self):
        response = self.client.get(reverse("issue-list"), {"status": Issue.Status.IN_REVIEW})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["status"], Issue.Status.IN_REVIEW)

    def test_delivery_analytics_returns_scoped_health_metrics(self):
        response = self.client.get(reverse("delivery-analytics"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status_distribution"], [
            {"status": "todo", "count": 1},
            {"status": "in_progress", "count": 0},
            {"status": "in_review", "count": 1},
            {"status": "blocked", "count": 0},
            {"status": "done", "count": 0},
        ])
        self.assertEqual(response.data["workload"], [{"member": "Ava Chen", "active_issues": 2}])
        self.assertEqual(response.data["risks"], {"blocked_issues": 0, "overdue_issues": 0, "completion_rate": 0})

    def test_issue_status_update_creates_activity_log(self):
        response = self.client.patch(
            reverse("issue-detail", kwargs={"pk": self.issue.pk}),
            {"status": Issue.Status.DONE},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            ActivityLog.objects.filter(
                issue=self.issue,
                action="Status updated",
                details__from=Issue.Status.IN_REVIEW,
                details__to=Issue.Status.DONE,
            ).exists()
        )

    def test_issue_detail_update_creates_activity_entries(self):
        response = self.client.patch(
            reverse("issue-detail", kwargs={"pk": self.issue.pk}),
            {
                "title": "Stabilize auth refresh flow",
                "description": "Remove duplicate refresh calls under load.",
                "priority": Issue.Priority.CRITICAL,
                "due_date": "2026-09-15",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entries = ActivityLog.objects.filter(issue=self.issue).values_list("action", flat=True)
        self.assertCountEqual(
            entries,
            [
                "Issue title updated",
                "Issue description updated",
                "Issue priority updated",
                "Issue due date updated",
            ],
        )

    def test_issue_create_generates_slug_and_activity_log(self):
        response = self.client.post(
            reverse("issue-list"),
            {
                "project": self.project.pk,
                "title": "Investigate delayed webhooks",
                "description": "Find the source of delivery lag.",
                "status": Issue.Status.TODO,
                "priority": Issue.Priority.HIGH,
                "assignee": self.member.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["slug"], "investigate-delayed-webhooks")
        self.assertTrue(
            ActivityLog.objects.filter(
                issue_id=response.data["id"],
                action="Issue created",
            ).exists()
        )

    def test_staff_can_create_member_with_login_account(self):
        staff_user = get_user_model().objects.create_user(
            username="admin",
            password="admin123",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff_user)

        response = self.client.post(
            reverse("team-member-list"),
            {
                "name": "Jordan Lee",
                "role": "QA Engineer",
                "email": "jordan@devflow.local",
                "login_username": "jordan",
                "password": "testpass123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["username"], "jordan")
        self.assertTrue(get_user_model().objects.get(username="jordan").check_password("testpass123"))

    def test_regular_user_cannot_create_team_member(self):
        response = self.client.post(
            reverse("team-member-list"),
            {
                "name": "Jordan Lee",
                "role": "QA Engineer",
                "email": "jordan@devflow.local",
                "login_username": "jordan",
                "password": "testpass123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_login_endpoint_sets_csrf_cookie(self):
        response = self.client.get(reverse("auth-login"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("csrftoken", response.cookies)

    def test_login_session_bootstrap_returns_current_user(self):
        response = self.client.get(reverse("auth-login"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["authenticated"])
        self.assertEqual(response.data["user"]["username"], self.user.username)
        self.assertFalse(response.data["user"]["is_staff"])

    def test_logout_clears_authenticated_session(self):
        self.client.force_authenticate(user=None)
        self.assertTrue(self.client.login(username="ava", password="secret123"))

        response = self.client.post(reverse("auth-logout"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["authenticated"])
        self.assertFalse(self.client.get(reverse("auth-login")).data["authenticated"])

    def test_login_endpoint_authenticates_user_and_scopes_issues(self):
        login_client = APIClient()
        login_response = login_client.post(
            reverse("auth-login"),
            {"username": "ava", "password": "secret123"},
            format="json",
        )

        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        self.assertTrue(login_response.data["authenticated"])

        scoped_response = login_client.get(reverse("issue-list"))
        self.assertEqual(scoped_response.status_code, status.HTTP_200_OK)
        self.assertEqual(scoped_response.data["count"], 2)
        self.assertEqual(scoped_response.data["results"][0]["assignee_name"], "Ava Chen")

    def test_regular_user_sees_only_accessible_projects(self):
        other_member = TeamMember.objects.create(
            name="Noah Patel",
            role="Designer",
            email="noah@devflow.local",
        )
        Project.objects.create(name="Private", key="private", owner=other_member)

        response = self.client.get(reverse("project-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["key"], self.project.key)

    def test_project_member_can_see_project_issues(self):
        member_user = get_user_model().objects.create_user(username="noah", password="secret123")
        member = TeamMember.objects.create(
            user=member_user,
            name="Noah Patel",
            role="Designer",
            email="noah@devflow.local",
        )
        self.project.members.add(member)
        self.client.force_authenticate(user=member_user)

        response = self.client.get(reverse("issue-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_regular_user_cannot_create_or_edit_projects(self):
        contributor_user = get_user_model().objects.create_user(username="noah", password="secret123")
        create_response = self.client.post(
            reverse("project-list"),
            {"name": "New project", "key": "new-project", "owner": self.member.pk},
            format="json",
        )
        self.client.force_authenticate(user=contributor_user)
        edit_response = self.client.patch(
            reverse("project-detail", kwargs={"pk": self.project.pk}),
            {"name": "Renamed project"},
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(edit_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_issue_cannot_be_assigned_to_non_project_member(self):
        other_member = TeamMember.objects.create(
            name="Noah Patel",
            role="Designer",
            email="noah@devflow.local",
        )

        response = self.client.patch(
            reverse("issue-detail", kwargs={"pk": self.issue.pk}),
            {"assignee": other_member.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("assignee", response.data)

    def test_activity_log_is_read_only(self):
        response = self.client.post(
            reverse("activity-list"),
            {"issue": self.issue.pk, "action": "Forged change"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
