"""Copies the Wit app page into this site and adds the tab icon. Used by the sync workflow."""
import sys
src, dst = sys.argv[1], sys.argv[2]
html = open(src, encoding='utf-8').read()
tag = ('<link rel="icon" href="/favicon.svg" type="image/svg+xml">'
       '<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">'
       '<meta name="theme-color" content="#000000">')
if 'rel="icon"' not in html:
    html = html.replace('</title>', '</title>\n' + tag, 1)
open(dst, 'w', encoding='utf-8').write(html)
