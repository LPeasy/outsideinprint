"""Offline baseline fixture generator. Does not instantiate the API client or read env files.

Usage: python test/generate-python-parity.py PATH_TO_APPROVED_PREVIEW
The frozen fixture keeps normal Node tests independent of Python and the preview.
"""
import json
from pathlib import Path
import socket
import sys

def no_network(*args, **kwargs):
    raise RuntimeError('Network is disabled for parity fixtures')

socket.create_connection = no_network
socket.socket.connect = no_network
socket.socket.connect_ex = no_network
sys.path.insert(0, str(Path(sys.argv[1]).resolve()))
from bob_preferences import defaults
from bob_recommender import validate_request
from bob_search import shortlist

def item(name, minutes, summary='Water, rivers and floods.', kind='essay'):
    return {'id': f'/essays/{name}/', 'title': name.replace('-', ' ').title(),
            'url': f'https://outsideinprint.org/essays/{name}/', 'summary': summary,
            'readingTime': minutes, 'type': kind, 'tags': [], 'topics': []}

catalog = [item('river', 8), item('flood', 4), item('rain', 3), item('water', 2),
           item('electricity', 6, 'Electricity, the power grid and everyday energy.'),
           item('gratitude', 2, 'Gratitude, comfort and kindness in ordinary life.', 'affirmation'),
           item('conversation', 4, 'Water and flooding.', 'dialogue'),
           item('hope', 3, 'Hope, optimism and water resilience.', 'dialogue'),
           item('water-vote', 3, 'The president and Congress voted on water policy.'),
           item('faith', 2, 'Water, religious faith and Christian prayer.'),
           item('privacy', 5, 'Password security, privacy and digital identity.'),
           item('invention', 9, 'Historical everyday objects, tools and technology.'),
           item('literature', 4, 'Books, reading and the library.'),
           item('unknown-duration', None)]
cases = []
def add(name, request):
    candidates, state = shortlist(catalog, validate_request(request))
    cases.append({'name': name, 'request': request, 'expected': {
        'preferences': state['preferences'], 'action': state['intent']['action'],
        'clarification': state['intent']['clarification'], 'ids': [i['id'] for i in candidates]}})
prefs = {**defaults(), 'topic': 'water', 'maxMinutes': 10}
for phrase in ['under five minutes', 'up to five minutes', 'five minutes or less',
               'no more than five minutes', 'not more than five minutes', 'not longer than five minutes',
               'not under five minutes', 'not over five minutes', 'no less than five minutes',
               'between three and five minutes', 'at least five minutes', 'more than five minutes',
               'I only have ten minutes', 'a five-minute read', 'half an hour', 'a quarter of an hour',
               'twenty-five minutes', 'under 0.5 hours', 'under five minutes and over ten minutes',
               '-5 minutes', 'minus five minutes', 'over 300 minutes']:
    add('duration: ' + phrase, {'message': phrase, 'preferences': prefs})
for phrase in ['something shorter', 'those are too long', 'Something longer', 'those are too short',
               'More like these', 'less technical', 'easier to read', 'same topic but lighter',
               'something more hopeful', 'only dialogues', 'nothing political', 'nothing religious',
               'more about history', 'electricity', 'More like the second one', 'why the second one?',
               'Why that one?', 'why the third one?', 'surprise me', 'help me choose']:
    add('refinement: ' + phrase, {'message': phrase, 'preferences': prefs,
        'currentIds': ['/essays/river/', '/essays/flood/'], 'seenIds': ['/essays/flood/']})
for phrase in ['a dialogue', 'Syd & Oliver', 'The Things We Say', 'Musings', 'only essays',
               'electrcity', 'water, nothing political', 'water, avoid religion', 'passwords',
               'book recommendations', 'everyday objects', 'underwater basketweaving', 'surprise me']:
    add('search: ' + phrase, {'message': phrase})
history = [{'role': 'user', 'content': 'water under five minutes'},
           {'role': 'assistant', 'content': 'Water [/essays/water/]; Rain [/essays/rain/]'},
           {'role': 'user', 'content': 'Something longer'},
           {'role': 'assistant', 'content': 'Flood [/essays/flood/]'}]
add('legacy more after longer', {'message': 'More like these', 'history': history,
    'currentIds': ['/essays/flood/'], 'seenIds': ['/essays/water/', '/essays/rain/', '/essays/flood/']})
add('legacy shorter reverses longer', {'message': 'something shorter', 'history': history, 'currentIds': ['/essays/flood/']})
add('legacy new subject clears duration', {'message': 'electricity', 'history': history})
add('shorter may retain qualifying previous result', {'message': 'Something shorter, under five minutes',
    'preferences': prefs, 'currentIds': ['/essays/river/', '/essays/flood/'], 'seenIds': ['/essays/river/', '/essays/flood/']})
for action in ['relax_time', 'clear_filters']:
    add(action, {'action': action, 'preferences': {**prefs, 'mood': 'hopeful', 'formats': ['dialogue'], 'excludedTopics': ['politics']}})
sticky = {**prefs, 'mood': 'hopeful', 'formats': ['essay'], 'excludedTopics': ['politics']}
add('explicit new subject', {'message': 'electricity', 'preferences': sticky})
sticky = cases[-1]['expected']['preferences']
for index in range(7):
    request = {'message': 'More like these', 'action': 'more', 'preferences': sticky,
               'history': [{'role': 'user', 'content': 'water under three minutes'}]}
    add(f'explicit more {index + 1} retains new subject', request)
    sticky = cases[-1]['expected']['preferences']

destination = Path(__file__).parent / 'fixtures' / 'python-parity.json'
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps({'source': 'Approved local Python preview; offline, synthetic catalog', 'catalog': catalog, 'cases': cases}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Wrote {len(cases)} offline parity cases')
