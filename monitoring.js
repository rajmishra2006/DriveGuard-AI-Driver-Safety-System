/**
 * GuardianAI Monitoring System
 * Core Detection Logic using MediaPipe
 */

const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const alertBanner = document.getElementById('alert-banner');
const alertMessage = document.getElementById('alert-message');
const cameraCard = document.getElementById('camera-card');
const logsContainer = document.getElementById('logs-container');

// Metrics elements
const eyeMetric = document.getElementById('eye-metric');
const headMetric = document.getElementById('head-metric');
const fatigueMetric = document.getElementById('fatigue-metric');
const phoneMetric = document.getElementById('phone-metric');
const riskMetric = document.getElementById('risk-metric');
const totalAlertsStat = document.getElementById('total-alerts-stat');
const safetyScoreStat = document.getElementById('safety-score');
const logCountStat = document.getElementById('log-count');
const snapshotGallery = document.getElementById('snapshot-gallery');
const clearGalleryBtn = document.getElementById('clear-gallery');
const debugInfo = document.getElementById('debug-info');

// State
let isMonitoring = false;
let totalAlerts = 0;
let lastAlertTime = 0;
let lastSnapshotTime = 0;
const ALERT_COOLDOWN = 3000;
const SNAPSHOT_COOLDOWN = 10000;

// Risk & Attention State
let currentRiskPenalty = 0;
let distractionStartTime = 0;
const CONTINUOUS_DISTRACTION_PENALTY_RATE = 0.5; // Risk increase per second while distracted

// Drowsiness Detection State
let eyesClosedStartTime = 0;
const DROWSINESS_THRESHOLD_MS = 2000; // Trigger alert only after 2 seconds of closed eyes

// Debug Mode
const IS_DEBUG = true; // Set to true to show raw values and markers
if (IS_DEBUG && debugInfo) debugInfo.classList.remove('hidden');

// Nod Detection State
let pitchHistory = [];
const NOD_HISTORY_SIZE = 15;
const NOD_THRESHOLD = 0.04; // Pitch change threshold
let isNodding = false;

// MediaPipe Setup
const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// EAR (Eye Aspect Ratio) Calculation
function calculateEAR(landmarks, eyeIndices) {
    const p = eyeIndices.map(idx => landmarks[idx]);
    const v1 = Math.sqrt(Math.pow(p[1].x - p[5].x, 2) + Math.pow(p[1].y - p[5].y, 2));
    const v2 = Math.sqrt(Math.pow(p[2].x - p[4].x, 2) + Math.pow(p[2].y - p[4].y, 2));
    const h = Math.sqrt(Math.pow(p[0].x - p[3].x, 2) + Math.pow(p[0].y - p[3].y, 2));
    return (v1 + v2) / (2.0 * h);
}

// MOR (Mouth Opening Ratio) Calculation - More sensitive for fatigue
function calculateMOR(landmarks) {
    const top = landmarks[13];
    const bottom = landmarks[14];
    const left = landmarks[78];
    const right = landmarks[308];
    
    // Vertical distance (top to bottom lip)
    const v = Math.sqrt(Math.pow(top.x - bottom.x, 2) + Math.pow(top.y - bottom.y, 2));
    // Horizontal distance (corner to corner)
    const h = Math.sqrt(Math.pow(left.x - right.x, 2) + Math.pow(left.y - right.y, 2));
    
    // Normalizing ratio
    return v / h;
}

// Alert Handling
let isSpeaking = false;

