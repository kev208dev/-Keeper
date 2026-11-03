package io.keeper.tts;

import ai.onnxruntime.OrtEnvironment;
import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.media.*;
import android.os.*;
import android.text.InputFilter;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

public class MainActivity extends Activity {
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private volatile boolean destroyed = false;
  private boolean foreground = true, ready = false, busy = true;
  private TextToSpeech engine;
  private OrtEnvironment environment;
  private MediaPlayer player;
  private EditText input;
  private Spinner voice, speed;
  private TextView status, metrics;
  private Button generate, replay, stop, save;
  private ProgressBar progress;
  private File lastAudio;
  private static final int INK = Color.rgb(28, 43, 36), GREEN = Color.rgb(37, 109, 82);

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.rgb(245, 246, 242));
    buildUi();
    worker.execute(
        () -> {
          try {
            long started = System.nanoTime();
            File folder = prepareModel();
            environment = OrtEnvironment.getEnvironment();
            engine =
                Helper.loadTextToSpeech(new File(folder, "onnx").getPath(), false, environment);
            ui(
                () -> {
                  ready = true;
                  busy = false;
                  status.setText("준비 완료 · 인터넷 없이 사용할 수 있어요");
                  metrics.setText(
                      String.format(
                          Locale.KOREA, "모델 준비 %.1f초", (System.nanoTime() - started) / 1e9));
                  refresh();
                });
          } catch (Throwable error) {
            fail(error, "모델을 준비하지 못했습니다. 저장 공간을 확인한 뒤 앱을 다시 열어 주세요.");
          }
        });
  }

  private int dp(int x) {
    return Math.round(x * getResources().getDisplayMetrics().density);
  }

  private TextView text(String content, int size) {
    TextView t = new TextView(this);
    t.setText(content);
    t.setTextSize(size);
    t.setTextColor(INK);
    return t;
  }

  private void gap(LinearLayout box, int height) {
    View v = new View(this);
    box.addView(v, new LinearLayout.LayoutParams(1, dp(height)));
  }

  private Button button(String label) {
    Button b = new Button(this);
    b.setText(label);
    b.setAllCaps(false);
    b.setMinHeight(dp(54));
    return b;
  }

  private void buildUi() {
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    scroll.setBackgroundColor(Color.rgb(245, 246, 242));
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);
    box.setPadding(dp(24), dp(32), dp(24), dp(28));
    scroll.addView(box);
    box.addView(text("KEEPER / VOICE", 14));
    gap(box, 8);
    box.addView(text("한국어 음성 테스트", 30));
    gap(box, 10);
    box.addView(text("문장을 입력하면 이 기기에서 음성으로 읽어 드려요.", 16));
    gap(box, 28);
    box.addView(text("읽을 문장", 16));
    gap(box, 8);
    input = new EditText(this);
    input.setTextSize(20);
    input.setTextColor(INK);
    input.setGravity(Gravity.TOP);
    input.setMinLines(4);
    input.setMaxLines(8);
    input.setFilters(new InputFilter[] {new InputFilter.LengthFilter(300)});
    input.setInputType(
        android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
    input.setText("안녕하세요. 키퍼 키오스크 도우미입니다. 원하시는 메뉴를 선택해 주세요.");

    box.addView(input, new LinearLayout.LayoutParams(-1, dp(160)));
    gap(box, 6);
    box.addView(text("한 번에 300자까지 입력할 수 있어요.", 13));
    gap(box, 22);
    LinearLayout options = new LinearLayout(this);
    options.setOrientation(LinearLayout.HORIZONTAL);
    LinearLayout a = new LinearLayout(this);
    a.setOrientation(LinearLayout.VERTICAL);
    a.addView(text("목소리", 14));
    voice = new Spinner(this);
    String[] voices = {"F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5"};
    voice.setAdapter(
        new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, voices));
    a.addView(voice, new LinearLayout.LayoutParams(-1, dp(52)));
    options.addView(a, new LinearLayout.LayoutParams(0, -2, 1));
    LinearLayout b = new LinearLayout(this);
    b.setOrientation(LinearLayout.VERTICAL);
    b.addView(text("읽는 속도", 14));
    speed = new Spinner(this);
    speed.setAdapter(
        new ArrayAdapter<>(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            new String[] {"0.8배", "1.0배", "1.2배"}));
    speed.setSelection(1);
    b.addView(speed, new LinearLayout.LayoutParams(-1, dp(52)));
    options.addView(b, new LinearLayout.LayoutParams(0, -2, 1));
    box.addView(options);
    gap(box, 18);
    generate = button("음성 만들고 듣기");
    generate.setTextColor(Color.WHITE);
    generate.setBackgroundTintList(android.content.res.ColorStateList.valueOf(GREEN));
    generate.setOnClickListener(v -> synthesize());
    box.addView(generate);
    gap(box, 14);
    progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
    progress.setIndeterminate(true);
    box.addView(progress, new LinearLayout.LayoutParams(-1, dp(5)));
    gap(box, 12);
    status = text("첫 실행 준비 중 · 모델 파일을 확인하고 있어요", 15);
    status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    box.addView(status);
    gap(box, 6);
    metrics = text("처음 한 번은 파일 준비에 시간이 걸릴 수 있어요.", 13);
    box.addView(metrics);
    gap(box, 18);
    LinearLayout actions = new LinearLayout(this);
    replay = button("다시 듣기");
    replay.setOnClickListener(v -> play());
    stop = button("재생 중지");
    stop.setOnClickListener(
        v -> {
          stopPlayer();
          status.setText("재생을 중지했습니다.");
        });
    save = button("WAV 저장");
    save.setOnClickListener(
        v -> {
          if (lastAudio != null) {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.setType("audio/wav");
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.putExtra(Intent.EXTRA_TITLE, lastAudio.getName());
            startActivityForResult(intent, 10);
          }
        });
    for (Button bt : new Button[] {replay, stop, save})
      actions.addView(bt, new LinearLayout.LayoutParams(0, -2, 1));
    box.addView(actions);
    gap(box, 32);
    TextView about = text("Supertonic 3 · CPU · 오프라인\nAndroid 테스트 버전 0.1.0", 13);
    box.addView(about);
    gap(box, 8);
    Button license = button("모델 출처와 라이선스");
    license.setOnClickListener(v -> showLicense());
    box.addView(license);
    setContentView(scroll);
    refresh();
  }

  private void refresh() {
    generate.setEnabled(ready && !busy);
    input.setEnabled(!busy);
    voice.setEnabled(!busy);
    speed.setEnabled(!busy);
    replay.setEnabled(lastAudio != null && !busy);
    save.setEnabled(lastAudio != null && !busy);
    stop.setEnabled(player != null);
    progress.setVisibility(busy ? View.VISIBLE : View.INVISIBLE);
  }

  private void ui(Runnable action) {
    runOnUiThread(
        () -> {
          if (!destroyed && !isFinishing()) action.run();
        });
  }

  private void fail(Throwable error, String message) {
    android.util.Log.e("KeeperTTS", message, error);
    ui(
        () -> {
          busy = false;
          status.setText(message);
          metrics.setText(
              error.getClass().getSimpleName() + ": " + String.valueOf(error.getMessage()));
          refresh();
        });
  }

  private File prepareModel() throws Exception {
    File root = new File(getFilesDir(), "supertonic-3");
    JSONObject manifest = new JSONObject(readAsset("supertonic-3/MODEL_SOURCE.json"));
    JSONObject hashes = manifest.getJSONObject("sha256");
    int done = 0, total = hashes.length();
    for (Iterator<String> it = hashes.keys(); it.hasNext(); ) {
      if (destroyed) throw new InterruptedException();
      String relative = it.next();
      File target = new File(root, relative);
      if (!target.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator))
        throw new IOException("Invalid model path");
      String expected = hashes.getString(relative);
      if (!target.isFile() || !sha256(target).equals(expected)) {
        File parent = target.getParentFile();
        if (!parent.isDirectory() && !parent.mkdirs())
          throw new IOException("Cannot create model directory");
        File part = new File(parent, target.getName() + ".part");
        try (InputStream source = getAssets().open("supertonic-3/" + relative);
            OutputStream sink = new FileOutputStream(part)) {
          byte[] buffer = new byte[262144];
          int n;
          while ((n = source.read(buffer)) != -1) sink.write(buffer, 0, n);
        }
        if (!sha256(part).equals(expected))
          throw new IOException("Model checksum mismatch: " + relative);
        if (target.exists() && !target.delete())
          throw new IOException("Cannot replace incomplete model");
        if (!part.renameTo(target)) throw new IOException("Cannot finish model copy");
      }
      final int count = ++done;
      ui(() -> status.setText("모델 파일 확인 중 · " + count + " / " + total));
    }
    return root;
  }

  private String sha256(File file) throws Exception {
    MessageDigest hash = MessageDigest.getInstance("SHA-256");
    try (InputStream source = new FileInputStream(file)) {
      byte[] b = new byte[262144];
      int n;
      while ((n = source.read(b)) != -1) hash.update(b, 0, n);
    }
    StringBuilder out = new StringBuilder();
    for (byte b : hash.digest()) out.append(String.format(Locale.ROOT, "%02x", b & 255));
    return out.toString();
  }

  private String readAsset(String path) throws IOException {
    try (InputStream in = getAssets().open(path);
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] b = new byte[8192];
      int n;
      while ((n = in.read(b)) != -1) out.write(b, 0, n);
      return out.toString("UTF-8");
    }
  }

  private void synthesize() {
    String sentence = input.getText().toString().trim();
    if (sentence.isEmpty()) {
      input.setError("읽을 문장을 입력해 주세요.");
      return;
    }
    stopPlayer();
    busy = true;
    status.setText("음성을 만들고 있어요…");
    refresh();
    String selected = voice.getSelectedItem().toString();
    float rate = new float[] {0.8f, 1f, 1.2f}[speed.getSelectedItemPosition()];
    worker.execute(
        () -> {
          try {
            long start = System.nanoTime();
            TTSResult result;
            try (StyleHandle style =
                new StyleHandle(
                    Helper.loadVoiceStyle(
                        Collections.singletonList(
                            new File(
                                    getFilesDir(),
                                    "supertonic-3/voice_styles/" + selected + ".json")
                                .getPath()),
                        false,
                        environment))) {
              result = engine.call(sentence, "ko", style.value, 5, rate, 0.3f, environment);
            }
            if (result.wav.length == 0) throw new IOException("Empty audio");
            float peak = 0;
            for (float sample : result.wav) {
              if (!Float.isFinite(sample)) throw new IOException("Invalid audio");
              peak = Math.max(peak, Math.abs(sample));
            }
            if (peak == 0) throw new IOException("Silent audio");
            File folder = new File(getFilesDir(), "outputs");
            if (!folder.isDirectory() && !folder.mkdirs())
              throw new IOException("Cannot create output directory");
            File audio = new File(folder, "keeper-" + UUID.randomUUID() + ".wav");
            Helper.writeWavFile(audio.getPath(), result.wav, engine.sampleRate);
            double seconds = (System.nanoTime() - start) / 1e9,
                duration = (double) result.wav.length / engine.sampleRate;
            JSONObject report = new JSONObject();
            report.put("offline", true);
            report.put("voice", selected);
            report.put("speed", rate);
            report.put("steps", 5);
            report.put("inference_seconds", seconds);
            report.put("audio_seconds", duration);
            report.put("sample_rate", engine.sampleRate);
            try (Writer out =
                new OutputStreamWriter(
                    new FileOutputStream(new File(folder, audio.getName() + ".json")),
                    java.nio.charset.StandardCharsets.UTF_8)) {
              out.write(report.toString(2));
            }
            ui(
                () -> {
                  lastAudio = audio;
                  busy = false;
                  metrics.setText(
                      String.format(
                          Locale.KOREA,
                          "생성 %.2f초  ·  음성 %.2f초  ·  %s",
                          seconds,
                          duration,
                          selected));
                  status.setText("음성을 만들었습니다.");
                  refresh();
                  if (foreground) play();
                });
          } catch (Throwable error) {
            fail(error, "음성을 만들지 못했습니다. 문장을 줄이거나 앱을 다시 열어 주세요.");
          }
        });
  }

  private static class StyleHandle implements AutoCloseable {
    final Style value;

    StyleHandle(Style value) {
      this.value = value;
    }

    public void close() throws Exception {
      value.close();
    }
  }

  private void play() {
    if (lastAudio == null) return;
    stopPlayer();
    try {
      player = new MediaPlayer();
      player.setAudioAttributes(
          new AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build());
      player.setDataSource(lastAudio.getPath());
      player.setOnCompletionListener(
          p -> {
            stopPlayer();
            status.setText("재생 완료");
          });
      player.setOnErrorListener(
          (p, w, e) -> {
            stopPlayer();
            status.setText("재생에 실패했습니다. WAV를 저장해 확인해 주세요.");
            return true;
          });
      player.prepare();
      player.start();
      status.setText("재생 중…");
      refresh();
    } catch (Exception error) {
      stopPlayer();
      status.setText("소리를 재생하지 못했습니다. 스피커와 볼륨을 확인해 주세요.");
    }
  }

  private void stopPlayer() {
    if (player != null) {
      player.release();
      player = null;
    }
    if (stop != null) refresh();
  }

  private void showLicense() {
    worker.execute(
        () -> {
          try {
            String body =
                readAsset("MODEL_NOTICE.md")
                    + "\n\n"
                    + readAsset("supertonic-3/LICENSE")
                    + "\n\n"
                    + readAsset("SUPERTONIC_CODE_LICENSE.txt")
                    + "\n\n"
                    + readAsset("ONNXRUNTIME_LICENSE.txt")
                    + "\n\n"
                    + readAsset("JACKSON_LICENSE.txt")
                    + "\n\n"
                    + readAsset("KEEPER_LICENSE.txt");
            ui(
                () ->
                    new AlertDialog.Builder(this)
                        .setTitle("모델 출처와 라이선스")
                        .setMessage(body)
                        .setPositiveButton("닫기", null)
                        .show());
          } catch (Exception error) {
            fail(error, "라이선스 파일을 열지 못했습니다.");
          }
        });
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request == 10
        && result == RESULT_OK
        && data != null
        && data.getData() != null
        && lastAudio != null) {
      File selected = lastAudio;
      android.net.Uri uri = data.getData();
      worker.execute(
          () -> {
            try (InputStream in = new FileInputStream(selected);
                OutputStream out = getContentResolver().openOutputStream(uri)) {
              if (out == null) throw new IOException("Cannot open output");
              byte[] b = new byte[65536];
              int n;
              while ((n = in.read(b)) != -1) out.write(b, 0, n);
              ui(() -> status.setText("WAV 파일을 저장했습니다."));
            } catch (Exception error) {
              fail(error, "파일을 저장하지 못했습니다.");
            }
          });
    }
  }

  @Override
  protected void onStart() {
    super.onStart();
    foreground = true;
  }

  @Override
  protected void onStop() {
    foreground = false;
    stopPlayer();
    super.onStop();
  }

  @Override
  protected void onDestroy() {
    destroyed = true;
    stopPlayer();
    worker.execute(
        () -> {
          try {
            if (engine != null) engine.close();
          } catch (Exception ignored) {
          }
        });
    worker.shutdown();
    super.onDestroy();
  }
}
