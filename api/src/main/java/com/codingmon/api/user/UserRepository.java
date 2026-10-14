package com.codingmon.api.user;

import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface UserRepository extends JpaRepository<User, Long> {

    @Query("select u from User u where lower(u.email) = lower(:email)")
    Optional<User> findByEmail(String email);

    @Query("select count(u) > 0 from User u where lower(u.email) = lower(:email)")
    boolean existsByEmail(String email);

    @Query("select count(u) > 0 from User u where lower(u.nickname) = lower(:nickname)")
    boolean existsByNickname(String nickname);

    @Query("select u.tokenVersion from User u where u.id = :id")
    Optional<Integer> findTokenVersionById(Long id);

    // 토큰 갱신·폐기를 사용자 단위로 순서대로 처리하려고 행을 잠근다.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id")
    Optional<User> findForUpdateById(Long id);
}
