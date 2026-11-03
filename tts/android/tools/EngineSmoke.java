package io.keeper.tts;

import ai.onnxruntime.OrtEnvironment;
import java.io.File;
import java.util.Collections;

/** Runs the same Android inference implementation on desktop ONNX Runtime. */
public class EngineSmoke {
  public static void main(String[] args) throws Exception {
    OrtEnvironment env = OrtEnvironment.getEnvironment();
    TextToSpeech tts = Helper.loadTextToSpeech(args[0] + "/onnx", false, env);
    try {
      for (int i = 0; i < 3; i++) {
        String name = i == 1 ? "M1" : "F1";
        Style style =
            Helper.loadVoiceStyle(
                Collections.singletonList(args[0] + "/voice_styles/" + name + ".json"), false, env);
        try {
          String text =
              i == 2 ? "아메리카노 두 잔입니다. 결제 금액은 팔천 원입니다. 카드를 챙겨 주세요." : "안녕하세요. 키퍼 키오스크 도우미입니다.";
          long start = System.nanoTime();
          TTSResult result = tts.call(text, "ko", style, 5, 1f, 0.3f, env);
          double elapsed = (System.nanoTime() - start) / 1e9;
          float peak = 0;
          for (float v : result.wav) {
            if (!Float.isFinite(v)) throw new AssertionError("Non-finite output");
            peak = Math.max(peak, Math.abs(v));
          }
          if (peak == 0 || result.wav.length < tts.sampleRate / 2)
            throw new AssertionError("Silent/short output");
          File out = new File(args[1], "android-engine-" + i + ".wav");
          Helper.writeWavFile(out.getPath(), result.wav, tts.sampleRate);
          if (out.length() != 44 + 2L * result.wav.length)
            throw new AssertionError("Invalid WAV length");
          System.out.printf(
              "PASS %s: %dHz, %.2fs audio, %.2fs inference, %s%n",
              name, tts.sampleRate, (double) result.wav.length / tts.sampleRate, elapsed, out);
        } finally {
          style.close();
        }
      }
    } finally {
      tts.close();
    }
  }
}
