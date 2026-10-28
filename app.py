import os
import sys
import io
import time
import json
import uuid
import base64
import urllib.parse
from datetime import datetime

# Assurer l'encodage UTF-8 sous Windows
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
import requests
from PIL import Image
from flask import Flask, render_template, request, jsonify, Response, stream_with_context
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Configuration des répertoires
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
GENERATED_FOLDER = os.path.join(BASE_DIR, 'static', 'generated')
HISTORY_FILE = os.path.join(BASE_DIR, 'history.json')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(GENERATED_FOLDER, exist_ok=True)

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")

# Modèles connus pour avoir des capacités de vision
KNOWN_VISION_KEYWORDS = ['vision', 'vl', 'llava', 'minicpm', 'moondream', 'bakllava', 'gemma4']

def load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {"analyses": [], "generations": []}

def save_history(history_data):
    try:
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Erreur de sauvegarde de l'historique: {e}")

def is_vision_model(model_info):
    name = model_info.get('name', '').lower()
    capabilities = model_info.get('capabilities', [])
    if 'vision' in capabilities:
        return True
    for kw in KNOWN_VISION_KEYWORDS:
        if kw in name:
            return True
    return False

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/status', methods=['GET'])
def get_status():
    """Vérifie si Ollama est actif et joignable."""
    try:
        resp = requests.get(f"{OLLAMA_HOST}/api/version", timeout=3)
        if resp.status_code == 200:
            data = resp.json()
            return jsonify({
                "connected": True,
                "version": data.get("version", "Inconnue"),
                "host": OLLAMA_HOST
            })
    except Exception as e:
        return jsonify({
            "connected": False,
            "error": str(e),
            "host": OLLAMA_HOST
        }), 503

@app.route('/api/models', methods=['GET'])
def get_models():
    """Récupère la liste des modèles installés dans Ollama avec détection de la vision."""
    try:
        resp = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=5)
        if resp.status_code != 200:
            return jsonify({"error": "Impossible de contacter Ollama"}), 502

        raw_models = resp.json().get('models', [])
        models = []
        default_vision_model = None

        for m in raw_models:
            has_vision = is_vision_model(m)
            model_entry = {
                "name": m.get("name"),
                "size": round(m.get("size", 0) / (1024 * 1024 * 1024), 2),  # en Go
                "modified_at": m.get("modified_at"),
                "is_vision": has_vision,
                "parameter_size": m.get("details", {}).get("parameter_size", "")
            }
            models.append(model_entry)
            if has_vision and not default_vision_model:
                default_vision_model = m.get("name")

        # Si aucun modèle vision n'est détecté, on prend le premier ou un nom par défaut
        if not default_vision_model and models:
            default_vision_model = models[0]["name"]
        elif not default_vision_model:
            default_vision_model = "gemma4:e2b"

        return jsonify({
            "models": models,
            "default_vision_model": default_vision_model
        })
    except Exception as e:
        return jsonify({"error": str(e), "models": [], "default_vision_model": "gemma4:e2b"}), 500

