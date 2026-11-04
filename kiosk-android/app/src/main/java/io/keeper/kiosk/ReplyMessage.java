package io.keeper.kiosk;

public final class ReplyMessage {
  public final String id;
  public final String inquiryId;
  public final String body;
  public final String sentAt;

  public ReplyMessage(String id, String inquiryId, String body, String sentAt) {
    this.id = id;
    this.inquiryId = inquiryId;
    this.body = body;
    this.sentAt = sentAt;
  }
}
