package com.codingmon.api.judge;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

class OutputComparatorTest {

    @Test
    void 끝_줄바꿈_하나와_CRLF는_같게_본다() {
        assertThat(compare("1 2\n3", "1 2\n3\n")).isEqualTo(Verdict.ACCEPTED);
        assertThat(compare("1 2\r\n3\r\n", "1 2\n3\n")).isEqualTo(Verdict.ACCEPTED);
        assertThat(compare("", "")).isEqualTo(Verdict.ACCEPTED);
        assertThat(OutputComparator.compare(null, bytes("\n"))).isEqualTo(Verdict.ACCEPTED);
    }

    @Test
    void 공백과_줄바꿈만_다르면_출력_형식_오류다() {
        assertThat(compare("3 \n", "3\n")).isEqualTo(Verdict.PRESENTATION_ERROR);
        assertThat(compare("3\n\n", "3\n")).isEqualTo(Verdict.PRESENTATION_ERROR);
        assertThat(compare("1\n\n2\n", "1\n2\n")).isEqualTo(Verdict.PRESENTATION_ERROR);
        assertThat(compare("1 2\n", "1\n2\n")).isEqualTo(Verdict.PRESENTATION_ERROR);
        assertThat(compare("1\t2", "1 2")).isEqualTo(Verdict.PRESENTATION_ERROR);
    }

    @Test
    void 공백을_지워도_다르면_오답이다() {
        assertThat(compare("4\n", "3\n")).isEqualTo(Verdict.WRONG_ANSWER);
        assertThat(OutputComparator.compare(null, bytes("0\n"))).isEqualTo(Verdict.WRONG_ANSWER);
        assertThat(compare("1 2 3\n", "1 2\n")).isEqualTo(Verdict.WRONG_ANSWER);
    }

    @Test
    void 긴_출력도_끝까지_비교한다() {
        String expected = "7\n".repeat(500_000);
        assertThat(compare(expected, expected)).isEqualTo(Verdict.ACCEPTED);
        assertThat(compare(expected.substring(0, expected.length() - 2) + "8\n", expected)).isEqualTo(Verdict.WRONG_ANSWER);
    }

    private static Verdict compare(String actual, String expected) {
        return OutputComparator.compare(bytes(actual), bytes(expected));
    }

    private static byte[] bytes(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }
}