@app.route('/api/analyze-stream', methods=['POST'])
def analyze_stream():
    """
    Analyse une image avec Ollama et retransmet le texte en temps réel (Streaming SSE).
    """
    image_b64 = None
    saved_filename = None

    model = request.form.get('model', 'gemma4:e2b')
    prompt = request.form.get('prompt', 'Décris cette image précisément et en détail en français.')
    style_instruction = request.form.get('style', 'naturel')

    # Ajustement selon le mode de description choisi
    if style_instruction == 'court':
        prompt += " Fais une description concise en 1 ou 2 phrases percutantes."
    elif style_instruction == 'detaille':
        prompt += " Décris tous les éléments visibles : objets, personnes, expressions, arrière-plan, couleurs, lumière et atmosphère."
    elif style_instruction == 'poetique':
        prompt += " Adopte un ton poétique, artistique et évocateur pour retranscrire les émotions de l'image."
    elif style_instruction == 'points':
        prompt += " Structure ta réponse sous forme de liste à puces claire et ordonnée."

    # Traitement de l'image envoyée (fichier uploadé ou base64)
    if 'image' in request.files and request.files['image'].filename:
        file = request.files['image']
        ext = os.path.splitext(file.filename)[1].lower() or '.jpg'
        saved_filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(UPLOAD_FOLDER, saved_filename)
        file.save(filepath)

        # Optimisation et conversion en base64 pour Ollama
        try:
            with Image.open(filepath) as img:
                # Convertir en RGB si nécessaire
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                # Redimensionner si trop grande pour fluidité
                max_dim = 1600
                if max(img.size) > max_dim:
                    img.thumbnail((max_dim, max_dim))
                
                buf = io.BytesIO()
                img.save(buf, format='JPEG', quality=90)
                image_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
        except Exception as e:
            return jsonify({"error": f"Erreur de lecture de l'image: {e}"}), 400

    elif request.form.get('image_b64'):
        raw_b64 = request.form.get('image_b64')
        if ',' in raw_b64:
            raw_b64 = raw_b64.split(',', 1)[1]
        image_b64 = raw_b64
        saved_filename = f"{uuid.uuid4().hex}.jpg"
        filepath = os.path.join(UPLOAD_FOLDER, saved_filename)
        try:
            with open(filepath, 'wb') as f:
                f.write(base64.b64decode(image_b64))
        except Exception as e:
            return jsonify({"error": f"Erreur de décodage base64: {e}"}), 400
    else:
        return jsonify({"error": "Aucune image fournie"}), 400

    def generate_sse():
        full_text = []
        start_time = time.time()
        ollama_payload = {
            "model": model,
            "prompt": prompt,
            "images": [image_b64],
            "stream": True,
            "options": {
                "temperature": 0.7
            }
        }

        try:
            resp = requests.post(
                f"{OLLAMA_HOST}/api/generate",
                json=ollama_payload,
                stream=True,
                timeout=120
            )

            if resp.status_code != 200:
                err_msg = f"Erreur Ollama ({resp.status_code}): {resp.text}"
                yield f"data: {json.dumps({'error': err_msg})}\n\n"
                return

            for line in resp.iter_lines():
                if line:
                    chunk = json.loads(line.decode('utf-8'))
                    token = chunk.get('response', '')
                    is_done = chunk.get('done', False)
                    if token:
                        full_text.append(token)
                        yield f"data: {json.dumps({'chunk': token, 'done': False})}\n\n"
                    
                    if is_done:
                        duration = round(time.time() - start_time, 2)
                        complete_response = "".join(full_text)
                        
                        # Sauvegarder dans l'historique
                        hist = load_history()
                        item_id = str(uuid.uuid4())
                        hist_entry = {
                            "id": item_id,
                            "type": "analysis",
                            "model": model,
                            "prompt": prompt,
                            "description": complete_response,
                            "image_url": f"/static/uploads/{saved_filename}",
                            "duration": duration,
                            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        }
                        hist["analyses"].insert(0, hist_entry)
                        # Limiter à 50 entrées
                        hist["analyses"] = hist["analyses"][:50]
                        save_history(hist)

                        yield f"data: {json.dumps({'done': True, 'duration': duration, 'image_url': f'/static/uploads/{saved_filename}', 'id': item_id})}\n\n"
                        break

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(stream_with_context(generate_sse()), mimetype='text/event-stream')