function triggerAlert(type, message, penalty = 5, shouldCapture = false) {
    const now = Date.now();
    if (now - lastAlertTime < ALERT_COOLDOWN) return;
    
    lastAlertTime = now;
    totalAlerts++;
    currentRiskPenalty += penalty;
    
    alertBanner.classList.remove('hidden');
    alertMessage.textContent = message;
    cameraCard.classList.add('alert-active');
    totalAlertsStat.textContent = totalAlerts;
    logCountStat.textContent = `${totalAlerts} TOTAL`;
    
    // Voice Alert System (Improved)
    if (window.speechSynthesis) {
        if (type === 'danger') {
            window.speechSynthesis.cancel();
            isSpeaking = false;
        }

        if (!isSpeaking) {
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            utterance.onstart = () => { isSpeaking = true; };
            utterance.onend = () => { isSpeaking = false; };
            utterance.onerror = () => { isSpeaking = false; };
            
            window.speechSynthesis.speak(utterance);
        }
    }
    
    addLog(type, message);
    
    // Take snapshot ONLY if specifically requested (for high-risk behaviors)
    if (shouldCapture && (now - lastSnapshotTime > SNAPSHOT_COOLDOWN)) {
        takeSnapshot(type);
        lastSnapshotTime = now;
    }
    
    setTimeout(() => {
        alertBanner.classList.add('hidden');
        cameraCard.classList.remove('alert-active');
    }, 2500);
}

function addLog(type, message) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logEntry = document.createElement('div');
    logEntry.className = "flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 animate-in slide-in-from-right duration-300";
    logEntry.innerHTML = `
        <div class="p-2 rounded-lg ${type === 'danger' ? 'bg-red-100 text-red-600' : type === 'system' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}">
            <i data-lucide="${type === 'danger' ? 'alert-octagon' : type === 'system' ? 'info' : 'alert-triangle'}" class="w-4 h-4"></i>
        </div>
        <div class="flex-1">
            <p class="text-sm font-semibold text-slate-800">${message}</p>
            <p class="text-xs text-slate-500">${time}</p>
        </div>
    `;
    logsContainer.prepend(logEntry);
    if (logsContainer.children.length > 20) logsContainer.lastChild.remove();
    if (window.lucide) window.lucide.createIcons();
    
    updateRiskDisplay();
}

function updateRiskDisplay() {
    const score = Math.max(0, 100 - currentRiskPenalty);
    safetyScoreStat.textContent = `${Math.round(score)}%`;
    safetyScoreStat.className = `text-xl font-bold ${score > 70 ? 'text-emerald-400' : score > 40 ? 'text-amber-400' : 'text-red-400'}`;
    
    // Update Risk Metric
    const risk = 100 - score;
    if (riskMetric) {
        riskMetric.textContent = `${Math.round(risk)}%`;
        riskMetric.className = `text-2xl font-bold ${risk < 30 ? 'text-emerald-500' : risk < 60 ? 'text-amber-500' : 'text-red-600'}`;
    }
}

async function takeSnapshot(type) {
    const dataUrl = canvasElement.toDataURL('image/jpeg', 0.8);
    const risk = riskMetric ? parseInt(riskMetric.textContent) : 0;
    
    // Update Gallery UI
    if (snapshotGallery) {
        // Remove empty message if it exists
        const emptyMsg = snapshotGallery.querySelector('.empty-msg');
        if (emptyMsg) emptyMsg.remove();

        const imgWrapper = document.createElement('div');
        imgWrapper.className = "relative aspect-video rounded-lg overflow-hidden border border-slate-100 shadow-sm animate-in fade-in zoom-in duration-500 group/img";
        imgWrapper.innerHTML = `
            <img src="${dataUrl}" class="w-full h-full object-cover">
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                <span class="text-[10px] font-bold text-white uppercase tracking-tighter">${type}</span>
            </div>
        `;
        snapshotGallery.prepend(imgWrapper);
        
        // Keep only last 10 snapshots in gallery for performance
        if (snapshotGallery.children.length > 10) snapshotGallery.lastChild.remove();
    }
    
    try {
        const response = await fetch('/save_snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                image: dataUrl, 
                alert_type: type,
                message: alertMessage ? alertMessage.textContent : '',
                risk_score: risk
            })
        });
        const result = await response.json();
        if (result.status === 'success') {
            addLog('system', `Snapshot saved: ${result.filename}`);
        } else {
            addLog('warning', `Failed to save snapshot: ${result.message}`);
        }
    } catch (e) {
        console.error("Failed to save snapshot", e);
        addLog('warning', 'Error saving snapshot.');
    }
}

