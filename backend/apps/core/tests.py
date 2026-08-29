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
