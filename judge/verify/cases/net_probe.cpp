#include <arpa/inet.h>
#include <netdb.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>
#include <cstdio>

static void tcp(const char* name, const char* ip, int port) {
    int s = socket(AF_INET, SOCK_STREAM, 0);
    if (s < 0) { std::printf("%s BLOCKED socket\n", name); return; }
    timeval tv{2, 0};
    setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof tv);
    sockaddr_in a{};
    a.sin_family = AF_INET;
    a.sin_port = htons(port);
    inet_pton(AF_INET, ip, &a.sin_addr);
    std::printf("%s %s\n", name, connect(s, (sockaddr*)&a, sizeof a) == 0 ? "REACHED" : "BLOCKED");
    close(s);
}

int main() {
    addrinfo* res = nullptr;
    std::printf("dns_example.com %s\n", getaddrinfo("example.com", "80", nullptr, &res) == 0 ? "REACHED" : "BLOCKED");
    tcp("tcp_1.1.1.1:53", "1.1.1.1", 53);
    tcp("tcp_8.8.8.8:53", "8.8.8.8", 53);
    tcp("imds_169.254.169.254:80", "169.254.169.254", 80);
}
