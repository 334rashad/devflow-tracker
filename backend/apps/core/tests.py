from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.core.models import Issue, Project, TeamMember


class IssueApiTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.lead = TeamMember.objects.create(name="Ava Chen", role="Lead", email="ava@example.com")
        self.project = Project.objects.create(name="Platform", key="platform", owner=self.lead)
        self.issue = Issue.objects.create(
            project=self.project,
            title="Fix flaky auth refresh flow",
            slug="fix-flaky-auth-refresh-flow",
            description="Auth refresh triggers duplicate calls under load.",
            status=Issue.Status.IN_REVIEW,
            priority=Issue.Priority.HIGH,
        )
        Issue.objects.create(
            project=self.project,
            title="Improve deployment dashboard",
            slug="improve-deployment-dashboard",
            description="Add release metrics to the dashboard.",
            status=Issue.Status.TODO,
            priority=Issue.Priority.MEDIUM,
        )

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
