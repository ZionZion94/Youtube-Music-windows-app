# YouTube Music pour Windows

Application de bureau **légère** pour YouTube Music : plus besoin d'ouvrir un navigateur.
Connectez-vous une fois avec votre compte Google (YouTube Premium inclus) et la session est conservée.

## Pourquoi c'est léger

- Construite avec [Tauri](https://tauri.app) : pas de Chromium embarqué comme Electron (Spotify, Discord…).
  Elle utilise **WebView2**, déjà présent dans Windows 10/11. L'installeur pèse quelques Mo.
- Quand la fenêtre est réduite ou cachée dans la zone de notification, l'application demande à
  WebView2 de passer en **mode mémoire réduite** et le rendu graphique s'arrête — la musique continue.
- Les fonctions Edge inutiles (traduction, shopping, mises à jour de composants…) sont désactivées.
- L'accélération matérielle reste active pour que l'interface reste **fluide**.

## Fonctionnalités

- Toutes les fonctions de YouTube Music (Premium : sans pub, lecture en arrière-plan, qualité élevée).
- **Touches multimédia** du clavier (Lecture/Pause, Suivant, Précédent, Stop), même quand la fenêtre est cachée.
- **Icône dans la zone de notification** : clic gauche = afficher/masquer, clic droit = menu de lecture.
- Fermer la fenêtre (✕) la cache dans la zone de notification ; *Quitter* depuis le menu de l'icône pour fermer.
- Position et taille de la fenêtre mémorisées.
- Une seule instance : relancer l'application ramène la fenêtre existante.
- Fermeture automatique du message « Vous êtes toujours là ? » qui coupe la musique.
- Les liens externes s'ouvrent dans votre navigateur par défaut.
- Le titre en cours s'affiche dans la barre des tâches et l'infobulle de l'icône.
- **Panneau multimédia de Windows** : titre, artiste et pochette apparaissent dans la fenêtre de contrôle
  du volume (et les paramètres rapides de Windows 11), avec les boutons ⏮ ⏯ ⏭.
- **Plugin Stream Deck** : Lecture/Pause, Titre suivant/précédent, Volume +/−, J'aime / Je n'aime pas,
  Titre en cours avec pochette (voir plus bas).

## Installation

Onglet **Actions** du dépôt → dernier build « Build Windows » réussi → section **Artifacts** :

- **YouTube-Music-Setup** : installeur (raccourcis menu Démarrer, désinstallation propre) ;
- **YouTube-Music-Portable** : l'application seule, sans installation — un simple `YouTube Music.exe`
  à placer où l'on veut. Même session et mêmes réglages que la version installée.

### Téléchargement ou lancement bloqué (« dangereux »)

L'application n'est pas signée numériquement (un certificat de signature est payant), donc Windows et les
navigateurs se méfient de tout `.exe` inconnu. Le code est public et compilé par GitHub Actions.

- **Edge** : dans la liste des téléchargements, survoler le fichier → **⋯** → **Conserver** →
  **Afficher plus** → **Conserver quand même**.
- **Chrome** : dans la liste des téléchargements → **Conserver le fichier dangereux**.
- **Au lancement** (« Windows a protégé votre ordinateur ») : **Informations complémentaires** →
  **Exécuter quand même**.
- **Antivirus Microsoft Defender** (« Menace détectée ») : Sécurité Windows → **Protection contre les virus
  et menaces** → **Historique de protection** → l'élément → **Actions** → **Autoriser sur l'appareil**.

La version portable déclenche moins souvent ces alertes que l'installeur.

## Plugin Stream Deck

Ajoute une catégorie **YouTube Music** dans le logiciel Stream Deck avec 7 boutons :

- **Lecture / Pause** — l'icône passe de ▶ à ❚❚ selon l'état réel du lecteur ;
- **Titre précédent** ;
- **Titre suivant** ;
- **Volume +** / **Volume −** — par pas de 5 % ; les touches affichent en permanence le volume actuel
  (pourcentage et jauge), même quand il est changé depuis l'application ;
- **J'aime / Je n'aime pas** (une seule touche) — appui court : J'aime ; appui long (½ s) : Je n'aime pas ;
  réappuyer annule. La touche affiche l'avis sur le titre en cours (neutre, aimé, pas aimé) ;
- **Titre en cours** — touche dynamique : pochette, titre (qui défile s'il est trop long) et artiste ;
  un appui met en lecture / en pause.

Si l'application n'est pas lancée, la touche affiche un triangle jaune. Le menu de l'icône de l'application
indique « Stream Deck : prêt (port …) » quand la liaison est disponible ; la cause d'un échec est écrite dans
`%APPDATA%\Elgato\StreamDeck\Plugins\com.zionzion94.ytmusic.sdPlugin\logs`.

**Installation** (Stream Deck 7.1 ou plus récent) :

1. Onglet **Actions** → dernier build réussi → télécharger l'artefact **StreamDeck-Plugin** et le décompresser.
2. Double-cliquer sur `com.zionzion94.ytmusic.streamDeckPlugin` : le logiciel Stream Deck l'installe.
3. Glisser les boutons de la catégorie **YouTube Music** sur vos touches.

L'application YouTube Music doit être en version 1.4.0 ou plus récente pour tous les boutons
(1.3.0 suffit pour la pochette, 1.2.0 pour le volume). Elle expose pour cela une petite
API locale sur `127.0.0.1:48723` (ou un port suivant s'il est réservé par Windows), inaccessible depuis le réseau
et depuis les sites web.

Pour compiler le plugin : `cd streamdeck-plugin && npm ci && npm run pack` (résultat dans `streamdeck-plugin/dist/`).

## Compiler soi-même

Prérequis : [Rust](https://rustup.rs), [Node.js](https://nodejs.org), et les
[Build Tools Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (charge « Développement desktop en C++ »).

```powershell
npx @tauri-apps/cli@2 dev     # lancer en développement
npx @tauri-apps/cli@2 build   # créer l'installeur dans src-tauri\target\release\bundle\nsis\
```

## Structure

| Fichier | Rôle |
|---|---|
| `src-tauri/src/main.rs` | Fenêtre, icône de notification, touches multimédia, gestion mémoire |
| `src-tauri/src/inject.js` | Script injecté dans YouTube Music (contrôles de lecture, petites améliorations) |
| `src-tauri/src/api.rs` | API locale utilisée par le plugin Stream Deck |
| `src-tauri/src/smtc.rs` | Intégration au panneau multimédia de Windows |
| `src-tauri/tauri.conf.json` | Configuration de l'application et de l'installeur |
| `streamdeck-plugin/` | Plugin Stream Deck (code dans `src/`, manifeste et icônes dans `com.zionzion94.ytmusic.sdPlugin/`) |
