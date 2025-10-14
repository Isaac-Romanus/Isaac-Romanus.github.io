// --- DOM Elements ---
  const homepage = document.getElementById('homepage');
  const annotationPage = document.getElementById('annotationPage');
  const startButton = document.getElementById('startButton');
  const instructionsButton = document.getElementById('instructionsButton');
  const instructionPanel = document.getElementById('instructionPanel');
  const closeInstructions = document.getElementById('closeInstructions');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const imageContainers = document.querySelectorAll('.image-container');
  
  // --- State ---
    let isPaused = false;
    let isDrawing = false;
    let currentRect = null;
    let startX, startY;
    let activeImageContainer = null;
    let sessionStartTime;
    let currentSetIndex = 0;
    let timeLog = [];
    let totalTimeOnSet = 0;
    
    // --- Mock Data ---
      // In a real application, you would fetch these from a server.
    const imageSets = [
      [
        'https://placehold.co/800x600/2E2E2E/FFFFFF?text=Image+1A',
        'https://placehold.co/800x600/3E3E3E/FFFFFF?text=Image+1B',
        'https://placehold.co/800x600/4E4E4E/FFFFFF?text=Image+1C',
        'https://placehold.co/800x600/5E5E5E/FFFFFF?text=Image+1D'
      ],
      [
        'https://placehold.co/800x600/FFC0CB/000000?text=Image+2A',
        'https://placehold.co/800x600/ADD8E6/000000?text=Image+2B',
        'https://placehold.co/800x600/90EE90/000000?text=Image+2C',
        'https://placehold.co/800x600/FFFFE0/000000?text=Image+2D'
      ],
      [
        'https://placehold.co/800x600/D2B48C/FFFFFF?text=Image+3A',
        'https://placehold.co/800x600/F5DEB3/000000?text=Image+3B',
        'https://placehold.co/800x600/DEB887/FFFFFF?text=Image+3C',
        'https://placehold.co/800x600/BC8F8F/FFFFFF?text=Image+3D'
      ]
    ];
    
    // --- Timer Functions ---
      function startTimer() {
        sessionStartTime = Date.now();
        console.log(`Timer started for set ${currentSetIndex} at ${new Date(sessionStartTime).toLocaleTimeString()}`);
      }
    
    function stopTimer() {
      if (sessionStartTime) {
        const elapsed = Date.now() - sessionStartTime;
        totalTimeOnSet += elapsed;
        sessionStartTime = null;
        console.log(`Timer stopped. Elapsed time: ${elapsed / 1000}s. Total time for set ${currentSetIndex}: ${totalTimeOnSet / 1000}s`);
      }
    }
    
    function saveTime() {
      if (timeLog[currentSetIndex] === undefined) {
        timeLog[currentSetIndex] = 0;
      }
      timeLog[currentSetIndex] += totalTimeOnSet;
      console.log(`Time saved for set ${currentSetIndex}: ${timeLog[currentSetIndex]/1000}s`, timeLog);
      totalTimeOnSet = 0; // Reset for next set
    }
    
    
    // --- Page Navigation ---
      startButton.addEventListener('click', () => {
        homepage.classList.add('hidden');
        annotationPage.classList.remove('hidden');
        loadImgs(currentSetIndex);
        startTimer();
      });
    
    instructionsButton.addEventListener('click', () => {
      instructionPanel.classList.add('open');
    });
    
    closeInstructions.addEventListener('click', () => {
      instructionPanel.classList.remove('open');
    });
    
    // --- Image Loading ---
      function loadImgs(setIndex) {
        const currentImages = imageSets[setIndex];
        imageContainers.forEach((container, index) => {
          const img = container.querySelector('img');
          if (currentImages && currentImages[index]) {
            img.src = currentImages[index];
            img.style.transform = 'scale(1) translate(0, 0)';
            img.style.filter = 'invert(0) brightness(1) contrast(1)';
            // Clear previous rectangles
            container.querySelectorAll('.rect').forEach(rect => rect.remove());
          } else {
            img.src = ''; // Clear image if set is incomplete
          }
        });
        totalTimeOnSet = timeLog[currentSetIndex] || 0;
        console.log(`Loaded set ${setIndex}. Resuming time from ${totalTimeOnSet / 1000}s`);
        
      }
    
    // --- Image Interaction ---
      imageContainers.forEach(container => {
        let img = container.querySelector('img');
        let scale = 1, panning = false, pointX = 0, pointY = 0, start = { x: 0, y: 0 };
        let contrast = 100, brightness = 100, isInverted = 0;
        let isAdjusting = false, lastMouseX=0, lastMouseY=0;
        
        const applyFilter = () => {
          img.style.filter = `invert(${isInverted}) brightness(${brightness}%) contrast(${contrast}%)`;
        }
        
        container.addEventListener('mouseenter', () => activeImageContainer = container);
        container.addEventListener('mouseleave', () => activeImageContainer = null);
        
        // Drawing Rectangles
        container.addEventListener('mousedown', (e) => {
          if (e.button !== 0 || e.ctrlKey || container.classList.contains('fullscreen')) return; // Left click only, no ctrl
          isDrawing = true;
          startX = e.offsetX;
          startY = e.offsetY;
          currentRect = document.createElement('div');
          currentRect.classList.add('rect');
          currentRect.style.left = `${startX}px`;
          currentRect.style.top = `${startY}px`;
          container.appendChild(currentRect);
        });
        
        container.addEventListener('mousemove', (e) => {
          if (!isDrawing) return;
          const newX = e.offsetX;
          const newY = e.offsetY;
          const rectX = Math.min(startX, newX);
          const rectY = Math.min(startY, newY);
          const rectWidth = Math.abs(startX - newX);
          const rectHeight = Math.abs(startY - newY);
          currentRect.style.left = `${rectX}px`;
          currentRect.style.top = `${rectY}px`;
          currentRect.style.width = `${rectWidth}px`;
          currentRect.style.height = `${rectHeight}px`;
        });
        
        window.addEventListener('mouseup', () => {
          isDrawing = false;
          currentRect = null;
        });
        
        // Zoom and Pan
        container.addEventListener('wheel', e => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          const rect = container.getBoundingClientRect();
          const xs = (e.clientX - rect.left) / rect.width;
          const ys = (e.clientY - rect.top) / rect.height;
          const delta = -e.deltaY;
          (delta > 0) ? (scale *= 1.1) : (scale /= 1.1);
          scale = Math.max(1, scale); // prevent zooming out too far
          img.style.transformOrigin = `${xs * 100}% ${ys * 100}%`;
          img.style.transform = `scale(${scale}) translate(${pointX}px, ${pointY}px)`;
        });
        
        container.addEventListener('mousedown', e => {
          if (!e.ctrlKey || e.button !== 0) return;
          e.preventDefault();
          panning = true;
          start = { x: e.clientX - pointX, y: e.clientY - pointY };
        });
        
        window.addEventListener('mousemove', e => {
          if (!panning) return;
          e.preventDefault();
          pointX = (e.clientX - start.x);
          pointY = (e.clientY - start.y);
          img.style.transform = `scale(${scale}) translate(${pointX/scale}px, ${pointY/scale}px)`;
        });
        
        window.addEventListener('mouseup', e => {
          panning = false;
        });
        
        // Fullscreen
        container.addEventListener('dblclick', () => {
          container.classList.toggle('fullscreen');
        });
        
        // Contrast / Brightness
        container.addEventListener('contextmenu', e => e.preventDefault()); // Prevent right click menu
        container.addEventListener('mousedown', e => {
          if (e.button !== 2) return; // Right click
          isAdjusting = true;
          lastMouseX = e.clientX;
          lastMouseY = e.clientY;
        });
        
        window.addEventListener('mousemove', e => {
          if(!isAdjusting) return;
          
          const dx = e.clientX - lastMouseX;
          const dy = e.clientY - lastMouseY;
          
          contrast += dx * 0.5; // Sensitivity
          brightness -= dy * 0.5; // Sensitivity
          
          contrast = Math.max(0, Math.min(200, contrast)); // Clamp values
          brightness = Math.max(0, Math.min(200, brightness));
          
          applyFilter();
          
          lastMouseX = e.clientX;
          lastMouseY = e.clientY;
        });
        
        window.addEventListener('mouseup', e => {
          if (e.button === 2) isAdjusting = false;
        });
        
        // Invert colors
        window.addEventListener('keydown', e => {
          if (e.key.toLowerCase() === 'i' && activeImageContainer === container) {
            isInverted = isInverted === 0 ? 1 : 0;
            applyFilter();
          }
        });
      });
    
    // --- Global Commands ---
      window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        
        if (key === 'p') {
          togglePause();
        }
        
        if (isPaused) {
          if (key === 'e') {
            exitAndSave();
          }
          return; // Block other commands when paused
        }
        
        if(document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
        
        if (e.key === 'ArrowRight') {
          if(currentSetIndex < imageSets.length - 1) {
            stopTimer();
            saveTime();
            currentSetIndex++;
            loadImgs(currentSetIndex);
            startTimer();
          } else {
            console.log("This is the last set.");
          }
        } else if (e.key === 'ArrowLeft') {
          if(currentSetIndex > 0) {
            stopTimer();
            saveTime();
            currentSetIndex--;
            loadImgs(currentSetIndex);
            startTimer();
          } else {
            console.log("This is the first set.");
          }
        }
      });
    
    function togglePause() {
      isPaused = !isPaused;
      if (isPaused) {
        stopTimer();
        pauseOverlay.classList.remove('hidden');
      } else {
        startTimer();
        pauseOverlay.classList.add('hidden');
      }
    }
    
    function exitAndSave() {
      stopTimer();
      saveTime();
      // In a real application, you'd send the data (rectangles, timeLog) to a server here.
            console.log("Exiting and 'saving' data...");
            console.log("Time per set (ms):", timeLog);
            // This is a placeholder for saving. We will just reload the page to go to homepage.
            location.reload(); 
        }
