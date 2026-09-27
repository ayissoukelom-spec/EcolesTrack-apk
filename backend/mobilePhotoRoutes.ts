import type { Express, Request, RequestHandler } from "express";
import multer from "multer";

interface AuthenticatedParentRequest extends Request {
  parent?: {
    id: string;
    email: string;
    role: string;
  };
}

interface ChildPhotoStore {
  isChildOwnedByParent(childId: string, parentId: string): Promise<boolean>;
  saveChildPhoto(childId: string, photoData: Buffer, mimeType: string): Promise<void>;
  getChildPhoto(childId: string): Promise<{ photoData: Buffer; mimeType: string } | null>;
}

const allowedPhotoMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedPhotoMimeTypes.has(file.mimetype)) {
      return callback(new Error("Seules les images JPEG, PNG et WebP sont acceptées."));
    }
    callback(null, true);
  },
}).single("file");

export function registerChildPhotoRoutes(
  app: Express,
  requireAuth: RequestHandler,
  requireParentRoleOnly: RequestHandler,
  store: ChildPhotoStore,
) {
  const requireChildOwnership: RequestHandler = (req, res, next) => {
    const parentId = (req as AuthenticatedParentRequest).parent?.id;
    if (!parentId) {
      return res.status(401).json({ error: "Authentification requise.", code: "UNAUTHORIZED" });
    }

    void store.isChildOwnedByParent(req.params.childId, parentId).then((isOwned) => {
      if (!isOwned) {
        return res.status(403).json({
          error: "Accès refusé. Cet enfant ne vous est pas rattaché.",
          code: "CHILD_OWNERSHIP_VIOLATION",
        });
      }
      next();
    }).catch(next);
  };

  const parsePhotoUpload: RequestHandler = (req, res, next) => {
    photoUpload(req, res, (error) => {
      if (!error) return next();
      return res.status(400).json({
        error: error.message || "Fichier photo invalide.",
        code: "CHILD_PHOTO_UPLOAD_INVALID",
      });
    });
  };

  app.post(
    "/api/mobile/parent/children/:childId/photo",
    requireAuth,
    requireParentRoleOnly,
    requireChildOwnership,
    parsePhotoUpload,
    (req, res, next) => {
      const file = req.file;
      if (!file || file.size === 0) {
        return res.status(400).json({
          error: "Veuillez fournir une image non vide.",
          code: "CHILD_PHOTO_REQUIRED",
        });
      }

      void store.saveChildPhoto(req.params.childId, file.buffer, file.mimetype).then(() => (
        res.status(200).json({ success: true })
      )).catch(next);
    },
  );

  app.get(
    "/api/mobile/parent/children/:childId/photo",
    requireAuth,
    requireParentRoleOnly,
    requireChildOwnership,
    (req, res, next) => {
      void store.getChildPhoto(req.params.childId).then((photo) => {
        if (!photo) {
          return res.status(404).json({
            error: "Photo de l’enfant introuvable.",
            code: "CHILD_PHOTO_NOT_FOUND",
          });
        }

        if (!allowedPhotoMimeTypes.has(photo.mimeType)) {
          return res.status(500).json({
            error: "Le type de la photo enregistrée est invalide.",
            code: "CHILD_PHOTO_INVALID_MIME_TYPE",
          });
        }

        res.setHeader("Content-Type", photo.mimeType);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).send(photo.photoData);
      }).catch(next);
    },
  );
}