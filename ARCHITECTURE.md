# Architecture Technique d'ÉcoleTrack

## 1. Vue d'ensemble de l'architecture

ÉcoleTrack utilise une architecture **Full-Stack robuste avec Émulateur Intégré** pour assurer une démonstration, un test et un déploiement simplifiés :

```
                  +----------------------------------------------+
                  |            Navigateur Client (UI)             |
                  +----------------------------------------------+
                  |  [Console Dev]   [Doc Guide]   [Android App] |
                  +--------+--------------+--------------+-------+
                           |              |              |
                           | API Dev      | OAuth        | REST API
                           v              v              v
                  +----------------------------------------------+
                  |              Serveur Node / Express          |
                  +----------------------------------------------+
                  |  - Middlewares (Helmet, CORS, Rate Limit)    |
                  |  - Routeurs Authentification (JWT, Rotation) |
                  |  - Moteur de File BullMQ (DLQ, Retries)      |
                  |  - Orchestrateur Multi-Canal (FCM, SMS, WA)  |
                  +----------------------------------------------+
```

### Éléments clés :
* **Frontend Web** : SPA moderne développée avec React 19, Vite, Tailwind CSS et Motion. Elle contient trois zones majeures : le guide interactif de gauche, l'émulateur mobile Android au centre, et la console de log développeur à droite.
* **Émulateur Mobile** : Intégration d'une application mobile simulée fonctionnant via des appels API réels vers le backend.
* **Backend Express (server.ts)** : Expose l'API mobile (/api/mobile/parent/*) et l'API de contrôle développeur (/api/dev/*).

---

## 2. Décision d'Uniformisation d'Architecture

ÉcoleTrack résout le problème classique des environnements hybrides en séparant clairement :
1. **L'application Web de test** (Vite + React) : déployée de manière centralisée.
2. **L'application Mobile native** (React Native / Android) : dont le code source de configuration Gradle/Manifest se situe dans le répertoire `/mobile/`.

Toutes les interfaces de l'API mobile sont rétrocompatibles et standardisées sous les formats JSON requis pour la production.
