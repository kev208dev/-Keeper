package io.keeper.kiosk;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.function.Supplier;

public final class KioskSession {
  public interface Store {
    String get(String key);

    void put(String key, String value);

    void remove(String key);
  }

  public enum ReplyAction {
    DISPLAY,
    ACK_ONLY,
    IGNORE
  }

  private static final String EVENT_ID = "pending.eventId";
  private static final String CATEGORY = "pending.category";
  private static final String MESSAGE = "pending.message";
  private static final String OCCURRED_AT = "pending.occurredAt";
  private static final String SEEN = "replies.seen";
  private static final String ACKS = "replies.acks";

  private final Store store;
  private final Supplier<String> idFactory;
  private final Set<String> seen;
  private final Set<String> acknowledgements;

  public KioskSession(Store store, Supplier<String> idFactory) {
    this.store = store;
    this.idFactory = idFactory;
    this.seen = readSet(SEEN);
    this.acknowledgements = readSet(ACKS);
  }

  public PendingInquiry beginOrResume(
      String category, String message, String occurredAt) {
    PendingInquiry current = pendingInquiry();
    if (current != null) return current;
    PendingInquiry created = new PendingInquiry(idFactory.get(), category, message, occurredAt);
    store.put(EVENT_ID, created.eventId);
    store.put(CATEGORY, created.category);
    store.put(MESSAGE, created.message);
    store.put(OCCURRED_AT, created.occurredAt);
    return created;
  }

  public PendingInquiry pendingInquiry() {
    String eventId = store.get(EVENT_ID);
    if (eventId == null) return null;
    return new PendingInquiry(eventId, store.get(CATEGORY), store.get(MESSAGE), store.get(OCCURRED_AT));
  }

  public ReplyAction onReplyReceived(String replyId, String inquiryId) {
    if (acknowledgements.contains(replyId)) return ReplyAction.ACK_ONLY;
    if (seen.contains(replyId)) return ReplyAction.IGNORE;
    PendingInquiry pending = pendingInquiry();
    return pending != null && pending.eventId.equals(inquiryId)
        ? ReplyAction.DISPLAY
        : ReplyAction.IGNORE;
  }

  public void onReplyRendered(String replyId) {
    seen.add(replyId);
    acknowledgements.add(replyId);
    writeSet(SEEN, seen);
    writeSet(ACKS, acknowledgements);
    clearPendingInquiry();
  }

  public void onReplyAcknowledged(String replyId) {
    acknowledgements.remove(replyId);
    writeSet(ACKS, acknowledgements);
  }

  public Set<String> pendingAcknowledgements() {
    return Collections.unmodifiableSet(new LinkedHashSet<>(acknowledgements));
  }

  public void clearPendingInquiry() {
    store.remove(EVENT_ID);
    store.remove(CATEGORY);
    store.remove(MESSAGE);
    store.remove(OCCURRED_AT);
  }

  private Set<String> readSet(String key) {
    Set<String> values = new LinkedHashSet<>();
    String encoded = store.get(key);
    if (encoded == null || encoded.isEmpty()) return values;
    for (String item : encoded.split("\\n")) {
      if (!item.isEmpty()) values.add(item);
    }
    return values;
  }

  private void writeSet(String key, Set<String> values) {
    if (values.isEmpty()) store.remove(key);
    else store.put(key, String.join("\n", values));
  }
}