// Face Results Handler
faceMesh.onResults(results => {
    if (!isMonitoring) return;
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        if (window.drawConnectors) {
            window.drawConnectors(canvasCtx, landmarks, window.FACEMESH_TESSELATION, {color: '#C0C0C070', lineWidth: 1});
            window.drawConnectors(canvasCtx, landmarks, window.FACEMESH_RIGHT_EYE, {color: '#818cf8', lineWidth: 2});
            window.drawConnectors(canvasCtx, landmarks, window.FACEMESH_LEFT_EYE, {color: '#818cf8', lineWidth: 2});
        }

        // 1. Drowsiness Detection (EAR)
        const leftEyeIndices = [362, 385, 387, 263, 373, 380];
        const rightEyeIndices = [33, 160, 158, 133, 153, 144];
        const earL = calculateEAR(landmarks, leftEyeIndices);
        const earR = calculateEAR(landmarks, rightEyeIndices);
        const avgEAR = (earL + earR) / 2;
        
        if (avgEAR < 0.22) {
            if (eyesClosedStartTime === 0) eyesClosedStartTime = Date.now();
            const duration = Date.now() - eyesClosedStartTime;
            
            if (duration > DROWSINESS_THRESHOLD_MS) {
                eyeMetric.textContent = "Closed";
                eyeMetric.className = "text-2xl font-bold text-red-600";
                triggerAlert('danger', "Drowsiness Detected!", 10, false); // Screenshot capture turned OFF for drowsiness
            } else {
                eyeMetric.textContent = "Analyzing";
                eyeMetric.className = "text-2xl font-bold text-amber-500 animate-pulse";
            }
        } else {
            eyesClosedStartTime = 0;
            eyeMetric.textContent = "Open";
            eyeMetric.className = "text-2xl font-bold text-emerald-500";
        }

        // 2. Fatigue Detection (MOR)
        const mor = calculateMOR(landmarks);
        if (mor > 0.35) {
            fatigueMetric.textContent = "Critical";
            fatigueMetric.className = "text-2xl font-bold text-red-600";
            triggerAlert('danger', "Extreme Fatigue!", 8, false); // No capture for fatigue
        } else if (mor > 0.18) {
            fatigueMetric.textContent = "Warning";
            fatigueMetric.className = "text-2xl font-bold text-amber-500";
            triggerAlert('warning', "Yawn Detected!", 3, false); // No capture for yawn
        } else {
            fatigueMetric.textContent = "Normal";
            fatigueMetric.className = "text-2xl font-bold text-emerald-500";
        }

        // 3. Head Pose (Distraction & Nod)
        const nose = landmarks[1];
        const leftEar = landmarks[234];
        const rightEar = landmarks[454];
        const leftEyePt = landmarks[33];
        const rightEyePt = landmarks[263];
        
        // Horizontal Rotation (Yaw)
        const earDistRatio = (nose.x - leftEar.x) / (rightEar.x - leftEar.x);
        
        if (earDistRatio < 0.30 || earDistRatio > 0.70) {
            headMetric.textContent = "Distracted";
            headMetric.className = "text-2xl font-bold text-red-600";
            triggerAlert('danger', "Eyes on road!", 5, true); // Capture for distraction
            
            // Continuous Distraction Tracking
            if (distractionStartTime === 0) distractionStartTime = Date.now();
            const distractionDuration = (Date.now() - distractionStartTime) / 1000;
            if (distractionDuration > 1) {
                currentRiskPenalty += CONTINUOUS_DISTRACTION_PENALTY_RATE;
                updateRiskDisplay();
            }
        } else if (earDistRatio < 0.42 || earDistRatio > 0.58) {
            headMetric.textContent = earDistRatio < 0.42 ? "Left" : "Right";
            headMetric.className = "text-2xl font-bold text-amber-500";
            distractionStartTime = 0;
        } else {
            headMetric.textContent = "Center";
            headMetric.className = "text-2xl font-bold text-emerald-500";
            distractionStartTime = 0;
        }

        // Vertical Rotation (Pitch) for Nod
        const eyeMidY = (leftEyePt.y + rightEyePt.y) / 2;
        const currentPitch = nose.y - eyeMidY;
        
        pitchHistory.push(currentPitch);
        if (pitchHistory.length > NOD_HISTORY_SIZE) pitchHistory.shift();
        
        if (pitchHistory.length === NOD_HISTORY_SIZE) {
            const minPitch = Math.min(...pitchHistory);
            const maxPitch = Math.max(...pitchHistory);
            const pitchRange = maxPitch - minPitch;
            
            if (pitchRange > NOD_THRESHOLD && !isNodding) {
                isNodding = true;
                addLog('system', "Head nod detected!");
                // No automatic snapshot for nod anymore as requested
                setTimeout(() => { isNodding = false; }, 2000);
            }
        }

        // Debug Info
        if (IS_DEBUG && debugInfo) {
            debugInfo.textContent = `MOR: ${mor.toFixed(2)} | YAW: ${earDistRatio.toFixed(2)}`;
        }
    } else {
        triggerAlert('danger', "Driver not detected!");
    }
    canvasCtx.restore();
});

