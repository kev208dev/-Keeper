package io.keeper.kiosk;

import static org.junit.Assert.*;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

public class KioskSessionTest {
  private static class MemoryStore implements KioskSession.Store {
    final Map<String, String> values = new HashMap<>();

    @Override
    public String get(String key) {
      return values.get(key);
    }

    @Override
    public void put(String key, String value) {
      values.put(key, value);
    }

    @Override
    public void remove(String key) {
      values.remove(key);
    }
  }

  @Test
  public void retryAndRestartReuseOriginalInquiryIdentityAndPayload() {
    MemoryStore store = new MemoryStore();
    KioskSession first = new KioskSession(store, () -> "event-fixed");

    PendingInquiry created =
        first.beginOrResume("결제", "결제했는데 문이 열리지 않아요", "2026-11-04T12:00:00+09:00");
    PendingInquiry retry =
        first.beginOrResume("기타", "바뀐 문장", "2026-11-04T12:01:00+09:00");
    PendingInquiry restored = new KioskSession(store, () -> "event-new").pendingInquiry();

    assertEquals("event-fixed", created.eventId);
    assertEquals(created.eventId, retry.eventId);
    assertEquals("결제", retry.category);
    assertEquals("결제했는데 문이 열리지 않아요", restored.message);
    assertEquals("2026-11-04T12:00:00+09:00", restored.occurredAt);
  }

  @Test
  public void replyCannotBeAcknowledgedBeforeItIsRendered() {
    MemoryStore store = new MemoryStore();
    KioskSession session = new KioskSession(store, () -> "q1");
    session.beginOrResume("기타", "도와주세요", "2026-11-04T12:00:00+09:00");

    assertEquals(KioskSession.ReplyAction.DISPLAY, session.onReplyReceived("r1", "q1"));
    assertFalse(session.pendingAcknowledgements().contains("r1"));

    session.onReplyRendered("r1");

    assertTrue(session.pendingAcknowledgements().contains("r1"));
    assertNull(session.pendingInquiry());
  }

  @Test
  public void displayedReplyIsDeduplicatedAndPendingAckSurvivesRestart() {
    MemoryStore store = new MemoryStore();
    KioskSession session = new KioskSession(store, () -> "q1");
    session.beginOrResume("기타", "도와주세요", "2026-11-04T12:00:00+09:00");
    session.onReplyRendered("r1");

    KioskSession restarted = new KioskSession(store, () -> "unused");

    assertEquals(KioskSession.ReplyAction.ACK_ONLY, restarted.onReplyReceived("r1", "q1"));
    assertTrue(restarted.pendingAcknowledgements().contains("r1"));
    restarted.onReplyAcknowledged("r1");
    assertFalse(new KioskSession(store, () -> "unused").pendingAcknowledgements().contains("r1"));
  }

  @Test
  public void replyForAnotherInquiryIsIgnored() {
    MemoryStore store = new MemoryStore();
    KioskSession session = new KioskSession(store, () -> "q1");
    session.beginOrResume("기타", "도와주세요", "2026-11-04T12:00:00+09:00");

    assertEquals(KioskSession.ReplyAction.IGNORE, session.onReplyReceived("r2", "other"));
  }
}