def smart_translate_prompt(user_prompt, requested_model='gemma4:e2b'):
    """
    Traduit et adapte fidèlement le concept de l'utilisateur (écrit en français)
    en une description en anglais précise et percutante pour le générateur d'images.
    Le sujet principal reste TOUJOURS la priorité absolue.
    """
    if not user_prompt:
        return "", requested_model

    # Choisir un modèle ultra-rapide si présent pour une traduction en < 1 seconde
    preferred_text_models = ['qwen2.5:1.5b', 'llama3.2:1b', 'llama3.2', 'qwen2.5', requested_model]
    chosen_model = requested_model

    try:
        tags_resp = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=3)
        if tags_resp.status_code == 200:
            installed = [m.get('name') for m in tags_resp.json().get('models', [])]
            for pref in preferred_text_models:
                if pref in installed:
                    chosen_model = pref
                    break
    except Exception:
        pass

    prompt_query = (
        "You are an expert translator and prompt engineer for AI image generators (Flux/Stable Diffusion). "
        "Convert the user concept into a clear, vivid English image prompt (10 to 30 words). "
        "CRITICAL RULES:\n"
        "1. The MAIN SUBJECT must be the absolute center of focus (e.g., 'pomme' -> 'A ripe crisp red apple on a wooden table', "
        "'Une voiture de sport' -> 'A sleek modern sports car', 'Miraculous' -> 'Ladybug superhero from Miraculous cartoon with red and black spots suit').\n"
        "2. If the user writes in French, accurately translate the meaning to English.\n"
        "3. Keep it purely visual and descriptive. Output ONLY the English description, without any quotes, intro words, or markdown."
        f"\n\nUser concept: {user_prompt}"
    )

    try:
        resp = requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json={
                "model": chosen_model,
                "prompt": prompt_query,
                "stream": False,
                "options": {
                    "temperature": 0.2,
                    "num_predict": 60
                }
            },
            timeout=15
        )
        if resp.status_code == 200:
            raw_text = resp.json().get('response', '').strip()
            # Nettoyer
            clean_text = raw_text.strip('"').strip("'").replace('\n', ' ').strip()
            if clean_text:
                return clean_text, chosen_model
    except Exception as e:
        print(f"Avertissement: traduction Ollama échouée ({e}), conservation du prompt brut.")

    # Dictionnaire de secours simple si Ollama n'est pas joignable
    fallback_dict = {
        'pomme': 'a red apple',
        'voiture': 'a car',
        'voiture de sport': 'a sleek sports car',
        'chat': 'a cute cat',
        'chien': 'a playful dog',
        'maison': 'a beautiful house',
        'fleur': 'colorful flowers',
        'arbre': 'a majestic tree',
        'miraculous': 'Ladybug from Miraculous Ladybug'
    }
    lower_prompt = user_prompt.lower().strip()
    return fallback_dict.get(lower_prompt, user_prompt), chosen_model

@app.route('/api/enhance-prompt', methods=['POST'])
def enhance_prompt():
    """
    Utilise Ollama pour enrichir un prompt court écrit en français en un prompt riche,
    visuel et détaillé en anglais pour le générateur d'images.
    """
    data = request.get_json() or {}
    user_prompt = data.get('prompt', '').strip()
    requested_model = data.get('model', 'gemma4:e2b')

    if not user_prompt:
        return jsonify({"error": "Le prompt ne peut pas être vide"}), 400

    enhanced, model_used = smart_translate_prompt(user_prompt, requested_model)
    return jsonify({"enhanced_prompt": enhanced, "model_used": model_used})

