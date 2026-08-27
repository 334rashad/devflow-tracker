from django.db import models


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class TeamMember(TimestampedModel):
    name = models.CharField(max_length=120)
    role = models.CharField(max_length=120)
    email = models.EmailField(unique=True)

    def __str__(self) -> str:
        return self.name


class Project(TimestampedModel):
    name = models.CharField(max_length=140)
    key = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    owner = models.ForeignKey(TeamMember, on_delete=models.PROTECT, related_name="owned_projects")

    def __str__(self) -> str:
        return self.name


class Issue(TimestampedModel):
    class Status(models.TextChoices):
        TODO = "todo", "Todo"
        IN_PROGRESS = "in_progress", "In Progress"
        IN_REVIEW = "in_review", "In Review"
        BLOCKED = "blocked", "Blocked"
        DONE = "done", "Done"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="issues")
    title = models.CharField(max_length=180)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TODO)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.MEDIUM)
    assignee = models.ForeignKey(
        TeamMember,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_issues",
    )
    due_date = models.DateField(null=True, blank=True)

    def __str__(self) -> str:
        return self.title


class ActivityLog(TimestampedModel):
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name="activity_logs")
    actor = models.ForeignKey(TeamMember, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=140)
    details = models.JSONField(default=dict, blank=True)

    def __str__(self) -> str:
        return self.action
