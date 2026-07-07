/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { 
  Parent, Child, Absence, Grade, AppNotification, 
  ParentDevice, NotificationPreferences, ParentConsent, 
  NotificationEvent, NotificationDelivery, NotificationChannel,
  CompleteDeliveryLog
} from '../src/types';

const DB_PATH = path.join(process.cwd(), 'db.json');

// Interface for database structure
interface DatabaseSchema {
  parents: Array<Parent & { passwordHash: string; role: string }>;
  schools: Array<{ id: string; name: string; address: string }>;
  parentSchools: Array<{ parentId: string; schoolId: string }>;
  children: Child[];
  absences: Absence[];
  grades: Grade[];
  appNotifications: AppNotification[];
  parentDevices: ParentDevice[];
  notificationPreferences: NotificationPreferences[];
  parentConsents: ParentConsent[];
  notificationEvents: NotificationEvent[];
  notificationDeliveries: NotificationDelivery[];
}

// Initial Seed Data
const INITIAL_DATABASE: DatabaseSchema = {
  parents: [
    {
      id: "parent-jean-dupont",
      name: "Jean Dupont",
      email: "jean.dupont@email.com",
      phoneNumber: "+33612345678",
      activeSchoolId: "school-pasteur",
      schools: [
        { id: "school-pasteur", name: "Collège Louis Pasteur" },
        { id: "school-moliere", name: "Lycée Molière" }
      ],
      passwordHash: "parent123", // Simple plain or hashed for mockup validation
      role: "parent"
    },
    {
      id: "parent-marie-martin",
      name: "Marie Martin",
      email: "marie.martin@email.com",
      phoneNumber: "+33698765432",
      activeSchoolId: "school-pasteur",
      schools: [
        { id: "school-pasteur", name: "Collège Louis Pasteur" }
      ],
      passwordHash: "parent123",
      role: "parent"
    },
    // Admin & Teacher to demonstrate the 403 Parent-Only protection
    {
      id: "user-admin",
      name: "Directeur Académique",
      email: "admin@ecoletrack.fr",
      phoneNumber: "+33600000001",
      activeSchoolId: "school-pasteur",
      schools: [],
      passwordHash: "admin123",
      role: "school_admin"
    },
    {
      id: "user-teacher",
      name: "M. Legendre (Prof de Maths)",
      email: "teacher@ecoletrack.fr",
      phoneNumber: "+33600000002",
      activeSchoolId: "school-pasteur",
      schools: [],
      passwordHash: "teacher123",
      role: "teacher"
    }
  ],
  schools: [
    { id: "school-pasteur", name: "Collège Louis Pasteur", address: "12 Rue des Écoles, Paris" },
    { id: "school-moliere", name: "Lycée Molière", address: "45 Avenue Molière, Paris" }
  ],
  parentSchools: [
    { parentId: "parent-jean-dupont", schoolId: "school-pasteur" },
    { parentId: "parent-jean-dupont", schoolId: "school-moliere" },
    { parentId: "parent-marie-martin", schoolId: "school-pasteur" }
  ],
  children: [
    {
      id: "child-lucas",
      parentId: "parent-jean-dupont",
      firstName: "Lucas",
      lastName: "Dupont",
      className: "4ème B",
      avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=120"
    },
    {
      id: "child-chloe",
      parentId: "parent-jean-dupont",
      firstName: "Chloé",
      lastName: "Dupont",
      className: "6ème A",
      avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=120"
    },
    {
      id: "child-theo",
      parentId: "parent-marie-martin",
      firstName: "Théo",
      lastName: "Martin",
      className: "3ème C",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120"
    }
  ],
  absences: [
    {
      id: "abs-1",
      childId: "child-lucas",
      date: "2026-06-15T08:30:00Z",
      reason: "Gastro-entérite aiguë",
      justified: true,
      justificationText: "Certificat médical envoyé le 16/06."
    },
    {
      id: "abs-2",
      childId: "child-lucas",
      date: "2026-07-02T10:00:00Z",
      reason: "Retard injustifié cours d'Histoire",
      justified: false
    },
    {
      id: "abs-3",
      childId: "child-chloe",
      date: "2026-06-20T14:00:00Z",
      reason: "Rendez-vous orthodontiste",
      justified: true,
      justificationText: "Mot de passe signé des parents fourni en amont."
    },
    {
      id: "abs-4",
      childId: "child-theo",
      date: "2026-06-28T09:00:00Z",
      reason: "Panne de réveil",
      justified: false
    }
  ],
  grades: [
    {
      id: "grade-1",
      childId: "child-lucas",
      subject: "Mathématiques",
      grade: 15.5,
      coefficient: 2,
      examName: "Contrôle Algèbre & Fonctions",
      date: "2026-06-10"
    },
    {
      id: "grade-2",
      childId: "child-lucas",
      subject: "Français",
      grade: 12,
      coefficient: 1,
      examName: "Expression écrite - Commentaire de texte",
      date: "2026-06-14"
    },
    {
      id: "grade-3",
      childId: "child-lucas",
      subject: "Histoire-Géographie",
      grade: 14,
      coefficient: 1.5,
      examName: "Évaluation - La Première Guerre Mondiale",
      date: "2026-06-25"
    },
    {
      id: "grade-4",
      childId: "child-chloe",
      subject: "Mathématiques",
      grade: 18,
      coefficient: 1,
      examName: "Calcul mental - Tables et fractions",
      date: "2026-06-12"
    },
    {
      id: "grade-5",
      childId: "child-chloe",
      subject: "Anglais",
      grade: 16.5,
      coefficient: 1.5,
      examName: "Vocabulaire & Verbes irréguliers",
      date: "2026-06-18"
    },
    {
      id: "grade-6",
      childId: "child-chloe",
      subject: "SVT",
      grade: 9.5,
      coefficient: 1,
      examName: "Contrôle - Le système solaire",
      date: "2026-06-27"
    },
    {
      id: "grade-7",
      childId: "child-theo",
      subject: "Mathématiques",
      grade: 11,
      coefficient: 2,
      examName: "Devoir commun - Géométrie",
      date: "2026-06-20"
    }
  ],
  appNotifications: [
    {
      id: "not-1",
      parentId: "parent-jean-dupont",
      title: "Nouvelle absence signalée",
      message: "Votre enfant Lucas Dupont a été signalé absent aujourd'hui à 10:00. Veuillez fournir un justificatif.",
      read: false,
      createdAt: "2026-07-02T10:15:00Z",
      deepLink: "ecoletrack://absences?childId=child-lucas"
    },
    {
      id: "not-2",
      parentId: "parent-jean-dupont",
      title: "Nouvelle note disponible",
      message: "Lucas Dupont a reçu un 14/20 en Histoire-Géographie (Coeff 1.5).",
      read: true,
      createdAt: "2026-06-25T16:00:00Z",
      deepLink: "ecoletrack://grades?childId=child-lucas"
    }
  ],
  parentDevices: [],
  notificationPreferences: [
    {
      parentId: "parent-jean-dupont",
      pushEnabled: true,
      whatsappEnabled: true,
      smsEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00"
    },
    {
      parentId: "parent-marie-martin",
      pushEnabled: true,
      whatsappEnabled: false,
      smsEnabled: true,
      quietHoursStart: "21:30",
      quietHoursEnd: "07:30"
    }
  ],
  parentConsents: [
    {
      id: "c-1",
      parentId: "parent-jean-dupont",
      channel: "whatsapp",
      consentGranted: true,
      consentTextVersion: "v1.0-fr",
      consentedAt: "2026-05-01T10:00:00Z"
    },
    {
      id: "c-2",
      parentId: "parent-jean-dupont",
      channel: "sms",
      consentGranted: false,
      consentTextVersion: "v1.0-fr",
      consentedAt: "2026-05-01T10:00:00Z",
      revokedAt: "2026-06-01T15:30:00Z"
    },
    {
      id: "c-3",
      parentId: "parent-marie-martin",
      channel: "sms",
      consentGranted: true,
      consentTextVersion: "v1.0-fr",
      consentedAt: "2026-05-15T11:00:00Z"
    }
  ],
  notificationEvents: [],
  notificationDeliveries: []
};

