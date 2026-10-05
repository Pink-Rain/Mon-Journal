#!/usr/bin/env python3
"""Extrait le code de Mon Journal d'un export JSON TiddlyWiki vers wiki/plugins/monjournal.

Usage : python3 scripts/extract-plugin.py export.json

Seul le CODE de l'appli est extrait (modules, styles, vues, layout, icônes…).
Les données personnelles (entrées, médias, réglages) ne sont jamais écrites dans le repo.
"""
import base64, json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "wiki", "plugins", "monjournal", "tiddlers")

CODE_PREFIXES = (
    "$:/journalapp/modules/",
    "$:/journalapp/styles",
    "$:/journalapp/ui/",
    "$:/journalapp/views/",
    "$:/journalapp/categories/",
    "$:/journalapp/icons/",
)
CODE_TITLES = {
    "$:/journalapp/layout",
    "$:/tags/JournalApp/Category",
    "$:/tags/JournalApp/View",
    "$:/palettes/Twilight",
    "$:/config/PageControlButtons/Visibility/$:/core/ui/Buttons/more-page-actions",
}
DROP_FIELDS = {"text", "modified", "created", "revision", "bag"}

EXT_BY_TYPE = {
    "application/javascript": ".js",
    "text/css": ".css",
    "application/json": ".json",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "application/x-tiddler-dictionary": ".dict",
}
BINARY_TYPES = {"image/png", "image/gif", "image/jpeg", "image/webp"}


# Adaptations pour l'appli : le bouton « Sauvegarder » de TiddlyWiki devient
# le bouton compte / synchronisation (la sauvegarde est automatique).
#
# Les catégories, vues et icônes sont maintenant des tiddlers « shadow » du
# plugin : les filtres [tag[…]] et is[tiddler] ne voient que les tiddlers
# ordinaires, il faut donc leur demander d'inclure les shadows.
def _replace_all(*pairs):
    def apply(text):
        for old, new in pairs:
            if old not in text:
                raise SystemExit("patch introuvable : %r" % old)
            text = text.replace(old, new)
        return text
    return apply


PATCHES = {
    "$:/journalapp/layout": _replace_all(
        ("{{$:/core/ui/Buttons/save-wiki}}",
         "{{$:/plugins/pinkrain/monjournal/ui/SyncButton}}"),
        ("[tag[$:/tags/JournalApp/Category]]",
         "[all[shadows+tiddlers]tag[$:/tags/JournalApp/Category]]"),
        ("addprefix[$:/journalapp/icons/]is[tiddler]]",
         "addprefix[$:/journalapp/icons/]has[type]]"),
    ),
    "$:/journalapp/ui/SidebarAuto": _replace_all(
        ("[tag<ja-category>tag[$:/tags/JournalApp/View]] [tag[$:/tags/JournalApp/View]field:category<ja-category>]",
         "[all[shadows+tiddlers]tag<ja-category>tag[$:/tags/JournalApp/View]] [all[shadows+tiddlers]tag[$:/tags/JournalApp/View]field:category<ja-category>]"),
    ),
    # Exemples neutres à la place des prénoms de la vraie vie : l'appli est
    # partagée, les autres utilisateurs n'ont pas à les voir.
    "$:/journalapp/modules/lib/entities.js": _replace_all(
        ('placeholder:"Emma, Julian…"', 'placeholder:"Alex, Sam…"'),
    ),
    "$:/journalapp/modules/lib/entity-forms.js": _replace_all(
        ('"Chez Emma, Parc, Maison…"', '"Chez Alex, Parc, Maison…"'),
    ),
    "$:/journalapp/modules/lib/relation-modes.js": _replace_all(
        ('{"Andrea":["irl","msg"],"Emma":["vocal"]}', '{"Alex":["irl","msg"],"Sam":["vocal"]}'),
    ),
    "$:/journalapp/modules/lib/jmedia.js": _replace_all(
        ("var all=[],usage=imageUsageTags(wiki);\n  wiki.each(function(t,title){",
         "var all=[],usage=imageUsageTags(wiki);\n  wiki.eachShadowPlusTiddlers(function(t,title){"),
    ),
    "$:/journalapp/modules/widgets/journal-settings.js": _replace_all(
        ('wiki.filterTiddlers("[tag[$:/tags/JournalApp/Category]]")',
         'wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/JournalApp/Category]]")'),
        ('wiki.each(function(t,title){if(t&&t.fields&&/^image\\//.test(String(t.fields.type||""))){images.push(title);}});',
         'wiki.eachShadowPlusTiddlers(function(t,title){if(t&&t.fields&&/^image\\//.test(String(t.fields.type||""))){images.push(title);}});'),
        ("/* Les icônes de catégories sont résolues dynamiquement à partir du slug. */\n  wiki.each(function(t){",
         "/* Les icônes de catégories sont résolues dynamiquement à partir du slug. */\n  wiki.eachShadowPlusTiddlers(function(t){"),
    ),
}


def is_code(title):
    return title in CODE_TITLES or title.startswith(CODE_PREFIXES)


def rel_path(title):
    p = title[3:] if title.startswith("$:/") else title
    parts = [re.sub(r'[<>:"\\|?*\s]+', "_", s) or "_" for s in p.split("/")]
    return os.path.join(*parts)


def write_meta(path, fields):
    with open(path, "w", encoding="utf-8") as f:
        for k in sorted(fields, key=lambda k: (k != "title", k)):
            f.write("%s: %s\n" % (k, fields[k]))


def main(src):
    tiddlers = json.load(open(src, encoding="utf-8"))
    # On ne supprime que ce que ce script génère : tiddlers/app/ (le pont avec
    # l'appli) est écrit à la main et ne doit pas être touché.
    for sub in ("journalapp", "tags", "palettes", "config"):
        if os.path.isdir(os.path.join(OUT, sub)):
            shutil.rmtree(os.path.join(OUT, sub))
    count = 0
    for t in tiddlers:
        title = t["title"]
        if not is_code(title):
            continue
        fields = {k: str(v) for k, v in t.items() if k not in DROP_FIELDS}
        text = PATCHES.get(title, lambda x: x)(t.get("text", "") or "")
        ttype = t.get("type", "")
        base = os.path.join(OUT, rel_path(title))
        os.makedirs(os.path.dirname(base), exist_ok=True)
        multiline = any("\n" in v for v in fields.values())
        if multiline:
            raise SystemExit("champ multi-ligne non géré : %s" % title)
        if ttype in EXT_BY_TYPE:
            ext = EXT_BY_TYPE[ttype]
            path = base if base.endswith(ext) else base + ext
            if ttype in BINARY_TYPES:
                with open(path, "wb") as f:
                    f.write(base64.b64decode(text))
            else:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(text)
            write_meta(path + ".meta", fields)
        else:
            with open(base + ".tid", "w", encoding="utf-8") as f:
                for k in sorted(fields, key=lambda k: (k != "title", k)):
                    f.write("%s: %s\n" % (k, fields[k]))
                f.write("\n" + text)
        count += 1
    print("%d tiddlers de code extraits dans %s" % (count, os.path.relpath(OUT, ROOT)))


if __name__ == "__main__":
    main(sys.argv[1])
