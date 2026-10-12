"""L6 : gestes candidat et effets SQL sur le banc jetable uniquement.
IA et paiements du banc --parcours sont synthétiques. Aucune qualification réelle.
"""
import argparse, json, os, re, subprocess, time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
cli=argparse.ArgumentParser()
cli.add_argument('--url',default='http://localhost:3160')
cli.add_argument('--base',required=True)
cli.add_argument('--banc-log',required=True)
cli.add_argument('--navigateur',choices=['chromium','firefox','webkit'],default='chromium')
cli.add_argument('--chromium')
cli.add_argument('--largeur',type=int,default=390)
cli.add_argument('--sortie',required=True)
a=cli.parse_args()
assert urlparse(a.url).hostname in ['localhost','127.0.0.1','::1']
assert re.fullmatch(r'immipro_recette\w*',a.base)
lecture="""
import {Client} from 'pg';import {readFileSync} from 'node:fs';
const {base,sql,params}=JSON.parse(readFileSync(0,'utf8'));const u=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!/^immipro_recette\\w*$/.test(base))throw Error('Banc local requis');
u.pathname='/'+base;const c=new Client({connectionString:u.toString()});
try{await c.connect();await c.query('BEGIN READ ONLY');console.log(JSON.stringify((await c.query(sql,params)).rows));}finally{await c.end();}
"""
def sql(q,params=[]):
 return json.loads(subprocess.check_output(['node','--input-type=module','-e',lecture],input=json.dumps({'base':a.base,'sql':q,'params':params}),text=True))
# Précondition explicite WF-08 : aucune lettre du catalogue n'est exigée
# par la règle NL du banc. Une pièce facultative synthétique est ajoutée
# seulement au nouveau candidat de cette exécution, jamais au référentiel.
def preparer_lettre(dossier,email):
 programme=r"""
import {Client} from 'pg';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';
const {base,dossier,email}=JSON.parse(readFileSync(0,'utf8'));const u=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!/^immipro_recette\w*$/.test(base)||!/^l6-.*@immipro\.test$/.test(email))throw Error('Fixture locale requise');
u.pathname='/'+base;const c=new Client({connectionString:u.toString()});
try{await c.connect();const r=await c.query('SELECT a.id FROM "Application" a JOIN "User" u ON u.id=a."userId" WHERE a.id=$1 AND u.email=$2',[dossier,email]);if(r.rowCount!==1)throw Error('Candidat synthétique requis');
await c.query('INSERT INTO "Document" (id,"applicationId",code,label,required,remedy) VALUES ($1,$2,$3,$4,false,$5)',[randomUUID(),dossier,'lettre_motivation','Lettre synthétique de recette — facultative','REDIGER']);}finally{await c.end();}
"""
 subprocess.run(['node','--input-type=module','-e',programme],input=json.dumps({'base':a.base,'dossier':dossier,'email':email}),text=True,check=True)
