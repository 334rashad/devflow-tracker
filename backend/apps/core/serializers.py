from django.utils.text import slugify
from rest_framework import serializers

from .models import ActivityLog, Issue, Project, TeamMember


class TeamMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeamMember
        fields = ["id", "name", "role", "email", "created_at", "updated_at"]


class ProjectSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.name", read_only=True)

    class Meta:
        model = Project
        fields = ["id", "name", "key", "description", "owner", "owner_name", "created_at", "updated_at"]


class IssueSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True)
    assignee_name = serializers.CharField(source="assignee.name", read_only=True)
    slug = serializers.SlugField(read_only=True)

    def create(self, validated_data):
        base_slug = slugify(validated_data["title"])[:130] or "issue"
        slug = base_slug
        suffix = 2

        while Issue.objects.filter(slug=slug).exists():
            slug = f"{base_slug[:130 - len(str(suffix)) - 1]}-{suffix}"
            suffix += 1

        return Issue.objects.create(slug=slug, **validated_data)

    class Meta:
        model = Issue
        fields = [
            "id",
            "project",
            "project_name",
            "title",
            "slug",
            "description",
            "status",
            "priority",
            "assignee",
            "assignee_name",
            "due_date",
            "created_at",
            "updated_at",
        ]


class ActivityLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.name", read_only=True)
    issue_slug = serializers.CharField(source="issue.slug", read_only=True)
    issue_title = serializers.CharField(source="issue.title", read_only=True)

    class Meta:
        model = ActivityLog
        fields = [
            "id",
            "issue",
            "issue_slug",
            "issue_title",
            "actor",
            "actor_name",
            "action",
            "details",
            "created_at",
        ]
