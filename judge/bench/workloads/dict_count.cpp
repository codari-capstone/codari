#include <algorithm>
#include <cstdio>
#include <unordered_map>
int main() {
    int n;
    std::scanf("%d", &n);
    std::unordered_map<long long, int> count;
    for (int i = 0; i < n; i++) {
        long long k;
        std::scanf("%lld", &k);
        count[k]++;
    }
    int best = 0;
    for (auto& kv : count) best = std::max(best, kv.second);
    std::printf("%zu %d\n", count.size(), best);
}