// Database utility class with simple atomic JSON persistence
export class JSONStore {
  private data: DatabaseSchema;

  constructor() {
    this.data = { ...INITIAL_DATABASE };
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const fileContent = fs.readFileSync(DB_PATH, 'utf-8');
        this.data = JSON.parse(fileContent);
        // Make sure all required tables exist
        for (const key of Object.keys(INITIAL_DATABASE) as Array<keyof DatabaseSchema>) {
          if (!this.data[key]) {
            (this.data as any)[key] = INITIAL_DATABASE[key];
          }
        }
      } else {
        this.save();
      }
    } catch (e) {
      console.error("Failed to load JSON database, using in-memory default", e);
      this.data = { ...INITIAL_DATABASE };
    }
  }

  public save() {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error("Failed to save JSON database to disk", e);
    }
  }

  // Parents
  public findParentByEmail(email: string) {
    return this.data.parents.find(p => p.email.toLowerCase() === email.toLowerCase());
  }

  public getParentById(id: string) {
    return this.data.parents.find(p => p.id === id);
  }

  // Children
  public getChildrenOfParent(parentId: string): Child[] {
    const linkedChildren = this.data.children.filter(c => c.parentId === parentId);
    if (linkedChildren.length > 0) {
      return linkedChildren;
    }

    const parent = this.getParentById(parentId);
    if (!parent || (parent as any).role !== "parent") {
      return linkedChildren;
    }

    const simulatedChild: Child = {
      id: "child-sim-" + crypto.randomUUID().slice(0, 8),
      parentId,
      firstName: "Enfant",
      lastName: "Simule",
      className: "Classe de demonstration",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120"
    };

    this.data.children.unshift(simulatedChild);
    this.save();
    return [simulatedChild];
  }

  public createSimulatedChildForParent(parentId: string): Child | null {
    const parent = this.getParentById(parentId);
    if (!parent || (parent as any).role !== "parent") {
      return null;
    }

    const simulatedChild: Child = {
      id: "child-sim-" + crypto.randomUUID().slice(0, 8),
      parentId,
      firstName: "Eleve",
      lastName: "Demo",
      className: "5eme Demo",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120"
    };

    this.data.children.unshift(simulatedChild);
    this.save();
    return simulatedChild;
  }

  public isChildOwnedByParent(childId: string, parentId: string): boolean {
    const child = this.data.children.find(c => c.id === childId);
    return child ? child.parentId === parentId : false;
  }

  // Absences
  public getAbsencesOfChild(childId: string): Absence[] {
    return this.data.absences.filter(a => a.childId === childId);
  }

  public addAbsence(absence: Omit<Absence, 'id'>): Absence {
    const newAbsence: Absence = {
      id: "abs-" + crypto.randomUUID().slice(0, 8),
      ...absence
    };
    this.data.absences.unshift(newAbsence);
    this.save();
    return newAbsence;
  }

  // Grades
  public getGradesOfChild(childId: string): Grade[] {
    return this.data.grades.filter(g => g.childId === childId);
  }

  public addGrade(grade: Omit<Grade, 'id'>): Grade {
    const newGrade: Grade = {
      id: "grade-" + crypto.randomUUID().slice(0, 8),
      ...grade
    };
    this.data.grades.unshift(newGrade);
    this.save();
    return newGrade;
  }

  // In-App Notifications
  public getInAppNotifications(parentId: string): AppNotification[] {
    return this.data.appNotifications.filter(n => n.parentId === parentId);
  }

  public markAllInAppNotificationsAsRead(parentId: string) {
    this.data.appNotifications = this.data.appNotifications.map(n => {
      if (n.parentId === parentId) {
        return { ...n, read: true };
      }
      return n;
    });
    this.save();
  }

  public addInAppNotification(parentId: string, title: string, message: string, deepLink?: string): AppNotification {
    const notification: AppNotification = {
      id: "not-" + crypto.randomUUID().slice(0, 8),
      parentId,
      title,
      message,
      read: false,
      createdAt: new Date().toISOString(),
      deepLink
    };
    this.data.appNotifications.unshift(notification);
    this.save();
    return notification;
  }

  // Device Tokens
  public registerPushToken(parentId: string, token: string, platform: 'android' | 'ios', appVersion: string): ParentDevice {
    // Delete existing records with this same token to keep it clean
    this.data.parentDevices = this.data.parentDevices.filter(d => d.pushToken !== token);

    const device: ParentDevice = {
      id: "dev-" + crypto.randomUUID().slice(0, 8),
      parentId,
      platform,
      pushToken: token,
      appVersion,
      lastSeenAt: new Date().toISOString()
    };
    this.data.parentDevices.push(device);
    this.save();
    return device;
  }

  public getDevicesOfParent(parentId: string): ParentDevice[] {
    return this.data.parentDevices.filter(d => d.parentId === parentId);
  }

  // Preferences
  public getNotificationPreferences(parentId: string): NotificationPreferences {
    let pref = this.data.notificationPreferences.find(p => p.parentId === parentId);
    if (!pref) {
      pref = {
        parentId,
        pushEnabled: true,
        whatsappEnabled: false,
        smsEnabled: false,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00"
      };
      this.data.notificationPreferences.push(pref);
      this.save();
    }
    return pref;
  }

  public updateNotificationPreferences(parentId: string, updates: Partial<NotificationPreferences>): NotificationPreferences {
    const index = this.data.notificationPreferences.findIndex(p => p.parentId === parentId);
    let pref: NotificationPreferences;
    if (index === -1) {
      pref = {
        parentId,
        pushEnabled: true,
        whatsappEnabled: false,
        smsEnabled: false,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        ...updates
      };
      this.data.notificationPreferences.push(pref);
    } else {
      pref = {
        ...this.data.notificationPreferences[index],
        ...updates
      };
      this.data.notificationPreferences[index] = pref;
    }
    this.save();
    return pref;
  }

  // Consent Center
  public getConsentsOfParent(parentId: string): ParentConsent[] {
    return this.data.parentConsents.filter(c => c.parentId === parentId);
  }

  public updateConsent(parentId: string, channel: 'whatsapp' | 'sms', granted: boolean, textVersion: string): ParentConsent {
    const timestamp = new Date().toISOString();
    
    // Revoke previous active consent for that channel
    this.data.parentConsents = this.data.parentConsents.map(c => {
      if (c.parentId === parentId && c.channel === channel && !c.revokedAt) {
        return { ...c, revokedAt: timestamp };
      }
      return c;
    });

    const consent: ParentConsent = {
      id: "consent-" + crypto.randomUUID().slice(0, 8),
      parentId,
      channel,
      consentGranted: granted,
      consentTextVersion: textVersion,
      consentedAt: timestamp
    };
    
    this.data.parentConsents.push(consent);
    this.save();
    return consent;
  }

  // Notification Event logging
  public createNotificationEvent(parentId: string, eventType: 'absence' | 'grade' | 'general' | 'test', payload: any, dedupeKey: string): NotificationEvent | null {
    // IDEMPOTENCY / DEDUPLICATION CHECK
    const existing = this.data.notificationEvents.find(e => e.dedupeKey === dedupeKey);
    if (existing) {
      console.log(`[IDEMPOTENCY TRIGGERED] Event with dedupe_key ${dedupeKey} already exists. Skipping insertion.`);
      return null;
    }

    const event: NotificationEvent = {
      id: "evt-" + crypto.randomUUID().slice(0, 8),
      parentId,
      eventType,
      payloadJson: JSON.stringify(payload),
      dedupeKey,
      createdAt: new Date().toISOString()
    };

    this.data.notificationEvents.unshift(event);
    this.save();
    return event;
  }

  public addNotificationDelivery(delivery: Omit<NotificationDelivery, 'id'>): NotificationDelivery {
    const newDelivery: NotificationDelivery = {
      id: "del-" + crypto.randomUUID().slice(0, 8),
      ...delivery
    };
    this.data.notificationDeliveries.unshift(newDelivery);
    this.save();
    return newDelivery;
  }

  public updateNotificationDeliveryStatus(id: string, updates: Partial<NotificationDelivery>) {
    const index = this.data.notificationDeliveries.findIndex(d => d.id === id);
    if (index !== -1) {
      this.data.notificationDeliveries[index] = {
        ...this.data.notificationDeliveries[index],
        ...updates
      };
      this.save();
    }
  }

  // Logs queries
  public getCompleteDeliveryLogs(): CompleteDeliveryLog[] {
    return this.data.notificationEvents.map(event => {
      const deliveries = this.data.notificationDeliveries.filter(d => d.eventId === event.id);
      return { event, deliveries };
    });
  }

  public clearAllLogs() {
    this.data.notificationEvents = [];
    this.data.notificationDeliveries = [];
    this.data.appNotifications = this.data.appNotifications.filter(n => !n.id.startsWith("test-"));
    this.save();
  }
}

