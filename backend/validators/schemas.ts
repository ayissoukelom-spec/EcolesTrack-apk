import { z } from "zod";

/**
 * Zod request validation schemas
 */

// 1. Login schema
export const LoginSchema = z.object({
  identifier: z.string().trim().min(1).optional(),
  email: z.string().email({ message: "Format d'email invalide." }).optional(),
  phoneCountryCode: z.string().trim().optional(),
  password: z.string().min(4, { message: "Le mot de passe doit contenir au moins 4 caractères." })
}).refine((value) => Boolean(value.identifier || value.email), {
  message: "Un email ou un numéro de téléphone est requis.",
  path: ['identifier'],
});

// 2. Push Token registration schema
export const RegisterPushTokenSchema = z.object({
  pushToken: z.string().min(10, { message: "Le token push est trop court." }),
  platform: z.enum(["android", "ios"], { message: "Plateforme invalide (android ou ios uniquement)." }),
  appVersion: z.string().min(1, { message: "La version de l'application est requise." }),
  deviceId: z.string().min(10, { message: "L'identifiant du device est requis." })
});

// 3. Notification Preferences schema
export const NotificationPreferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: "Format d'heure invalide (HH:MM)." }).nullable().optional(),
  quietHoursEnd: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: "Format d'heure invalide (HH:MM)." }).nullable().optional(),
  whatsappConsent: z.boolean().optional(),
  smsConsent: z.boolean().optional()
});

// 4. Test Notification schema
export const TestNotificationSchema = z.object({
  title: z.string().min(1, { message: "Le titre est requis." }),
  message: z.string().min(1, { message: "Le message est requis." }),
  target: z.string().min(1).optional()
});

// 5. Simulation Add Absence schema
export const DevAddAbsenceSchema = z.object({
  childId: z.string().min(1),
  date: z.string().optional(),
  reason: z.string().min(2),
  justified: z.boolean().optional(),
  justificationText: z.string().optional()
});

export const ParentAbsenceDeclarationSchema = z.object({
  childId: z.string().regex(/^\d+$/, { message: "Identifiant d’enfant invalide." }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Format de date invalide (AAAA-MM-JJ)." }),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Format d’heure invalide (HH:MM)." }),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Format d’heure invalide (HH:MM)." }),
  reason: z.string({ error: "Le motif de déclaration est obligatoire." })
    .max(1000, { message: "Le motif ne peut pas dépasser 1000 caractères." })
    .trim()
    .min(1, { message: "Le motif de déclaration est obligatoire." }),
}).refine((value) => {
  const parsed = new Date(`${value.date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value.date;
}, {
  message: "Date invalide.",
  path: ['date'],
}).refine((value) => value.startTime < value.endTime, {
  message: "L’heure de fin doit être postérieure à l’heure de début.",
  path: ['endTime'],
});

// 6. Simulation Add Grade schema
export const DevAddGradeSchema = z.object({
  childId: z.string().min(1),
  subject: z.string().min(1),
  grade: z.number().min(0).max(20),
  coefficient: z.number().positive().optional(),
  examName: z.string().min(1),
  date: z.string().optional()
});
