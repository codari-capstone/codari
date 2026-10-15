package com.codingmon.api.auth;

import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;

// 기능명세 '계정 규칙'. DB 제약이 아니라 서버에서 검사한다.
final class AccountRules {

    // DB의 users.email·email_tokens.email 컬럼 길이(VARCHAR(320))와 같다.
    static final int EMAIL_MAX_LENGTH = 320;

    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final Pattern NICKNAME = Pattern.compile("^[가-힣A-Za-z0-9]{2,16}$");
    private static final Pattern UPPER = Pattern.compile("[A-Z]");
    private static final Pattern LOWER = Pattern.compile("[a-z]");
    private static final Pattern DIGIT = Pattern.compile("[0-9]");
    // 특수문자는 키보드로 치는 ASCII 기호(!@#$ 등)만 센다.
    private static final Pattern SPECIAL = Pattern.compile("\\p{Punct}");

    private AccountRules() {
    }

    static String email(String email) {
        String trimmed = email == null ? "" : email.strip();
        if (trimmed.length() > EMAIL_MAX_LENGTH || !EMAIL.matcher(trimmed).matches()) {
            throw AuthErrors.error(HttpStatus.BAD_REQUEST, "INVALID_EMAIL", "이메일 형식이 올바르지 않아요");
        }
        return trimmed;
    }

    static String nickname(String nickname) {
        if (nickname == null || !NICKNAME.matcher(nickname).matches()) {
            throw AuthErrors.error(HttpStatus.BAD_REQUEST, "INVALID_NICKNAME", "닉네임은 2~16자의 한글·영문·숫자만 쓸 수 있어요");
        }
        return nickname;
    }

    static String password(String password, String confirm) {
        if (password == null || password.length() < 10 || password.length() > 20
                || !UPPER.matcher(password).find() || !LOWER.matcher(password).find()
                || !DIGIT.matcher(password).find() || !SPECIAL.matcher(password).find()) {
            throw AuthErrors.error(HttpStatus.BAD_REQUEST, "INVALID_PASSWORD",
                    "비밀번호는 10~20자이고 영문 대문자·소문자·숫자·특수문자를 각각 하나 이상 넣어야 해요");
        }
        if (!password.equals(confirm)) {
            throw AuthErrors.error(HttpStatus.BAD_REQUEST, "PASSWORD_MISMATCH", "비밀번호가 일치하지 않아요");
        }
        return password;
    }
}
