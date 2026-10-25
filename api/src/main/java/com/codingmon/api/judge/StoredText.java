package com.codingmon.api.judge;

import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

// DB에 저장할 출력·메시지 변환(database-schema.md). PostgreSQL 문자열은 NUL과 잘못된 UTF-8을 받지 못해,
// 그대로 넣으면 저장이 실패하고 제출이 진행 중에 멈춘다. 깨진 바이트와 NUL을 U+FFFD로 바꾸고 65,536자로 자른다.
final class StoredText {

    // VARCHAR(65536)는 코드 포인트 단위로 센다.
    static final int MAX_CHARS = 65_536;

    // Judge0 실행 스크립트가 신호로 끝난 프로그램의 stderr 끝에 붙이는 줄. 내부 경로가 들어 있다(judge-verdict-mapping.md 7절).
    private static final Pattern JUDGE_RUN_LINE = Pattern.compile("^run: line \\d+:");

    private StoredText() {
    }

    static String of(byte[] bytes) {
        // new String은 잘못된 UTF-8 바이트를 U+FFFD로 바꾼다.
        return bytes == null ? null : of(new String(bytes, StandardCharsets.UTF_8));
    }

    static String of(String text) {
        if (text == null) {
            return null;
        }
        String safe = text.replace('\0', '�');
        return safe.codePointCount(0, safe.length()) <= MAX_CHARS ? safe
                : safe.substring(0, safe.offsetByCodePoints(0, MAX_CHARS));
    }

    // 판정에 쓰려고 stderr를 글자로 읽는다. 글자로 바꾼 값은 비교에 쓰지 않는다.
    static String decode(byte[] bytes) {
        return bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8);
    }

    static String withoutJudgeLines(String stderr) {
        return stderr.lines().filter(line -> !JUDGE_RUN_LINE.matcher(line).find())
                .collect(Collectors.joining("\n")).stripTrailing();
    }
}
