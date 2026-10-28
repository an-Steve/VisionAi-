# 👁️ VisionAI Studio - Analyse & Génération d'Images avec Ollama

> **Réalisé par ANTON NELCON Steve**

Application web locale moderne développée en **Python (Flask)** et **HTML / CSS / JavaScript**, utilisant **Ollama** pour analyser et décrire des images en langage naturel (français), ainsi qu'un générateur d'images à partir de texte enrichi par l'IA.

---

## ✨ Fonctionnalités Principales

### 1. 👁️ Analyse d'Image par Vision IA (Local avec Ollama)
- **Modèles compatibles** : Détection automatique des modèles Vision installés dans Ollama (`gemma4:e2b`, `llama3.2-vision`, `llava`, `minicpm-v`, `qwen2.5vl`, etc.).
- **Chargement flexible** : Glisser-déposer (Drag & Drop), explorateur de fichiers ou **collage direct depuis le presse-papier (`Ctrl+V`)**.
- **Diffusion en direct (Streaming)** : Le texte s'affiche mot par mot en temps réel.
- **Synthèse Vocale (Audio)** : Bouton pour écouter la description lue à voix haute en français.
- **Modes d'analyse rapides** :
  - *Naturel* (description fluide et équilibrée)
  - *Ultra-détaillé* (inventaire complet des objets, couleurs, éclairage)
  - *En 1 phrase* (résumé percutant)
  - *Liste à puces* (synthèse ordonnée)
  - *Poétique* (évocation artistique)

### 2. 🎨 Générateur d'Image (Texte ➜ Image)
- **Création à partir de phrases** : Écrivez n'importe quelle idée en français.
- **✨ Amélioration du prompt par Ollama** : Traduit et enrichit votre idée en un prompt visuel détaillé (éclairage cinématique, rendu 8K, composition).
- **Styles artistiques** : Cinématique, Photoréaliste, Anime/Manga, Cyberpunk, Fantastique, Aquarelle.
- **Formats** : Carré (1:1), Paysage (16:9), Portrait (9:16).
- **Pont direct vers la Vision** : Un clic sur *"Analyser l'image"* envoie immédiatement l'image générée dans l'onglet Vision pour la faire décrire par Ollama !

### 3. 📜 Historique & Galerie
- Sauvegarde locale automatique de toutes les analyses et images créées dans `history.json`.

---

## 🚀 Démarrage Rapide

### Option 1 : Lancement en un clic sous Windows
Double-cliquez simplement sur le fichier :
```
run.bat
```
Il ouvrira votre navigateur sur `http://localhost:5000` et démarrera le serveur Flask.

### Option 2 : Lancement en ligne de commande
1. Installez les dépendances :
   ```bash
   pip install -r requirements.txt
   ```
2. Démarrez le serveur :
   ```bash
   python app.py
   ```
3. Rendez-vous sur [http://localhost:5000](http://localhost:5000) dans votre navigateur.

---

## 🧠 Modèles Ollama Recommandés

L'application détecte automatiquement vos modèles installés. Vous disposez déjà de modèles compatibles vision comme `gemma4:e2b`.

Si vous souhaitez tester d'autres modèles Vision de référence, vous pouvez les télécharger dans votre terminal :

```bash
# Llama 3.2 Vision (Meta)
ollama pull llama3.2-vision

# LLaVA (Large Language and Vision Assistant)
ollama pull llava

# MiniCPM-V
ollama pull minicpm-v
```
Puis cliquez sur l'icône de rafraîchissement (🔄) dans l'interface web pour que le nouveau modèle apparaisse instantanément.

---

## 📁 Structure du Projet

```
Image/
├── app.py                 # Serveur backend Flask & API Ollama
├── requirements.txt       # Dépendances Python (Flask, requests, pillow...)
├── run.bat                # Script de démarrage rapide Windows
├── history.json           # Historique des analyses et créations
├── templates/
│   └── index.html         # Interface web responsive
└── static/
    ├── css/
    │   └── style.css      # Design moderne glassmorphism dark-mode
    ├── js/
    │   └── app.js         # Logique frontend, streaming SSE et audio
    ├── uploads/           # Images uploadées pour analyse
    └── generated/         # Images créées par le générateur
```
