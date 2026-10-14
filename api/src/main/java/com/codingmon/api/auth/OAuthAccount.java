package com.codingmon.api.auth;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "oauth_accounts")
class OAuthAccount {

    static final String GITHUB = "GITHUB";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;

    private String provider;

    private String providerUserId;

    private String providerUsername;

    protected OAuthAccount() {
    }

    OAuthAccount(Long userId, String providerUserId, String providerUsername) {
        this.userId = userId;
        this.provider = GITHUB;
        this.providerUserId = providerUserId;
        this.providerUsername = providerUsername;
    }

    Long getUserId() {
        return userId;
    }

    // 사용자명은 바뀔 수 있어 로그인할 때마다 최신 값으로 남긴다(참고용).
    void updateUsername(String providerUsername) {
        this.providerUsername = providerUsername;
    }
}
