
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime

app = FastAPI(
    title="PulseRoute API",
    description="Emergency Response Coordination System",
    version="1.0.0"
)

# Allow frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Demonstration data
available_ambulances = 4
incident_number = 0
incidents = []


class EmergencyRequest(BaseModel):
    ambulance_id: str
    destination: str


@app.get("/")
def home():
    return {
        "message": "Welcome to PulseRoute API",
        "status": "online"
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "service": "PulseRoute Backend"
    }


@app.get("/api/dashboard")
def dashboard():

    return {
        "active_emergencies": len([
            incident for incident in incidents
            if incident["status"] == "Active"
        ]),
        "available_ambulances": available_ambulances,
        "hospitals_online": 6,
        "system_status": "Online"
    }


@app.post("/api/emergency")
def create_emergency(request: EmergencyRequest):

    global incident_number, available_ambulances

    incident_number += 1

    incident = {
        "incident_id": f"PR-{incident_number:03d}",
        "ambulance_id": request.ambulance_id,
        "destination": request.destination,
        "status": "Active",
        "created_at": datetime.now().isoformat()
    }

    incidents.append(incident)

    return {
        "message": "Emergency registered successfully",
        **incident
    }


@app.get("/api/emergencies")
def get_emergencies():

    return {
        "total": len(incidents),
        "incidents": incidents
    }


@app.post("/api/reset")
def reset_simulation():

    global incident_number

    incidents.clear()
    incident_number = 0

    return {
        "message": "Simulation reset successfully"
    }

