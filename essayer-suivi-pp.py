"""Lance cette copie uniquement sur l'ordinateur, sans publication."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import subprocess
import webbrowser

root = Path(__file__).resolve().parent
handler = partial(SimpleHTTPRequestHandler, directory=str(root))
try:
    server = ThreadingHTTPServer(('127.0.0.1', 8768), handler)
except OSError:
    print('Le port local 8768 est deja utilise. Fermez la precedente fenetre de cet essai puis relancez.')
    raise SystemExit(1)
url = 'http://127.0.0.1:8768/'
chrome = Path(os.environ.get('PROGRAMFILES', r'C:\Program Files')) / 'Google/Chrome/Application/chrome.exe'
if chrome.is_file():
    subprocess.Popen([str(chrome), url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
else:
    webbrowser.open(url)
print('Copie locale Suivi PP - aucun changement de l application en ligne.')
print('Gardez cette fenetre ouverte pendant votre essai. Ctrl+C pour terminer.')
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
