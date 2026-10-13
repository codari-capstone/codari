package com.codingmon.api.user;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface UserRepository extends JpaRepository<User, Long> {

    @Query("select u.tokenVersion from User u where u.id = :id")
    Optional<Integer> findTokenVersionById(Long id);
}
