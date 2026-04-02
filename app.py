from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import base64
import sqlite3
from datetime import datetime

app = Flask(__name__)

# Configuration
SNAPSHOT_DIR = 'snapshots'
DATABASE = 'driveguard.db'

# Ensure snapshots directory exists
os.makedirs(SNAPSHOT_DIR, exist_ok=True)


def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            alert_type TEXT NOT NULL,
            message TEXT,
            image_path TEXT,
            risk_score INTEGER
        )
    ''')
    conn.commit()
    conn.close()


# Initialize DB on startup
init_db()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/save_snapshot', methods=['POST'])
def save_snapshot():
    try:
        data = request.get_json(silent=True)

        if not data:
            return jsonify({'status': 'error', 'message': 'Invalid JSON data'}), 400

        image_data = data.get('image')
        alert_type = data.get('alert_type', 'unknown')
        message = data.get('message', '')
        risk_score = data.get('risk_score', 0)

        if not image_data:
            return jsonify({'status': 'error', 'message': 'No image data provided'}), 400

        # Decode base64 image
        header, encoded = image_data.split(",", 1)
        binary_data = base64.b64decode(encoded)

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        filename = f"{alert_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
        filepath = os.path.join(SNAPSHOT_DIR, filename)

        with open(filepath, "wb") as f:
            f.write(binary_data)

        # Store in database
        conn = get_db_connection()
        conn.execute(
            '''
            INSERT INTO alerts 
            (timestamp, alert_type, message, image_path, risk_score)
            VALUES (?, ?, ?, ?, ?)
            ''',
            (timestamp, alert_type, message, filename, risk_score)
        )
        conn.commit()
        conn.close()

        return jsonify({'status': 'success', 'filename': filename})

    except Exception as e:
        print(f"Error saving snapshot: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/get_history', methods=['GET'])
def get_history():
    try:
        conn = get_db_connection()
        alerts = conn.execute(
            'SELECT * FROM alerts ORDER BY id DESC LIMIT 50'
        ).fetchall()
        conn.close()

        return jsonify([dict(row) for row in alerts])

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/snapshots/<path:filename>')
def get_snapshot(filename):
    return send_from_directory(SNAPSHOT_DIR, filename)


@app.route('/get_snapshots')
def list_snapshots():
    files = sorted(os.listdir(SNAPSHOT_DIR), reverse=True)[:20]
    return jsonify(files)


@app.route('/favicon.ico')
def favicon():
    return '', 204


# ✅ Cloud deployment compatible run config
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
