#!/usr/bin/env python3
"""Fix password toggle buttons by adding onclick handlers."""

with open('dashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Simple string replacements for each button
# Pattern: id="toggle-pass-XXX"><svg  ->  id="toggle-pass-XXX" onclick="window.togglePasswordVisibility('input-XXX', this)"><svg
replacements = [
    ('id="toggle-pass-lama-ganti"><svg',
     'id="toggle-pass-lama-ganti" onclick="window.togglePasswordVisibility(\'input-pass-lama-ganti\', this)"><svg'),
    ('id="toggle-pass-baru-ganti"><svg',
     'id="toggle-pass-baru-ganti" onclick="window.togglePasswordVisibility(\'input-pass-baru-ganti\', this)"><svg'),
    ('id="toggle-pass-konfirmasi-ganti"><svg',
     'id="toggle-pass-konfirmasi-ganti" onclick="window.togglePasswordVisibility(\'input-pass-konfirmasi-ganti\', this)"><svg'),
    ('id="toggle-pass-ledger"><svg',
     'id="toggle-pass-ledger" onclick="window.togglePasswordVisibility(\'input-password-ledger\', this)"><svg'),
]

for old, new in replacements:
    count = content.count(old)
    content = content.replace(old, new)
    print(f'Replaced {count} occurrence(s) for: {old[:50]}...')

with open('dashboard.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('All replacements done!')
