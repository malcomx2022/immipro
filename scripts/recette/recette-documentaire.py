"""S.170 : navigateur → stockage/antivirus/worker → revue humaine, sans IA.
Python Playwright requis hors dépendances du produit. Uniquement le banc local.
DATABASE_URL désigne son serveur ; --base désigne la base jetable du banc.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

cli = argparse.ArgumentParser()
cli.add_argument('--url', default='http://127.0.0.1:3100')
cli.add_argument('--base', required=True)
cli.add_argument('--banc-log', required=True)
cli.add_argument('--chromium')
cli.add_argument('--sortie', default='.recette/recette-documentaire.json')
args = cli.parse_args()
assert urlparse(args.url).hostname in ['localhost', '127.0.0.1', '::1'], 'Banc local requis.'
assert re.fullmatch(r'immipro_recette\w*', args.base), 'Base jetable du banc requise.'
assert os.environ.get('DATABASE_URL'), 'DATABASE_URL manque.'
base = args.url.rstrip('/')
match = re.search(r'Mot de passe des comptes de démonstration : (\S+)', Path(args.banc_log).read_text())
assert match, 'Mot de passe synthétique absent du journal du banc.'
pwd = match.group(1)
# Requêtes paramétrées et lecture seule. La connexion complète ne sort jamais
# dans le résultat ; le navigateur exerce les vraies routes du framework.
lecture = """
import {Client} from 'pg';
import {readFileSync} from 'node:fs';
const {base, sql, params} = JSON.parse(readFileSync(0, 'utf8'));
const url = new URL(process.env.DATABASE_URL);
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !/^immipro_recette\\w*$/.test(base)) throw Error('Base locale requise');
url.pathname = '/' + base;
const client = new Client({connectionString:url.toString()});
try {await client.connect();console.log(JSON.stringify((await client.query(sql,params)).rows));}
finally {await client.end();}
"""

def sql(texte, params=None):
    sortie = subprocess.check_output(['node', '--input-type=module', '-e', lecture],
        input=json.dumps({'base': args.base, 'sql': texte, 'params': params or []}), text=True)
    return json.loads(sortie)

app = sql('SELECT a.id FROM "Application" a JOIN "User" u ON u.id=a."userId" WHERE u.email=$1 AND a.status=\'ACTIF\' LIMIT 1', ['aline.dossou@immipro.test'])[0]['id']
document = sql('SELECT id, status FROM "Document" WHERE "applicationId"=$1 AND code=\'passeport\'', [app])[0]
piece = document['id']
def quota():
    return int(sql('SELECT coalesce(sum(delta),0) AS n FROM "AnalysisCredit" WHERE "applicationId"=$1', [app])[0]['n'])
def version():
    rows = sql('SELECT id, "scanState" FROM "DocumentVersion" WHERE "documentId"=$1 ORDER BY rank DESC LIMIT 1', [piece])
    return rows[0] if rows else None

assert version() is None, 'Relancer le banc sur sa base jetable avant cette recette : le passeport a déjà une version.'

resultats = []
erreurs_js = []
with sync_playwright() as p:
    options = {'executable_path': args.chromium} if args.chromium else {}
    navigateur = p.chromium.launch(**options, args=['--no-sandbox'])
    contexte = navigateur.new_context(viewport={'width': 390, 'height': 844})
    page = contexte.new_page()
    page.on('pageerror', lambda erreur: erreurs_js.append(str(erreur)))
    def connexion(email):
        page.goto(base + '/connexion')
        page.get_by_label('Adresse email', exact=True).fill(email)
        page.get_by_label('Mot de passe', exact=True).fill(pwd)
        page.get_by_label('Mot de passe', exact=True).press('Enter')
        page.wait_for_url('**/tableau-de-bord')
    connexion('aline.dossou@immipro.test')
    avant = quota()
    precedente = version()
    page.goto(f'{base}/dossiers/{app}/pieces/{piece}', wait_until='networkidle')
    page.locator('input[type=file]').last.set_input_files(str(Path('tests/banc-ia/pieces/L07.pdf').resolve()))
    page.get_by_text('L07.pdf', exact=False).first.wait_for()
    page.get_by_role('button', name='Ajouter la pièce', exact=True).click()
    page.get_by_text('Ton fichier', exact=False).first.wait_for(timeout=20000)
    analyse = []
    fin = time.monotonic() + 40
    while time.monotonic() < fin:
        courante = version()
        if courante and (not precedente or courante['id'] != precedente['id']):
            analyse = sql('SELECT verdict, "creditConsumed" FROM "DocumentAnalysis" WHERE "versionId"=$1', [courante['id']])
            if courante['scanState'] == 'SAINE' and analyse:
                break
        time.sleep(1)
    assert courante and (not precedente or courante['id'] != precedente['id']), 'Aucune nouvelle version déposée.'
    assert courante['scanState'] == 'SAINE' and analyse, 'La nouvelle version n’a pas été traitée.'
    apres = quota()
    assert analyse[0]['verdict'] == 'ILLISIBLE' and analyse[0]['creditConsumed'] is False
    assert avant == apres, 'Une analyse utile a été consommée sans fournisseur.'
    resultats.append({'controle': 'Dépôt navigateur puis traitement de la nouvelle version sans IA',
        'scan': courante['scanState'], 'analyse': analyse[0], 'quotaAvant': avant, 'quotaApres': apres, 'conforme': True})
    contexte.clear_cookies()
    page.set_viewport_size({'width': 1280, 'height': 900})
    connexion('admin@immipro.test')
    page.goto(base + '/revue', wait_until='networkidle')
    page.get_by_label("Motif de l'accès et de la décision", exact=True).fill('Vérification de la pièce synthétique du banc local.')
    page.get_by_role('button', name='Conforme', exact=True).click()
    page.get_by_label('Message envoyé au candidat', exact=True).fill('La pièce déposée est lisible. Poursuis les autres étapes de ta checklist.')
    page.get_by_role('button', name='Enregistrer et passer à la suivante', exact=True).click()
    page.wait_for_timeout(700)
    statut = sql('SELECT status FROM "Document" WHERE id=$1', [piece])[0]['status']
    assert statut == 'CONFORME', 'La décision opérateur n’a pas été enregistrée.'
    assert quota() == avant, 'La revue humaine a consommé une analyse utile.'
    resultats.append({'controle': 'Décision opérateur via formulaire réel', 'statut': statut, 'conforme': True})
    assert not erreurs_js, 'Erreur JavaScript dans le parcours.'
    navigateur.close()

sortie = Path(args.sortie)
sortie.parent.mkdir(parents=True, exist_ok=True)
sortie.write_text(json.dumps({'simulation': True, 'resultats': resultats, 'erreursJS': erreurs_js}, ensure_ascii=False, indent=2))
print(json.dumps({'controles': len(resultats), 'conforme': True}, ensure_ascii=False))
