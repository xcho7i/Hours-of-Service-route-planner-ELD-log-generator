from django.urls import path

from .views import geocode_view, plan_trip_view

urlpatterns = [
    path("plan", plan_trip_view, name="trip-plan"),
    path("geocode", geocode_view, name="trip-geocode"),
]
