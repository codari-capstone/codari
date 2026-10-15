package com.codingmon.api.auth;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "email_tokens")
class EmailCode {

    static final int MAX_ATTEMPTS = 5;

    enum Purpose {
        VERIFY_EMAIL, RESET_PASSWORD
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String email;

    @Enumerated(EnumType.STRING)
    private Purpose purpose;

    private String tokenHash;

    private short attemptCount;

    private Instant expiresAt;

    private Instant usedAt;

    @Column(insertable = false, updatable = false)
    private Instant createdAt;

    protected EmailCode() {
    }

    EmailCode(String email, Purpose purpose, String tokenHash, Instant expiresAt) {
        this.email = email;
        this.purpose = purpose;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
    }

    String getTokenHash() {
        return tokenHash;
    }

    boolean isExpired(Instant now) {
        return !expiresAt.isAfter(now);
    }

    // 틀린 횟수를 올리고, 5회가 되면 무효로 한다. 무효가 되면 true.
    boolean fail(Instant now) {
        attemptCount++;
        if (attemptCount >= MAX_ATTEMPTS) {
            usedAt = now;
            return true;
        }
        return false;
    }

    void use(Instant now) {
        usedAt = now;
    }
}
