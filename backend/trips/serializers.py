"""
DRF serializer for the request body. Field-level checks live here; richer
domain validation (cycle bounds, start-time parsing/normalization) is handled
by ``trips.services.validators`` so it can be unit-tested independently.
"""
from rest_framework import serializers


class TripPlanRequestSerializer(serializers.Serializer):
    current_location = serializers.CharField(max_length=255)
    pickup_location = serializers.CharField(max_length=255)
    dropoff_location = serializers.CharField(max_length=255)
    current_cycle_used_hours = serializers.FloatField(min_value=0, max_value=70)
    start_time = serializers.DateTimeField(required=False, allow_null=True)
