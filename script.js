// === DOM ELEMENTS ===
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const overlayCtx = overlay.getContext("2d");

const startAppBtn = document.getElementById("start-app-btn");
const splashScreen = document.getElementById("splash-screen");
const appContainer = document.getElementById("app-container");
const filterTray = document.getElementById("filter-tray");
const startCaptureBtn = document.getElementById("start-capture-btn");
const countdownEl = document.getElementById("countdown");
const photostripCanvas = document.getElementById("photostrip-canvas");
const photostripCtx = photostripCanvas.getContext("2d");
const previewModal = document.getElementById("preview-modal");
const downloadBtn = document.getElementById("download-btn");
const retakeBtn = document.getElementById("retake-btn");
const backgroundTray = document.getElementById("background-tray");

let currentBackgroundImg = null;
let currentBackgroundName = "none";

let currentFilter = null;
let currentFilterName = "none";
const capturedPhotos = [];
const COUNTDOWN_TIME = 3;
let lastLandmarks = null;

const shotPreviews = [
  document.getElementById("shot1").getContext("2d"),
  document.getElementById("shot2").getContext("2d"),
  document.getElementById("shot3").getContext("2d"),
  document.getElementById("shot4").getContext("2d"),
];

let selfieSegmentation = null;
let modelsLoaded = false;
let isProcessing = false;

// === 1. LOAD FACE MODELS ===
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri("models"),
  faceapi.nets.faceLandmark68TinyNet.loadFromUri("models"),
]).then(() => {
  console.log("✅ FaceAPI models loaded successfully!");
  modelsLoaded = true;
});

// === 2. START APP BUTTON ===
startAppBtn.addEventListener("click", () => {
  splashScreen.style.display = "none";
  appContainer.style.display = "flex";
  startVideo();
});

// === 3. START CAMERA ===
async function startVideo() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 720, height: 560 } 
    });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play();
      overlay.width = 720;
      overlay.height = 560;
      setupBackgroundSegmentation();
    };
  } catch (err) {
    console.error("Error accessing webcam:", err);
    alert("Could not access your webcam. Please allow camera access.");
  }
}

// === 4. BACKGROUND SEGMENTATION SETUP ===
function setupBackgroundSegmentation() {
  selfieSegmentation = new SelfieSegmentation({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
  });

  selfieSegmentation.setOptions({ modelSelection: 1 });
  selfieSegmentation.onResults(onSegmentationResults);

  // Start processing loop
  processFrame();
}

// === 5. UNIFIED PROCESSING LOOP ===
async function processFrame() {
  if (!isProcessing && video.readyState === 4) {
    isProcessing = true;
    
    try {
      // First, detect face landmarks (independent of MediaPipe)
      if (modelsLoaded) {
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks(true);
        
        lastLandmarks = detection ? detection.landmarks : null;
      }
      
      // Then send to MediaPipe for background segmentation
      await selfieSegmentation.send({ image: video });
      
    } catch (err) {
      console.error("Frame processing error:", err);
    }
    
    isProcessing = false;
  }
  
  requestAnimationFrame(processFrame);
}

// === 6. RENDER RESULTS (Background + Filter) ===
async function onSegmentationResults(results) {
  overlayCtx.save();
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  // === STEP 1: Draw background or video ===
  if (currentBackgroundImg && currentBackgroundName !== "none") {
    // Draw custom background
    overlayCtx.drawImage(currentBackgroundImg, 0, 0, overlay.width, overlay.height);
    
    // Cut out the person using segmentation mask
    overlayCtx.globalCompositeOperation = "destination-out";
    overlayCtx.drawImage(results.segmentationMask, 0, 0, overlay.width, overlay.height);
    
    // Draw the person on top
    overlayCtx.globalCompositeOperation = "destination-over";
    overlayCtx.drawImage(results.image, 0, 0, overlay.width, overlay.height);
  } else {
    // No background replacement - just show video
    overlayCtx.globalCompositeOperation = "source-over";
    overlayCtx.drawImage(results.image, 0, 0, overlay.width, overlay.height);
  }

  // === STEP 2: Draw face filter on top ===
  if (currentFilter && currentFilterName !== "none" && lastLandmarks) {
    try {
      const leftEye = lastLandmarks.getLeftEye();
      const rightEye = lastLandmarks.getRightEye();

      if (leftEye && leftEye.length > 0 && rightEye && rightEye.length > 0) {
        const eyeCenterX = (leftEye[0].x + rightEye[3].x) / 2;
        const eyeTopY = Math.min(leftEye[1].y, rightEye[1].y);
        const faceWidth = Math.abs(rightEye[3].x - leftEye[0].x);

        let filterWidth, filterHeight, filterY;

        // Position filters based on type
        if (currentFilterName.includes("sunglasses")) {
          filterWidth = faceWidth * 2.2;
          filterHeight = filterWidth * 0.4;
          filterY = eyeTopY - filterHeight * 0.2;
        } else if (currentFilterName.includes("bunny")) {
          filterWidth = faceWidth * 2.5;
          filterHeight = filterWidth * 1.4;
          filterY = eyeTopY - filterHeight * 0.9;
        } else if (currentFilterName.includes("ears")) {
          filterWidth = faceWidth * 2.3;
          filterHeight = filterWidth * 1.0;
          filterY = eyeTopY - filterHeight * 0.8;
        } else {
          filterWidth = faceWidth * 3;
          filterHeight = filterWidth * 0.6;
          filterY = eyeTopY - filterHeight * 0.5;
        }

        // Draw filter with proper composite mode
        overlayCtx.globalCompositeOperation = "source-over";
        overlayCtx.drawImage(
          currentFilter,
          eyeCenterX - filterWidth / 2,
          filterY,
          filterWidth,
          filterHeight
        );
      }
    } catch (err) {
      console.error("Error drawing filter:", err);
    }
  }

  overlayCtx.restore();
}

