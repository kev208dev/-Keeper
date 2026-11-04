package io.keeper.kiosk;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class KeeperApiClient {
  private final String baseUrl;
  private final String deviceKey;
  private final String deviceId;

  public KeeperApiClient(String baseUrl, String deviceKey, String deviceId) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.deviceKey = deviceKey == null ? "" : deviceKey.trim();
    this.deviceId = deviceId;
  }

  public void heartbeat() throws IOException {
    request("/ingest/heartbeat", new JSONObject());
  }

  public String sendInquiry(PendingInquiry inquiry) throws IOException {
    try {
      JSONObject body =
          new JSONObject()
              .put("eventId", inquiry.eventId)
              .put("type", "inquiry.created")
              .put("occurredAt", inquiry.occurredAt)
              .put("title", inquiry.category)
              .put("note", inquiry.message)
              .put("transcript", new JSONArray().put("고객: " + inquiry.message))
              .put("status", "forwarded")
              .put("deviceId", deviceId);
      return request("/ingest/events", body).optString("status", "accepted");
    } catch (JSONException error) {
      throw new IOException("문의 데이터를 만들지 못했습니다.", error);
    }
  }

  public List<ReplyMessage> pullReplies() throws IOException {
    JSONArray received = requestArray("/ingest/replies/pull", new JSONObject());
    List<ReplyMessage> replies = new ArrayList<>();
    for (int index = 0; index < received.length(); index++) {
      JSONObject item = received.optJSONObject(index);
      if (item == null) continue;
      replies.add(
          new ReplyMessage(
              item.optString("id"),
              item.optString("inquiryId"),
              item.optString("body"),
              item.optString("sentAt")));
    }
    return replies;
  }

  public void acknowledgeReply(String replyId) throws IOException {
    String encoded = URLEncoder.encode(replyId, StandardCharsets.UTF_8.name()).replace("+", "%20");
    request("/ingest/replies/" + encoded + "/delivered", new JSONObject());
  }

  private JSONObject request(String path, JSONObject body) throws IOException {
    String response = exchange(path, body);
    if (response.isEmpty()) return new JSONObject();
    try {
      return new JSONObject(response);
    } catch (JSONException error) {
      throw new IOException("서버 응답 형식이 올바르지 않습니다.", error);
    }
  }

  private JSONArray requestArray(String path, JSONObject body) throws IOException {
    String response = exchange(path, body);
    try {
      return new JSONArray(response);
    } catch (JSONException error) {
      throw new IOException("서버 응답 형식이 올바르지 않습니다.", error);
    }
  }

  private String exchange(String path, JSONObject body) throws IOException {
    if (baseUrl.isEmpty()) throw new IOException("서버 주소를 설정해 주세요.");
    if (deviceKey.isEmpty()) throw new IOException("기기 키를 설정해 주세요.");
    HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
    try {
      connection.setConnectTimeout(5_000);
      connection.setReadTimeout(10_000);
      connection.setRequestMethod("POST");
      connection.setDoOutput(true);
      connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
      connection.setRequestProperty("Accept", "application/json");
      connection.setRequestProperty("X-Device-Key", deviceKey);
      connection.setRequestProperty("X-Device-Id", deviceId);
      byte[] encoded = body.toString().getBytes(StandardCharsets.UTF_8);
      connection.setFixedLengthStreamingMode(encoded.length);
      try (OutputStream output = connection.getOutputStream()) {
        output.write(encoded);
      }
      int status = connection.getResponseCode();
      String response = read(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
      if (status < 200 || status >= 300) {
        String detail = response;
        try {
          detail = new JSONObject(response).optString("detail", response);
        } catch (JSONException ignored) {
          // Plain-text and empty error bodies remain useful as-is.
        }
        throw new IOException(
            detail.isEmpty() ? "서버 요청에 실패했습니다. (" + status + ")" : detail + " (" + status + ")");
      }
      return response;
    } finally {
      connection.disconnect();
    }
  }

  private String read(InputStream input) throws IOException {
    if (input == null) return "";
    try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      int count;
      while ((count = source.read(buffer)) != -1) output.write(buffer, 0, count);
      return output.toString(StandardCharsets.UTF_8.name());
    }
  }

  private static String normalizeBaseUrl(String value) {
    String result = value == null ? "" : value.trim();
    while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
    return result;
  }
}
