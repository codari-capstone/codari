#include <cstdio>
// 재귀 호출 뒤에도 volatile 지역 변수를 읽어 프레임이 끝까지 살아 있게 한다.
// f(x - 1) + 1처럼 쓰면 -O2가 반복문으로 바꿔 깊은 스택을 실제로 쓰지 않는다.
int f(int n) {
    volatile int x = n;
    if (x == 0) return 0;
    int r = f(x - 1);
    return r + (x > 0);
}
int main() { std::printf("%d\n", f(1000000)); }
