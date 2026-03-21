# DriveGuard | Driver Safety Monitoring System

DriveGuard is a real-time AI-powered driver safety monitoring system designed for hackathons. It uses advanced computer vision to detect driver drowsiness, fatigue, and distraction, providing instant visual and auditory alerts.

## 🚀 Features

- **Real-time Monitoring**: Detects eyes closed, yawning, head distraction, and phone usage.
- **Modern Dashboard**: High-performance UI built with Tailwind CSS and Lucide icons.
- **Visual & Audio Alerts**: Flashing red overlays and voice warnings for immediate feedback.
- **Snapshot Capture**: Automatically saves images of unsafe behavior to the backend.
- **Night Vision Mode**: Simulated infrared mode for low-light or total darkness testing.
- **Mobile Friendly**: Responsive design works on laptops and tablets.

## 🛠 Tech Stack

- **Backend**: Flask (Python)
- **Frontend**: React-style architecture with Tailwind CSS
- **AI Engine**: MediaPipe FaceMesh & Pose (Client-side)
- **Icons**: Lucide React
- **Voice**: Web Speech API

## 🏃 How to Run

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Start the Server**:
   ```bash
   python app.py
   ```

3. **Access the App**:
   Open `http://localhost:5000` in your browser.

## 📁 Project Structure

- `app.py`: Flask server for serving the web app and saving snapshots.
- `templates/index.html`: Main dashboard UI.
- `static/js/monitoring.js`: Core AI detection logic using MediaPipe.
- `snapshots/`: Directory where captured alerts are stored.

## 🧠 AI Detection Logic

- **Drowsiness**: Calculated using **Eye Aspect Ratio (EAR)**. If EAR drops below 0.22 for more than 1 second, an alert is triggered.
- **Fatigue**: Calculated using **Mouth Opening Ratio (MOR)** to detect yawning.
- **Distraction**: Uses head pose estimation (yaw/pitch) based on facial landmarks.
- **Phone Use**: Uses Pose detection to check for hands near the head.

---
Built for Hackathons with ❤️ by Trae AI.
