from django.urls import include, path

urlpatterns = [
    path("api/trips/", include("trips.urls")),
]
