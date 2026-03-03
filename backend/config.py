FEATURE_COLUMNS = [
    'orders_last_15_min',
    'enhanced_total_load',
    'trust_score',
    'hour_of_day',
    'is_peak_hour',
    'is_weekend',
    'merchant_reported_kpt'
]

TARGET_COLUMN = 'true_kpt'

MODEL_PATH = "model.pkl"
DATA_PATH = "dataset.csv"