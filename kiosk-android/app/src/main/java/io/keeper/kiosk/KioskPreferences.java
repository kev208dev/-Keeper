package io.keeper.kiosk;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.UUID;

public final class KioskPreferences implements KioskSession.Store {
  private static final String FILE = "keeper-kiosk";
  private static final String DEVICE_ID = "device.id";
  private static final String SERVER_URL = "server.url";
  private static final String DEVICE_KEY = "device.key";
  private static final String VOICE = "voice";
  private static final String SPEED = "speed";
  private static final String VOLUME = "volume";

  private final SharedPreferences values;

  public KioskPreferences(Context context) {
    values = context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
  }

  public String deviceId() {
    String current = values.getString(DEVICE_ID, null);
    if (current != null && !current.isEmpty()) return current;
    current = "kiosk-" + UUID.randomUUID();
    values.edit().putString(DEVICE_ID, current).apply();
    return current;
  }

  public String serverUrl() {
    return values.getString(SERVER_URL, "");
  }

  public String deviceKey() {
    return values.getString(DEVICE_KEY, "");
  }

  public String voice() {
    return values.getString(VOICE, "F1");
  }

  public float speed() {
    return values.getFloat(SPEED, 1.0f);
  }

  public float volume() {
    return values.getFloat(VOLUME, 1.0f);
  }

  public void saveConnection(String serverUrl, String deviceKey) {
    values.edit().putString(SERVER_URL, trimServer(serverUrl)).putString(DEVICE_KEY, deviceKey.trim()).apply();
  }

  public void saveVoice(String voice, float speed, float volume) {
    values.edit().putString(VOICE, voice).putFloat(SPEED, speed).putFloat(VOLUME, volume).apply();
  }

  public boolean isConfigured() {
    return !serverUrl().isEmpty() && !deviceKey().isEmpty();
  }

  private String trimServer(String value) {
    String result = value == null ? "" : value.trim();
    while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
    return result;
  }

  @Override
  public String get(String key) {
    return values.getString("session." + key, null);
  }

  @Override
  public void put(String key, String value) {
    values.edit().putString("session." + key, value).apply();
  }

  @Override
  public void remove(String key) {
    values.edit().remove("session." + key).apply();
  }
}
