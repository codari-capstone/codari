package com.codingmon.api.auth;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface OAuthAccountRepository extends JpaRepository<OAuthAccount, Long> {

    Optional<OAuthAccount> findByProviderAndProviderUserId(String provider, String providerUserId);
}
