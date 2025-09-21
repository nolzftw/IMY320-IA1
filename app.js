let dotnetInstance = null;
let canvas = null;
let ctx = null;
let audioContext = null;
let analyser = null;
let dataArray = null;
let source = null;
let isRunning = false;
let animationId = null;
let lastTime = 0;

let mouseX = 0;
let mouseY = 0;
let mousePressed = false;

async function initializeWasm() {
    try {
        console.log('Loading WebAssembly module...');

        const { dotnet } = await import('/_framework/dotnet.js');
        const api = await dotnet.create();

        const assemblyExports = await api.getAssemblyExports('AudioVisualizerWasm');
        dotnetInstance = assemblyExports.AudioVisualizerWasm.Program;

        console.log('Audio Visualizer WebAssembly module loaded successfully');

        initializeCanvas();
        setupEventHandlers();

        try {
            dotnetInstance.SetVisualizationMode(0); 
            dotnetInstance.SetSensitivity(1.0); 
        } catch (error) {
            console.warn('Could not set default WebAssembly values:', error);
        }

        startVisualization();

        const startBtn = document.getElementById('startBtn');
        if (startBtn && startBtn.textContent.includes('Loading')) {
            startBtn.textContent = 'Start Audio';
            startBtn.disabled = false;
        }

    } catch (error) {
        console.error('Failed to initialize WebAssembly:', error);
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.textContent = 'Failed to Load';
            startBtn.disabled = true;
        }
    }
}

function initializeCanvas() {
    canvas = document.getElementById('visualizerCanvas');
    ctx = canvas.getContext('2d');

    ctx.globalCompositeOperation = 'lighter';

    canvas.width = 800;
    canvas.height = 600;
}

function setupEventHandlers() {
    document.getElementById('startBtn').addEventListener('click', startAudio);

    document.getElementById('audioUpload').addEventListener('change', handleFileUpload);

    document.getElementById('resetBtn').addEventListener('click', resetVisualizer);


    mouseX = canvas.width / 2;
    mouseY = canvas.height / 2;
    mousePressed = false;
}

async function startAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setupAudioAnalysis(stream);

        document.getElementById('startBtn').textContent = 'Listening...';
        document.getElementById('startBtn').disabled = true;
    } catch (error) {
        console.error('Microphone access denied:', error);
        alert('Please allow microphone access to use the audio visualizer, or load an audio file instead.');
    }
}

let audioElement = null;

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) {
        if (!dotnetInstance) {
            alert('WebAssembly module is still loading. Please wait and try again.');
            e.target.value = ''; 
            return;
        }

        console.log('Loading audio file:', file.name);
        audioElement = new Audio();
        audioElement.src = URL.createObjectURL(file);
        audioElement.crossOrigin = 'anonymous';
        audioElement.controls = true;
        audioElement.loop = true;

        audioElement.addEventListener('loadeddata', () => {
            console.log('Audio file loaded, setting up analysis');
            setupAudioAnalysis(audioElement);
            showAudioControls(file.name);
            audioElement.play();
        });

        audioElement.addEventListener('error', (error) => {
            console.error('Error loading audio file:', error);
            alert('Error loading audio file. Please try a different file.');
            document.getElementById('startBtn').textContent = 'Start Audio';
            document.getElementById('startBtn').disabled = false;
        });

        document.getElementById('startBtn').textContent = 'Playing File';
        document.getElementById('startBtn').disabled = true;
    }
}

function setupAudioAnalysis(audioSource) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();

    analyser.fftSize = 256; 
    analyser.smoothingTimeConstant = 0.3;

    if (audioSource instanceof MediaStream) {
        source = audioContext.createMediaStreamSource(audioSource);
    } else {
        source = audioContext.createMediaElementSource(audioSource);
        source.connect(audioContext.destination);
    }

    source.connect(analyser);

    dataArray = new Uint8Array(analyser.frequencyBinCount);

    console.log('Audio analysis setup complete');
}

function startVisualization() {
    console.log('Starting visualization...', { isRunning, animationId });

    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    isRunning = true;
    lastTime = performance.now();
    animate(lastTime);
}