// === 7. FILTER SELECTION ===
filterTray.addEventListener("click", (e) => {
  const button = e.target.closest(".filter-btn");
  if (!button) return;

  document.querySelectorAll(".filter-btn").forEach((btn) => btn.classList.remove("active"));
  button.classList.add("active");

  currentFilterName = button.dataset.filter;

  if (currentFilterName === "none") {
    currentFilter = null;
  } else {
    const filterImg = new Image();
    filterImg.crossOrigin = "anonymous";
    filterImg.src = currentFilterName;
    filterImg.onload = () => {
      currentFilter = filterImg;
      console.log("✅ Filter loaded:", currentFilterName);
    };
    filterImg.onerror = () => {
      console.error("❌ Failed to load filter:", currentFilterName);
      currentFilter = null;
    };
  }
});

// === 8. BACKGROUND SELECTION ===
backgroundTray.addEventListener("click", (e) => {
  const button = e.target.closest(".bg-btn");
  if (!button) return;

  document.querySelectorAll(".bg-btn").forEach((btn) => btn.classList.remove("active"));
  button.classList.add("active");

  currentBackgroundName = button.dataset.bg;

  if (currentBackgroundName === "none") {
    currentBackgroundImg = null;
  } else {
    const bgImg = new Image();
    bgImg.crossOrigin = "anonymous";
    bgImg.src = currentBackgroundName;
    bgImg.onload = () => {
      currentBackgroundImg = bgImg;
      console.log("✅ Background loaded:", currentBackgroundName);
    };
    bgImg.onerror = () => {
      console.error("❌ Failed to load background:", currentBackgroundName);
      currentBackgroundImg = null;
    };
  }
});

// === 9. CAPTURE SEQUENCE ===
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startCaptureSequence() {
  startCaptureBtn.disabled = true;
  capturedPhotos.length = 0;
  resetSidebar();

  for (let i = 0; i < 4; i++) {
    for (let j = COUNTDOWN_TIME; j > 0; j--) {
      countdownEl.textContent = j;
      countdownEl.style.opacity = "1";
      await delay(1000);
      countdownEl.style.opacity = "0";
    }
    takePhoto(i);
    await delay(500);
  }

  await generatePhotoStrip();
  appContainer.style.display = "none";
  previewModal.style.display = "flex";
  startCaptureBtn.disabled = false;
}

function takePhoto(index) {
  const ctx = shotPreviews[index];
  const canvas = ctx.canvas;
  canvas.width = overlay.width;
  canvas.height = overlay.height;
  
  // Flip the canvas horizontally to un-mirror the image
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(overlay, -canvas.width, 0, canvas.width, canvas.height);
  ctx.restore();
  
  capturedPhotos.push(canvas.toDataURL("image/png"));
}

function resetSidebar() {
  for (const ctx of shotPreviews) {
    ctx.fillStyle = "#ccc";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}

// === 10. GENERATE PHOTO STRIP ===
async function generatePhotoStrip() {
  const photoWidth = 720;
  const photoHeight = 560;
  const padding = 40;

  photostripCanvas.width = photoWidth + padding * 2;
  photostripCanvas.height = (photoHeight + padding) * 4 + padding;

  photostripCtx.fillStyle = "white";
  photostripCtx.fillRect(0, 0, photostripCanvas.width, photostripCanvas.height);

  const images = await Promise.all(
    capturedPhotos.map(
      (url) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = url;
        })
    )
  );

  images.forEach((img, i) => {
    const yPos = (photoHeight + padding) * i + padding;
    photostripCtx.drawImage(img, padding, yPos, photoWidth, photoHeight);
  });

  photostripCtx.fillStyle = "#888";
  photostripCtx.font = "24px Arial";
  photostripCtx.textAlign = "center";
  photostripCtx.fillText(new Date().toLocaleDateString(), photostripCanvas.width / 2, photostripCanvas.height - 20);

  downloadBtn.href = photostripCanvas.toDataURL("image/png");
}

// === 11. BUTTON EVENTS ===
startCaptureBtn.addEventListener("click", startCaptureSequence);
retakeBtn.addEventListener("click", () => {
  previewModal.style.display = "none";
  appContainer.style.display = "flex";
  resetSidebar();
});

document.getElementById("help-btn").addEventListener("click", () => {
  alert("Need help?\n\n1. Choose a filter.\n2. Choose a background.\n3. Click 'Start Capture' to take photos.\n4. Download your photostrip!");
});