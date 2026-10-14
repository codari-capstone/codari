package com.codingmon.api.auth;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    // 엔티티를 읽지 않고 사용자만 찾는다. 사용자 행을 잠근 뒤 토큰을 최신 상태로 다시 읽기 위해서다.
    @Query("select t.userId from RefreshToken t where t.tokenHash = :tokenHash")
    Optional<Long> findUserIdByTokenHash(String tokenHash);

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    // 호출하기 전에 사용자 행을 잠가야 한다. 그래야 폐기 중에 같은 묶음의 새 토큰이 생기지 않는다.
    @Modifying
    @Query("update RefreshToken t set t.revokedAt = :now where t.familyId = :familyId and t.revokedAt is null")
    void revokeFamily(UUID familyId, Instant now);

    // 호출하기 전에 사용자 행을 잠가야 한다(revokeFamily와 같다).
    @Modifying
    @Query("update RefreshToken t set t.revokedAt = :now where t.userId = :userId and t.revokedAt is null")
    void revokeAllOfUser(Long userId, Instant now);

    @Modifying
    @Query("delete from RefreshToken t where t.expiresAt < :now")
    void deleteExpired(Instant now);
}
