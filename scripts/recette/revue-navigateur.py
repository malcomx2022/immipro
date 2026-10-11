"""Recette navigateur locale REV11. Dépendance manuelle : Python Playwright.
Ne certifie ni les paiements réels, ni le modèle IA, ni l'accessibilité complète.
Exécution et préalables : docs/revue/revue-complete-2026-10-11.md.
"""
import argparse,json,re,pathlib
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
cli=argparse.ArgumentParser()
cli.add_argument('--url',default='http://127.0.0.1:3100')
cli.add_argument('--banc-log',required=True)
cli.add_argument('--dossier',required=True)
cli.add_argument('--piece',required=True)
cli.add_argument('--chromium')
cli.add_argument('--sortie',default='.recette/revue-navigateur.json')
args=cli.parse_args()
if urlparse(args.url).hostname not in ['localhost','127.0.0.1','::1']:
 raise SystemExit('Recette limitée au banc sur la boucle locale.')
base=args.url.rstrip('/')
log=pathlib.Path(args.banc_log).read_text()
match=re.search(r'Mot de passe des comptes de démonstration : (\S+)',log)
if not match: raise SystemExit('Mot de passe synthétique du banc absent du journal.')
pwd=match.group(1);app=args.dossier;piece=args.piece
results=[];actions=[];errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(**({'executable_path':args.chromium} if args.chromium else {}),args=['--no-sandbox'])
 c=b.new_context(viewport={'width':390,'height':844});page=c.new_page()
 page.on('pageerror',lambda e:errors.append(str(e)))
 def check(path,role):
  try:
   resp=page.goto(base+path,wait_until='networkidle',timeout=25000)
   results.append({'role':role,'chemin':path,'statut':resp.status,'destination':page.url.replace(base,''),'h1':page.locator('h1').all_text_contents(),'debordement':page.evaluate('Math.max(0,document.documentElement.scrollWidth-innerWidth)')})
  except Exception as e:results.append({'role':role,'chemin':path,'erreur':str(e)[:300]})
 def login(email):
  page.goto(base+'/connexion')
  page.get_by_label('Adresse email',exact=True).fill(email)
  page.get_by_label('Mot de passe',exact=True).fill(pwd)
  page.get_by_label('Mot de passe',exact=True).press('Enter')
  page.wait_for_url('**/tableau-de-bord',timeout=15000)
  actions.append({'action':'connexion par formulaire et touche Entrée','role':email.split('@')[0],'conforme':True})
 for path in ['/','/comment-ca-marche','/tarifs','/simulateur','/resultats','/destinations','/destinations/pays-bas','/conditions','/mentions-legales','/donnees-personnelles','/guides','/guides/pays-bas','/articles','/contact','/inscription','/mot-de-passe']:
  check(path,'public')
 check('/tableau-de-bord','anonyme')
 login('aline.dossou@immipro.test')
 for path in ['/tableau-de-bord','/profil','/comparateur','/notifications','/services','/consentements','/compte/rappels','/compte/mes-donnees','/dossiers/nouveau',f'/dossiers/{app}',f'/dossiers/{app}/completude',f'/dossiers/{app}/echeancier',f'/dossiers/{app}/redaction',f'/dossiers/{app}/pieces/{piece}',f'/dossiers/{app}/pieces/{piece}/versions','/paiement/pack']:
  check(path,'candidat')
 statut=page.evaluate("() => fetch('/api/dossiers').then(r => r.status)")
 actions.append({'action':'session candidat reconnue par API dossiers','statut':statut,'conforme':statut==200})
 # These requests actually pass through framework authentication and role guards.
 for path in ['/api/admin/couts-ia','/api/admin/utilisateurs']:
  statut=page.evaluate('(path) => fetch(path).then(r => r.status)',path)
  actions.append({'action':'refus candidat sur API administrative','chemin':path,'statut':statut,'conforme':statut==403})
 check('/revue','candidat')
 c.clear_cookies();page.set_viewport_size({'width':1280,'height':900});login('admin@immipro.test')
 for path in ['/veille','/couts-ia','/revue','/journal','/contenus','/utilisateurs','/textes-juridiques','/paiements','/habilitations']:
  check(path,'admin')
 c.clear_cookies();login('veilleur@immipro.test')
 check('/veille','veilleur');check('/habilitations','veilleur')
 pathlib.Path(args.sortie).parent.mkdir(parents=True,exist_ok=True)
 pathlib.Path(args.sortie).write_text(json.dumps({'navigations':results,'actions':actions,'erreursJS':errors},ensure_ascii=False,indent=2))
 print(json.dumps({'pages':len(results),'erreurs':errors,'navigation_non200':[r for r in results if r.get('statut')!=200],'debordements':[r for r in results if r.get('debordement',0)>1],'actions':actions},ensure_ascii=False,indent=2))
 b.close()

# Des textes juridiques non validés restent volontairement absents du banc.
absences={'/conditions','/mentions-legales','/donnees-personnelles','/contact'}
anomalies=[r for r in results if 'erreur' in r or r.get('debordement',0)>1 or (r.get('statut')!=200 and not (r.get('statut')==404 and r['chemin'] in absences))]
if errors or anomalies or any(a.get('conforme') is False for a in actions):
 raise SystemExit(1)
