package com.codingmon.api.judge;

import java.io.ByteArrayOutputStream;
import java.util.Arrays;

// 출력 비교(AI_FEATURES 10절 판정 규칙). 줄바꿈 문자(CRLF)와 출력 끝의 줄바꿈 한 개만 통일한 뒤 같으면 정답,
// 공백·줄바꿈만 다르면 출력 형식 오류, 공백을 모두 지워도 다르면 오답이다.
// 원본 바이트로 비교한다. 글자로 바꾸면 서로 다른 깨진 바이트가 모두 U+FFFD가 돼 같은 출력으로 보일 수 있다.
final class OutputComparator {

    private OutputComparator() {
    }

    static Verdict compare(byte[] actual, byte[] expected) {
        byte[] a = normalize(actual);
        byte[] e = normalize(expected);
        if (Arrays.equals(a, e)) {
            return Verdict.ACCEPTED;
        }
        if (Arrays.equals(withoutWhitespace(a), withoutWhitespace(e))) {
            return Verdict.PRESENTATION_ERROR;
        }
        return Verdict.WRONG_ANSWER;
    }

    // CRLF를 LF로 바꾸고 끝의 LF 하나를 뗀다. Judge0는 출력이 없으면 null을 준다.
    private static byte[] normalize(byte[] bytes) {
        if (bytes == null) {
            return new byte[0];
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream(bytes.length);
        for (int i = 0; i < bytes.length; i++) {
            if (bytes[i] == '\r' && i + 1 < bytes.length && bytes[i + 1] == '\n') {
                continue;
            }
            out.write(bytes[i]);
        }
        byte[] lf = out.toByteArray();
        return lf.length > 0 && lf[lf.length - 1] == '\n' ? Arrays.copyOf(lf, lf.length - 1) : lf;
    }

    private static byte[] withoutWhitespace(byte[] bytes) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(bytes.length);
        for (byte b : bytes) {
            if (b != ' ' && b != '\t' && b != '\n' && b != '\r' && b != 0x0B && b != '\f') {
                out.write(b);
            }
        }
        return out.toByteArray();
    }
}