// Pose Results Handler
pose.onResults(results => {
    if (!isMonitoring) return;
    
    if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;
        const leftHand = landmarks[15];
        const rightHand = landmarks[16];
        const leftEar = landmarks[7];
        const rightEar = landmarks[8];
        const nose = landmarks[0];
        
        // Distance from hands to ears or nose
        const distL_Ear = Math.sqrt(Math.pow(leftHand.x - leftEar.x, 2) + Math.pow(leftHand.y - leftEar.y, 2));
        const distR_Ear = Math.sqrt(Math.pow(rightHand.x - rightEar.x, 2) + Math.pow(rightHand.y - rightEar.y, 2));
        const distL_Nose = Math.sqrt(Math.pow(leftHand.x - nose.x, 2) + Math.pow(leftHand.y - nose.y, 2));
        const distR_Nose = Math.sqrt(Math.pow(rightHand.x - nose.x, 2) + Math.pow(rightHand.y - nose.y, 2));
        
        const minDist = Math.min(distL_Ear, distR_Ear, distL_Nose, distR_Nose);
        
        // Debug Info update
        if (IS_DEBUG && debugInfo) {
            const currentText = debugInfo.textContent.split(' | DIST:')[0];
            debugInfo.textContent = `${currentText} | DIST: ${minDist.toFixed(2)}`;
        }

        // Draw debug markers
        if (IS_DEBUG && canvasCtx) {
            canvasCtx.fillStyle = 'red';
            [leftHand, rightHand, leftEar, rightEar, nose].forEach(pt => {
                canvasCtx.beginPath();
                canvasCtx.arc(pt.x * canvasElement.width, pt.y * canvasElement.height, 5, 0, 2 * Math.PI);
                canvasCtx.fill();
            });
        }

        // Phone Use Granular Levels
        if (minDist < 0.28) {
            phoneMetric.textContent = "Detected";
            phoneMetric.className = "text-2xl font-bold text-red-600";
            triggerAlert('danger', "No phone use!", 15, true); // Capture for phone use
        } else if (minDist < 0.40) {
            phoneMetric.textContent = "Warning";
            phoneMetric.className = "text-2xl font-bold text-amber-500";
        } else {
            phoneMetric.textContent = "None";
            phoneMetric.className = "text-2xl font-bold text-emerald-500";
        }
    }
});

