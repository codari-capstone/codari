#include <cstdio>
#include <new>
int main() {
    // new 식은 -O2에서 생략될 수 있어 operator new를 직접 부른다
    void* volatile p = ::operator new(1ULL << 42);
    std::printf("%p\n", p);
}
