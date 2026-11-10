# Adds or changes UI strings in messages/fa.json and messages/en.json (the JSON files are the source of truth).
# Usage: python3 scripts/add-messages.py additions.json   where the file holds {"section": {"key": ["fa", "en"], ...}, ...}
# (nested sections are allowed; a two-item list of strings is a leaf).
import json, os, sys

root = os.path.join(os.path.dirname(__file__), '..', 'messages')
add = json.load(open(sys.argv[1], encoding='utf-8'))

def is_leaf(v):
    return isinstance(v, list) and len(v) == 2 and all(isinstance(x, str) for x in v)

def merge(dst, src, i):
    for k, v in src.items():
        if is_leaf(v):
            dst[k] = v[i]
        else:
            if not isinstance(dst.get(k), dict):
                dst[k] = {}
            merge(dst[k], v, i)

for i, loc in enumerate(['fa', 'en']):
    path = os.path.join(root, f'{loc}.json')
    data = json.load(open(path, encoding='utf-8'))
    merge(data, add, i)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
