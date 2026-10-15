#include <cstdio>
int main() {
    int* volatile p = nullptr;
    std::printf("%d\n", *p);
}
