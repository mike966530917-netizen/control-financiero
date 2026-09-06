"""
Servidor Local de Desarrollo para Finanzas PWA
Compatible con cualquier consola de Windows (sin errores de codificación cp1252).
"""

import http.server
import socketserver
import webbrowser
import socket
import os
import sys

# Asegurar codificación UTF-8 si es soportada
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

PORT = 8000
DIRECTORIO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend')

def obtener_ip_local():
    """Obtiene la dirección IP local de la computadora en la red Wi-Fi."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return 'localhost'

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORIO, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

def main():
    if not os.path.exists(DIRECTORIO):
        print(f"[ERROR] No se encontro la carpeta frontend en: {DIRECTORIO}")
        sys.exit(1)

    ip_local = obtener_ip_local()
    url_local = f"http://localhost:{PORT}"
    url_movil = f"http://{ip_local}:{PORT}"

    print("\n" + "=" * 62)
    print(">>> PWA FINANCIERA ACTIVA CON SERVIDOR PYTHON <<<")
    print("=" * 62)
    print(f"[*] En tu Computadora:  {url_local}")
    print(f"[*] En tu Celular:       {url_movil} (conectado al mismo Wi-Fi)")
    print("=" * 62)
    print("Presiona Ctrl + C para detener el servidor.\n")

    # Abrir en el navegador automáticamente
    try:
        webbrowser.open(url_local)
    except Exception:
        pass

    with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[OK] Servidor detenido con exito.")
            httpd.server_close()

if __name__ == '__main__':
    main()
