"""
ASGI config for Real vs AI project.
Supports both HTTP and WebSocket protocols.
"""
import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Initialize Django ASGI application early to ensure AppRegistry is populated
django_asgi_app = get_asgi_application()

# Import routing after Django setup
from apps.game.routing import websocket_urlpatterns

# H: AllowedHostsOriginValidator rétabli (anti-CSWSH). Il valide l'Origin du
# WebSocket contre ALLOWED_HOSTS. Les appareils du LAN se connectent à l'IP du
# serveur (présente dans ALLOWED_HOSTS), donc leur Origin est accepté ; en DEBUG,
# ALLOWED_HOSTS contient '*' et le validateur autorise toutes les origines.
# IMPORTANT : tout hôte/IP utilisé pour accéder au jeu doit figurer dans
# DJANGO_ALLOWED_HOSTS, sinon les connexions WebSocket seront refusées.
application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': AllowedHostsOriginValidator(
        AuthMiddlewareStack(
            URLRouter(websocket_urlpatterns)
        )
    ),
})

