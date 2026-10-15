package com.codingmon.api.user;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String email;

    private String passwordHash;

    private int tokenVersion;

    private String nickname;

    @Enumerated(EnumType.STRING)
    private Role role = Role.USER;

    protected User() {
    }

    public User(String email, String passwordHash, String nickname) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.nickname = nickname;
    }

    public Long getId() {
        return id;
    }

    public int getTokenVersion() {
        return tokenVersion;
    }

    public Role getRole() {
        return role;
    }
}
