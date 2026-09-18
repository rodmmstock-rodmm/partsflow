from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .cache_utils import invalidate_options_cache
from .models import Employee, JobType, Location, Machine, Supplier, SupplierContact, Unit


@receiver(post_save, sender=Employee)
@receiver(post_save, sender=Machine)
@receiver(post_save, sender=Supplier)
@receiver(post_save, sender=SupplierContact)
@receiver(post_save, sender=Location)
@receiver(post_save, sender=Unit)
@receiver(post_save, sender=JobType)
@receiver(post_delete, sender=Employee)
@receiver(post_delete, sender=Machine)
@receiver(post_delete, sender=Supplier)
@receiver(post_delete, sender=SupplierContact)
@receiver(post_delete, sender=Location)
@receiver(post_delete, sender=Unit)
@receiver(post_delete, sender=JobType)
def clear_options_cache(sender, **kwargs):
    invalidate_options_cache()
