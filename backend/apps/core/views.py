from django.contrib.auth import authenticate, login, logout
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ActivityLog, Issue, Project, TeamMember
from .serializers import ActivityLogSerializer, IssueSerializer, ProjectSerializer, TeamMemberSerializer


def auth_payload(user):
    team_member = getattr(user, "team_member", None)
    return {
        "authenticated": user.is_authenticated,
        "user": {
            "id": user.id,
            "username": user.username,
            "name": team_member.name if team_member else None,
            "is_staff": user.is_staff,
        }
        if user.is_authenticated
        else None,
    }


class LoginView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        from django.middleware.csrf import get_token

        get_token(request)
        return Response(auth_payload(request.user))

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")

        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({"authenticated": False, "error": "Invalid username or password."}, status=401)

        login(request, user)
        return Response(auth_payload(user))


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({"authenticated": False})


class TeamMemberViewSet(viewsets.ModelViewSet):
    queryset = TeamMember.objects.all().order_by("name")
    serializer_class = TeamMemberSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        permission_classes = [IsAuthenticated] if self.action in {"list", "retrieve"} else [IsAdminUser]
        return [permission() for permission in permission_classes]


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.select_related("owner").all().order_by("name")
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated]


class IssueViewSet(viewsets.ModelViewSet):
    serializer_class = IssueSerializer
    filterset_fields = ["project", "status", "priority", "assignee"]
    search_fields = ["title", "description", "slug"]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Issue.objects.select_related("project", "assignee").all().order_by("-created_at")
        user = self.request.user

        if user.is_staff:
            return queryset

        team_member = getattr(user, "team_member", None)
        if team_member is None:
            return queryset.none()

        return queryset.filter(Q(assignee=team_member) | Q(project__owner=team_member))

    def _activity_actor(self, issue):
        return getattr(self.request.user, "team_member", None) or issue.assignee

    def perform_create(self, serializer):
        issue = serializer.save()
        ActivityLog.objects.create(
            issue=issue,
            actor=self._activity_actor(issue),
            action="Issue created",
            details={"status": issue.status},
        )

    def perform_update(self, serializer):
        issue = self.get_object()
        previous_status = issue.status
        previous_assignee = issue.assignee
        updated_issue = serializer.save()

        if previous_status != updated_issue.status:
            ActivityLog.objects.create(
                issue=updated_issue,
                actor=self._activity_actor(updated_issue),
                action="Status updated",
                details={"from": previous_status, "to": updated_issue.status},
            )

        if previous_assignee != updated_issue.assignee:
            ActivityLog.objects.create(
                issue=updated_issue,
                actor=self._activity_actor(updated_issue),
                action="Assignee updated",
                details={
                    "from": previous_assignee.name if previous_assignee else "Unassigned",
                    "to": updated_issue.assignee.name if updated_issue.assignee else "Unassigned",
                },
            )


class ActivityLogViewSet(viewsets.ModelViewSet):
    serializer_class = ActivityLogSerializer
    filterset_fields = ["issue", "actor"]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = ActivityLog.objects.select_related("issue", "actor").all().order_by("-created_at")
        user = self.request.user

        if user.is_staff:
            return queryset

        team_member = getattr(user, "team_member", None)
        if team_member is None:
            return queryset.none()

        return queryset.filter(Q(issue__assignee=team_member) | Q(issue__project__owner=team_member))


class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]
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
