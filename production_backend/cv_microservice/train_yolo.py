"""
WaterSight - YOLOv8 Segmentation Fine-Tuning Skeleton

WARNING: The accuracy of the CV microservice depends ENTIRELY on the quality 
of the labeled dataset. Code cannot compensate for poor annotations.

EXPECTED DATASET STRUCTURE (Roboflow/CVAT YOLOv8 format):
dataset/
├── data.yaml
├── train/
│   ├── images/
│   └── labels/
└── valid/
    ├── images/
    └── labels/

data.yaml should look like:
---------------------------
train: ../train/images
val: ../valid/images

nc: 3
names: ['water', 'vegetation', 'bare_soil']
---------------------------
"""

import os
from ultralytics import YOLO

def train_model(data_yaml_path: str, epochs: int = 100):
    print(f"🚀 Starting YOLOv8-seg training on {data_yaml_path}")
    
    # 1. Load a pretrained YOLOv8 Nano segmentation model
    model = YOLO("yolov8n-seg.pt")
    
    # 2. Train the model on your custom dataset
    results = model.train(
        data=data_yaml_path,
        epochs=epochs,
        imgsz=640,
        batch=16,
        device="cpu", # Change to 0 if CUDA is available
        project="watersight_cv",
        name="run_01"
    )
    
    print("✅ Training complete. Exporting to ONNX for microservice deployment...")
    
    # 3. Export to ONNX (optimized for CPU inference in the FastAPI microservice)
    export_path = model.export(format="onnx", opset=12, dynamic=True)
    print(f"🎉 Model exported successfully to {export_path}")

if __name__ == "__main__":
    yaml_path = os.path.abspath("dataset/data.yaml")
    if not os.path.exists(yaml_path):
        print(f"ERROR: Dataset not found at {yaml_path}")
        print("Please export your annotated dataset from CVAT/Roboflow first.")
    else:
        train_model(yaml_path)
