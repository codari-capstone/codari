package com.codingmon.api.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
class EmailSender {

    private static final Logger log = LoggerFactory.getLogger(EmailSender.class);

    private final ObjectProvider<JavaMailSender> mailSender;
    private final String from;

    EmailSender(ObjectProvider<JavaMailSender> mailSender, @Value("${app.mail.from}") String from) {
        this.mailSender = mailSender;
        this.from = from;
    }

    void sendCode(String to, EmailCode.Purpose purpose, String code) {
        JavaMailSender sender = mailSender.getIfAvailable();
        if (sender == null) {
            // SMTP 설정이 없는 로컬 개발 환경에서만 이 경로를 탄다.
            log.warn("SMTP 설정이 없어 메일 대신 로그에 남긴다: {} {} {}", to, purpose, code);
            return;
        }
        String subject = purpose == EmailCode.Purpose.VERIFY_EMAIL ? "회원가입 인증번호" : "비밀번호 재설정 인증번호";
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(to);
        message.setSubject("[codingmon] " + subject);
        message.setText("인증번호: " + code + "\n5분 안에 입력해 주세요.");
        sender.send(message);
    }
}
