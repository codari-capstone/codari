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

    private String avatarUrl;

    @Enumerated(EnumType.STRING)
    private Role role = Role.USER;

    protected User() {
    }

    public User(String email, String passwordHash, String nickname) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.nickname = nickname;
    }

    // GitHub 가입 계정은 이메일과 비밀번호가 없다.
    public static User github(String nickname, String avatarUrl) {
        User user = new User(null, null, nickname);
        user.avatarUrl = avatarUrl;
        return user;
    }

    public Long getId() {
        return id;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public int getTokenVersion() {
        return tokenVersion;
    }

    public Role getRole() {
        return role;
    }
}
