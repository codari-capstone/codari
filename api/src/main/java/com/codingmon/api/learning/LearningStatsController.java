package com.codingmon.api.learning;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.codingmon.api.learning.LearningStatsRepository.LearningStats;

@RestController
class LearningStatsController {

    private final LearningStatsRepository stats;

    LearningStatsController(LearningStatsRepository stats) {
        this.stats = stats;
    }

    // REP-01·02. 요청할 때마다 다시 계산한다. 하루 1회 저장하는 리포트(#85)와 다르다.
    @GetMapping("/api/users/me/learning-stats")
    LearningStats get(@AuthenticationPrincipal Jwt jwt) {
        return stats.find(Long.parseLong(jwt.getSubject()));
    }
}
