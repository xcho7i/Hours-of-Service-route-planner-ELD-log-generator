from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .serializers import TripPlanRequestSerializer
from .services.geocoding import GeocodingError, geocode
from .services.trip_builder import plan_trip
from .services.validators import ValidationError, validate_trip_request


@api_view(["POST"])
def plan_trip_view(request):
    """POST /api/trips/plan -- plan an HOS-compliant trip."""
    # Light field validation first for clean DRF error messages.
    serializer = TripPlanRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {"errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Domain validation + normalization (defaults start_time, parses cycle).
    try:
        trip_request = validate_trip_request(request.data)
    except ValidationError as exc:
        return Response(
            {"errors": {"detail": str(exc)}},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Plan.
    try:
        result = plan_trip(trip_request)
    except GeocodingError as exc:
        return Response(
            {"errors": {"detail": str(exc)}},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(result, status=status.HTTP_200_OK)


@api_view(["POST"])
def geocode_view(request):
    """POST /api/trips/geocode -- resolve the three locations to coordinates so
    the map can show (draggable) pins before a full trip is planned. Any
    location that cannot be resolved comes back as null instead of erroring."""
    data = request.data or {}
    out = {}
    for key, field in (
        ("current", "current_location"),
        ("pickup", "pickup_location"),
        ("dropoff", "dropoff_location"),
    ):
        raw = data.get(field)
        if not raw or not str(raw).strip():
            out[key] = None
            continue
        try:
            out[key] = geocode(str(raw)).as_dict()
        except GeocodingError:
            out[key] = None
    return Response(out, status=status.HTTP_200_OK)