function animate(currentTime) {
    if (!isRunning) {
        console.log('Animation stopped');
        return;
    }

    animationId = requestAnimationFrame(animate);

    if (lastTime === 0) {
        lastTime = currentTime;
    }

    const deltaTime = Math.min((currentTime - lastTime) / 1000.0, 0.1); 
    lastTime = currentTime;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let frequencyData = new Array(128).fill(0);
    let hasAudioData = false;

    if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        hasAudioData = true;

        for (let i = 0; i < Math.min(dataArray.length, 128); i++) {
            frequencyData[i] = dataArray[i] / 255.0;
        }

    } else {
        const time = currentTime * 0.001;
        for (let i = 0; i < 128; i++) {
            const baseFreq = (Math.sin(time * 1.5 + i * 0.2) + 1) * 0.25;
            const variation = Math.sin(time * 3 + i * 0.1) * 0.15;
            const noise = Math.random() * 0.1;
            frequencyData[i] = Math.max(0, Math.min(1, baseFreq + variation + noise));
        }
    }

    let rendered = false;

    if (dotnetInstance) {
        try {
            dotnetInstance.UpdateAudioData(JSON.stringify(frequencyData));
            dotnetInstance.UpdateParticles(deltaTime, mouseX, mouseY, mousePressed);

            renderParticles();
            rendered = true;
        } catch (error) {
            console.warn('WebAssembly rendering failed, using fallback:', error);
        }
    }

    if (!rendered) {
        renderDemoVisualization(frequencyData);
    }
}

function renderParticles() {
    if (!dotnetInstance) return;

    const particleCount = dotnetInstance.GetParticleCount();

    for (let i = 0; i < particleCount; i++) {
        renderParticleEffect(i);
    }
}

