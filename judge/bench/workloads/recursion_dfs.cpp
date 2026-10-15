#include <cstdio>
long long depth_sum(int k) {
    volatile int keep = k;  // 꼬리 재귀 최적화로 반복문이 되지 않게 한다
    return keep == 0 ? 0 : depth_sum(keep - 1) + keep % 1000;
}
int main() {
    int n;
    std::scanf("%d", &n);
    std::printf("%lld\n", depth_sum(n));
}
