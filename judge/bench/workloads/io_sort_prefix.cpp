#include <algorithm>
#include <cstdio>
#include <vector>
int main() {
    int n;
    if (std::scanf("%d", &n) != 1) return 0;
    std::vector<long long> a(n);
    for (auto& x : a) std::scanf("%lld", &x);
    std::sort(a.begin(), a.end());
    const long long mod = 1000000007LL;
    long long prefix = 0, total = 0;
    for (long long x : a) {
        prefix += x;
        total = (total + prefix) % mod;
    }
    std::printf("%lld\n", total);
}
