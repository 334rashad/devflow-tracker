from django.contrib.auth import authenticate, login, logout
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.permissions import AllowAny, BasePermission, IsAdminUser, IsAuthenticated, SAFE_METHODS
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


def issue_queryset_for_user(user):
    queryset = Issue.objects.select_related("project", "assignee").all().order_by("-created_at")

    if user.is_staff:
        return queryset

    team_member = getattr(user, "team_member", None)
    if team_member is None:
        return queryset.none()

    return queryset.filter(
        Q(assignee=team_member) | Q(project__owner=team_member) | Q(project__members=team_member)
    ).distinct()


def project_queryset_for_user(user):
    queryset = Project.objects.select_related("owner").all().order_by("name")
    if user.is_staff:
        return queryset

    team_member = getattr(user, "team_member", None)
    if team_member is None:
        return queryset.none()

    return queryset.filter(
        Q(owner=team_member) | Q(members=team_member) | Q(issues__assignee=team_member)
    ).distinct()


class ProjectPermission(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS or request.user.is_staff:
            return True
        return getattr(request.user, "team_member", None) == obj.owner


class IssuePermission(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_staff:
            return True
        team_member = getattr(request.user, "team_member", None)
        if team_member is None:
            return False
        if request.method == "DELETE":
            return obj.project.owner_id == team_member.id
        return obj.assignee_id == team_member.id or obj.project.owner_id == team_member.id or obj.project.members.filter(
            pk=team_member.pk
        ).exists()


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

    def get_queryset(self):
        if self.request.user.is_staff:
            return self.queryset
        team_member = getattr(self.request.user, "team_member", None)
        if team_member is None:
            return self.queryset.none()
        return self.queryset.filter(Q(pk=team_member.pk) | Q(projects__in=project_queryset_for_user(self.request.user))).distinct()


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.select_related("owner").all().order_by("name")
    serializer_class = ProjectSerializer
    permission_classes = [ProjectPermission]

    def get_queryset(self):
        return project_queryset_for_user(self.request.user)

    def get_permissions(self):
        if self.action in {"create", "destroy"}:
            return [IsAdminUser()]
        return [ProjectPermission()]


class IssueViewSet(viewsets.ModelViewSet):
    serializer_class = IssueSerializer
    filterset_fields = ["project", "status", "priority", "assignee"]
    search_fields = ["title", "description", "slug"]
    permission_classes = [IssuePermission]

    def get_queryset(self):
        return issue_queryset_for_user(self.request.user)

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
        previous_title = issue.title
        previous_description = issue.description
        previous_priority = issue.priority
        previous_project = issue.project
        previous_due_date = issue.due_date
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

        changes = [
            ("title", previous_title, updated_issue.title),
            ("description", previous_description, updated_issue.description),
            ("priority", previous_priority, updated_issue.priority),
            ("project", previous_project.name, updated_issue.project.name),
            (
                "due date",
                previous_due_date.isoformat() if previous_due_date else "No due date",
                updated_issue.due_date.isoformat() if updated_issue.due_date else "No due date",
            ),
        ]
        for field, previous_value, updated_value in changes:
            if previous_value != updated_value:
                ActivityLog.objects.create(
                    issue=updated_issue,
                    actor=self._activity_actor(updated_issue),
                    action=f"Issue {field} updated",
                    details={"from": previous_value, "to": updated_value},
                )


class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
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
        issues = issue_queryset_for_user(request.user)
        issue_counts = issues.aggregate(
            open_issues=Count("id", filter=~Q(status=Issue.Status.DONE)),
            blocked_issues=Count("id", filter=Q(status=Issue.Status.BLOCKED)),
            in_progress_issues=Count("id", filter=Q(status=Issue.Status.IN_PROGRESS)),
            review_issues=Count("id", filter=Q(status=Issue.Status.IN_REVIEW)),
            done_issues=Count("id", filter=Q(status=Issue.Status.DONE)),
        )

        payload = {
            "projects": issues.values("project_id").distinct().count(),
            "team_members": issues.exclude(assignee__isnull=True).values("assignee_id").distinct().count(),
            "issues": issues.count(),
            "activity_today": ActivityLog.objects.filter(issue__in=issues, created_at__date=today).count(),
            **issue_counts,
        }
        return Response(payload)


class DeliveryAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        issues = issue_queryset_for_user(request.user)
        total_issues = issues.count()

        status_counts = dict(issues.values_list("status").annotate(total=Count("id")))
        priority_counts = dict(issues.values_list("priority").annotate(total=Count("id")))
        project_rows = issues.values("project__name").annotate(
            total=Count("id"),
            completed=Count("id", filter=Q(status=Issue.Status.DONE)),
            blocked=Count("id", filter=Q(status=Issue.Status.BLOCKED)),
        ).order_by("project__name")
        workload = issues.exclude(assignee__isnull=True).exclude(status=Issue.Status.DONE).values(
            "assignee__name"
        ).annotate(active_issues=Count("id")).order_by("-active_issues", "assignee__name")

        return Response(
            {
                "status_distribution": [
                    {"status": status, "count": status_counts.get(status, 0)}
                    for status, _ in Issue.Status.choices
                ],
                "priority_distribution": [
                    {"priority": priority, "count": priority_counts.get(priority, 0)}
                    for priority, _ in Issue.Priority.choices
                ],
                "project_health": [
                    {
                        "project": row["project__name"],
                        "total_issues": row["total"],
                        "blocked_issues": row["blocked"],
                        "completion_rate": round(row["completed"] / row["total"] * 100) if row["total"] else 0,
                    }
                    for row in project_rows
                ],
                "workload": [
                    {"member": row["assignee__name"], "active_issues": row["active_issues"]} for row in workload
                ],
                "risks": {
                    "blocked_issues": issues.filter(status=Issue.Status.BLOCKED).count(),
                    "overdue_issues": issues.filter(due_date__lt=today).exclude(status=Issue.Status.DONE).count(),
                    "completion_rate": round(issues.filter(status=Issue.Status.DONE).count() / total_issues * 100)
                    if total_issues
                    else 0,
                },
            }
        )