email=f'l6-{a.navigateur}-{a.largeur}-{time.time_ns()}@immipro.test'
preuves=[];erreurs=[]
with sync_playwright() as p:
 options={'executable_path':a.chromium} if a.navigateur=='chromium' and a.chromium else {}
 b=getattr(p,a.navigateur).launch(**options)
 c=b.new_context(viewport={'width':a.largeur,'height':900});page=c.new_page()
 def go(url): return page.goto(url,wait_until="networkidle")
 page.on('pageerror',lambda e:erreurs.append(str(e)))
 go(a.url+'/simulateur')
 choix=['Étudier','Licence','Plus de 12 millions F','C1 et plus','Rentrée de septembre 2027','Seul']
 for i,nom in enumerate(choix):
  radio=page.get_by_role('radio',name=nom,exact=True);radio.focus();radio.press('Space')
  page.locator('[role=radio][aria-checked=true]').wait_for()
  assert page.locator('[role=radio][aria-checked=true]').inner_text().startswith(nom)
  page.get_by_role('button',name='Voir mes destinations' if i==5 else 'Continuer',exact=True).click()
 page.wait_for_url('**/resultats');page.locator('h1').filter(has_text='destination').wait_for()
 preuves.append({'controle':'Six réponses au clavier et recommandations calculées','conforme':True})
 go(a.url+'/inscription')
 page.get_by_label('Prénom et nom',exact=True).fill('Recette Telephone')
 page.get_by_label('Adresse email',exact=True).fill(email)
 tel=page.get_by_label('Numéro Mobile Money',exact=True)
 tel.fill('97000042')
 page.get_by_label('Mot de passe',exact=True).fill('RecetteL6Synthetique42')
 page.get_by_role('checkbox').check()
 assert page.get_by_role('button',name='Créer mon compte',exact=True).is_disabled()
 tel.fill('00 229 01 97 00 00 42')
 page.get_by_role('button',name='Créer mon compte',exact=True).click();page.wait_for_url('**/verification')
 page.wait_for_load_state('networkidle')
 compte=sql('SELECT id,phone,"emailVerified" FROM "User" WHERE email=$1',[email])[0]
 assert compte['phone']=='+2290197000042' and compte['emailVerified'] is None
 fin=time.monotonic()+20;code=None
 while time.monotonic()<fin:
  m=re.search(re.escape(email)+r'[^\n]*code (\d{6})',Path(a.banc_log).read_text())
  if m:code=m.group(1);break
  time.sleep(.2)
 assert code,'Courrier de vérification absent'
 page.get_by_label('Code de vérification',exact=True).fill(code)
 page.get_by_label('Code de vérification',exact=True).press('Enter')
 page.wait_for_url('**/tableau-de-bord')
 assert sql('SELECT "emailVerified" FROM "User" WHERE id=$1',[compte['id']])[0]['emailVerified']
 preuves.append({'controle':'Inscription, téléphone normalisé en base, courrier capturé, vérification par Entrée','conforme':True})
 go(a.url+'/dossiers/nouveau?destination=pays-bas')
 page.get_by_role('radio',name=re.compile('Je ne sais pas encore')).click()
 page.get_by_role('button',name='Créer mon dossier',exact=True).click()
 page.wait_for_url(re.compile(r'/dossiers/[a-f0-9-]+$'))
 dossier=page.url.rsplit('/',1)[1]
 row=sql('SELECT status,"targetDate","visaRuleId" FROM "Application" WHERE id=$1 AND "userId"=$2',[dossier,compte['id']])[0]
 assert row['status']=='BROUILLON' and row['targetDate'] is None
 assert sql('SELECT count(*) AS n FROM "Document" WHERE "applicationId"=$1',[dossier])[0]['n']!='0'
 preuves.append({'controle':'Ouverture réelle, règle figée et checklist persistée sans date inventée','conforme':True})
 faux=re.search(r'parcours scriptés uniquement locaux : (http://[^ ]+)',Path(a.banc_log).read_text()).group(1)
 def checkout(route):
  identifiant=route.request.url.rsplit('/',1)[1]
  route.fulfill(status=200,content_type='text/html; charset=utf-8',body=f'<html lang="fr"><title>Paiement synthétique local</title><a href="{faux}/payer/{identifiant}">Confirmer le paiement synthétique</a></html>')
 c.route('https://checkout.stripe.com/**',checkout)
 go(a.url+f'/paiement/recapitulatif?dossier={dossier}&achat=dossier&devise=EUR')
 page.get_by_role('checkbox').check()
 page.get_by_role('button',name=re.compile('^Payer ')).click()
 page.wait_for_url('https://checkout.stripe.com/**')
 page.wait_for_load_state('domcontentloaded')
 page.get_by_role('link',name='Confirmer le paiement synthétique').click()
 page.wait_for_url(a.url+'/paiement/confirme?**')
 fin=time.monotonic()+15;credits=0
 while time.monotonic()<fin:
  credits=int(sql('SELECT coalesce(sum(delta),0) AS n FROM "AnalysisCredit" WHERE "applicationId"=$1',[dossier])[0]['n'])
  if credits==30:break
  time.sleep(.2)
 assert credits==30
 tx=sql('SELECT status,"providerTxId" FROM "Transaction" WHERE "applicationId"=$1',[dossier])[0]
 assert tx['status']=='CONFIRMEE'
 rejoue=c.request.get(faux+'/payer/'+tx['providerTxId'].removeprefix('stripe:'),max_redirects=0)
 assert rejoue.status==303,(rejoue.status,rejoue.text(),tx)
 assert int(sql('SELECT sum(delta) AS n FROM "AnalysisCredit" WHERE "applicationId"=$1',[dossier])[0]['n'])==30
 preuves.append({'controle':'Checkout intercepté localement, webhook signé réel et attribution de 30 analyses','conforme':True,'commercial':False})
 go(a.url+'/consentements')
 interrupteur=page.get_by_role('switch',name="Analyse de mes pièces d'identité",exact=True)
 interrupteur.wait_for();assert interrupteur.get_attribute('aria-checked')=='false'
 interrupteur.click()
 with page.expect_response(lambda r:r.url.endswith('/api/comptes/consentements') and r.request.method=='PUT') as retour:
  page.get_by_role('button',name='Enregistrer',exact=True).click()
 assert retour.value.ok
 piece=sql('SELECT id FROM "Document" WHERE "applicationId"=$1 AND code=$2',[dossier,'passeport'])[0]['id']
 go(a.url+f'/dossiers/{dossier}/pieces/{piece}')
 page.locator('input[type=file]').last.set_input_files(str(Path('tests/banc-ia/pieces/L07.pdf').resolve()))
 page.get_by_text(re.compile(r'L0[79]\.pdf')).first.wait_for()
 page.get_by_role('button',name='Ajouter la pièce',exact=True).click()
 fin=time.monotonic()+45;analyses=[]
 while time.monotonic()<fin:
  analyses=sql('SELECT v."scanState",a.verdict,a."creditConsumed",a."inputTokens",a."outputTokens" FROM "DocumentVersion" v JOIN "DocumentAnalysis" a ON a."versionId"=v.id WHERE v."documentId"=$1 ORDER BY v.rank DESC LIMIT 1',[piece])
  if analyses:break
  time.sleep(.5)
 assert analyses and analyses[0]['scanState']=='SAINE',(analyses,page.locator('body').inner_text())
 assert analyses[0]['inputTokens']==120 and analyses[0]['outputTokens']==30,analyses
 assert analyses[0]['creditConsumed'] is True,analyses
 assert int(sql('SELECT sum(delta) AS n FROM "AnalysisCredit" WHERE "applicationId"=$1',[dossier])[0]['n'])==29
 preuves.append({'controle':'Consentement accordé, téléversement réel, antivirus, worker et lecture IA synthétique mesurée','analyse':analyses[0],'conforme':True})
 go(a.url+f'/dossiers/{dossier}/pieces/{piece}')
 page.get_by_role('button',name='Téléverser une autre version',exact=True).click()
 page.locator('input[type=file]').last.set_input_files(str(Path('tests/banc-ia/pieces/L09.pdf').resolve()))
 page.get_by_text(re.compile(r'L0[79]\.pdf')).first.wait_for()
 page.get_by_role('button',name='Ajouter la pièce',exact=True).click()
 fin=time.monotonic()+30
 while time.monotonic()<fin:
  versions=sql('SELECT v.id,v.rank,a."creditConsumed" FROM "DocumentVersion" v JOIN "DocumentAnalysis" a ON a."versionId"=v.id WHERE v."documentId"=$1 ORDER BY v.rank',[piece])
  if len(versions)==2:break
  time.sleep(.5)
 assert len(versions)==2 and versions[1]['creditConsumed'] is True,versions
 assert int(sql('SELECT sum(delta) AS n FROM "AnalysisCredit" WHERE "applicationId"=$1',[dossier])[0]['n'])==28
 go(a.url+f'/dossiers/{dossier}/pieces/{piece}/versions')
 page.get_by_role('heading',name=re.compile('version',re.I)).first.wait_for()
 preuves.append({'controle':'Remplacement par un autre fichier, deux versions, nouvelle analyse débitée et historique ouvert','conforme':True})
 go(a.url+'/consentements');page.get_by_role('switch',name="Analyse de mes pièces d'identité",exact=True).click()
 with page.expect_response(lambda r:r.url.endswith('/api/comptes/consentements') and r.request.method=='PUT') as retour:
  page.get_by_role('button',name='Enregistrer',exact=True).click()
 assert retour.value.ok
 go(a.url+f'/dossiers/{dossier}/pieces/{piece}')
 page.get_by_role('button',name='Téléverser une autre version',exact=True).click()
 page.get_by_role('heading',name='Ton autorisation est nécessaire pour déposer une pièce',exact=True).wait_for()
 page.locator('input[type=file]').last.set_input_files(str(Path('tests/banc-ia/pieces/L07.pdf').resolve()))
 assert page.get_by_role('button',name='Ajouter la pièce',exact=True).is_disabled()
 assert len(sql('SELECT id FROM "DocumentVersion" WHERE "documentId"=$1',[piece]))==2
 assert int(sql('SELECT sum(delta) AS n FROM "AnalysisCredit" WHERE "applicationId"=$1',[dossier])[0]['n'])==28
 preuves.append({'controle':'Retrait du consentement, nouveau dépôt fermé et quota inchangé','conforme':True})
 preparer_lettre(dossier,email)
 go(a.url+f'/dossiers/{dossier}/redaction')
 page.get_by_role('radio').first.click()
 page.get_by_role('button',name="Commencer l'entretien",exact=True).click()
 page.get_by_role('button',name="Écrire directement dans l'éditeur",exact=True).click()
 manuel="Madame, Monsieur, je prépare mon dossier à partir des informations que j'ai fournies. Ce texte synthétique décrit mon parcours et mon projet d'études. Il est destiné à vérifier l'enregistrement, la conservation des versions et l'export local du document, puis sa relecture. Salutations respectueuses."
 page.get_by_label('Ton texte',exact=True).fill(manuel)
 page.get_by_role('button',name='Enregistrer une version',exact=True).click()
 page.get_by_role('link',name='Télécharger en Word',exact=True).wait_for()
 with page.expect_download() as telechargement:
  page.get_by_role('link',name='Télécharger en Word',exact=True).click()
 chemin=telechargement.value.path();assert Path(chemin).read_bytes()[:2]==b'PK'
 page.get_by_role('link',name="Voir l'analyse critique",exact=True).click()
 page.get_by_role('heading',level=1).wait_for()
 with page.expect_response(lambda r:r.url.endswith('/redaction/lettre-motivation/relecture') and r.request.method=='POST') as critique:
  page.get_by_role('button',name="Lancer l'analyse",exact=True).click()
 charge=critique.value.json();assert critique.value.ok and charge.get('relue') is True,charge
 assert int(sql('SELECT sum(delta) AS n FROM "AnalysisCredit" WHERE "applicationId"=$1',[dossier])[0]['n'])==27
 preuves.append({'controle':'Pièce facultative synthétique préparée : écriture manuelle, version, export DOCX et critique IA synthétique débitée','conforme':True,'fixture':True})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not erreurs
 Path(a.sortie).parent.mkdir(parents=True,exist_ok=True)
 Path(a.sortie).write_text(json.dumps({'simulation':True,'navigateur':a.navigateur,'largeur':a.largeur,'resultats':preuves,'erreursJS':erreurs},ensure_ascii=False,indent=2))
 b.close()
print(json.dumps({'controles':len(preuves),'conforme':True}))
