package com.codingmon.api.auth;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

// GitHub OAuth App 웹 흐름. 이메일 권한(user:email)은 요청하지 않고 공개 프로필만 읽는다.
@Component
class GitHubClient {

    record Profile(String id, String login, String avatarUrl) {
    }

    private static final ParameterizedTypeReference<Map<String, Object>> JSON = new ParameterizedTypeReference<>() {
    };

    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    private final RestClient rest;
    private final String clientId;
    private final String clientSecret;

    GitHubClient(@Value("${app.github.client-id}") String clientId, @Value("${app.github.client-secret}") String clientSecret) {
        // GitHub가 응답하지 않아도 콜백 요청이 무한정 기다리지 않게 한다. 시간을 넘기면 로그인 실패로 처리된다.
        SimpleClientHttpRequestFactory requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(TIMEOUT);
        requests.setReadTimeout(TIMEOUT);
        this.rest = RestClient.builder().requestFactory(requests).build();
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }

    boolean isConfigured() {
        return !clientId.isBlank() && !clientSecret.isBlank();
    }

    // 콜백 주소는 GitHub에 등록한 값을 쓴다(환경마다 OAuth App을 따로 등록).
    String authorizeUrl(String state) {
        return "https://github.com/login/oauth/authorize?client_id=" + encode(clientId) + "&state=" + encode(state);
    }

    // 실패하면 예외를 던진다. 호출하는 쪽은 이유와 관계없이 로그인 실패로 처리한다.
    Profile fetchProfile(String code) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);
        form.add("code", code);
        Map<String, Object> token = rest.post()
                .uri("https://github.com/login/oauth/access_token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .accept(MediaType.APPLICATION_JSON)
                .body(form)
                .retrieve()
                .body(JSON);
        Object accessToken = token == null ? null : token.get("access_token");
        if (accessToken == null) {
            throw new IllegalStateException("GitHub access token을 받지 못했다");
        }
        Map<String, Object> user = rest.get()
                .uri("https://api.github.com/user")
                .header("Authorization", "Bearer " + accessToken)
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .body(JSON);
        if (user == null || user.get("id") == null) {
            throw new IllegalStateException("GitHub 사용자 정보를 받지 못했다");
        }
        return new Profile(String.valueOf(user.get("id")), (String) user.get("login"), (String) user.get("avatar_url"));
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
