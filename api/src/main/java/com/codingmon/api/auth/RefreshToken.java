package com.codingmon.api.auth;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;

    private String tokenHash;

    private UUID familyId;

    private Instant expiresAt;

    private Instant revokedAt;

    private Long replacedByTokenId;

    @Column(insertable = false, updatable = false)
    private Instant createdAt;

    protected RefreshToken() {
    }

    RefreshToken(Long userId, String tokenHash, UUID familyId, Instant expiresAt) {
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.familyId = familyId;
        this.expiresAt = expiresAt;
    }

    void replaceWith(RefreshToken next, Instant now) {
        revokedAt = now;
        replacedByTokenId = next.id;
    }

    UUID getFamilyId() {
        return familyId;
    }

    boolean isExpired(Instant now) {
        return !expiresAt.isAfter(now);
    }

    boolean isRevoked() {
        return revokedAt != null;
    }

    boolean isReplaced() {
        return replacedByTokenId != null;
    }

    // 교체할 때 revokedAt에 교체 시각을 남긴다.
    boolean isReplacedBefore(Instant time) {
        return isReplaced() && revokedAt.isBefore(time);
    }
}
