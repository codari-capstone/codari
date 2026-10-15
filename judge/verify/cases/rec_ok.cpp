#include <cstdio>
int f(int n) {
    volatile int x = n;
    return x ? f(x - 1) + 1 : 0;
}
int main() { std::printf("%d\n", f(1000000)); }
