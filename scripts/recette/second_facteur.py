"""Second temps de la connexion pour les recettes Python du banc — S.215.

La double authentification est obligatoire pour un compte interne : après le
mot de passe, l'écran demande le code de l'application. La graine écrit le
secret des opérateurs de démonstration dans le journal du banc
(« second facteur <adresse> : <secret> ») ; ce module en calcule le code
comme le ferait le téléphone (RFC 6238, SHA-1, six chiffres, trente
secondes), sans dépendance hors de la bibliothèque standard.

Un code déjà servi est refusé (anti-rejeu) : relancée dans les trente
secondes, une recette verrait « déjà de servir ». On attend alors le pas
suivant, une seule fois.
"""
import base64
import hashlib
import hmac
import re
import struct
import time

PERIODE = 30
CHIFFRES = 6


def secret_du_banc(journal: str, email: str):
    """Le secret TOTP d'un opérateur de démonstration, ou None (candidat, clé absente)."""
    m = re.search(r'second facteur ' + re.escape(email) + r' : ([A-Z2-7]+)', journal)
    return m.group(1) if m else None


def code_totp(secret: str, instant=None) -> str:
    cle = base64.b32decode(secret + '=' * (-len(secret) % 8))
    pas = int((time.time() if instant is None else instant) // PERIODE)
    empreinte = hmac.new(cle, struct.pack('>Q', pas), hashlib.sha1).digest()
    decalage = empreinte[-1] & 0x0F
    binaire = struct.unpack('>I', empreinte[decalage:decalage + 4])[0] & 0x7FFFFFFF
    return str(binaire % 10 ** CHIFFRES).zfill(CHIFFRES)


def attendre_le_pas_suivant():
    time.sleep(PERIODE - time.time() % PERIODE + 0.5)


def second_temps(page, journal: str, email: str) -> bool:
    """Après le mot de passe : saisit le code si l'écran le demande. Rend True si saisi."""
    secret = secret_du_banc(journal, email)
    if not secret:
        return False
    titre = page.get_by_role('heading', level=1)
    titre.filter(has_text='Double authentification').wait_for(timeout=15000)
    for essai in range(2):
        champ = page.get_by_label('Code à six chiffres', exact=True)
        champ.fill(code_totp(secret))
        with page.expect_response(lambda r: r.url.endswith('/api/comptes/session/second-facteur')) as reponse:
            page.get_by_role('button', name='Vérifier et me connecter', exact=True).click()
        if reponse.value.status == 200:
            return True
        texte = reponse.value.text()
        if essai == 0 and 'déjà de servir' in texte:
            # Le code de ce pas a déjà ouvert une connexion : attendre le suivant.
            attendre_le_pas_suivant()
            continue
        raise SystemExit(f'Second facteur refusé pour {email} : {texte[:300]}')
    raise SystemExit(f'Second facteur refusé deux fois pour {email}.')
