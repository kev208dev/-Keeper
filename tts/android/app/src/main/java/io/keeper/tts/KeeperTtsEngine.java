package io.keeper.tts;

import ai.onnxruntime.OrtEnvironment;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.Iterator;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import org.json.JSONObject;

/** Cached, serialized Android wrapper around the existing Supertonic 3 Java engine. */
public final class KeeperTtsEngine {
  public interface Listener {
    default void onReady() {}

    default void onState(String message) {}

    default void onComplete(File audio) {}

    default void onError(String message, Throwable error) {}
  }

  private static KeeperTtsEngine instance;

  public static synchronized KeeperTtsEngine get(Context context) {
    if (instance == null) instance = new KeeperTtsEngine(context.getApplicationContext());
    return instance;
  }

  private final Context context;
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final Handler main = new Handler(Looper.getMainLooper());
  private final AtomicLong generation = new AtomicLong();
  private final CopyOnWriteArrayList<Listener> initialization = new CopyOnWriteArrayList<>();
  private volatile boolean loading;
  private volatile boolean ready;
  private volatile Throwable loadFailure;
  private OrtEnvironment environment;
  private TextToSpeech engine;
  private MediaPlayer player;
  private File lastAudio;

  private KeeperTtsEngine(Context context) {
    this.context = context;
  }

  public boolean isReady() {
    return ready;
  }

  public synchronized void initialize(Listener listener) {
    if (ready) {
      main.post(listener::onReady);
      return;
    }
    if (loadFailure != null) {
      main.post(() -> listener.onError("음성 모델을 준비하지 못했습니다.", loadFailure));
      return;
    }
    initialization.add(listener);
    if (loading) return;
    loading = true;
    worker.execute(
        () -> {
          try {
            notifyState("오프라인 음성 모델을 확인하고 있어요.");
            File folder = prepareModel();
            environment = OrtEnvironment.getEnvironment();
            engine = Helper.loadTextToSpeech(new File(folder, "onnx").getPath(), false, environment);
            ready = true;
            loading = false;
            for (Listener waiting : initialization) main.post(waiting::onReady);
          } catch (Throwable error) {
            loadFailure = error;
            loading = false;
            for (Listener waiting : initialization) {
              main.post(() -> waiting.onError("음성 모델을 준비하지 못했습니다.", error));
            }
          } finally {
            initialization.clear();
          }
        });
  }

  public void speak(String text, String voice, float speed, float volume, Listener listener) {
    String sentence = text == null ? "" : text.trim();
    if (sentence.isEmpty()) {
      listener.onError("읽을 문장이 없습니다.", new IllegalArgumentException("empty text"));
      return;
    }
    if (!ready || engine == null || environment == null) {
      listener.onError("음성 모델이 아직 준비되지 않았습니다.", new IllegalStateException("not ready"));
      return;
    }
    long request = generation.incrementAndGet();
    stopPlayer();
    listener.onState("음성을 만들고 있어요.");
    worker.execute(
        () -> {
          try {
            TTSResult result;
            try (StyleHandle style =
                new StyleHandle(
                    Helper.loadVoiceStyle(
                        Collections.singletonList(
                            new File(
                                    context.getFilesDir(),
                                    "supertonic-3/voice_styles/" + voice + ".json")
                                .getPath()),
                        false,
                        environment))) {
              result = engine.call(sentence, "ko", style.value, 5, speed, 0.3f, environment);
            }
            if (request != generation.get()) return;
            validateAudio(result.wav);
            File folder = new File(context.getCacheDir(), "tts");
            if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("output directory");
            File audio = new File(folder, "keeper-" + UUID.randomUUID() + ".wav");
            Helper.writeWavFile(audio.getPath(), result.wav, engine.sampleRate);
            lastAudio = audio;
            main.post(
                () -> {
                  if (request != generation.get()) return;
                  listener.onComplete(audio);
                  play(audio, volume, request, listener);
                });
          } catch (Throwable error) {
            main.post(() -> listener.onError("음성을 만들지 못했습니다.", error));
          }
        });
  }

