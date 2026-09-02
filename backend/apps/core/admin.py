from django.contrib import admin

from .models import ActivityLog, Issue, Project, TeamMember


@admin.register(TeamMember)
class TeamMemberAdmin(admin.ModelAdmin):
	list_display = ("name", "role", "email", "created_at")
	search_fields = ("name", "role", "email")


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
	list_display = ("name", "key", "owner", "created_at")
	search_fields = ("name", "key", "description")
	list_filter = ("owner",)
	filter_horizontal = ("members",)


@admin.register(Issue)
class IssueAdmin(admin.ModelAdmin):
	list_display = ("title", "project", "status", "priority", "assignee", "due_date")
	search_fields = ("title", "slug", "description")
	list_filter = ("status", "priority", "project")


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
	list_display = ("action", "issue", "actor", "created_at")
	search_fields = ("action",)
	list_filter = ("created_at",)
