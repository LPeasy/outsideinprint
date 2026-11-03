"""Validate generated app payloads; never reads or copies managed originals."""
import argparse, datetime, hashlib, json
from pathlib import Path
from urllib.parse import urlparse, urljoin
from html.parser import HTMLParser
p=argparse.ArgumentParser();p.add_argument('--site-dir',required=True);p.add_argument('--clock');args=p.parse_args();root=Path(args.site_dir)
c=json.loads((root/'app/v1/catalog.json').read_text());assert c['schemaVersion']==1 and c['offlineContentComplete'] is True and c['offlineGalleryComplete'] is True
ids=[x['id'] for x in c['items']];assert len(ids)==len(set(ids)) and ids
now=datetime.datetime.fromisoformat(args.clock.replace('Z','+00:00')) if args.clock else datetime.datetime.now(datetime.timezone.utc)
for item in c['items']:
 assert datetime.datetime.fromisoformat(item['date'].replace('Z','+00:00'))<=now,item['id']
 assert item['canonicalURL'].startswith('https://outsideinprint.org/'),item['id']
 payload=json.loads((root/urlparse(item['articleURL']).path.lstrip('/')).read_text())
 assert payload['id']==item['id']
 assert hashlib.sha256(payload['html'].encode()).hexdigest()==item['revision']
 assert 'oip-image:' not in payload['html'] and '/images/originals/' not in payload['html']
 assert 'APP_PRIVATE_SENTINEL' not in payload['html']
f=c['frontPage'];assert f['schemaVersion']==1 and set(f['selectedIds'])<=set(ids)
assert len(f['selectedIds'])==len(set(f['selectedIds']))
assert f['lead']['mode'] in ['latest','pinned']
if f['lead']['mode']=='pinned':assert f['lead']['id'] in ids
for a in c['artwork']:assert not a['articleId'] or a['articleId'] in ids
# A full site build includes the public Gallery. Each distinct public Gallery
# image must be represented in the feed, including illustrations without a piece.
class GalleryImages(HTMLParser):
 def __init__(self):
  super().__init__();self.urls=set()
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='button' and 'data-cartoon-lightbox-trigger' in a and a.get('data-image'):
   self.urls.add(urljoin('https://outsideinprint.org',a['data-image']))
gallery=root/'gallery/index.html'
if gallery.exists():
 parser=GalleryImages();parser.feed(gallery.read_text())
 actual={a['url'] for a in c['artwork']}
 assert parser.urls and parser.urls<=actual, sorted(parser.urls-actual)

for lane in ['almanack','books']:assert all(x['id'] in ids for x in c[lane])
assert c['almanack'] and c['books'] and c['jukebob']['albums']
assert len({x['id'] for x in c['bookCatalog']})==len(c['bookCatalog'])
assert all(x['title'] and x['author'] and x['cover'].startswith('https://outsideinprint.org/') for x in c['bookCatalog'])
assert all(not x['sampleId'] or x['sampleId'] in ids for x in c['bookCatalog'])
class BookshopLinks(HTMLParser):
 def __init__(self):
  super().__init__();self.urls=set();self.titles=set()
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);classes=set(a.get('class','').split())
  if tag=='a' and classes.intersection({'bookstore-record__cover','bookstore-feature__cover'}) and a.get('href'):
   self.urls.add(urljoin('https://outsideinprint.org',a['href']))
   label=a.get('aria-label','');assert label.startswith('Read about '),label
   self.titles.add(label.removeprefix('Read about '))
shop=root/'shop/index.html'
if shop.exists():
 parser=BookshopLinks();parser.feed(shop.read_text())
 assert len(parser.urls)==len(c['bookCatalog']), (sorted(parser.urls),[x['id'] for x in c['bookCatalog']])
 assert parser.titles=={x['title'] for x in c['bookCatalog']}, (parser.titles,{x['title'] for x in c['bookCatalog']})
assert all(isinstance(x.get('issueNumber'),int) and x['issueNumber']>0 for x in c['almanack'])
assert all(isinstance(x.get('issueDate'),str) and x['issueDate'] for x in c['almanack'])
print(json.dumps({'status':'PASS','pieces':len(ids),'artwork':len(c['artwork']),'collections':len(c['collections']),'almanack':len(c['almanack']),'samples':len(c['books']),'albums':len(c['jukebob']['albums'])}))
