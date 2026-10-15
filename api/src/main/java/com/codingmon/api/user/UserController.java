package com.codingmon.api.user;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
class UserController {

    private final UserRepository users;

    UserController(UserRepository users) {
        this.users = users;
    }

    record CurrentUser(Long id, String nickname, Role role, String avatarUrl) {
    }

    // 화면 상단의 사용자 메뉴·관리자 메뉴용(COM-01·05). 닉네임은 바뀔 수 있어 토큰이 아니라 DB에서 읽는다.
    // 토큰 검증(token_version 포함)은 SecurityConfig가 이미 했다.
    @GetMapping("/me")
    CurrentUser me(@AuthenticationPrincipal Jwt jwt) {
        User user = users.findById(Long.valueOf(jwt.getSubject())).orElseThrow();
        return new CurrentUser(user.getId(), user.getNickname(), user.getRole(), user.getAvatarUrl());
    }
}
