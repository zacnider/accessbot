terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "run" {
  service = "run.googleapis.com"
}

resource "google_project_service" "aiplatform" {
  service = "aiplatform.googleapis.com"
}

resource "google_project_service" "secretmanager" {
  service = "secretmanager.googleapis.com"
}

# Cloud Run service
resource "google_cloud_run_v2_service" "accessbot" {
  name     = var.service_name
  location = var.region

  depends_on = [google_project_service.run]

  template {
    containers {
      image = "gcr.io/${var.project_id}/${var.service_name}:latest"

      ports {
        container_port = 8080
      }

      env {
        name  = "GOOGLE_GENAI_USE_VERTEXAI"
        value = "TRUE"
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.region
      }

      resources {
        limits = {
          cpu    = "2"
          memory = "1Gi"
        }
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    timeout         = "3600s"
    session_affinity = true

    max_instance_request_concurrency = 100
  }
}

# Allow unauthenticated access
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.accessbot.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
