from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0002_teammember_user"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="members",
            field=models.ManyToManyField(blank=True, related_name="projects", to="core.teammember"),
        ),
    ]