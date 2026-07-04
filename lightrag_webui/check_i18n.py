import json

with open('src/locales/zh.json', 'r', encoding='utf-8') as f:
    zh = json.load(f)
with open('src/locales/en.json', 'r', encoding='utf-8') as f:
    en = json.load(f)

def find_missing(d1, d2, path=''):
    missing = []
    for k, v in d2.items():
        cur = f'{path}.{k}' if path else k
        if isinstance(v, dict):
            missing += find_missing(d1.get(k, {}), v, cur)
        elif k not in d1:
            missing.append(f'{cur} (MISSING)')
        elif d1.get(k, '') == v and v != '':
            missing.append(f'{cur} (untranslated: "{v[:60]}")')
    return missing

miss = find_missing(zh, en)
print(f'Missing or untranslated keys ({len(miss)}):')
for m in miss:
    print(f'  {m}')
