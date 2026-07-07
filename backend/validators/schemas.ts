import { z } from "zod";

/**
 * Zod request validation schemas
 */

// 1. Login schema
export const LoginSchema = z.object({
  email: z.string().email({ message: "Format d'email invalide." }),
  password: z.string().min(4, { message: "Le mot de passe doit contenir au moins 4 caractères." })
});

// 2. Push Token registration schema
export const RegisterPushTokenSchema = z.object({
  pushToken: z.string().min(10, { message: "Le token push est trop court." }),
  platform: z.enum(["android", "ios"], { message: "Plateforme invalide (android ou ios uniquement)." }),
  appVersion: z.string().min(1, { message: "La version de l'application est requise." })
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
  message: z.string().min(1, { message: "Le message est requis." })
});

// 5. Simulation Add Absence schema
export const DevAddAbsenceSchema = z.object({
  childId: z.string().min(1),
  date: z.string().optional(),
  reason: z.string().min(2),
  justified: z.boolean().optional(),
  justificationText: z.string().optional()
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
