package com.codingmon.api.auth;

import java.time.Instant;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

interface EmailCodeRepository extends JpaRepository<EmailCode, Long> {

    // 같은 인증번호로 동시에 확인해도 틀린 횟수가 빠지지 않도록 행을 잠근다.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from EmailCode c where lower(c.email) = lower(:email) and c.purpose = :purpose and c.usedAt is null")
    Optional<EmailCode> findActiveForUpdate(String email, EmailCode.Purpose purpose);

    @Query("select max(c.createdAt) from EmailCode c where lower(c.email) = lower(:email) and c.purpose = :purpose")
    Optional<Instant> findLastSentAt(String email, EmailCode.Purpose purpose);

    @Query("select count(c) from EmailCode c where lower(c.email) = lower(:email) and c.purpose = :purpose and c.createdAt >= :since")
    long countSentSince(String email, EmailCode.Purpose purpose, Instant since);

    @Modifying
    @Query("update EmailCode c set c.usedAt = :now where lower(c.email) = lower(:email) and c.purpose = :purpose and c.usedAt is null")
    void invalidateActive(String email, EmailCode.Purpose purpose, Instant now);

    @Modifying
    @Query("delete from EmailCode c where c.createdAt < :before")
    void deleteCreatedBefore(Instant before);
}
