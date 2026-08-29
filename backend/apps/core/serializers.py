from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.text import slugify
from rest_framework import serializers

from .models import ActivityLog, Issue, Project, TeamMember


class TeamMemberSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    login_username = serializers.CharField(write_only=True, required=True, max_length=150)
    password = serializers.CharField(write_only=True, required=True, min_length=8)

    def validate_login_username(self, value):
        if get_user_model().objects.filter(username=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        username = validated_data.pop("login_username")
        password = validated_data.pop("password")
        user = get_user_model().objects.create_user(username=username, password=password)
        return TeamMember.objects.create(user=user, **validated_data)

    class Meta:
        model = TeamMember
        fields = [
            "id",
            "name",
            "role",
            "email",
            "username",
            "login_username",
            "password",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "login_username": {"write_only": True},
            "password": {"write_only": True},
        }


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
