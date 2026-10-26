#include <cstdio>
int main() {
    volatile int z = 0;
    std::printf("%d\n", 10 / z);
}
