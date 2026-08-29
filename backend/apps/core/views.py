from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ActivityLog, Issue, Project, TeamMember
from .serializers import ActivityLogSerializer, IssueSerializer, ProjectSerializer, TeamMemberSerializer


class TeamMemberViewSet(viewsets.ModelViewSet):
    queryset = TeamMember.objects.all().order_by("name")
    serializer_class = TeamMemberSerializer


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.select_related("owner").all().order_by("name")
    serializer_class = ProjectSerializer


class IssueViewSet(viewsets.ModelViewSet):
    queryset = Issue.objects.select_related("project", "assignee").all().order_by("-created_at")
    serializer_class = IssueSerializer
    filterset_fields = ["project", "status", "priority", "assignee"]
    search_fields = ["title", "description", "slug"]

    def perform_update(self, serializer):
        issue = self.get_object()
        previous_status = issue.status
        updated_issue = serializer.save()

        if previous_status != updated_issue.status:
            ActivityLog.objects.create(
                issue=updated_issue,
                actor=updated_issue.assignee,
                action="Status updated",
                details={"from": previous_status, "to": updated_issue.status},
            )


class ActivityLogViewSet(viewsets.ModelViewSet):
    queryset = ActivityLog.objects.select_related("issue", "actor").all().order_by("-created_at")
    serializer_class = ActivityLogSerializer
    filterset_fields = ["issue", "actor"]


class DashboardStatsView(APIView):
    def get(self, request):
        today = timezone.localdate()
        issue_counts = Issue.objects.aggregate(
            open_issues=Count("id", filter=~Q(status=Issue.Status.DONE)),
            blocked_issues=Count("id", filter=Q(status=Issue.Status.BLOCKED)),
            in_progress_issues=Count("id", filter=Q(status=Issue.Status.IN_PROGRESS)),
            review_issues=Count("id", filter=Q(status=Issue.Status.IN_REVIEW)),
            done_issues=Count("id", filter=Q(status=Issue.Status.DONE)),
        )

        payload = {
            "projects": Project.objects.count(),
            "team_members": TeamMember.objects.count(),
            "issues": Issue.objects.count(),
            "activity_today": ActivityLog.objects.filter(created_at__date=today).count(),
            **issue_counts,
        }
        return Response(payload)