// Camera Control
const camera = new Camera(videoElement, {
    onFrame: async () => {
        if (isMonitoring) {
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            await faceMesh.send({image: videoElement});
            await pose.send({image: videoElement});
        }
    },
    width: 640,
    height: 480
});

startBtn.addEventListener('click', async () => {
    try {
        isMonitoring = true;
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        
        await camera.start();
        
        // Load history from DB on start
        fetchHistory();
        
        logsContainer.innerHTML = '';
        addLog('system', 'System active.');
    } catch (err) {
        console.error("Camera access error:", err);
        isMonitoring = false;
        startBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        
        let errorMsg = "Camera access failed.";
        if (err.name === 'NotReadableError' || err.message.includes('in use')) {
            errorMsg = "Camera is already in use by another app or tab.";
        } else if (err.name === 'NotAllowedError') {
            errorMsg = "Camera permission denied.";
        }
        
        addLog('danger', errorMsg);
        alert(errorMsg + " Please close other apps using the camera and refresh.");
    }
});

stopBtn.addEventListener('click', () => {
    isMonitoring = false;
    stopBtn.classList.add('hidden');
    startBtn.classList.remove('hidden');
    
    camera.stop();
    
    // Explicitly stop all video tracks to release the camera hardware
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
    }
    
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    addLog('system', 'System stopped.');
});

const snapshotBtn = document.getElementById('snapshot-btn');

// ... (previous code)

// Snapshot Button Logic
snapshotBtn.addEventListener('click', async () => {
    if (!isMonitoring) {
        addLog('warning', 'Start monitoring first to take a snapshot.');
        return;
    }
    
    // Visual feedback for snapshot
    snapshotBtn.classList.add('bg-indigo-100', 'scale-90');
    setTimeout(() => snapshotBtn.classList.remove('bg-indigo-100', 'scale-90'), 200);
    
    addLog('system', 'Capturing snapshot...');
    await takeSnapshot('manual');
    
    // Optional: Flash the camera card to simulate a shutter
    const overlay = document.querySelector('.alert-overlay');
    overlay.style.backgroundColor = 'white';
    overlay.style.opacity = '0.5';
    setTimeout(() => {
        overlay.style.backgroundColor = '';
        overlay.style.opacity = '';
    }, 100);
});

// Clear Gallery Logic
if (clearGalleryBtn) {
    clearGalleryBtn.addEventListener('click', () => {
        snapshotGallery.innerHTML = `
            <div class="col-span-2 text-center py-8 text-slate-400 italic text-sm empty-msg">
                No snapshots captured...
            </div>
        `;
    });
}

async function fetchHistory() {
    try {
        const response = await fetch('/get_history');
        const history = await response.json();
        
        if (history && history.length > 0) {
            snapshotGallery.innerHTML = ''; // Clear existing
            history.forEach(item => {
                const imgWrapper = document.createElement('div');
                imgWrapper.className = "relative aspect-video rounded-lg overflow-hidden border border-slate-100 shadow-sm group/img";
                imgWrapper.innerHTML = `
                    <img src="/snapshots/${item.image_path}" class="w-full h-full object-cover">
                    <div class="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                        <span class="text-[10px] font-bold text-white uppercase tracking-tighter">${item.alert_type}</span>
                    </div>
                `;
                snapshotGallery.appendChild(imgWrapper);
            });
        }
    } catch (e) {
        console.error("Failed to fetch history", e);
    }
}

// FPS Counter
let lastTime = 0;
function updateFPS(now) {
    if (lastTime !== 0) {
        const fps = Math.round(1000 / (now - lastTime));
        document.getElementById('fps-counter').textContent = `FPS: ${fps}`;
    }
    lastTime = now;
    requestAnimationFrame(updateFPS);
}
requestAnimationFrame(updateFPS);
