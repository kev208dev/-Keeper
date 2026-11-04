package io.keeper.kiosk;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.TextView;
import io.keeper.tts.KeeperTtsEngine;
import java.io.File;
import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
  private static final int INK = Color.rgb(28, 43, 36);
  private static final int GREEN = Color.rgb(31, 111, 79);
  private static final int PALE = Color.rgb(244, 247, 242);
  private static final long POLL_MS = 5_000;

  private final ExecutorService network = Executors.newSingleThreadExecutor();
  private final Handler main = new Handler(Looper.getMainLooper());
  private KioskPreferences preferences;
  private KioskSession session;
  private KeeperTtsEngine tts;
  private boolean destroyed;
  private boolean ttsReady;
  private String ttsState = "오프라인 음성 모델 준비 중";
  private TextView connectionView;
  private TextView waitingView;
  private final Runnable poll = this::pollReplies;

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    preferences = new KioskPreferences(this);
    session = new KioskSession(preferences, () -> "inquiry-" + UUID.randomUUID());
    tts = KeeperTtsEngine.get(this);
    enterImmersiveMode();
    initializeTts();
    if (session.pendingInquiry() == null) showHome();
    else showWaiting(session.pendingInquiry(), "전송 상태를 확인하고 있어요.");
    main.post(poll);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) enterImmersiveMode();
  }

  @Override
  protected void onDestroy() {
    destroyed = true;
    main.removeCallbacksAndMessages(null);
    tts.stop();
    network.shutdownNow();
    super.onDestroy();
  }

  private void enterImmersiveMode() {
    getWindow()
        .getDecorView()
        .setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
  }

  private void initializeTts() {
    tts.initialize(
        new KeeperTtsEngine.Listener() {
          @Override
          public void onReady() {
            ttsReady = true;
            ttsState = "오프라인 음성 안내 준비 완료";
          }

          @Override
          public void onState(String message) {
            ttsState = message;
          }

          @Override
          public void onError(String message, Throwable error) {
            ttsReady = false;
            ttsState = message;
          }
        });
  }

  private void showHome() {
    LinearLayout box = page();
    TextView brand = text("#Keeper", 38);
    brand.setContentDescription("키퍼");
    box.addView(brand);
    gap(box, 8);
    box.addView(text("무엇을 도와드릴까요?", 24));
    gap(box, 28);

    Button inquiry = primaryButton("점주에게 도움 요청");
    inquiry.setOnClickListener(view -> showInquiry());
    box.addView(inquiry, wide(74));
    gap(box, 14);
    Button voice = secondaryButton("음성 안내 듣기");
    voice.setOnClickListener(view -> showVoiceGuide());
    box.addView(voice, wide(68));
    gap(box, 24);

    PendingInquiry pending = session.pendingInquiry();
    if (pending != null) {
      Button resume = secondaryButton("보낸 문의 확인");
      resume.setOnClickListener(view -> showWaiting(pending, "점주의 답변을 기다리고 있어요."));
      box.addView(resume, wide(60));
      gap(box, 20);
    }

    connectionView = text(connectionSummary(), 15);
    connectionView.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    box.addView(connectionView);
    gap(box, 28);
    Button settings = secondaryButton("개발자 설정");
    settings.setOnClickListener(view -> showSettings());
    box.addView(settings, wide(56));
    setPage(box);
  }

  private void showInquiry() {
    LinearLayout box = page();
    addHeader(box, "도움 요청", this::showHome);
    box.addView(text("문의 종류", 16));
    Spinner categories = new Spinner(this);
    String[] labels = {"결제 문제", "출입 문제", "상품 문의", "기타 도움"};
    categories.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, labels));
    box.addView(categories, wide(58));
    gap(box, 18);
    box.addView(text("상황을 간단히 적어 주세요", 16));
    EditText message = new EditText(this);
    message.setTextSize(20);
    message.setTextColor(INK);
    message.setHint("예: 결제했는데 문이 열리지 않아요");
    message.setGravity(Gravity.TOP);
    message.setMinLines(4);
    message.setMaxLines(6);
    message.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
    box.addView(message, wide(150));
    gap(box, 20);
    Button send = primaryButton("점주에게 보내기");
    send.setOnClickListener(
        view -> {
          String body = message.getText().toString().trim();
          if (body.isEmpty()) {
            message.setError("상황을 입력해 주세요.");
            return;
          }
          PendingInquiry inquiry;
          synchronized (session) {
            inquiry =
                session.beginOrResume(
                    labels[categories.getSelectedItemPosition()], body, OffsetDateTime.now().toString());
          }
          showWaiting(inquiry, "문의 내용을 보내고 있어요.");
          sendInquiry(inquiry);
        });
    box.addView(send, wide(68));
    setPage(box);
  }

  private void showWaiting(PendingInquiry inquiry, String state) {
    LinearLayout box = page();
    addHeader(box, "문의 접수", this::showHome);
    box.addView(text("점주에게 문의를 전달했어요", 28));
    gap(box, 16);
    box.addView(text(inquiry.category, 17));
    gap(box, 8);
    TextView message = text(inquiry.message, 22);
    message.setPadding(dp(20), dp(20), dp(20), dp(20));
    message.setBackgroundColor(Color.WHITE);
    box.addView(message, wide(-2));
    gap(box, 24);
    waitingView = text(state, 17);
    waitingView.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_ASSERTIVE);
    box.addView(waitingView);
    gap(box, 18);
    Button retry = secondaryButton("전송 다시 시도");
    retry.setOnClickListener(
        view -> {
          waitingView.setText("같은 문의 번호로 다시 보내고 있어요.");
          sendInquiry(inquiry);
        });
    box.addView(retry, wide(60));
    setPage(box);
  }

  private void sendInquiry(PendingInquiry inquiry) {
    network.execute(
        () -> {
          try {
            String result = client().sendInquiry(inquiry);
            ui(
                () -> {
                  if (waitingView != null) {
                    waitingView.setText(
                        "duplicate".equals(result)
                            ? "문의가 이미 접수되어 답변을 기다리고 있어요."
                            : "문의가 접수됐어요. 점주의 답변을 기다리고 있어요.");
                  }
                });
          } catch (IOException error) {
            ui(() -> updateWaiting("전송하지 못했어요. 설정을 확인한 뒤 다시 시도해 주세요.\n" + error.getMessage()));
          }
        });
  }

  private void showReply(ReplyMessage reply) {
    LinearLayout box = page();
    box.addView(text("점주 답변이 도착했어요", 30));
    gap(box, 20);
    TextView body = text(reply.body, 26);
    body.setPadding(dp(24), dp(24), dp(24), dp(24));
    body.setBackgroundColor(Color.WHITE);
    body.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_ASSERTIVE);
    box.addView(body, wide(-2));
    gap(box, 10);
    box.addView(text(formatTime(reply.sentAt), 14));
    gap(box, 24);
    TextView speech = text(ttsState, 15);
    box.addView(speech);
    gap(box, 12);
    Button listen = primaryButton("답변 음성으로 듣기");
    listen.setEnabled(ttsReady);
    listen.setOnClickListener(view -> speak(reply.body, speech));
    box.addView(listen, wide(64));
    gap(box, 12);
    Button home = secondaryButton("처음 화면으로");
    home.setOnClickListener(view -> showHome());
    box.addView(home, wide(60));
    setPage(box);

    // setContentView 뒤의 UI 프레임에서만 delivered ACK를 큐에 넣는다.
    getWindow()
        .getDecorView()
        .post(
            () -> {
              synchronized (session) {
                session.onReplyRendered(reply.id);
              }
              acknowledge(reply.id);
            });
  }

  private void showVoiceGuide() {
    LinearLayout box = page();
    addHeader(box, "음성 안내", this::showHome);
    TextView sentence = text("도움이 필요하면 점주에게 도움 요청 버튼을 눌러 주세요.", 25);
    sentence.setPadding(dp(20), dp(20), dp(20), dp(20));
    sentence.setBackgroundColor(Color.WHITE);
    box.addView(sentence, wide(-2));
    gap(box, 20);
    TextView state = text(ttsState, 16);
    state.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    box.addView(state);
    gap(box, 18);
    Button play = primaryButton("안내 듣기");
    play.setEnabled(ttsReady);
    play.setOnClickListener(view -> speak(sentence.getText().toString(), state));
    box.addView(play, wide(64));
    gap(box, 12);
    Button replay = secondaryButton("다시 듣기");
    replay.setEnabled(ttsReady);
    replay.setOnClickListener(view -> tts.replay(preferences.volume(), ttsListener(state)));
    box.addView(replay, wide(58));
    gap(box, 12);
    Button stop = secondaryButton("재생 중지");
    stop.setOnClickListener(
        view -> {
          tts.stop();
          state.setText("음성 재생을 중지했습니다.");
        });
    box.addView(stop, wide(58));
    setPage(box);
  }

  private void speak(String sentence, TextView state) {
    if (!ttsReady) {
      state.setText(ttsState);
      return;
    }
    tts.speak(
        sentence,
        preferences.voice(),
        preferences.speed(),
        preferences.volume(),
        ttsListener(state));
  }

  private KeeperTtsEngine.Listener ttsListener(TextView state) {
    return new KeeperTtsEngine.Listener() {
      @Override
      public void onState(String message) {
        ttsState = message;
        state.setText(message);
      }

      @Override
      public void onComplete(File audio) {
        state.setText("음성을 만들었습니다. 재생을 시작합니다.");
      }

      @Override
      public void onError(String message, Throwable error) {
        ttsState = message;
        state.setText(message + " " + String.valueOf(error.getMessage()));
      }
    };
  }

  private void showSettings() {
    LinearLayout box = page();
    addHeader(box, "개발자 설정", this::showHome);
    box.addView(text("서버 주소", 15));
    EditText server = input(preferences.serverUrl(), "예: http://192.168.0.10:8000");
    server.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
    box.addView(server, wide(56));
    gap(box, 14);
    box.addView(text("기기 키", 15));
    EditText key = input(preferences.deviceKey(), "점주 앱에서 발급한 기기 키");
    key.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
    box.addView(key, wide(56));
    gap(box, 18);
    TextView testState = text("기기 ID: " + preferences.deviceId(), 13);
    testState.setTextIsSelectable(true);
    box.addView(testState);
    gap(box, 12);
    Button test = secondaryButton("연결 테스트");
    test.setOnClickListener(
        view -> {
          testState.setText("서버 연결을 확인하고 있어요.");
          network.execute(
              () -> {
                try {
                  new KeeperApiClient(
                          server.getText().toString(), key.getText().toString(), preferences.deviceId())
                      .heartbeat();
                  ui(() -> testState.setText("연결 성공 · 기기 ID: " + preferences.deviceId()));
                } catch (IOException error) {
                  ui(() -> testState.setText("연결 실패 · " + error.getMessage()));
                }
              });
        });
    box.addView(test, wide(58));
    gap(box, 22);
    box.addView(text("목소리", 15));
    Spinner voice = new Spinner(this);
    String[] voices = {"F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5"};
    voice.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, voices));
    for (int index = 0; index < voices.length; index++) {
      if (voices[index].equals(preferences.voice())) voice.setSelection(index);
    }
    box.addView(voice, wide(54));
    gap(box, 12);
    TextView speedLabel = text(String.format(Locale.KOREA, "읽기 속도 %.1f배", preferences.speed()), 15);
    box.addView(speedLabel);
    SeekBar speed = new SeekBar(this);
    speed.setMax(4);
    speed.setProgress(Math.round((preferences.speed() - 0.8f) * 5));
    speed.setOnSeekBarChangeListener(seekListener(value -> speedLabel.setText(String.format(Locale.KOREA, "읽기 속도 %.1f배", 0.8f + value * 0.2f))));
    box.addView(speed, wide(50));
    TextView volumeLabel = text("음량 " + Math.round(preferences.volume() * 100) + "%", 15);
    box.addView(volumeLabel);
    SeekBar volume = new SeekBar(this);
    volume.setMax(10);
    volume.setProgress(Math.round(preferences.volume() * 10));
    volume.setOnSeekBarChangeListener(seekListener(value -> volumeLabel.setText("음량 " + value * 10 + "%")));
    box.addView(volume, wide(50));
    gap(box, 18);
    Button save = primaryButton("설정 저장");
    save.setOnClickListener(
        view -> {
          preferences.saveConnection(server.getText().toString(), key.getText().toString());
          preferences.saveVoice(
              voices[voice.getSelectedItemPosition()], 0.8f + speed.getProgress() * 0.2f, volume.getProgress() / 10f);
          showHome();
        });
    box.addView(save, wide(64));
    gap(box, 22);
    box.addView(text("앱 버전 1.0.0-demo · Android 8.0 이상\n" + ttsState, 13));
    setPage(box);
  }

  private SeekBar.OnSeekBarChangeListener seekListener(IntConsumer changed) {
    return new SeekBar.OnSeekBarChangeListener() {
      @Override
      public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
        changed.accept(progress);
      }

      @Override
      public void onStartTrackingTouch(SeekBar seekBar) {}

      @Override
      public void onStopTrackingTouch(SeekBar seekBar) {}
    };
  }

  private interface IntConsumer {
    void accept(int value);
  }

  private void pollReplies() {
    if (destroyed) return;
    if (!preferences.isConfigured()) {
      updateConnection("연결 설정이 필요합니다.");
      main.postDelayed(poll, POLL_MS);
      return;
    }
    network.execute(
        () -> {
          try {
            retryAcknowledgements();
            List<ReplyMessage> replies = client().pullReplies();
            ui(() -> updateConnection("서버 연결됨 · 답변 확인 중"));
            for (ReplyMessage reply : replies) handleReply(reply);
          } catch (IOException error) {
            ui(() -> updateConnection("서버 연결 안 됨 · " + error.getMessage()));
          } finally {
            if (!destroyed) main.postDelayed(poll, POLL_MS);
          }
        });
  }

  private void handleReply(ReplyMessage reply) {
    KioskSession.ReplyAction action;
    synchronized (session) {
      action = session.onReplyReceived(reply.id, reply.inquiryId);
    }
    if (action == KioskSession.ReplyAction.ACK_ONLY) acknowledgeNow(reply.id);
    else if (action == KioskSession.ReplyAction.DISPLAY) ui(() -> showReply(reply));
  }

  private void retryAcknowledgements() {
    Set<String> pending;
    synchronized (session) {
      pending = session.pendingAcknowledgements();
    }
    for (String replyId : pending) acknowledgeNow(replyId);
  }

  private void acknowledge(String replyId) {
    network.execute(() -> acknowledgeNow(replyId));
  }

  private void acknowledgeNow(String replyId) {
    try {
      client().acknowledgeReply(replyId);
      synchronized (session) {
        session.onReplyAcknowledged(replyId);
      }
    } catch (IOException error) {
      // ACK는 세션에 남아 다음 poll에서 같은 답변 ID로 다시 시도한다.
    }
  }

  private KeeperApiClient client() {
    return new KeeperApiClient(preferences.serverUrl(), preferences.deviceKey(), preferences.deviceId());
  }

  private void updateConnection(String message) {
    if (connectionView != null) connectionView.setText(message);
  }

  private void updateWaiting(String message) {
    if (waitingView != null) waitingView.setText(message);
  }

  private String connectionSummary() {
    return preferences.isConfigured() ? "서버 연결을 확인하고 있어요." : "사용 전 개발자 설정에서 서버와 기기 키를 입력해 주세요.";
  }

  private String formatTime(String value) {
    if (value == null || value.isEmpty()) return "";
    return "보낸 시각 " + value.replace('T', ' ').replace("+09:00", "");
  }

  private void ui(Runnable action) {
    main.post(
        () -> {
          if (!destroyed && !isFinishing()) action.run();
        });
  }

  private LinearLayout page() {
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);
    box.setPadding(dp(44), dp(34), dp(44), dp(34));
    box.setGravity(Gravity.CENTER_HORIZONTAL);
    return box;
  }

  private void setPage(LinearLayout box) {
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    scroll.setBackgroundColor(PALE);
    scroll.addView(box, new ScrollView.LayoutParams(-1, -2));
    setContentView(scroll);
    enterImmersiveMode();
  }

  private void addHeader(LinearLayout box, String title, Runnable back) {
    LinearLayout row = new LinearLayout(this);
    row.setGravity(Gravity.CENTER_VERTICAL);
    Button button = secondaryButton("← 처음으로");
    button.setOnClickListener(view -> back.run());
    row.addView(button, new LinearLayout.LayoutParams(dp(145), dp(54)));
    TextView heading = text(title, 27);
    heading.setGravity(Gravity.CENTER);
    row.addView(heading, new LinearLayout.LayoutParams(0, dp(58), 1));
    View balance = new View(this);
    row.addView(balance, new LinearLayout.LayoutParams(dp(145), dp(1)));
    box.addView(row, wide(62));
    gap(box, 24);
  }

  private TextView text(String value, int size) {
    TextView text = new TextView(this);
    text.setText(value);
    text.setTextSize(size);
    text.setTextColor(INK);
    return text;
  }

  private EditText input(String value, String hint) {
    EditText input = new EditText(this);
    input.setText(value);
    input.setHint(hint);
    input.setTextSize(17);
    input.setTextColor(INK);
    input.setSingleLine(true);
    return input;
  }

  private Button primaryButton(String label) {
    Button button = new Button(this);
    button.setText(label);
    button.setTextSize(19);
    button.setTextColor(Color.WHITE);
    button.setAllCaps(false);
    button.setBackgroundTintList(ColorStateList.valueOf(GREEN));
    return button;
  }

  private Button secondaryButton(String label) {
    Button button = new Button(this);
    button.setText(label);
    button.setTextSize(17);
    button.setTextColor(INK);
    button.setAllCaps(false);
    button.setBackgroundTintList(ColorStateList.valueOf(Color.WHITE));
    return button;
  }

  private LinearLayout.LayoutParams wide(int height) {
    return new LinearLayout.LayoutParams(-1, height < 0 ? height : dp(height));
  }

  private void gap(LinearLayout box, int height) {
    box.addView(new View(this), new LinearLayout.LayoutParams(1, dp(height)));
  }

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }
}
