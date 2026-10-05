import type { Express, Request, RequestHandler } from "express";
import { normalizeParentLoginPhone } from "./parentLogin.js";

interface AuthenticatedParentRequest extends Request {
  parent?: {
    id: string;
    email: string;
    role: string;
  };
}

interface ParentWhatsAppRouteStore {
  isChildOwnedByParent(childId: string, parentId: string): Promise<boolean>;
}

interface ParentWhatsAppDatabase {
  dbQuery<T>(query: string, params: unknown[]): Promise<{ rows: T[] }>;
}

interface SchoolRow {
  school_id: number | null;
}

interface AdministratorRow {
  phone: string | null;
}

const parseStudentId = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const studentId = Number(value);
  return Number.isSafeInteger(studentId) ? studentId : null;
};

const normalizeWhatsAppNumber = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmedValue = value.trim();
  if (!/^(?:\+|00)?[\d\s()./-]+$/.test(trimmedValue)) return null;
  const number = normalizeParentLoginPhone(trimmedValue)[0];
  return number && /^[1-9]\d{1,14}$/.test(number) ? number : null;
};

export function registerParentWhatsAppRoute(
  app: Express,
  requireAuth: RequestHandler,
  requireParentRoleOnly: RequestHandler,
  store: ParentWhatsAppRouteStore,
  database: ParentWhatsAppDatabase,
) {
  app.get(
    "/api/mobile/parent/whatsapp-contact",
    requireAuth,
    requireParentRoleOnly,
    async (req, res) => {
      const parentId = (req as AuthenticatedParentRequest).parent?.id;
      const studentId = parseStudentId(req.query.studentId);
      if (!parentId) {
        return res.status(401).json({ error: "Authentification requise.", code: "UNAUTHORIZED" });
      }
      if (studentId === null) {
        return res.status(400).json({ error: "Identifiant d’enfant invalide.", code: "INVALID_STUDENT_ID" });
      }

      try {
        if (!(await store.isChildOwnedByParent(String(studentId), parentId))) {
          return res.status(404).json({ error: "Enfant introuvable.", code: "CHILD_NOT_FOUND" });
        }

        const studentResult = await database.dbQuery<SchoolRow>(
          "SELECT school_id FROM students WHERE id = $1 LIMIT 1",
          [studentId],
        );
        const schoolId = studentResult.rows[0]?.school_id;
        if (schoolId == null) {
          return res.json({ whatsappUrl: null });
        }

        const administrators = await database.dbQuery<AdministratorRow>(
          `SELECT phone
           FROM users
           WHERE role = 'school_admin'
             AND school_id = $1
             AND phone IS NOT NULL
           ORDER BY id ASC`,
          [schoolId],
        );

        for (const administrator of administrators.rows) {
          const number = normalizeWhatsAppNumber(administrator.phone);
          if (number) {
            const message = encodeURIComponent("Bonjour, je souhaite contacter l’administration de l’école.");
            return res.json({ whatsappUrl: `https://wa.me/${number}?text=${message}` });
          }
        }

        return res.json({ whatsappUrl: null });
      } catch (error) {
        console.error("Failed to resolve mobile parent WhatsApp contact:", error);
        return res.status(500).json({ error: "Impossible de récupérer le contact WhatsApp." });
      }
    },
  );
}
