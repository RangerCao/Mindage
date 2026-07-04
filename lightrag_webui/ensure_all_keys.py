import json, os

os.chdir(os.path.dirname(__file__) or '.')

with open('src/locales/zh.json', 'r', encoding='utf-8') as f:
    zh = json.load(f)
with open('src/locales/en.json', 'r', encoding='utf-8') as f:
    en = json.load(f)

# Ensure ALL keys from en.json exist in zh.json
def ensure_keys(zh_d, en_d, path=''):
    added = 0
    for k, v in en_d.items():
        cur = f'{path}.{k}' if path else k
        if isinstance(v, dict):
            if k not in zh_d:
                zh_d[k] = {}
            added += ensure_keys(zh_d[k], v, cur)
        elif k not in zh_d:
            zh_d[k] = v  # Copy English as fallback
            added += 1
    return added

added = ensure_keys(zh, en)
print(f'Added {added} missing keys from en.json')
print(f'Total zh.json entries: {sum(1 for _ in json.dumps(zh, ensure_ascii=False).split(",") if ":" in _)}')

with open('src/locales/zh.json', 'w', encoding='utf-8') as f:
    json.dump(zh, f, ensure_ascii=False, indent=4)
    f.write('\n')
