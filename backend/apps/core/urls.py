from rest_framework.routers import DefaultRouter

from django.urls import path

from .views import ActivityLogViewSet, DashboardStatsView, IssueViewSet, LoginView, ProjectViewSet, TeamMemberViewSet

router = DefaultRouter()
router.register(r"team-members", TeamMemberViewSet, basename="team-member")
router.register(r"projects", ProjectViewSet, basename="project")
router.register(r"issues", IssueViewSet, basename="issue")
router.register(r"activity", ActivityLogViewSet, basename="activity")

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="auth-login"),
]
urlpatterns += router.urls
urlpatterns += [path("dashboard/", DashboardStatsView.as_view(), name="dashboard-stats")]
