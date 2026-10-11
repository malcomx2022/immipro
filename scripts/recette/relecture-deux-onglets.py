"""Deux onglets R-04 réels. Données synthétiques, session éphémère du banc."""
import json
import os
from playwright.sync_api import sync_playwright

base = os.environ['RECETTE_BASE']
chemin = f"{base}/dossiers/{os.environ['RECETTE_DOSSIER']}/redaction/lettre-motivation/relecture"
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    context.add_cookies([{'name': 'immipro_session', 'value': os.environ['RECETTE_SESSION'], 'url': base}])
    erreurs, posts = [], []
    context.on('page', lambda page: page.on('pageerror', lambda erreur: erreurs.append(str(erreur))))
    context.on('request', lambda req: posts.append(req.url) if req.method == 'POST' and req.url.endswith('/relecture') else None)
    a, b = context.new_page(), context.new_page()
    for page in [a, b]:
        page.goto(chemin)
        page.get_by_role('button', name="Lancer l'analyse").wait_for()
    a.get_by_role('button', name="Lancer l'analyse").click()
    a.get_by_role('button', name='Analyse en cours…').wait_for()
    a.wait_for_function("async () => (await (await fetch(location.href)).text()).includes('déjà en cours')")
    with b.expect_response(lambda r: r.request.method == 'POST' and r.url.endswith('/relecture')) as rep:
        b.get_by_role('button', name="Lancer l'analyse").click()
    assert rep.value.ok and rep.value.json().get('enCours') is True
    b.get_by_role('status').filter(has_text='déjà en cours').wait_for()
    assert 'Rien à reprendre sur cette version.' not in b.locator('body').inner_text()
    # Une actualisation retrouve la réservation durable, sans nouveau POST.
    b.reload()
    b.get_by_role('button', name='Consulter le résultat').wait_for()
    b.set_viewport_size({'width': 390, 'height': 844})
    dimensions = b.evaluate('({largeur:innerWidth,contenu:document.documentElement.scrollWidth})')
    assert dimensions['contenu'] <= dimensions['largeur'], dimensions
    print('LIBERER', flush=True)
    a.get_by_role('heading', name='Préciser le retour').wait_for()
    b.get_by_role('button', name='Consulter le résultat').click()
    b.get_by_role('heading', name='Préciser le retour').wait_for()
    assert len(posts) == 2, posts  # Deux gestes, un seul fournisseur.
    assert not erreurs, erreurs
    assert b.get_by_role('link', name='Éditeur', exact=True).get_attribute('href').endswith('/lettre-motivation')
    print(json.dumps({'deuxOnglets':True,'rechargementEnCours':True,'consultationSansPost':True,'avisVisibleDeuxOnglets':True,'posts':len(posts),'mobile':dimensions,'erreursJS':erreurs},ensure_ascii=False),flush=True)
    context.close()
    browser.close()