// Global store instance
export const store = new JSONStore();

// ====================================================================
// ORCHESTRATEUR DE NOTIFICATIONS MULTI-CANAUX (SIMULATION BULLMQ)
// ====================================================================
// This background worker processes notification events from our queue
// and executes priorities, consent validation, and channel fallbacks.
export async function triggerMultiChannelNotification(
  parentId: string, 
  title: string, 
  message: string, 
  eventType: 'absence' | 'grade' | 'general' | 'test',
  payload: any,
  dedupeKey: string
) {
  // 1. Create In-App Notification (Always created as baseline record)
  const appNotif = store.addInAppNotification(parentId, title, message, payload.deepLink);

  // 2. Register Notification Event (Audit & Idempotency)
  const event = store.createNotificationEvent(parentId, eventType, payload, dedupeKey);
  if (!event) {
    // Deduplicated, stop processing to avoid spamming
    return { status: 'deduplicated', reason: 'Deduplication key triggered' };
  }

  const prefs = store.getNotificationPreferences(parentId);
  const consents = store.getConsentsOfParent(parentId);
  const parentObj = store.getParentById(parentId);

  if (!parentObj) {
    return { status: 'failed', reason: 'Parent not found' };
  }

  // Helper check: Is consent active for a channel?
  const hasConsent = (channel: 'whatsapp' | 'sms') => {
    const channelConsents = consents.filter(c => c.channel === channel);
    if (channelConsents.length === 0) return false;
    // Sorted by time, last active consent controls
    const last = channelConsents[channelConsents.length - 1];
    return last.consentGranted && !last.revokedAt;
  };

  // Helper check: Is quiet hours active?
  const isQuietHours = () => {
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeInMinutes = currentHours * 60 + currentMinutes;

    const parseTimeToMinutes = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const startMinutes = parseTimeToMinutes(prefs.quietHoursStart);
    const endMinutes = parseTimeToMinutes(prefs.quietHoursEnd);

    if (startMinutes > endMinutes) {
      // Overnight e.g. 22:00 to 07:00
      return currentTimeInMinutes >= startMinutes || currentTimeInMinutes <= endMinutes;
    } else {
      // Normal range e.g. 13:00 to 14:00
      return currentTimeInMinutes >= startMinutes && currentTimeInMinutes <= endMinutes;
    }
  };

  // 3. Initiate Notification Deliveries Queue Sequence
  // Core logic:
  // - Push is Priority 1.
  // - Fallback to WhatsApp if Push is disabled or fails, and user gave WhatsApp consent.
  // - Fallback to SMS if WhatsApp is disabled or fails, and user gave SMS consent.
  // - If quiet hours is active, SMS and WhatsApp might be delayed/blocked, but we will process them as "failed (quiet hours)" or log it.

  console.log(`[NOTIF ORCHESTRATOR] Processing notification for ${parentObj.name} (Event ID: ${event.id})`);

  let pushDelivered = false;
  let whatsappDelivered = false;
  let smsDelivered = false;

  // Track if quiet hours limits delivery
  const isQuiet = isQuietHours();

  // --- CHANNEL 1: PUSH (FCM) ---
  const pushDelivery = store.addNotificationDelivery({
    eventId: event.id,
    channel: 'push',
    provider: 'fcm',
    status: 'queued',
    attempts: 0
  });

  if (prefs.pushEnabled) {
    const devices = store.getDevicesOfParent(parentId);
    store.updateNotificationDeliveryStatus(pushDelivery.id, { attempts: 1 });

    if (devices.length > 0) {
      // Simulating FCM Cloud trigger
      const hasAndroidDevice = devices.some(d => d.platform === 'android');
      
      // Let's mark as delivered!
      store.updateNotificationDeliveryStatus(pushDelivery.id, {
        status: 'delivered',
        providerMessageId: `fcm-msg-${crypto.randomUUID().slice(0, 8)}`,
        sentAt: new Date().toISOString(),
        deliveredAt: new Date().toISOString()
      });
      pushDelivered = true;
      console.log(`[FCM PUSH] Delivered successfully to ${devices.length} registered devices.`);
    } else {
      // No devices registered, Push is "failed" due to no registered devices
      store.updateNotificationDeliveryStatus(pushDelivery.id, {
        status: 'failed',
        errorCode: 'NO_DEVICES_REGISTERED',
        errorMessage: 'Parent registered push but has no active session on device.'
      });
      console.log(`[FCM PUSH] Failed: No devices registered.`);
    }
  } else {
    // Push is disabled by parent
    store.updateNotificationDeliveryStatus(pushDelivery.id, {
      status: 'failed',
      errorCode: 'PUSH_DISABLED',
      errorMessage: 'Push notifications are disabled in parent preferences.'
    });
    console.log(`[FCM PUSH] Skipped: push is disabled by user.`);
  }

  // --- CHANNEL 2: FALLBACK TO WHATSAPP ---
  // Triggered only if Push was not delivered and WhatsApp is preferred/enabled
  if (!pushDelivered) {
    const waDelivery = store.addNotificationDelivery({
      eventId: event.id,
      channel: 'whatsapp',
      provider: 'whatsapp_cloud_api',
      status: 'queued',
      attempts: 0
    });

    if (prefs.whatsappEnabled) {
      store.updateNotificationDeliveryStatus(waDelivery.id, { attempts: 1 });
      
      if (!hasConsent('whatsapp')) {
        store.updateNotificationDeliveryStatus(waDelivery.id, {
          status: 'failed',
          errorCode: 'CONSENT_MISSING',
          errorMessage: 'WhatsApp consent not given or explicitly revoked.'
        });
        console.log(`[WHATSAPP] Failed: No active consent recorded.`);
      } else if (isQuiet) {
        store.updateNotificationDeliveryStatus(waDelivery.id, {
          status: 'failed',
          errorCode: 'QUIET_HOURS_BLOCKED',
          errorMessage: `Delivery blocked by Quiet Hours (${prefs.quietHoursStart} - ${prefs.quietHoursEnd}).`
        });
        console.log(`[WHATSAPP] Blocked: Quiet hours active.`);
      } else {
        // Successful simulation of WhatsApp Cloud Template API
        store.updateNotificationDeliveryStatus(waDelivery.id, {
          status: 'delivered',
          providerMessageId: `wa-msg-${crypto.randomUUID().slice(0, 8)}`,
          sentAt: new Date().toISOString(),
          deliveredAt: new Date().toISOString()
        });
        whatsappDelivered = true;
        console.log(`[WHATSAPP] Template message delivered to ${parentObj.phoneNumber}.`);
      }
    } else {
      store.updateNotificationDeliveryStatus(waDelivery.id, {
        status: 'failed',
        errorCode: 'CHANNEL_DISABLED',
        errorMessage: 'WhatsApp notifications are disabled in parent preferences.'
      });
      console.log(`[WHATSAPP] Skipped: Channel disabled.`);
    }
  }

  // --- CHANNEL 3: FALLBACK TO SMS ---
  // Triggered only if both Push AND WhatsApp failed to deliver, and SMS is preferred/enabled
  if (!pushDelivered && !whatsappDelivered) {
    const smsDelivery = store.addNotificationDelivery({
      eventId: event.id,
      channel: 'sms',
      provider: 'twilio_sms',
      status: 'queued',
      attempts: 0
    });

    if (prefs.smsEnabled) {
      store.updateNotificationDeliveryStatus(smsDelivery.id, { attempts: 1 });
      
      if (!hasConsent('sms')) {
        store.updateNotificationDeliveryStatus(smsDelivery.id, {
          status: 'failed',
          errorCode: 'CONSENT_MISSING',
          errorMessage: 'SMS consent not given or explicitly revoked.'
        });
        console.log(`[SMS] Failed: No active consent recorded.`);
      } else if (isQuiet) {
        store.updateNotificationDeliveryStatus(smsDelivery.id, {
          status: 'failed',
          errorCode: 'QUIET_HOURS_BLOCKED',
          errorMessage: `Delivery blocked by Quiet Hours (${prefs.quietHoursStart} - ${prefs.quietHoursEnd}).`
        });
        console.log(`[SMS] Blocked: Quiet hours active.`);
      } else {
        // Successful simulation of SMS Gateway
        store.updateNotificationDeliveryStatus(smsDelivery.id, {
          status: 'delivered',
          providerMessageId: `sms-msg-${crypto.randomUUID().slice(0, 8)}`,
          sentAt: new Date().toISOString(),
          deliveredAt: new Date().toISOString()
        });
        smsDelivered = true;
        console.log(`[SMS] Delivered SMS to ${parentObj.phoneNumber}.`);
      }
    } else {
      store.updateNotificationDeliveryStatus(smsDelivery.id, {
        status: 'failed',
        errorCode: 'CHANNEL_DISABLED',
        errorMessage: 'SMS notifications are disabled in parent preferences.'
      });
      console.log(`[SMS] Skipped: Channel disabled.`);
    }
  }

  return {
    status: 'processed',
    appNotificationId: appNotif.id,
    eventId: event.id,
    deliverySummary: {
      push: pushDelivered ? 'delivered' : 'skipped_or_failed',
      whatsapp: whatsappDelivered ? 'delivered' : 'skipped_or_failed',
      sms: smsDelivered ? 'delivered' : 'skipped_or_failed'
    }
  };
}
