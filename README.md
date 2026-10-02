# Mon Journal

Journal, agenda et carnet de relations pour **Windows** et **Android**.
Chaque personne se connecte avec son compte Google ; ses données sont enregistrées
sur l'appareil puis synchronisées dans le dossier caché de l'appli de **son propre**
Google Drive (permission `drive.appdata`). Il n'y a aucun serveur.

- Windows : https://github.com/Pink-Rain/Mon-Journal/releases/latest/download/Mon-Journal-Setup.exe
- Android : https://github.com/Pink-Rain/Mon-Journal/releases/latest/download/Mon-Journal.apk

L'appli se met à jour toute seule : Windows télécharge la nouvelle version et propose
de redémarrer ; Android propose d'installer le nouvel APK.

## Organisation du code

| Dossier | Rôle |
| --- | --- |
| `wiki/plugins/monjournal/tiddlers/journalapp/` | L'interface d'origine (vues, layout, modules, styles), extraite du TiddlyWiki par `scripts/extract-plugin.py`. |
| `wiki/plugins/monjournal/tiddlers/app/` | Le pont avec l'appli : syncadaptor, bouton de synchronisation, réglages par défaut. |
| `host/` | La couche appli chargée avant TiddlyWiki : connexion Google, stockage IndexedDB, synchronisation Drive, import, mises à jour. |
| `electron/` | Coque Windows (fenêtre, connexion Google par le navigateur, electron-updater). |
| `android/` | Projet Capacitor, avec les plugins natifs `MonJournalAuth`, `MonJournalUpdater`, `MonJournalFiles`. |
| `docs/` | Site public (accueil, confidentialité, conditions) servi par GitHub Pages. |
| `signing/` | Clé de signature Android, chiffrée. |

TiddlyWiki sert de moteur invisible : il est démarré par `host/src/index.js` une fois
le compte ouvert et les données chargées.

## Développer

```sh
npm install
npm run dev            # construit dist/web et le sert sur http://localhost:8765 (mode local, sans Google)
node tests/run-sync-test.mjs   # tests de synchronisation (Playwright)
```

Mettre à jour l'interface depuis un export TiddlyWiki : `npm run extract -- export.json`
(seul le code est extrait, jamais les données).

## Publier une version

1. Monter la version dans `package.json` (ex. `0.2.0`).
2. Pousser un tag `v0.2.0`.
3. Le workflow **Release** construit l'installateur Windows et l'APK, puis crée la Release.

Secrets GitHub Actions nécessaires :

- `MJ_GOOGLE_DESKTOP_CLIENT_SECRET` : code secret du client OAuth « Application de bureau ».
- `ANDROID_KEYSTORE_PASSWORD` : mot de passe de `signing/monjournal-release.p12.enc`.
