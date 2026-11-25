"""Copies the Wit app page into this site, adds the tab icon, and makes usewit.dev/app open straight into the app.
Used by the sync workflow. Vorinos/Wit's own app/index.html is never changed."""
import sys
src, dst = sys.argv[1], sys.argv[2]
html = open(src, encoding='utf-8').read()

# the tab icon, and an old /app/#brain link tidied to plain /app
head = ('<link rel="icon" href="/favicon.svg" type="image/svg+xml">'
        '<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">'
        '<meta name="theme-color" content="#000000">'
        "<script>if(location.hash==='#brain')try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}</script>")
if 'rel="icon"' not in html:
    html = html.replace('</title>', '</title>\n' + head, 1)

# open as the app, the way the desktop app does: no intro page first and no #brain in the address
OLD = "const DESKTOP = location.protocol === 'file:' && !/[?&]site/.test(location.search);"
NEW = "const DESKTOP = (location.protocol === 'file:' && !/[?&]site/.test(location.search)) || /^\\/app(\\/|\\/index\\.html)?$/.test(location.pathname);"
if OLD in html:
    html = html.replace(OLD, NEW, 1)
else:
    print('warning: the app no longer has the line that picks app or intro; /app may show the intro page', file=sys.stderr)

open(dst, 'w', encoding='utf-8').write(html)
