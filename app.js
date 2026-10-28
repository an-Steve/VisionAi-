/**
 * VisionAI Studio - Frontend Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let currentImageFile = null;
    let currentImageBase64 = null;
    let isAnalyzing = false;
    let isGenerating = false;
    let lastGeneratedImageUrl = null;
    let selectedVisionStyle = 'naturel';

    // --- DOM Elements ---
    const ollamaBadge = document.getElementById('ollama-status-badge');
    const ollamaStatusText = document.getElementById('ollama-status-text');
    const modelSelect = document.getElementById('model-select');
    const refreshModelsBtn = document.getElementById('refresh-models-btn');

    // Tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // Tab 1 Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const dropIdle = document.getElementById('drop-idle');
    const dropPreview = document.getElementById('drop-preview');
    const previewImg = document.getElementById('preview-img');
    const removeImgBtn = document.getElementById('remove-img-btn');
    const imgResolution = document.getElementById('img-resolution');
    const imgFilesize = document.getElementById('img-filesize');
    const presetChips = document.querySelectorAll('.preset-chips .chip');
    const visionPrompt = document.getElementById('vision-prompt');
    const resetPromptBtn = document.getElementById('reset-prompt-btn');
    const analyzeBtn = document.getElementById('analyze-btn');
    const analyzeLoader = document.getElementById('analyze-loader');
    const emptyOutput = document.getElementById('empty-output');
    const resultContent = document.getElementById('result-content');
    const streamingCursor = document.getElementById('streaming-cursor');
    const copyBtn = document.getElementById('copy-btn');
    const speakBtn = document.getElementById('speak-btn');
    const timeBadge = document.getElementById('generation-time-badge');
    const usedModelTag = document.getElementById('used-model-tag');

    // Tab 2 Elements
    const genPrompt = document.getElementById('gen-prompt');
    const enhancePromptBtn = document.getElementById('enhance-prompt-btn');
    const enhanceLoader = document.getElementById('enhance-loader');
    const styleCards = document.querySelectorAll('.style-card');
    const ratioChips = document.querySelectorAll('.ratio-chip');
    const generateBtn = document.getElementById('generate-btn');
    const generateLoader = document.getElementById('generate-loader');
    const emptyGen = document.getElementById('empty-gen');
    const generatedImg = document.getElementById('generated-img');
    const downloadGenBtn = document.getElementById('download-gen-btn');
    const sendToVisionBtn = document.getElementById('send-to-vision-btn');
    const genTimeBadge = document.getElementById('gen-time-badge');
    const genPromptInfo = document.getElementById('gen-prompt-info');
    const finalPromptText = document.getElementById('final-prompt-text');

    // Tab 3 Elements
    const historyCount = document.getElementById('history-count');
    const countAnalyses = document.getElementById('count-analyses');
    const countGenerations = document.getElementById('count-generations');
    const subtabAnalyses = document.getElementById('subtab-analyses');
    const subtabGenerations = document.getElementById('subtab-generations');
    const subTabBtns = document.querySelectorAll('.sub-tab-btn');
    const clearHistoryBtn = document.getElementById('clear-history-btn');

    // Toast Container
    const toastContainer = document.getElementById('toast-container');

    // --- Helpers: Toast Notification ---
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'error') icon = '⚠️';

        toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // --- 1. Ollama Connection & Model Loading ---
    async function checkOllamaStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            if (data.connected) {
                ollamaBadge.className = 'status-badge online';
                ollamaStatusText.textContent = `Ollama connecté (v${data.version})`;
            } else {
                ollamaBadge.className = 'status-badge offline';
                ollamaStatusText.textContent = 'Ollama hors ligne';
            }
        } catch (e) {
            ollamaBadge.className = 'status-badge offline';
            ollamaStatusText.textContent = 'Ollama indisponible';
        }
    }

    async function loadModels() {
        try {
            const res = await fetch('/api/models');
            const data = await res.json();
            
            modelSelect.innerHTML = '';

            if (data.models && data.models.length > 0) {
                data.models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.name;
                    opt.textContent = m.is_vision ? `👁️ ${m.name} (Vision)` : `💬 ${m.name}`;
                    if (m.name === data.default_vision_model) {
                        opt.selected = true;
                    }
                    modelSelect.appendChild(opt);
                });
                usedModelTag.textContent = modelSelect.value;
            } else {
                const opt = document.createElement('option');
                opt.value = 'gemma4:e2b';
                opt.textContent = 'gemma4:e2b (Défaut)';
                modelSelect.appendChild(opt);
                usedModelTag.textContent = 'gemma4:e2b';
            }
        } catch (e) {
            modelSelect.innerHTML = '<option value="gemma4:e2b">gemma4:e2b</option>';
            usedModelTag.textContent = 'gemma4:e2b';
        }
    }

    refreshModelsBtn.addEventListener('click', async () => {
        refreshModelsBtn.style.transform = 'rotate(360deg)';
        refreshModelsBtn.style.transition = 'transform 0.5s';
        await checkOllamaStatus();
        await loadModels();
        setTimeout(() => {
            refreshModelsBtn.style.transform = '';
            refreshModelsBtn.style.transition = '';
            showToast('Liste des modèles actualisée', 'info');
        }, 500);
    });

    modelSelect.addEventListener('change', () => {
        usedModelTag.textContent = modelSelect.value;
    });

    // --- 2. Tab Navigation ---
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'tab-history') {
                loadHistory();
            }
        });
    });

    // --- 3. Image Loading (Drag & Drop, Browse, Paste) ---
    function handleImageFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            showToast('Veuillez sélectionner un fichier image valide (JPG, PNG, WebP...)', 'error');
            return;
        }

        currentImageFile = file;

        // Calcul taille
        const sizeKb = Math.round(file.size / 1024);
        imgFilesize.textContent = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} Mo` : `${sizeKb} Ko`;

        const reader = new FileReader();
        reader.onload = (e) => {
            currentImageBase64 = e.target.result;
            previewImg.src = currentImageBase64;
            
            // Calcul dimensions
            const tempImg = new Image();
            tempImg.onload = () => {
                imgResolution.textContent = `${tempImg.naturalWidth} x ${tempImg.naturalHeight} px`;
            };
            tempImg.src = currentImageBase64;

            dropIdle.classList.add('hidden');
            dropPreview.classList.remove('hidden');
            analyzeBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    }

    // Browse click
    browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleImageFile(e.target.files[0]);
        }
    });

    // Drag & Drop
    ['dragenter', 'dragover'].forEach(name => {
        dropZone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(name => {
        dropZone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleImageFile(e.dataTransfer.files[0]);
        }
    });

    // Clipboard Paste (Ctrl+V)
    window.addEventListener('paste', (e) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                handleImageFile(blob);
                showToast('Image collée depuis le presse-papier !', 'success');
                break;
            }
        }
    });

    // Clear Image
    removeImgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentImageFile = null;
        currentImageBase64 = null;
        fileInput.value = '';
        previewImg.src = '';
        dropPreview.classList.add('hidden');
        dropIdle.classList.remove('hidden');
        analyzeBtn.disabled = true;
    });

    // Preset Prompt Chips
    presetChips.forEach(chip => {
        chip.addEventListener('click', () => {
            presetChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            selectedVisionStyle = chip.getAttribute('data-style');

            const stylePrompts = {
                'naturel': "Décris précisément cette image en français : les objets, les personnes, les actions et l'ambiance générale.",
                'detaille': "Analyse cette image avec une extrême précision : liste tous les détails visibles, couleurs, plans, éclairage, textures et éléments d'arrière-plan.",
                'court': "Résume ce que tu vois sur cette image en une seule phrase claire et concise en français.",
                'points': "Décris le contenu de cette image sous forme de liste à puces synthétique des éléments clés.",
                'poetique': "Raconte ce que cette image t'évoque avec une plume poétique, sensorielle et artistique en français."
            };

            visionPrompt.value = stylePrompts[selectedVisionStyle] || visionPrompt.value;
        });
    });

    resetPromptBtn.addEventListener('click', () => {
        visionPrompt.value = "Décris précisément cette image en français : les objets, les personnes, les actions et l'ambiance générale.";
        presetChips.forEach(c => c.classList.remove('active'));
        presetChips[0].classList.add('active');
        selectedVisionStyle = 'naturel';
    });

    // --- 4. Vision Analysis Streaming ---
    analyzeBtn.addEventListener('click', async () => {
        if ((!currentImageFile && !currentImageBase64) || isAnalyzing) return;

        isAnalyzing = true;
        analyzeBtn.disabled = true;
        analyzeLoader.classList.remove('hidden');
        analyzeBtn.querySelector('.btn-text').textContent = 'Analyse en cours...';

        emptyOutput.classList.add('hidden');
        resultContent.classList.remove('hidden');
        resultContent.textContent = '';
        streamingCursor.classList.remove('hidden');
        timeBadge.classList.add('hidden');
        copyBtn.disabled = true;
        speakBtn.disabled = true;

        const formData = new FormData();
        if (currentImageFile) {
            formData.append('image', currentImageFile);
        } else if (currentImageBase64) {
            formData.append('image_b64', currentImageBase64);
        }
        formData.append('prompt', visionPrompt.value);
        formData.append('model', modelSelect.value);
        formData.append('style', selectedVisionStyle);

        usedModelTag.textContent = modelSelect.value;

        try {
            const response = await fetch('/api/analyze-stream', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Erreur serveur (${response.status})`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.error) {
                                throw new Error(data.error);
                            }
                            if (data.chunk) {
                                accumulatedText += data.chunk;
                                resultContent.textContent = accumulatedText;
                                // Auto-scroll to bottom of output box
                                resultContent.scrollTop = resultContent.scrollHeight;
                            }
                            if (data.done) {
                                if (data.duration) {
                                    timeBadge.textContent = `⏱️ ${data.duration}s`;
                                    timeBadge.classList.remove('hidden');
                                }
                                showToast('Analyse d\'image terminée !', 'success');
                                updateHistoryBadge();
                            }
                        } catch (err) {
                            console.warn("Ligne non-JSON reçue :", line);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Erreur d'analyse :", error);
            resultContent.textContent = `Erreur : ${error.message}\nAssurez-vous qu'Ollama est lancé et que le modèle sélectionné prend bien en charge la vision.`;
            showToast(error.message, 'error');
        } finally {
            isAnalyzing = false;
            streamingCursor.classList.add('hidden');
            analyzeLoader.classList.add('hidden');
            analyzeBtn.querySelector('.btn-text').textContent = 'Analyser l\'image avec Ollama';
            analyzeBtn.disabled = false;
            if (resultContent.textContent.trim().length > 0) {
                copyBtn.disabled = false;
                speakBtn.disabled = false;
            }
        }
    });

    // Copy to clipboard
    copyBtn.addEventListener('click', () => {
        if (!resultContent.textContent) return;
        navigator.clipboard.writeText(resultContent.textContent).then(() => {
            showToast('Texte copié dans le presse-papier !', 'success');
        });
    });

    // Text to Speech (Audio)
    speakBtn.addEventListener('click', () => {
        const text = resultContent.textContent;
        if (!text) return;

        if ('speechSynthesis' in window) {
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
                showToast('Lecture audio arrêtée', 'info');
                return;
            }

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'fr-FR';
            utterance.rate = 1.0;

            utterance.onstart = () => {
                speakBtn.style.color = '#818cf8';
                showToast('Lecture en cours...', 'info');
            };
            utterance.onend = () => {
                speakBtn.style.color = '';
            };
            utterance.onerror = () => {
                speakBtn.style.color = '';
            };

            window.speechSynthesis.speak(utterance);
        } else {
            showToast('La synthèse vocale n\'est pas supportée par votre navigateur', 'error');
        }
    });

    // --- 5. Tab 2 : Image Generation ---

    // Style card selection
    styleCards.forEach(card => {
        card.addEventListener('click', () => {
            styleCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            card.querySelector('input[type="radio"]').checked = true;
        });
    });

    // Ratio chips selection
    ratioChips.forEach(chip => {
        chip.addEventListener('click', () => {
            ratioChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            chip.querySelector('input[type="radio"]').checked = true;
        });
    });

    // Prompt Enhancer with Ollama
    enhancePromptBtn.addEventListener('click', async () => {
        const prompt = genPrompt.value.trim();
        if (!prompt) {
            showToast('Écrivez d\'abord une idée dans le champ avant de l\'améliorer !', 'error');
            return;
        }

        enhancePromptBtn.disabled = true;
        enhanceLoader.classList.remove('hidden');

        try {
            const res = await fetch('/api/enhance-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt,
                    model: modelSelect.value
                })
            });

            const data = await res.json();
            if (data.enhanced_prompt) {
                genPrompt.value = data.enhanced_prompt;
                showToast('Description enrichie avec succès par Ollama !', 'success');
            } else {
                throw new Error(data.error || 'Erreur inconnue');
            }
        } catch (e) {
            showToast(`Impossible d'améliorer le prompt : ${e.message}`, 'error');
        } finally {
            enhancePromptBtn.disabled = false;
            enhanceLoader.classList.add('hidden');
        }
    });

    // Generate Image Button
    generateBtn.addEventListener('click', async () => {
        const prompt = genPrompt.value.trim();
        if (!prompt) {
            showToast('Veuillez saisir une description pour créer l\'image', 'error');
            return;
        }

        if (isGenerating) return;

        isGenerating = true;
        generateBtn.disabled = true;
        generateLoader.classList.remove('hidden');
        generateBtn.querySelector('.btn-text').textContent = 'Création de l\'image...';

        const selectedStyle = document.querySelector('input[name="art-style"]:checked')?.value || 'cinematic';
        const selectedRatio = document.querySelector('input[name="aspect-ratio"]:checked')?.value || '1:1';

        emptyGen.classList.add('hidden');
        generatedImg.classList.add('hidden');
        downloadGenBtn.disabled = true;
        sendToVisionBtn.disabled = true;
        genTimeBadge.classList.add('hidden');
        genPromptInfo.classList.add('hidden');

        try {
            const res = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt,
                    style: selectedStyle,
                    aspect_ratio: selectedRatio,
                    model: modelSelect.value
                })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Erreur lors de la génération');
            }

            lastGeneratedImageUrl = data.image_url;
            generatedImg.src = data.image_url;
            generatedImg.classList.remove('hidden');

            downloadGenBtn.disabled = false;
            sendToVisionBtn.disabled = false;

            genTimeBadge.textContent = `⏱️ ${data.duration}s`;
            genTimeBadge.classList.remove('hidden');

            if (data.final_prompt) {
                finalPromptText.innerHTML = `<b>Votre idée :</b> "${data.original_prompt}"<br><b>Prompt optimisé pour l'IA :</b> <em>${data.final_prompt}</em>`;
                genPromptInfo.classList.remove('hidden');
            }

            showToast('Image générée avec succès !', 'success');
            updateHistoryBadge();

        } catch (e) {
            console.error("Erreur de génération :", e);
            emptyGen.classList.remove('hidden');
            showToast(e.message, 'error');
        } finally {
            isGenerating = false;
            generateBtn.disabled = false;
            generateLoader.classList.add('hidden');
            generateBtn.querySelector('.btn-text').textContent = 'Générer l\'Image';
        }
    });

    // Download generated image
    downloadGenBtn.addEventListener('click', () => {
        if (!lastGeneratedImageUrl) return;
        const a = document.createElement('a');
        a.href = lastGeneratedImageUrl;
        a.download = `visionai_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('Téléchargement lancé !', 'success');
    });

    // Bridge: Send generated image to Vision Tab for instant Ollama analysis!
    sendToVisionBtn.addEventListener('click', async () => {
        if (!lastGeneratedImageUrl) return;

        showToast('Envoi de l\'image vers l\'onglet Vision...', 'info');

        try {
            // Récupérer l'image sous forme de blob
            const resp = await fetch(lastGeneratedImageUrl);
            const blob = await resp.blob();
            const file = new File([blob], "generated.jpg", { type: "image/jpeg" });

            handleImageFile(file);

            // Basculer vers l'onglet Vision
            tabButtons[0].click();

            showToast('Image prête pour l\'analyse par Ollama ! Cliquez sur Analyser.', 'success');
        } catch (e) {
            showToast('Erreur lors du transfert de l\'image', 'error');
        }
    });

    // --- 6. Tab 3 : History & Gallery ---
    subTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            subTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const subtabId = btn.getAttribute('data-subtab');
            if (subtabId === 'subtab-analyses') {
                subtabAnalyses.classList.remove('hidden');
                subtabGenerations.classList.add('hidden');
            } else {
                subtabAnalyses.classList.add('hidden');
                subtabGenerations.classList.remove('hidden');
            }
        });
    });

    async function loadHistory() {
        try {
            const res = await fetch('/api/history');
            const data = await res.json();

            const analyses = data.analyses || [];
            const generations = data.generations || [];

            historyCount.textContent = analyses.length + generations.length;
            countAnalyses.textContent = analyses.length;
            countGenerations.textContent = generations.length;

            // Render analyses
            if (analyses.length === 0) {
                subtabAnalyses.innerHTML = '<p class="empty-text" style="grid-column: 1/-1; padding: 30px; text-align: center;">Aucune analyse enregistrée pour le moment.</p>';
            } else {
                subtabAnalyses.innerHTML = analyses.map(item => `
                    <div class="history-card">
                        <img class="history-thumb" src="${item.image_url}" alt="Image analysée" loading="lazy">
                        <div class="history-body">
                            <span class="history-date">${item.timestamp} • ${item.model || ''}</span>
                            <p class="history-text" title="${item.description.replace(/"/g, '&quot;')}">${item.description}</p>
                        </div>
                    </div>
                `).join('');
            }

            // Render generations
            if (generations.length === 0) {
                subtabGenerations.innerHTML = '<p class="empty-text" style="grid-column: 1/-1; padding: 30px; text-align: center;">Aucune image générée pour le moment.</p>';
            } else {
                subtabGenerations.innerHTML = generations.map(item => `
                    <div class="history-card">
                        <img class="history-thumb" src="${item.image_url}" alt="Image générée" loading="lazy">
                        <div class="history-body">
                            <span class="history-date">${item.timestamp} • Style: ${item.style || 'cinematic'}</span>
                            <p class="history-text" title="${item.prompt.replace(/"/g, '&quot;')}">"${item.prompt}"</p>
                        </div>
                    </div>
                `).join('');
            }
        } catch (e) {
            console.error("Erreur de chargement d'historique :", e);
        }
    }

    async function updateHistoryBadge() {
        try {
            const res = await fetch('/api/history');
            const data = await res.json();
            const count = (data.analyses?.length || 0) + (data.generations?.length || 0);
            historyCount.textContent = count;
        } catch (e) {}
    }

    clearHistoryBtn.addEventListener('click', async () => {
        if (!confirm('Voulez-vous vraiment vider tout l\'historique ?')) return;

        try {
            await fetch('/api/history/clear', { method: 'POST' });
            showToast('Historique effacé avec succès', 'info');
            loadHistory();
        } catch (e) {
            showToast('Erreur lors de l\'effacement', 'error');
        }
    });

    // --- Initial Startup ---
    checkOllamaStatus();
    loadModels();
    updateHistoryBadge();

    // Periodic ping to Ollama every 30 seconds
    setInterval(checkOllamaStatus, 30000);
});
