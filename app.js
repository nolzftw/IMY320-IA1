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

// Mouse interaction
let mouseX = 0;
let mouseY = 0;
let mousePressed = false;

async function initializeWasm() {
    try {
        console.log('Loading WebAssembly module...');

        // Use the .NET 8 WebAssembly initialization
        const { dotnet } = await import('/_framework/dotnet.js');
        const api = await dotnet.create();

        const assemblyExports = await api.getAssemblyExports('AudioVisualizerWasm');
        dotnetInstance = assemblyExports.AudioVisualizerWasm.Program;

        console.log('Audio Visualizer WebAssembly module loaded successfully');

        initializeCanvas();
        setupEventHandlers();

        // Set default WebAssembly settings
        try {
            dotnetInstance.SetVisualizationMode(0); // Radial Burst mode
            dotnetInstance.SetSensitivity(1.0); // Default sensitivity
        } catch (error) {
            console.warn('Could not set default WebAssembly values:', error);
        }

        startVisualization();

        // Update UI to show module is ready
        const startBtn = document.getElementById('startBtn');
        if (startBtn && startBtn.textContent.includes('Loading')) {
            startBtn.textContent = '🎵 Start Audio';
            startBtn.disabled = false;
        }

    } catch (error) {
        console.error('Failed to initialize WebAssembly:', error);
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.textContent = '❌ Failed to Load';
            startBtn.disabled = true;
        }
    }
}

function initializeCanvas() {
    canvas = document.getElementById('visualizerCanvas');
    ctx = canvas.getContext('2d');

    // Enable alpha blending for particle trails
    ctx.globalCompositeOperation = 'lighter';

    // Set canvas size properly
    canvas.width = 800;
    canvas.height = 600;
}

function setupEventHandlers() {
    // Start audio button
    document.getElementById('startBtn').addEventListener('click', startAudio);

    // File upload
    document.getElementById('audioUpload').addEventListener('change', handleFileUpload);

    // Reset button
    document.getElementById('resetBtn').addEventListener('click', resetVisualizer);


    // Remove mouse interaction - set fixed values
    mouseX = canvas.width / 2;
    mouseY = canvas.height / 2;
    mousePressed = false;
}

async function startAudio() {
    try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setupAudioAnalysis(stream);

        document.getElementById('startBtn').textContent = '🎵 Listening...';
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
            e.target.value = ''; // Clear the file input
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
            document.getElementById('startBtn').textContent = '🎵 Start Audio';
            document.getElementById('startBtn').disabled = false;
        });

        document.getElementById('startBtn').textContent = '🎵 Playing File';
        document.getElementById('startBtn').disabled = true;
    }
}

function setupAudioAnalysis(audioSource) {
    // Create audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();

    // Configure analyser
    analyser.fftSize = 256; // 128 frequency bins for better frequency resolution
    analyser.smoothingTimeConstant = 0.3;

    // Create audio source
    if (audioSource instanceof MediaStream) {
        source = audioContext.createMediaStreamSource(audioSource);
    } else {
        source = audioContext.createMediaElementSource(audioSource);
        // Connect to destination so audio plays through speakers
        source.connect(audioContext.destination);
    }

    // Connect audio graph
    source.connect(analyser);

    // Create data array for frequency data
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    console.log('Audio analysis setup complete');
}

