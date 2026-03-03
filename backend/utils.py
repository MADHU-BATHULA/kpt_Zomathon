import pandas as pd
from config import FEATURE_COLUMNS, TARGET_COLUMN

def load_data(path):
    df = pd.read_csv(path)
    X = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN]
    return X, y