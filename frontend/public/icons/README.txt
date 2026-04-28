Fichiers PWA (PNG) :
- icon-192.png — raccourci / Apple Touch
- icon-512.png — “any”, haute résolution
- icon-maskable-512.png — Android adaptive (logo ~80 % + fond #0a0a0a)

Dans index.html, le lien « manifest » pointe vers /api/public/pwa-manifest (titre d’installation « Partenaire — McBuleli » lorsque le domaine est relié à un FAI). Le fichier manifest.json statique reste un secours si l’API n’est pas joignable.

Regénération (macOS) depuis la racine frontend :
  npm run icons

Sur Linux/CI sans qlmanage/sips, exportez manuellement le SVG vers ces trois PNG.