function startVisualization() {
    console.log('Starting visualization...', { isRunning, animationId });

    // Stop any existing animation first
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

    // Ensure we always continue the animation loop
    animationId = requestAnimationFrame(animate);

    // Initialize lastTime if needed
    if (lastTime === 0) {
        lastTime = currentTime;
    }

    const deltaTime = Math.min((currentTime - lastTime) / 1000.0, 0.1); // Cap delta time to prevent jumps
    lastTime = currentTime;

    // Clear canvas with proper fade for trail effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Get audio frequency data
    let frequencyData = new Array(128).fill(0);
    let hasAudioData = false;

    if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        hasAudioData = true;

        // Normalize frequency data to 0-1 range
        for (let i = 0; i < Math.min(dataArray.length, 128); i++) {
            frequencyData[i] = dataArray[i] / 255.0;
        }

    } else {
        // Generate animated demo data when no audio
        const time = currentTime * 0.001;
        for (let i = 0; i < 128; i++) {
            const baseFreq = (Math.sin(time * 1.5 + i * 0.2) + 1) * 0.25;
            const variation = Math.sin(time * 3 + i * 0.1) * 0.15;
            const noise = Math.random() * 0.1;
            frequencyData[i] = Math.max(0, Math.min(1, baseFreq + variation + noise));
        }
    }

    // Always render visualization - either WebAssembly or fallback
    let rendered = false;

    if (dotnetInstance) {
        try {
            // Convert frequencyData array to JSON string for WebAssembly
            dotnetInstance.UpdateAudioData(JSON.stringify(frequencyData));
            dotnetInstance.UpdateParticles(deltaTime, mouseX, mouseY, mousePressed);

            renderParticles();
            rendered = true;
        } catch (error) {
            console.warn('WebAssembly rendering failed, using fallback:', error);
        }
    }

    // Use fallback visualization if WebAssembly failed or isn't available
    if (!rendered) {
        renderDemoVisualization(frequencyData);
    }
}

function renderParticles() {
    if (!dotnetInstance) return;

    const particleCount = dotnetInstance.GetParticleCount();

    // Note: For simplicity, we'll get particle data one by one
    // In a real implementation, you'd want to optimize this
    for (let i = 0; i < particleCount; i++) {
        // Since we can't easily access the particle data directly,
        // we'll create a simple particle rendering system
        renderParticleEffect(i);
    }
}

