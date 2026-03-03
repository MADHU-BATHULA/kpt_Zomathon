from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import pickle

# -----------------------------
# Initialize Flask App
# -----------------------------
app = Flask(__name__)
CORS(app)

# -----------------------------
# Load Trained Model
# -----------------------------
with open("model.pkl", "rb") as f:
    model = pickle.load(f)

# -----------------------------
# Home Route
# -----------------------------
@app.route("/")
def home():
    return "KPT Maximum Accuracy API Running 🚀"

# -----------------------------
# Prediction Route
# -----------------------------
@app.route("/predict", methods=["POST"])
def predict():

    data = request.json

    # Convert request data to dataframe
    features = pd.DataFrame([{
        "orders_last_15_min": data["orders_last_15_min"],
        "enhanced_total_load": data["enhanced_total_load"],
        "trust_score": data["trust_score"],
        "hour_of_day": data["hour_of_day"],
        "is_peak_hour": data["is_peak_hour"],
        "is_weekend": data["is_weekend"],
        "merchant_reported_kpt": data["merchant_reported_kpt"]
    }])

    # Model prediction
    predicted_kpt = float(model.predict(features)[0])

    # Rider waiting time calculation
    rider_wait_time = max(
        0,
        predicted_kpt - data["merchant_reported_kpt"]
    )

    # API response
    return jsonify({
        "predicted_kpt": round(predicted_kpt, 2),
        "rider_wait_time": round(rider_wait_time, 2)
    })

# -----------------------------
# Run Server
# -----------------------------
if __name__ == "__main__":
    app.run(debug=True)