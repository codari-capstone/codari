import socket


def probe(name, fn):
    try:
        fn()
        print(name, "REACHED")
    except Exception as e:  # noqa: BLE001
        print(name, "BLOCKED", type(e).__name__)


probe("dns_example.com", lambda: socket.getaddrinfo("example.com", 80))
probe("tcp_1.1.1.1:53", lambda: socket.create_connection(("1.1.1.1", 53), timeout=2).close())
probe("tcp_8.8.8.8:53", lambda: socket.create_connection(("8.8.8.8", 53), timeout=2).close())
probe("imds_169.254.169.254:80", lambda: socket.create_connection(("169.254.169.254", 80), timeout=2).close())