function renderParticleEffect(particleIndex) {
    // Generate enhanced particle effects based on overall frequency spectrum
    if (!analyser || !dataArray) return;

    const time = Date.now() * 0.001;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Get overall energy from frequency data
    const totalEnergy = dataArray ? Array.from(dataArray).reduce((a, b) => a + b, 0) / (dataArray.length * 255) : 0.5;
    const lowEnergy = dataArray ? Array.from(dataArray.slice(0, 20)).reduce((a, b) => a + b, 0) / (20 * 255) : 0.5;
    const midEnergy = dataArray ? Array.from(dataArray.slice(20, 80)).reduce((a, b) => a + b, 0) / (60 * 255) : 0.5;
    const highEnergy = dataArray ? Array.from(dataArray.slice(80, 128)).reduce((a, b) => a + b, 0) / (48 * 255) : 0.5;

    // Create multiple particle systems
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

            // Main particle with glow
            const hue = (system.color + time * 30 + particleIndex * 5) % 360;
            const size = system.size + system.energy * 8;

            // Outer glow
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
            gradient.addColorStop(0, `hsla(${hue}, 90%, 70%, ${system.energy * 0.8})`);
            gradient.addColorStop(0.5, `hsla(${hue}, 80%, 50%, ${system.energy * 0.4})`);
            gradient.addColorStop(1, `hsla(${hue}, 70%, 30%, 0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, size * 3, 0, Math.PI * 2);
            ctx.fill();

            // Core particle
            ctx.fillStyle = `hsla(${hue}, 95%, 85%, ${system.energy * 0.9})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();

            // Energy burst effects
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

            // Connection lines to center when energy is high
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


// HSV to RGB color conversion utility
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

    // Remove existing controls if any
    const existingControls = document.getElementById('audioPlayerControls');
    if (existingControls) {
        existingControls.remove();
    }

    // Create audio controls container
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

    // File name display
    const fileNameDiv = document.createElement('div');
    fileNameDiv.textContent = `🎵 ${fileName}`;
    fileNameDiv.style.cssText = 'margin-bottom: 10px; font-size: 14px; font-weight: bold;';

    // Insert audio element for controls
    audioElement.style.cssText = 'width: 100%; height: 40px;';

    audioControls.appendChild(fileNameDiv);
    audioControls.appendChild(audioElement);

    controlsContainer.appendChild(audioControls);
}

function resetVisualizer() {
    console.log('Resetting visualizer...');

    // Stop animation
    isRunning = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    // Stop and clear audio
    if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
        audioElement = null;
    }

    // Close audio context
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
    }

    // Clear audio references
    analyser = null;
    dataArray = null;
    source = null;

    // Clear canvas completely
    if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }


    // Remove audio controls
    const audioControls = document.getElementById('audioPlayerControls');
    if (audioControls) {
        audioControls.remove();
    }

    // Reset file input
    document.getElementById('audioUpload').value = '';

    // Reset buttons
    const startBtn = document.getElementById('startBtn');
    startBtn.textContent = '🎵 Start Audio';
    startBtn.disabled = false;

    // Reset to default values

    // Reset WebAssembly if available
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

    // Force restart visualization after a brief pause
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

    // Calculate overall energy levels for dramatic effects
    const totalEnergy = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
    const lowFreqs = frequencyData.slice(0, 32).reduce((a, b) => a + b, 0) / 32;
    const midFreqs = frequencyData.slice(32, 96).reduce((a, b) => a + b, 0) / 64;
    const highFreqs = frequencyData.slice(96, 128).reduce((a, b) => a + b, 0) / 32;

    // Create multiple visual layers for depth

    // Layer 1: Spiraling frequency rings
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

                // Add trailing particles
                const trailX = centerX + Math.cos(angle - 0.3) * (radius * 0.8);
                const trailY = centerY + Math.sin(angle - 0.3) * (radius * 0.8);
                ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${alpha * 0.4})`;
                ctx.beginPath();
                ctx.arc(trailX, trailY, 1 + intensity * 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // Layer 2: Central energy burst
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

    // Layer 3: Frequency bands as expanding arcs
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

            // Add inner glow
            ctx.strokeStyle = `hsla(${hue}, 100%, 80%, ${bandEnergy * 0.4})`;
            ctx.lineWidth = 1 + bandEnergy * 3;
            ctx.beginPath();
            ctx.arc(centerX, centerY, arcRadius - 5, startAngle, endAngle);
            ctx.stroke();
        }
    }

    // Layer 4: Floating orbs responding to different frequency ranges
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

            // Outer glow
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, orbSize * 2);
            gradient.addColorStop(0, `hsla(${hue}, 90%, 70%, ${orbType.freq * 0.6})`);
            gradient.addColorStop(0.7, `hsla(${hue}, 80%, 50%, ${orbType.freq * 0.3})`);
            gradient.addColorStop(1, `hsla(${hue}, 70%, 30%, 0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, orbSize * 2, 0, Math.PI * 2);
            ctx.fill();

            // Core orb
            ctx.fillStyle = `hsla(${hue}, 95%, 80%, ${orbType.freq * 0.9})`;
            ctx.beginPath();
            ctx.arc(x, y, orbSize, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // Layer 5: Energy lightning effects
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

    // Central core with multiple layers
    const coreHue = (time * 60) % 360;
    const coreRadius = 15 + totalEnergy * 40;

    // Outer core glow
    const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius * 1.5);
    coreGradient.addColorStop(0, `hsla(${coreHue}, 100%, 90%, ${totalEnergy * 0.8})`);
    coreGradient.addColorStop(0.6, `hsla(${coreHue}, 90%, 70%, ${totalEnergy * 0.4})`);
    coreGradient.addColorStop(1, `hsla(${coreHue}, 80%, 50%, 0)`);

    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, coreRadius * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Inner core
    ctx.fillStyle = `hsla(${coreHue + 180}, 100%, 95%, ${0.6 + totalEnergy * 0.4})`;
    ctx.beginPath();
    ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    // Core pulse ring
    const pulseRadius = coreRadius + Math.sin(time * 8) * 10;
    ctx.strokeStyle = `hsla(${coreHue + 60}, 100%, 80%, ${totalEnergy * 0.6})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();
}

function updateVisualizationDisplay() {
    // Remove any existing mode display
    const existingDisplay = document.getElementById('currentMode');
    if (existingDisplay) {
        existingDisplay.remove();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeWasm();
    updateVisualizationDisplay(); // Show initial mode
});

// Handle page visibility changes to restart animation
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isRunning) {
        console.log('Page became visible, restarting animation...');
        // Give a moment for the page to fully load
        setTimeout(() => {
            startVisualization();
        }, 100);
    }
});

// Handle window focus to ensure animation continues
window.addEventListener('focus', () => {
    if (isRunning) {
        console.log('Window focused, ensuring animation is running...');
        setTimeout(() => {
            startVisualization();
        }, 50);
    }
});