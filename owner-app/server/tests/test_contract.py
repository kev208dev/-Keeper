"""서버가 contract/keeper.schema.json과 같은 형식을 쓰는지 검증한다."""

from typing import get_args

import pytest
from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError
from pydantic import TypeAdapter, ValidationError as PydanticValidationError
from referencing import Registry, Resource

from keeper.schemas import IngestEvent

from .conftest import clip_ready, door_closed, door_open, inquiry, movement


def validator_for(schema: dict, definition: str) -> Draft202012Validator:
    registry = Registry().with_resource(schema["$id"], Resource.from_contents(schema))
    return Draft202012Validator({"$ref": f"{schema['$id']}#/$defs/{definition}"}, registry=registry)


def test_schema_itself_is_valid(schema):
    Draft202012Validator.check_schema(schema)


def test_examples_cover_every_event_type(schema, example_events):
    in_schema = {
        schema["$defs"][ref["$ref"].rsplit("/", 1)[1]]["properties"]["type"]["const"]
        for ref in schema["$defs"]["IngestEvent"]["oneOf"]
    }
    in_server = {
        get_args(model.model_fields["type"].annotation)[0] for model in get_args(get_args(IngestEvent)[0])
    }

    assert {event["type"] for event in example_events} == in_schema == in_server


def test_examples_match_the_schema_and_are_accepted_by_the_server(schema, example_events, store):
    validator = validator_for(schema, "IngestEvent")

    for event in example_events:
        validator.validate(event)
        assert store.send(event).status_code == 202, event["type"]


@pytest.mark.parametrize(
    "change",
    [
        {"extra": "field"},
        {"eventId": ""},
        {"occurredAt": "2026-10-23T14:08:00"},
        {"unpaid": "maybe"},
        {"from": ""},
    ],
)
def test_schema_and_server_reject_the_same_bad_events(schema, change):
    event = movement() | change

    with pytest.raises(ValidationError):
        validator_for(schema, "IngestEvent").validate(event)
    with pytest.raises(PydanticValidationError):
        TypeAdapter(IngestEvent).validate_python(event)


def test_dashboard_response_matches_the_schema(schema, example_events, store):
    headers = store.login()
    for event in example_events:
        store.send_ok(event)
    store.send_ok(door_open("open-door"))
    store.send_ok(inquiry("ai", status="ai_resolved"))

    dashboard = store.dashboard(headers, since="2026-10-01T00:00:00+09:00")

    validator_for(schema, "Dashboard").validate(dashboard)
    assert {alert["kind"] for alert in dashboard["alerts"]} == {"movement", "duration", "product"}
    assert dashboard["clips"] and dashboard["cameras"] and dashboard["inquiries"]


def test_period_alerts_match_the_schema(schema, store):
    headers = store.login()
    store.send_ok(movement())
    store.send_ok(door_open())
    store.send_ok(door_closed())

    response = store.client.get("/api/alerts", params={"start": "2026-10-23", "end": "2026-10-23"}, headers=headers)

    validator = validator_for(schema, "Alert")
    assert len(response.json()) == 2
    for alert in response.json():
        validator.validate(alert)


def test_dashboard_before_integration_matches_the_schema(schema, store):
    dashboard = store.dashboard(store.login())

    validator_for(schema, "Dashboard").validate(dashboard)


def test_clip_helper_is_a_valid_event(schema):
    validator_for(schema, "IngestEvent").validate(clip_ready())
