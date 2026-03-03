import pickle
import numpy as np

from sklearn.model_selection import train_test_split, KFold, cross_val_score
from sklearn.metrics import mean_absolute_error
from sklearn.ensemble import (
    RandomForestRegressor,
    GradientBoostingRegressor,
    HistGradientBoostingRegressor,
    ExtraTreesRegressor,
    StackingRegressor
)
from sklearn.linear_model import Ridge

from config import MODEL_PATH, DATA_PATH
from utils import load_data


# Load Data
X, y = load_data(DATA_PATH)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Base Models (Python 3.13 Safe)
rf = RandomForestRegressor(
    n_estimators=400,
    max_depth=12,
    random_state=42
)

gbr = GradientBoostingRegressor(
    n_estimators=500,
    learning_rate=0.05,
    max_depth=5
)

hgb = HistGradientBoostingRegressor(
    max_iter=500,
    learning_rate=0.05,
    max_depth=6
)

et = ExtraTreesRegressor(
    n_estimators=400,
    max_depth=12,
    random_state=42
)

# Stacking
stack_model = StackingRegressor(
    estimators=[
        ('rf', rf),
        ('gbr', gbr),
        ('hgb', hgb),
        ('et', et)
    ],
    final_estimator=Ridge(),
    cv=5,
    n_jobs=-1
)

# Train
stack_model.fit(X_train, y_train)

# Evaluate
pred = stack_model.predict(X_test)
mae = mean_absolute_error(y_test, pred)

print("🔥 FINAL TEST MAE:", mae)

# Cross Validation
kf = KFold(n_splits=5, shuffle=True, random_state=42)
cv_scores = cross_val_score(
    stack_model,
    X,
    y,
    scoring="neg_mean_absolute_error",
    cv=kf,
    n_jobs=-1
)

print("📊 Cross Validation MAE:", -np.mean(cv_scores))

# Save
with open(MODEL_PATH, "wb") as f:
    pickle.dump(stack_model, f)

print("✅ Model Saved Successfully")