# Zomathon – Kitchen Prep Time (KPT) Prediction System

## Overview
This project aims to improve **Kitchen Prep Time (KPT) prediction** in food delivery platforms like Zomato.  
Accurate KPT prediction helps reduce **rider waiting time**, improves **ETA accuracy**, and enhances overall delivery efficiency.

Our solution focuses on improving **input signal quality**, rather than only modifying the prediction model.  
We simulate real-world restaurant behavior and use machine learning to produce more reliable KPT estimates.

---

## Problem Statement
Current KPT prediction systems rely heavily on merchant-reported **Food Order Ready (FOR)** signals.  
These signals often contain noise due to:

- Rider-influenced marking
- Merchant bias
- Lack of visibility into external kitchen load
- Manual operational inconsistencies

This leads to inaccurate predictions, rider idle time, and fluctuating customer ETAs.

---

## Proposed Solution
Our system improves KPT prediction by introducing **enhanced input signals** and building a **machine learning pipeline** that estimates true kitchen load.

Key improvements:

- Simulated **external kitchen load** (non-Zomato orders)
- Merchant reliability scoring
- Hidden load estimation
- Signal de-noising
- Ensemble ML prediction model
- Rider waiting time estimation

---

## System Architecture


Restaurant Signals
↓
Feature Engineering
↓
Ensemble ML Model
↓
Flask API
↓
Frontend Dashboard
↓
Predicted KPT + Rider Waiting Time


---

## Technologies Used

### Backend
- Python
- Flask
- Pandas
- NumPy
- Scikit-learn

### Machine Learning
- Random Forest
- Ensemble Learning
- Cross Validation
- Feature Engineering

### Frontend
- HTML
- CSS
- JavaScript

### Tools
- VS Code
- Git & GitHub

---

## Features

### 1. Synthetic Data Simulation
Generated a dataset representing:
- 300 restaurants
- 30,000 orders
- Peak hours
- Merchant bias
- External kitchen load

### 2. Signal Enhancement
Improved input signals by modeling:
- External orders
- Hidden kitchen rush
- Merchant reliability score

### 3. Machine Learning Model
An ensemble model predicts **true KPT** using engineered signals.

### 4. Rider Waiting Time Estimation
The system also estimates **rider idle time at restaurants**, which is a key success metric.

### 5. Interactive Dashboard
A frontend interface allows users to input restaurant signals and obtain predictions in real time.

---

## Project Structure


kpt_zomato
│
├── backend
│ ├── app.py
│ ├── model.pkl
│ └── requirements.txt
│
├── frontend
│ └── index.html
│
├── dataset.csv
│
└── README.md


---

## Installation

### 1. Clone the Repository


git clone https://github.com/MADHU-BATHULA/kpt_Zomathon.git

cd kpt_Zomathon


### 2. Create Virtual Environment


python -m venv venv


Activate it:

Windows

venv\Scripts\activate


Mac/Linux

source venv/bin/activate


### 3. Install Dependencies


pip install -r backend/requirements.txt


---

## Running the Project

### Start Backend API


cd backend
python app.py


The server will run at:


http://127.0.0.1:5000


### Open Frontend

Open the frontend file in a browser:


frontend/index.html


---

## API Endpoint

### POST `/predict`

Input:


{
"orders_last_15_min": 10,
"enhanced_total_load": 18,
"trust_score": 0.8,
"hour_of_day": 14,
"is_peak_hour": 1,
"is_weekend": 0,
"merchant_reported_kpt": 15
}


Response:


{
"predicted_kpt": 17.4,
"rider_wait_time": 2.4
}


---

## Evaluation Results

Our improved signals reduced prediction error and rider waiting time.

| Metric | Result |
|------|------|
| Baseline MAE | 1.64 |
| Enhanced MAE | 1.13 |
| Improvement | ~31% |
| Rider Waiting Time Reduction | ~47% |

---

## Future Improvements

- IoT-based kitchen activity tracking
- Real-time rush detection
- Deep learning-based sequence modeling
- Integration with live delivery systems

---

## Author

**Madhu Bathula**

GitHub  
https://github.com/MADHU-BATHULA

---

## License

This project is developed for **Zomathon Hackathon** demonstration purposes.
