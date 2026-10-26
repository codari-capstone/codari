#include <cstdio>
#include <vector>
int main() {
    std::vector<char> v(512u << 20, 1);
    std::printf("%d\n", v[12345]);
}