  public void replay(float volume, Listener listener) {
    if (lastAudio == null || !lastAudio.isFile()) {
      listener.onError("다시 들을 음성이 없습니다.", new IllegalStateException("no audio"));
      return;
    }
    long request = generation.incrementAndGet();
    play(lastAudio, volume, request, listener);
  }

  public void stop() {
    generation.incrementAndGet();
    stopPlayer();
  }

  private synchronized void play(File audio, float volume, long request, Listener listener) {
    stopPlayer();
    try {
      player = new MediaPlayer();
      player.setAudioAttributes(
          new AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build());
      player.setDataSource(audio.getPath());
      player.setVolume(volume, volume);
      player.setOnCompletionListener(
          completed -> {
            stopPlayer();
            if (request == generation.get()) listener.onState("음성 재생을 마쳤습니다.");
          });
      player.setOnErrorListener(
          (failed, what, extra) -> {
            stopPlayer();
            listener.onError("음성을 재생하지 못했습니다.", new IOException("MediaPlayer " + what));
            return true;
          });
      player.prepare();
      player.start();
      listener.onState("음성 안내를 재생하고 있어요.");
    } catch (Throwable error) {
      stopPlayer();
      listener.onError("음성을 재생하지 못했습니다.", error);
    }
  }

  private synchronized void stopPlayer() {
    if (player != null) {
      player.release();
      player = null;
    }
  }

  private void notifyState(String message) {
    for (Listener listener : initialization) main.post(() -> listener.onState(message));
  }

  private void validateAudio(float[] wav) throws IOException {
    if (wav.length == 0) throw new IOException("empty audio");
    float peak = 0;
    for (float sample : wav) {
      if (!Float.isFinite(sample)) throw new IOException("invalid audio");
      peak = Math.max(peak, Math.abs(sample));
    }
    if (peak == 0) throw new IOException("silent audio");
  }

  private File prepareModel() throws Exception {
    File root = new File(context.getFilesDir(), "supertonic-3");
    JSONObject manifest = new JSONObject(readAsset("supertonic-3/MODEL_SOURCE.json"));
    JSONObject hashes = manifest.getJSONObject("sha256");
    for (Iterator<String> keys = hashes.keys(); keys.hasNext(); ) {
      String relative = keys.next();
      File target = new File(root, relative);
      if (!target.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator)) {
        throw new IOException("invalid model path");
      }
      String expected = hashes.getString(relative);
      if (target.isFile() && sha256(target).equals(expected)) continue;
      File parent = target.getParentFile();
      if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("model directory");
      File partial = new File(parent, target.getName() + ".part");
      try (InputStream source = context.getAssets().open("supertonic-3/" + relative);
          OutputStream output = new FileOutputStream(partial)) {
        byte[] buffer = new byte[262144];
        int count;
        while ((count = source.read(buffer)) != -1) output.write(buffer, 0, count);
      }
      if (!sha256(partial).equals(expected)) throw new IOException("model checksum: " + relative);
      if (target.exists() && !target.delete()) throw new IOException("old model file");
      if (!partial.renameTo(target)) throw new IOException("model move");
    }
    return root;
  }

  private String readAsset(String path) throws IOException {
    try (InputStream input = context.getAssets().open(path);
        ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      int count;
      while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
      return output.toString("UTF-8");
    }
  }

  private String sha256(File file) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    try (InputStream input = new FileInputStream(file)) {
      byte[] buffer = new byte[262144];
      int count;
      while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
    }
    StringBuilder encoded = new StringBuilder();
    for (byte value : digest.digest()) encoded.append(String.format(Locale.ROOT, "%02x", value & 255));
    return encoded.toString();
  }

  private static final class StyleHandle implements AutoCloseable {
    final Style value;

    StyleHandle(Style value) {
      this.value = value;
    }

    @Override
    public void close() throws Exception {
      value.close();
    }
  }
}