function renderParticleEffect(particleIndex) {
    if (!analyser || !dataArray) return;

    const time = Date.now() * 0.001;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const totalEnergy = dataArray ? Array.from(dataArray).reduce((a, b) => a + b, 0) / (dataArray.length * 255) : 0.5;
    const lowEnergy = dataArray ? Array.from(dataArray.slice(0, 20)).reduce((a, b) => a + b, 0) / (20 * 255) : 0.5;
    const midEnergy = dataArray ? Array.from(dataArray.slice(20, 80)).reduce((a, b) => a + b, 0) / (60 * 255) : 0.5;
    const highEnergy = dataArray ? Array.from(dataArray.slice(80, 128)).reduce((a, b) => a + b, 0) / (48 * 255) : 0.5;

    const systems = [
        { energy: lowEnergy, baseAngle: particleIndex * 0.1, radius: 80, speed: 0.3, color: 240, size: 3 },
        { energy: midEnergy, baseAngle: particleIndex * 0.15, radius: 120, speed: 0.5, color: 120, size: 2 },
        { energy: highEnergy, baseAngle: particleIndex * 0.2, radius: 160, speed: 0.8, color: 0, size: 1.5 }
    ];

    systems.forEach((system, sysIndex) => {
        if (system.energy > 0.1) {
            const angle = system.baseAngle + time * system.speed + sysIndex;
            const radiusVariation = Math.sin(time * 2 + particleIndex * 0.1) * 30;
            const finalRadius = system.radius + system.energy * 100 + radiusVariation;

            const x = centerX + Math.cos(angle) * finalRadius;
            const y = centerY + Math.sin(angle) * finalRadius;

            const hue = (system.color + time * 30 + particleIndex * 5) % 360;
            const size = system.size + system.energy * 8;

            const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
            gradient.addColorStop(0, `hsla(${hue}, 90%, 70%, ${system.energy * 0.8})`);
            gradient.addColorStop(0.5, `hsla(${hue}, 80%, 50%, ${system.energy * 0.4})`);
            gradient.addColorStop(1, `hsla(${hue}, 70%, 30%, 0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, size * 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = `hsla(${hue}, 95%, 85%, ${system.energy * 0.9})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();

            if (system.energy > 0.7) {
                for (let burst = 0; burst < 3; burst++) {
                    const burstAngle = angle + burst * Math.PI * 0.67;
                    const burstDistance = size * 2 + Math.sin(time * 8 + burst) * 10;
                    const burstX = x + Math.cos(burstAngle) * burstDistance;
                    const burstY = y + Math.sin(burstAngle) * burstDistance;

                    ctx.fillStyle = `hsla(${hue + 60}, 100%, 90%, ${system.energy * 0.6})`;
                    ctx.beginPath();
                    ctx.arc(burstX, burstY, size * 0.3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            if (totalEnergy > 0.5 && Math.random() < system.energy * 0.3) {
                ctx.strokeStyle = `hsla(${hue}, 80%, 60%, ${system.energy * 0.5})`;
                ctx.lineWidth = 1 + system.energy * 2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(x, y);
                ctx.stroke();
            }
        }
    });
}


function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function showAudioControls(fileName) {
    const controlsContainer = document.querySelector('.audio-controls');

    const existingControls = document.getElementById('audioPlayerControls');
    if (existingControls) {
        existingControls.remove();
    }

    const audioControls = document.createElement('div');
    audioControls.id = 'audioPlayerControls';
    audioControls.style.cssText = `
        background: rgba(0,0,0,0.7);
        border-radius: 10px;
        padding: 15px;
        margin-top: 10px;
        color: white;
        backdrop-filter: blur(10px);
    `;

    const fileNameDiv = document.createElement('div');
    fileNameDiv.textContent = `🎵 ${fileName}`;
    fileNameDiv.style.cssText = 'margin-bottom: 10px; font-size: 14px; font-weight: bold;';

    audioElement.style.cssText = 'width: 100%; height: 40px;';

    audioControls.appendChild(fileNameDiv);
    audioControls.appendChild(audioElement);

    controlsContainer.appendChild(audioControls);
}

function resetVisualizer() {
    console.log('Resetting visualizer...');

    isRunning = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
        audioElement = null;
    }

    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
    }

    analyser = null;
    dataArray = null;
    source = null;

    if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }


    const audioControls = document.getElementById('audioPlayerControls');
    if (audioControls) {
        audioControls.remove();
    }

    document.getElementById('audioUpload').value = '';

    const startBtn = document.getElementById('startBtn');
    startBtn.textContent = '🎵 Start Audio';
    startBtn.disabled = false;

    if (dotnetInstance) {
        try {
            dotnetInstance.SetSensitivity(1.0);
            dotnetInstance.SetVisualizationMode(0);
        } catch (error) {
            console.warn('Error resetting WebAssembly state:', error);
        }
    }

    updateVisualizationDisplay();

    console.log('Visualizer reset complete');

    setTimeout(() => {
        console.log('Restarting visualization after reset...');
        startVisualization();
    }, 200);
}

function renderDemoVisualization(frequencyData) {
    if (!ctx || !canvas) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const time = Date.now() * 0.001;

    const totalEnergy = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
    const lowFreqs = frequencyData.slice(0, 32).reduce((a, b) => a + b, 0) / 32;
    const midFreqs = frequencyData.slice(32, 96).reduce((a, b) => a + b, 0) / 64;
    const highFreqs = frequencyData.slice(96, 128).reduce((a, b) => a + b, 0) / 32;

    for (let ring = 0; ring < 5; ring++) {
        const ringRadius = 60 + ring * 40;
        const ringSpeed = 0.2 + ring * 0.1;

        for (let i = 0; i < frequencyData.length; i += 2) {
            const angle = (i / frequencyData.length) * Math.PI * 4 + time * ringSpeed + ring;
            const intensity = frequencyData[i];

            if (intensity > 0.1) {
                const radius = ringRadius + intensity * 80;
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;

                const hue = (i * 2.8125 + ring * 72 + time * 30) % 360;
                const alpha = Math.max(0.1, intensity * 0.8);

                ctx.fillStyle = `hsla(${hue}, 90%, ${60 + ring * 8}%, ${alpha})`;
                ctx.beginPath();
                ctx.arc(x, y, 2 + intensity * 8, 0, Math.PI * 2);
                ctx.fill();

                const trailX = centerX + Math.cos(angle - 0.3) * (radius * 0.8);
                const trailY = centerY + Math.sin(angle - 0.3) * (radius * 0.8);
                ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${alpha * 0.4})`;
                ctx.beginPath();
                ctx.arc(trailX, trailY, 1 + intensity * 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    const burstRadius = 30 + totalEnergy * 150 + Math.sin(time * 6) * 20;
    const burstParticles = Math.floor(20 + totalEnergy * 80);

    for (let i = 0; i < burstParticles; i++) {
        const angle = (i / burstParticles) * Math.PI * 2 + time * 2;
        const distance = Math.random() * burstRadius;
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;

        const hue = (time * 120 + i * 10) % 360;
        const alpha = (1 - distance / burstRadius) * totalEnergy;

        ctx.fillStyle = `hsla(${hue}, 95%, 70%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, 1 + totalEnergy * 4, 0, Math.PI * 2);
        ctx.fill();
    }

    const numArcs = 8;
    for (let arc = 0; arc < numArcs; arc++) {
        const startAngle = (arc / numArcs) * Math.PI * 2 + time * 0.5;
        const endAngle = startAngle + Math.PI / 4;
        const baseRadius = 100 + arc * 25;

        const freqBandSize = Math.floor(frequencyData.length / numArcs);
        const bandStart = arc * freqBandSize;
        const bandEnd = Math.min(bandStart + freqBandSize, frequencyData.length);
        const bandEnergy = frequencyData.slice(bandStart, bandEnd).reduce((a, b) => a + b, 0) / freqBandSize;

        if (bandEnergy > 0.1) {
            const arcRadius = baseRadius + bandEnergy * 100;
            const hue = (arc * 45 + time * 40) % 360;

            ctx.strokeStyle = `hsla(${hue}, 85%, 60%, ${bandEnergy * 0.8})`;
            ctx.lineWidth = 3 + bandEnergy * 8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(centerX, centerY, arcRadius, startAngle, endAngle);
            ctx.stroke();

            ctx.strokeStyle = `hsla(${hue}, 100%, 80%, ${bandEnergy * 0.4})`;
            ctx.lineWidth = 1 + bandEnergy * 3;
            ctx.beginPath();
            ctx.arc(centerX, centerY, arcRadius - 5, startAngle, endAngle);
            ctx.stroke();
        }
    }

    const orbTypes = [
        { freq: lowFreqs, count: 6, baseRadius: 200, color: 240, speed: 0.3 },
        { freq: midFreqs, count: 8, baseRadius: 160, color: 120, speed: 0.5 },
        { freq: highFreqs, count: 12, baseRadius: 120, color: 0, speed: 0.8 }
    ];

    orbTypes.forEach((orbType, typeIndex) => {
        for (let i = 0; i < orbType.count; i++) {
            const angle = (i / orbType.count) * Math.PI * 2 + time * orbType.speed + typeIndex;
            const radius = orbType.baseRadius + Math.sin(time * 2 + i) * 30;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;

            const orbSize = 3 + orbType.freq * 15;
            const hue = (orbType.color + time * 20 + i * 30) % 360;

            const gradient = ctx.createRadialGradient(x, y, 0, x, y, orbSize * 2);
            gradient.addColorStop(0, `hsla(${hue}, 90%, 70%, ${orbType.freq * 0.6})`);
            gradient.addColorStop(0.7, `hsla(${hue}, 80%, 50%, ${orbType.freq * 0.3})`);
            gradient.addColorStop(1, `hsla(${hue}, 70%, 30%, 0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, orbSize * 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = `hsla(${hue}, 95%, 80%, ${orbType.freq * 0.9})`;
            ctx.beginPath();
            ctx.arc(x, y, orbSize, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    if (totalEnergy > 0.6) {
        for (let bolt = 0; bolt < 5; bolt++) {
            const startAngle = Math.random() * Math.PI * 2;
            const startRadius = 20 + Math.random() * 40;
            const endRadius = 150 + Math.random() * 200;

            let currentRadius = startRadius;
            let currentAngle = startAngle;

            ctx.strokeStyle = `hsla(${Math.random() * 60 + 180}, 100%, 90%, ${totalEnergy * 0.7})`;
            ctx.lineWidth = 1 + totalEnergy * 3;
            ctx.lineCap = 'round';
            ctx.beginPath();

            let x = centerX + Math.cos(currentAngle) * currentRadius;
            let y = centerY + Math.sin(currentAngle) * currentRadius;
            ctx.moveTo(x, y);

            while (currentRadius < endRadius) {
                currentRadius += 10 + Math.random() * 20;
                currentAngle += (Math.random() - 0.5) * 0.5;

                x = centerX + Math.cos(currentAngle) * currentRadius;
                y = centerY + Math.sin(currentAngle) * currentRadius;
                ctx.lineTo(x, y);
            }

            ctx.stroke();
        }
    }

    const coreHue = (time * 60) % 360;
    const coreRadius = 15 + totalEnergy * 40;

    const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius * 1.5);
    coreGradient.addColorStop(0, `hsla(${coreHue}, 100%, 90%, ${totalEnergy * 0.8})`);
    coreGradient.addColorStop(0.6, `hsla(${coreHue}, 90%, 70%, ${totalEnergy * 0.4})`);
    coreGradient.addColorStop(1, `hsla(${coreHue}, 80%, 50%, 0)`);

    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, coreRadius * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `hsla(${coreHue + 180}, 100%, 95%, ${0.6 + totalEnergy * 0.4})`;
    ctx.beginPath();
    ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    const pulseRadius = coreRadius + Math.sin(time * 8) * 10;
    ctx.strokeStyle = `hsla(${coreHue + 60}, 100%, 80%, ${totalEnergy * 0.6})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();
}

function updateVisualizationDisplay() {
    const existingDisplay = document.getElementById('currentMode');
    if (existingDisplay) {
        existingDisplay.remove();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeWasm();
    updateVisualizationDisplay(); 
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isRunning) {
        console.log('Page became visible, restarting animation...');
        setTimeout(() => {
            startVisualization();
        }, 100);
    }
});

window.addEventListener('focus', () => {
    if (isRunning) {
        console.log('Window focused, ensuring animation is running...');
        setTimeout(() => {
            startVisualization();
        }, 50);
    }
});