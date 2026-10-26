#include <cstdio>
int main() {
    long long n, s = 0;
    std::scanf("%lld", &n);
    for (long long i = 0; i < n; i++)
        for (long long j = 0; j < n; j++) s += (i * j) % 7;
    std::printf("%lld\n", s);
}
