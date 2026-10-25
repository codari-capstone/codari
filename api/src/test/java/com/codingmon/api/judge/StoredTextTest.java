package com.codingmon.api.judge;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class StoredTextTest {

    @Test
    void 깨진_바이트와_NUL은_대체_문자로_바꾼다() {
        assertThat(StoredText.of(new byte[] { 'a', (byte) 0xFF, 0, 'b' })).isEqualTo("a��b");
        assertThat(StoredText.of((byte[]) null)).isNull();
    }

    @Test
    void 코드_포인트_65536자로_자른다() {
        String emoji = "😀";
        String text = "a".repeat(StoredText.MAX_CHARS - 1) + emoji + emoji;
        String stored = StoredText.of(text);
        assertThat(stored.codePointCount(0, stored.length())).isEqualTo(StoredText.MAX_CHARS);
        // 서로게이트 쌍 중간에서 자르지 않는다
        assertThat(stored).endsWith(emoji);
        assertThat(StoredText.of("짧은 출력")).isEqualTo("짧은 출력");
    }

    @Test
    void Judge0_실행_스크립트_줄을_지운다() {
        assertThat(StoredText.withoutJudgeLines("Traceback (most recent call last):\nIndexError: x\n"
                + "run: line 1:     3 Killed                  /usr/local/python-3.8.1/bin/python3 script.py\n"))
                .isEqualTo("Traceback (most recent call last):\nIndexError: x");
        assertThat(StoredText.withoutJudgeLines("run: line 1:     3 Segmentation fault      ./a.out\n")).isEmpty();
    }
}
