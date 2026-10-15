#include <cstdio>
int f(int n) {
    volatile char buf[1024];
    buf[0] = (char)n;
    return n ? f(n - 1) + buf[0] : 0;
}
int main() { std::printf("%d\n", f(100000000)); }
