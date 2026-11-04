package io.keeper.kiosk;

public final class PendingInquiry {
  public final String eventId;
  public final String category;
  public final String message;
  public final String occurredAt;

  public PendingInquiry(String eventId, String category, String message, String occurredAt) {
    this.eventId = eventId;
    this.category = category;
    this.message = message;
    this.occurredAt = occurredAt;
  }
}
