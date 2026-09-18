"""Create a local admin user and finish instance setup. Run inside the api container:
dev/dc.sh exec -T api python manage.py shell < dev/bootstrap.py
"""

from plane.db.models import Profile, User
from plane.license.models import Instance

EMAIL = "dev@example.com"
PASSWORD = "Passw0rd!2026"

user, created = User.objects.get_or_create(
    email=EMAIL,
    defaults={
        "username": "dev",
        "first_name": "Dev",
        "last_name": "User",
        "display_name": "dev",
        "is_active": True,
        "is_password_autoset": False,
    },
)
user.set_password(PASSWORD)
user.save()
Profile.objects.get_or_create(user=user, defaults={"is_onboarded": True, "is_tour_completed": True})
instance = Instance.objects.first()
if instance is not None:
    instance.is_setup_done = True
    instance.save()
print("user", user.id, "created" if created else "existing", "| instance setup done:", instance is not None)
