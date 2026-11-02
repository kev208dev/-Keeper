"""contract/keeper.schema.json의 이벤트 형식을 코드로 옮긴 모델. 형식을 바꿀 때는 두 곳을 함께 고친다."""

from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints

Id = Annotated[str, StringConstraints(min_length=1, max_length=100)]
NonEmpty = Annotated[str, StringConstraints(min_length=1)]
Duration = Annotated[str, StringConstraints(pattern=r"^\d{2}:\d{2}$")]
CameraStatus = Literal["connected", "disconnected"]
InquiryStatus = Literal["forwarded", "ai_resolved"]


class Event(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    eventId: Id
    occurredAt: AwareDatetime


class MovementEvent(Event):
    type: Literal["alert.movement"]
    cameraId: Id
    from_: NonEmpty = Field(alias="from")
    to: NonEmpty
    unpaid: bool


class DoorOpenEvent(Event):
    type: Literal["alert.door_open"]
    cameraId: Id
    openedAt: AwareDatetime
    limitMinutes: int = Field(ge=1, le=1440)


class DoorClosedEvent(Event):
    type: Literal["door.closed"]
    alertEventId: Id


class ProductDamageEvent(Event):
    type: Literal["alert.product_damage"]
    cameraId: Id
    product: str | None


class ClipReadyEvent(Event):
    type: Literal["clip.ready"]
    alertEventId: Id
    duration: Duration


class InquiryCreatedEvent(Event):
    type: Literal["inquiry.created"]
    title: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    note: Annotated[str, StringConstraints(max_length=1000)]
    transcript: list[Annotated[str, StringConstraints(max_length=2000)]] = Field(max_length=100)
    status: InquiryStatus


class CameraStatusEvent(Event):
    type: Literal["camera.status"]
    cameraId: Id
    name: NonEmpty
    location: NonEmpty
    status: CameraStatus


IngestEvent = Annotated[
    MovementEvent
    | DoorOpenEvent
    | DoorClosedEvent
    | ProductDamageEvent
    | ClipReadyEvent
    | InquiryCreatedEvent
    | CameraStatusEvent,
    Field(discriminator="type"),
]


class LoginRequest(BaseModel):
    email: Annotated[str, StringConstraints(max_length=200)]
    password: Annotated[str, StringConstraints(max_length=200)]


class SignupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Annotated[
        str,
        StringConstraints(strip_whitespace=True, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"),
    ]
    password: Annotated[str, StringConstraints(min_length=8, max_length=200)]
    storeName: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
