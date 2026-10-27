package com.codingmon.api.problem;

import static com.codingmon.api.problem.AdminProblemController.MAX_INPUT_BYTES;
import static com.codingmon.api.problem.AdminProblemController.MAX_OUTPUT_BYTES;
import static com.codingmon.api.problem.AdminProblemController.MAX_TEST_CASES;
import static com.codingmon.api.problem.AdminProblemController.MAX_TOTAL_BYTES;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.problem.AdminProblemRepository.CaseType;
import com.codingmon.api.problem.AdminProblemRepository.TestCaseInput;

// 테스트케이스 ZIP을 케이스 목록으로 읽는다(openapi `readTestCaseZip`, #34). 저장하지 않는다.
// 압축 폭탄을 막으려고 항목 수와 풀린 바이트를 세다가 상한에서 멈춘다.
final class TestCaseZip {

    // 케이스 10개의 파일 20개에 맥이 넣는 __MACOSX 항목과 폴더 항목을 더해도 넉넉한 값.
    static final int MAX_ENTRIES = 100;

    // 맨 위에 감싼 폴더가 하나 있어도 된다(cases/sample/1.in).
    private static final Pattern CASE_FILE = Pattern.compile("(?:[^/]+/)?(sample|hidden)/(\\d{1,9})\\.(in|out)");
    private static final byte[] BOM = { (byte) 0xEF, (byte) 0xBB, (byte) 0xBF };

    private record Key(CaseType type, int number) {
    }

    private record CaseFile(String name, String text) {
    }

    private TestCaseZip() {
    }

    static List<TestCaseInput> read(byte[] zipBytes) {
        // ZipInputStream은 ZIP이 아닌 바이트를 빈 ZIP처럼 읽으므로 머리 글자(PK)로 먼저 가른다.
        if (zipBytes.length < 2 || zipBytes[0] != 'P' || zipBytes[1] != 'K') {
            throw invalid("ZIP 파일을 읽을 수 없어요");
        }
        Map<Key, CaseFile> inputs = new HashMap<>();
        Map<Key, CaseFile> outputs = new HashMap<>();
        int entries = 0;
        long total = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            for (ZipEntry entry; (entry = zip.getNextEntry()) != null;) {
                if (++entries > MAX_ENTRIES) {
                    throw invalid("ZIP 안 파일이 너무 많아요. " + MAX_ENTRIES + "개까지 읽을 수 있어요");
                }
                String name = entry.getName();
                if (entry.isDirectory() || ignored(name)) {
                    continue;
                }
                Matcher matcher = CASE_FILE.matcher(name);
                if (!matcher.matches() || Integer.parseInt(matcher.group(2)) == 0) {
                    throw invalid("규칙에 맞지 않는 파일이 있어요: " + name + ". sample/ 또는 hidden/ 폴더에 N.in·N.out 이름으로 넣어 주세요");
                }
                boolean input = matcher.group(3).equals("in");
                int max = input ? MAX_INPUT_BYTES : MAX_OUTPUT_BYTES;
                byte[] bytes = zip.readNBytes(max + 1);
                if (bytes.length > max) {
                    throw AdminProblemController.limitExceeded(name + "이 " + AdminProblemController.mib(max) + "를 넘어요");
                }
                total += bytes.length;
                if (total > MAX_TOTAL_BYTES) {
                    throw AdminProblemController.totalTooLarge();
                }
                Key key = new Key(CaseType.valueOf(matcher.group(1).toUpperCase()), Integer.parseInt(matcher.group(2)));
                CaseFile file = new CaseFile(name, utf8(name, bytes));
                CaseFile before = (input ? inputs : outputs).putIfAbsent(key, file);
                if (before != null) {
                    throw invalid("번호가 같은 파일이 있어요: " + before.name() + ", " + name);
                }
            }
        } catch (IOException e) {
            throw invalid("ZIP 파일을 읽을 수 없어요");
        }
        // 공개 예제 먼저, 그 안에서 번호 순서(CaseType 선언 순서가 SAMPLE, HIDDEN이다).
        Set<Key> keys = new TreeSet<>(Comparator.comparing(Key::type).thenComparingInt(Key::number));
        keys.addAll(inputs.keySet());
        keys.addAll(outputs.keySet());
        if (keys.isEmpty()) {
            throw invalid("ZIP에 케이스가 없어요. sample/ 또는 hidden/ 폴더에 N.in·N.out을 넣어 주세요");
        }
        List<TestCaseInput> cases = new ArrayList<>();
        for (Key key : keys) {
            CaseFile input = inputs.get(key);
            CaseFile output = outputs.get(key);
            if (input == null || output == null) {
                throw invalid("짝이 없는 파일이 있어요: " + (input == null ? output : input).name());
            }
            cases.add(new TestCaseInput(key.type(), input.text(), output.text()));
        }
        if (cases.size() > MAX_TEST_CASES) {
            throw AdminProblemController.tooManyTestCases();
        }
        return cases;
    }

    // 맥이 압축할 때 넣는 파일.
    private static boolean ignored(String name) {
        return name.startsWith("__MACOSX/") || name.equals(".DS_Store") || name.endsWith("/.DS_Store");
    }

    // 깨진 바이트를 몰래 바꾸지 않고 거절한다. 맨 앞 BOM은 내용이 아니라 인코딩 표시라 지운다.
    private static String utf8(String name, byte[] bytes) {
        int from = bytes.length >= BOM.length && Arrays.equals(bytes, 0, BOM.length, BOM, 0, BOM.length) ? BOM.length : 0;
        try {
            return StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes, from, bytes.length - from)).toString();
        } catch (CharacterCodingException e) {
            throw invalid("UTF-8이 아닌 파일이 있어요: " + name);
        }
    }

    private static ErrorResponseException invalid(String detail) {
        return ApiErrors.error(HttpStatus.BAD_REQUEST, "ZIP_INVALID", detail);
    }
}
