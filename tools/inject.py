"""Copies the Wit app page into this site, adds the tab icon, makes usewit.dev/app open straight into the app, and
makes it installable (manifest, offline worker, an Install button where the browser offers one).
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

# installable from the browser: the web app manifest, the offline worker, and an Install button in the app's bar where
# the browser offers installing (Chrome, Edge). In Safari it is File > Add to Dock, or Share > Add to Home Screen.
if 'rel="manifest"' not in html:
    html = html.replace('</title>', '</title>\n<link rel="manifest" href="/app/manifest.webmanifest">', 1)
INSTALL = '''<script>
/* usewit.dev only: work offline, and offer to install Wit as an app where the browser allows it */
(function () {
  if ('serviceWorker' in navigator) addEventListener('load', function () { navigator.serviceWorker.register('/app/sw.js').catch(function () {}); });
  var offer = null;
  addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); offer = e;
    var pills = document.querySelector('#mid .bar .pills');
    if (!pills || document.getElementById('installBtn')) return;
    var b = document.createElement('button');
    b.className = 'pill'; b.type = 'button'; b.id = 'installBtn'; b.title = 'Install Wit as an app on this device. Your notes stay on it.';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v10"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/></svg><span>Install</span>';
    b.addEventListener('click', function () { if (!offer) return; offer.prompt(); offer.userChoice.then(function () { offer = null; b.remove(); }); });
    pills.prepend(b);
  });
  addEventListener('appinstalled', function () { var b = document.getElementById('installBtn'); if (b) b.remove(); });
})();
</script>'''
if "getElementById('installBtn')" not in html:
    i = html.rfind('</body>')
    html = html[:i] + INSTALL + '\n' + html[i:]

open(dst, 'w', encoding='utf-8').write(html)
