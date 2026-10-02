# Signature Android

`monjournal-release.p12.enc` est la clé de signature des APK de Mon Journal,
chiffrée (AES-256, PBKDF2 600 000 itérations). Sans elle, impossible de publier
une mise à jour qui s'installe par-dessus l'appli existante.

- Alias : `monjournal`
- Package : `com.pinkrain.monjournal`
- SHA-1 : `E9:8B:D0:AC:52:CB:B4:F1:4C:99:20:BF:DF:E7:66:68:D9:D6:FB:08`
- SHA-256 : `FC:E7:99:62:06:82:51:11:F0:73:B8:40:C1:48:C4:EA:DE:7C:80:BC:E8:28:E8:FF:E3:77:CE:33:A0:7B:1E:5C`

Le mot de passe n'est **jamais** commité. Il vit uniquement dans le secret
GitHub Actions `ANDROID_KEYSTORE_PASSWORD` (il sert à la fois à déchiffrer ce
fichier et à ouvrir le keystore).

Déchiffrer à la main :

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -in signing/monjournal-release.p12.enc -out monjournal-release.p12
```