@app.route('/api/generate-image', methods=['POST'])
def generate_image():
    """
    Génère une image à partir d'une description textuelle.
    Traduit et adapte automatiquement le prompt français en anglais pour garantir
    que l'image correspond parfaitement à ce que l'utilisateur a demandé.
    """
    data = request.get_json() or {}
    prompt = data.get('prompt', '').strip()
    style = data.get('style', 'cinematic')
    aspect_ratio = data.get('aspect_ratio', '1:1')
    enhancer_model = data.get('model', 'gemma4:e2b')

    if not prompt:
        return jsonify({"error": "Veuillez fournir une description"}), 400

    # Résolutions selon le ratio
    dimensions = {
        '1:1': (1024, 1024),
        '16:9': (1280, 720),
        '9:16': (720, 1280),
        '4:3': (1024, 768)
    }
    width, height = dimensions.get(aspect_ratio, (1024, 1024))

    # Styles d'image équilibrés qui mettent en valeur le sujet sans l'étouffer
    style_modifiers = {
        'photorealistic': 'hyperrealistic photograph, sharp focus, natural lighting, 8k resolution',
        'cinematic': 'cinematic photography, dramatic lighting, sharp focus, atmospheric, 8k',
        'anime': 'vibrant Japanese anime style illustration, clean linework, Makoto Shinkai style',
        'cyberpunk': 'cyberpunk aesthetic, glowing neon lights, futuristic cityscape reflection',
        'fantasy': 'epic fantasy digital art, magical glowing atmosphere, detailed concept art',
        'watercolor': 'artistic watercolor painting, delicate brushstrokes, textured paper'
    }

    # Traduction et adaptation automatique en anglais avec Ollama
    english_prompt, model_used = smart_translate_prompt(prompt, enhancer_model)

    # Ajout du style sélectionné
    modifier = style_modifiers.get(style, '')
    if modifier:
        combined_prompt = f"{english_prompt}, {modifier}"
    else:
        combined_prompt = english_prompt

    start_time = time.time()
    seed = int(time.time() * 1000) % 1000000
    encoded_prompt = urllib.parse.quote(combined_prompt)

    image_bytes = None
    engine_used = "Flux (Pollinations)"

    # 1. Tenter Pollinations Flux
    pollinations_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?seed={seed}&nologo=true"
    try:
        resp = requests.get(pollinations_url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=25)
        if resp.status_code == 200 and len(resp.content) > 5000:
            image_bytes = resp.content
    except Exception as e:
        print(f"Avertissement Pollinations : {e}")

    # 2. Si limite atteinte (ex: erreur 402 ou timeout), bascule transparente vers Stable Diffusion (AI Horde)
    if not image_bytes:
        print("[INFO] Bascule vers le moteur Stable Diffusion (AI Horde)...")
        engine_used = "Stable Diffusion (AI Horde)"
        try:
            horde_url = 'https://aihorde.net/api/v2/generate/async'
            h_payload = {
                'prompt': combined_prompt,
                'params': {
                    'steps': 20,
                    'width': 512,
                    'height': 512
                }
            }
            h_headers = {
                'apikey': '0000000000',
                'Client-Agent': 'VisionAI:1.0:anon'
            }
            h_req = requests.post(horde_url, json=h_payload, headers=h_headers, timeout=8)
            if h_req.status_code == 202:
                job_id = h_req.json().get('id')
                for _ in range(12):
                    time.sleep(2)
                    c_resp = requests.get(f'https://aihorde.net/api/v2/generate/check/{job_id}', timeout=8)
                    if c_resp.status_code == 200 and c_resp.json().get('done'):
                        s_resp = requests.get(f'https://aihorde.net/api/v2/generate/status/{job_id}', timeout=8)
                        if s_resp.status_code == 200:
                            gens = s_resp.json().get('generations', [])
                            if gens and gens[0].get('img'):
                                img_resp = requests.get(gens[0]['img'], timeout=15)
                                im = Image.open(io.BytesIO(img_resp.content)).convert('RGB')
                                buf = io.BytesIO()
                                im.save(buf, format='JPEG', quality=90)
                                image_bytes = buf.getvalue()
                                break
        except Exception as e:
            print(f"Avertissement AI Horde : {e}")

    if not image_bytes:
        return jsonify({
            "error": "Les services de génération gratuits sont temporairement saturés. Patientez quelques secondes et réessayez !"
        }), 503

    try:
        saved_filename = f"gen_{uuid.uuid4().hex}.jpg"
        filepath = os.path.join(GENERATED_FOLDER, saved_filename)

        with open(filepath, 'wb') as f:
            f.write(image_bytes)

        duration = round(time.time() - start_time, 2)
        image_url = f"/static/generated/{saved_filename}"

        # Enregistrement dans l'historique
        hist = load_history()
        item_id = str(uuid.uuid4())
        hist_entry = {
            "id": item_id,
            "type": "generation",
            "prompt": prompt,
            "english_prompt": english_prompt,
            "final_prompt": combined_prompt,
            "engine": engine_used,
            "style": style,
            "aspect_ratio": aspect_ratio,
            "image_url": image_url,
            "duration": duration,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        hist["generations"].insert(0, hist_entry)
        hist["generations"] = hist["generations"][:50]
        save_history(hist)

        return jsonify({
            "success": True,
            "id": item_id,
            "image_url": image_url,
            "original_prompt": prompt,
            "english_prompt": english_prompt,
            "final_prompt": combined_prompt,
            "engine": engine_used,
            "duration": duration
        })

    except Exception as e:
        return jsonify({"error": f"Erreur de sauvegarde : {str(e)}"}), 500

@app.route('/api/history', methods=['GET'])
def get_history():
    return jsonify(load_history())

@app.route('/api/history/clear', methods=['POST'])
def clear_history():
    save_history({"analyses": [], "generations": []})
    return jsonify({"success": True})

if __name__ == '__main__':
    print("=" * 60)
    print(" [OK] Serveur VisionAI demarre avec succes !")
    print(" [URL] Accedez a l'application sur : http://localhost:5000")
    print(" [AI] Connecte au service Ollama : " + OLLAMA_HOST)
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)
