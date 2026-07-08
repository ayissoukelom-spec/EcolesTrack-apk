var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");

// backend/store.ts
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var crypto = __toESM(require("crypto"), 1);
var DB_PATH = path.join(process.cwd(), "db.json");
var INITIAL_DATABASE = {
  parents: [
    {
      id: "parent-jean-dupont",
      name: "Jean Dupont",
      email: "jean.dupont@email.com",
      phoneNumber: "+33612345678",
      activeSchoolId: "school-pasteur",
      schools: [
        { id: "school-pasteur", name: "Coll\xE8ge Louis Pasteur" },
        { id: "school-moliere", name: "Lyc\xE9e Moli\xE8re" }
      ],
      passwordHash: "parent123",
      // Simple plain or hashed for mockup validation
      role: "parent"
    },
    {
      id: "parent-marie-martin",
      name: "Marie Martin",
      email: "marie.martin@email.com",
      phoneNumber: "+33698765432",
      activeSchoolId: "school-pasteur",
      schools: [
        { id: "school-pasteur", name: "Coll\xE8ge Louis Pasteur" }
      ],
      passwordHash: "parent123",
      role: "parent"
    },
    // Admin & Teacher to demonstrate the 403 Parent-Only protection
    {
      id: "user-admin",
      name: "Directeur Acad\xE9mique",
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
    { id: "school-pasteur", name: "Coll\xE8ge Louis Pasteur", address: "12 Rue des \xC9coles, Paris" },
    { id: "school-moliere", name: "Lyc\xE9e Moli\xE8re", address: "45 Avenue Moli\xE8re, Paris" }
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
      className: "4\xE8me B",
      avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=120"
    },
    {
      id: "child-chloe",
      parentId: "parent-jean-dupont",
      firstName: "Chlo\xE9",
      lastName: "Dupont",
      className: "6\xE8me A",
      avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=120"
    },
    {
      id: "child-theo",
      parentId: "parent-marie-martin",
      firstName: "Th\xE9o",
      lastName: "Martin",
      className: "3\xE8me C",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120"
    }
  ],
  absences: [
    {
      id: "abs-1",
      childId: "child-lucas",
      date: "2026-06-15T08:30:00Z",
      reason: "Gastro-ent\xE9rite aigu\xEB",
      justified: true,
      justificationText: "Certificat m\xE9dical envoy\xE9 le 16/06."
    },
    {
      id: "abs-2",
      childId: "child-lucas",
      date: "2026-07-02T10:00:00Z",
      reason: "Retard injustifi\xE9 cours d'Histoire",
      justified: false
    },
    {
      id: "abs-3",
      childId: "child-chloe",
      date: "2026-06-20T14:00:00Z",
      reason: "Rendez-vous orthodontiste",
      justified: true,
      justificationText: "Mot de passe sign\xE9 des parents fourni en amont."
    },
    {
      id: "abs-4",
      childId: "child-theo",
      date: "2026-06-28T09:00:00Z",
      reason: "Panne de r\xE9veil",
      justified: false
    }
  ],
  grades: [
    {
      id: "grade-1",
      childId: "child-lucas",
      subject: "Math\xE9matiques",
      grade: 15.5,
      coefficient: 2,
      examName: "Contr\xF4le Alg\xE8bre & Fonctions",
      date: "2026-06-10"
    },
    {
      id: "grade-2",
      childId: "child-lucas",
      subject: "Fran\xE7ais",
      grade: 12,
      coefficient: 1,
      examName: "Expression \xE9crite - Commentaire de texte",
      date: "2026-06-14"
    },
    {
      id: "grade-3",
      childId: "child-lucas",
      subject: "Histoire-G\xE9ographie",
      grade: 14,
      coefficient: 1.5,
      examName: "\xC9valuation - La Premi\xE8re Guerre Mondiale",
      date: "2026-06-25"
    },
    {
      id: "grade-4",
      childId: "child-chloe",
      subject: "Math\xE9matiques",
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
      examName: "Vocabulaire & Verbes irr\xE9guliers",
      date: "2026-06-18"
    },
    {
      id: "grade-6",
      childId: "child-chloe",
      subject: "SVT",
      grade: 9.5,
      coefficient: 1,
      examName: "Contr\xF4le - Le syst\xE8me solaire",
      date: "2026-06-27"
    },
    {
      id: "grade-7",
      childId: "child-theo",
      subject: "Math\xE9matiques",
      grade: 11,
      coefficient: 2,
      examName: "Devoir commun - G\xE9om\xE9trie",
      date: "2026-06-20"
    }
  ],
  appNotifications: [
    {
      id: "not-1",
      parentId: "parent-jean-dupont",
      title: "Nouvelle absence signal\xE9e",
      message: "Votre enfant Lucas Dupont a \xE9t\xE9 signal\xE9 absent aujourd'hui \xE0 10:00. Veuillez fournir un justificatif.",
      read: false,
      createdAt: "2026-07-02T10:15:00Z",
      deepLink: "ecoletrack://absences?childId=child-lucas"
    },
    {
      id: "not-2",
      parentId: "parent-jean-dupont",
      title: "Nouvelle note disponible",
      message: "Lucas Dupont a re\xE7u un 14/20 en Histoire-G\xE9ographie (Coeff 1.5).",
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
var JSONStore = class {
  constructor() {
    this.data = { ...INITIAL_DATABASE };
    this.load();
  }
  load() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const fileContent = fs.readFileSync(DB_PATH, "utf-8");
        this.data = JSON.parse(fileContent);
        for (const key of Object.keys(INITIAL_DATABASE)) {
          if (!this.data[key]) {
            this.data[key] = INITIAL_DATABASE[key];
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
  save() {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to save JSON database to disk", e);
    }
  }
  // Parents
  findParentByEmail(email) {
    return this.data.parents.find((p) => p.email.toLowerCase() === email.toLowerCase());
  }
  getParentById(id) {
    return this.data.parents.find((p) => p.id === id);
  }
  // Children
  getChildrenOfParent(parentId) {
    const linkedChildren = this.data.children.filter((c) => c.parentId === parentId);
    if (linkedChildren.length > 0) {
      return linkedChildren;
    }
    const parent = this.getParentById(parentId);
    if (!parent || parent.role !== "parent") {
      return linkedChildren;
    }
    const simulatedChild = {
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
  createSimulatedChildForParent(parentId) {
    const parent = this.getParentById(parentId);
    if (!parent || parent.role !== "parent") {
      return null;
    }
    const simulatedChild = {
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
  isChildOwnedByParent(childId, parentId) {
    const child = this.data.children.find((c) => c.id === childId);
    return child ? child.parentId === parentId : false;
  }
  // Absences
  getAbsencesOfChild(childId) {
    return this.data.absences.filter((a) => a.childId === childId);
  }
  addAbsence(absence) {
    const newAbsence = {
      id: "abs-" + crypto.randomUUID().slice(0, 8),
      ...absence
    };
    this.data.absences.unshift(newAbsence);
    this.save();
    return newAbsence;
  }
  // Grades
  getGradesOfChild(childId) {
    return this.data.grades.filter((g) => g.childId === childId);
  }
  addGrade(grade) {
    const newGrade = {
      id: "grade-" + crypto.randomUUID().slice(0, 8),
      ...grade
    };
    this.data.grades.unshift(newGrade);
    this.save();
    return newGrade;
  }
  // In-App Notifications
  getInAppNotifications(parentId) {
    return this.data.appNotifications.filter((n) => n.parentId === parentId);
  }
  markAllInAppNotificationsAsRead(parentId) {
    this.data.appNotifications = this.data.appNotifications.map((n) => {
      if (n.parentId === parentId) {
        return { ...n, read: true };
      }
      return n;
    });
    this.save();
  }
  addInAppNotification(parentId, title, message, deepLink) {
    const notification = {
      id: "not-" + crypto.randomUUID().slice(0, 8),
      parentId,
      title,
      message,
      read: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      deepLink
    };
    this.data.appNotifications.unshift(notification);
    this.save();
    return notification;
  }
  // Device Tokens
  registerPushToken(parentId, token, platform, appVersion) {
    this.data.parentDevices = this.data.parentDevices.filter((d) => d.pushToken !== token);
    const device = {
      id: "dev-" + crypto.randomUUID().slice(0, 8),
      parentId,
      platform,
      pushToken: token,
      appVersion,
      lastSeenAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.data.parentDevices.push(device);
    this.save();
    return device;
  }
  getDevicesOfParent(parentId) {
    return this.data.parentDevices.filter((d) => d.parentId === parentId);
  }
  // Preferences
  getNotificationPreferences(parentId) {
    let pref = this.data.notificationPreferences.find((p) => p.parentId === parentId);
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
  updateNotificationPreferences(parentId, updates) {
    const index = this.data.notificationPreferences.findIndex((p) => p.parentId === parentId);
    let pref;
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
  getConsentsOfParent(parentId) {
    return this.data.parentConsents.filter((c) => c.parentId === parentId);
  }
  updateConsent(parentId, channel, granted, textVersion) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    this.data.parentConsents = this.data.parentConsents.map((c) => {
      if (c.parentId === parentId && c.channel === channel && !c.revokedAt) {
        return { ...c, revokedAt: timestamp };
      }
      return c;
    });
    const consent = {
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
  createNotificationEvent(parentId, eventType, payload, dedupeKey) {
    const existing = this.data.notificationEvents.find((e) => e.dedupeKey === dedupeKey);
    if (existing) {
      console.log(`[IDEMPOTENCY TRIGGERED] Event with dedupe_key ${dedupeKey} already exists. Skipping insertion.`);
      return null;
    }
    const event = {
      id: "evt-" + crypto.randomUUID().slice(0, 8),
      parentId,
      eventType,
      payloadJson: JSON.stringify(payload),
      dedupeKey,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.data.notificationEvents.unshift(event);
    this.save();
    return event;
  }
  addNotificationDelivery(delivery) {
    const newDelivery = {
      id: "del-" + crypto.randomUUID().slice(0, 8),
      ...delivery
    };
    this.data.notificationDeliveries.unshift(newDelivery);
    this.save();
    return newDelivery;
  }
  updateNotificationDeliveryStatus(id, updates) {
    const index = this.data.notificationDeliveries.findIndex((d) => d.id === id);
    if (index !== -1) {
      this.data.notificationDeliveries[index] = {
        ...this.data.notificationDeliveries[index],
        ...updates
      };
      this.save();
    }
  }
  // Logs queries
  getCompleteDeliveryLogs() {
    return this.data.notificationEvents.map((event) => {
      const deliveries = this.data.notificationDeliveries.filter((d) => d.eventId === event.id);
      return { event, deliveries };
    });
  }
  clearAllLogs() {
    this.data.notificationEvents = [];
    this.data.notificationDeliveries = [];
    this.data.appNotifications = this.data.appNotifications.filter((n) => !n.id.startsWith("test-"));
    this.save();
  }
};
var store = new JSONStore();
async function triggerMultiChannelNotification(parentId, title, message, eventType, payload, dedupeKey) {
  const appNotif = store.addInAppNotification(parentId, title, message, payload.deepLink);
  const event = store.createNotificationEvent(parentId, eventType, payload, dedupeKey);
  if (!event) {
    return { status: "deduplicated", reason: "Deduplication key triggered" };
  }
  const prefs = store.getNotificationPreferences(parentId);
  const consents = store.getConsentsOfParent(parentId);
  const parentObj = store.getParentById(parentId);
  if (!parentObj) {
    return { status: "failed", reason: "Parent not found" };
  }
  const hasConsent = (channel) => {
    const channelConsents = consents.filter((c) => c.channel === channel);
    if (channelConsents.length === 0) return false;
    const last = channelConsents[channelConsents.length - 1];
    return last.consentGranted && !last.revokedAt;
  };
  const isQuietHours = () => {
    const now = /* @__PURE__ */ new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeInMinutes = currentHours * 60 + currentMinutes;
    const parseTimeToMinutes = (timeStr) => {
      const [h, m] = timeStr.split(":").map(Number);
      return h * 60 + m;
    };
    const startMinutes = parseTimeToMinutes(prefs.quietHoursStart);
    const endMinutes = parseTimeToMinutes(prefs.quietHoursEnd);
    if (startMinutes > endMinutes) {
      return currentTimeInMinutes >= startMinutes || currentTimeInMinutes <= endMinutes;
    } else {
      return currentTimeInMinutes >= startMinutes && currentTimeInMinutes <= endMinutes;
    }
  };
  console.log(`[NOTIF ORCHESTRATOR] Processing notification for ${parentObj.name} (Event ID: ${event.id})`);
  let pushDelivered = false;
  let whatsappDelivered = false;
  let smsDelivered = false;
  const isQuiet = isQuietHours();
  const pushDelivery = store.addNotificationDelivery({
    eventId: event.id,
    channel: "push",
    provider: "fcm",
    status: "queued",
    attempts: 0
  });
  if (prefs.pushEnabled) {
    const devices = store.getDevicesOfParent(parentId);
    store.updateNotificationDeliveryStatus(pushDelivery.id, { attempts: 1 });
    if (devices.length > 0) {
      const hasAndroidDevice = devices.some((d) => d.platform === "android");
      store.updateNotificationDeliveryStatus(pushDelivery.id, {
        status: "delivered",
        providerMessageId: `fcm-msg-${crypto.randomUUID().slice(0, 8)}`,
        sentAt: (/* @__PURE__ */ new Date()).toISOString(),
        deliveredAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      pushDelivered = true;
      console.log(`[FCM PUSH] Delivered successfully to ${devices.length} registered devices.`);
    } else {
      store.updateNotificationDeliveryStatus(pushDelivery.id, {
        status: "failed",
        errorCode: "NO_DEVICES_REGISTERED",
        errorMessage: "Parent registered push but has no active session on device."
      });
      console.log(`[FCM PUSH] Failed: No devices registered.`);
    }
  } else {
    store.updateNotificationDeliveryStatus(pushDelivery.id, {
      status: "failed",
      errorCode: "PUSH_DISABLED",
      errorMessage: "Push notifications are disabled in parent preferences."
    });
    console.log(`[FCM PUSH] Skipped: push is disabled by user.`);
  }
  if (!pushDelivered) {
    const waDelivery = store.addNotificationDelivery({
      eventId: event.id,
      channel: "whatsapp",
      provider: "whatsapp_cloud_api",
      status: "queued",
      attempts: 0
    });
    if (prefs.whatsappEnabled) {
      store.updateNotificationDeliveryStatus(waDelivery.id, { attempts: 1 });
      if (!hasConsent("whatsapp")) {
        store.updateNotificationDeliveryStatus(waDelivery.id, {
          status: "failed",
          errorCode: "CONSENT_MISSING",
          errorMessage: "WhatsApp consent not given or explicitly revoked."
        });
        console.log(`[WHATSAPP] Failed: No active consent recorded.`);
      } else if (isQuiet) {
        store.updateNotificationDeliveryStatus(waDelivery.id, {
          status: "failed",
          errorCode: "QUIET_HOURS_BLOCKED",
          errorMessage: `Delivery blocked by Quiet Hours (${prefs.quietHoursStart} - ${prefs.quietHoursEnd}).`
        });
        console.log(`[WHATSAPP] Blocked: Quiet hours active.`);
      } else {
        store.updateNotificationDeliveryStatus(waDelivery.id, {
          status: "delivered",
          providerMessageId: `wa-msg-${crypto.randomUUID().slice(0, 8)}`,
          sentAt: (/* @__PURE__ */ new Date()).toISOString(),
          deliveredAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        whatsappDelivered = true;
        console.log(`[WHATSAPP] Template message delivered to ${parentObj.phoneNumber}.`);
      }
    } else {
      store.updateNotificationDeliveryStatus(waDelivery.id, {
        status: "failed",
        errorCode: "CHANNEL_DISABLED",
        errorMessage: "WhatsApp notifications are disabled in parent preferences."
      });
      console.log(`[WHATSAPP] Skipped: Channel disabled.`);
    }
  }
  if (!pushDelivered && !whatsappDelivered) {
    const smsDelivery = store.addNotificationDelivery({
      eventId: event.id,
      channel: "sms",
      provider: "twilio_sms",
      status: "queued",
      attempts: 0
    });
    if (prefs.smsEnabled) {
      store.updateNotificationDeliveryStatus(smsDelivery.id, { attempts: 1 });
      if (!hasConsent("sms")) {
        store.updateNotificationDeliveryStatus(smsDelivery.id, {
          status: "failed",
          errorCode: "CONSENT_MISSING",
          errorMessage: "SMS consent not given or explicitly revoked."
        });
        console.log(`[SMS] Failed: No active consent recorded.`);
      } else if (isQuiet) {
        store.updateNotificationDeliveryStatus(smsDelivery.id, {
          status: "failed",
          errorCode: "QUIET_HOURS_BLOCKED",
          errorMessage: `Delivery blocked by Quiet Hours (${prefs.quietHoursStart} - ${prefs.quietHoursEnd}).`
        });
        console.log(`[SMS] Blocked: Quiet hours active.`);
      } else {
        store.updateNotificationDeliveryStatus(smsDelivery.id, {
          status: "delivered",
          providerMessageId: `sms-msg-${crypto.randomUUID().slice(0, 8)}`,
          sentAt: (/* @__PURE__ */ new Date()).toISOString(),
          deliveredAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        smsDelivered = true;
        console.log(`[SMS] Delivered SMS to ${parentObj.phoneNumber}.`);
      }
    } else {
      store.updateNotificationDeliveryStatus(smsDelivery.id, {
        status: "failed",
        errorCode: "CHANNEL_DISABLED",
        errorMessage: "SMS notifications are disabled in parent preferences."
      });
      console.log(`[SMS] Skipped: Channel disabled.`);
    }
  }
  return {
    status: "processed",
    appNotificationId: appNotif.id,
    eventId: event.id,
    deliverySummary: {
      push: pushDelivered ? "delivered" : "skipped_or_failed",
      whatsapp: whatsappDelivered ? "delivered" : "skipped_or_failed",
      sms: smsDelivered ? "delivered" : "skipped_or_failed"
    }
  };
}

// backend/utils/logger.ts
var Logger = class {
  constructor(context = "System") {
    this.context = context;
  }
  log(level, message, meta) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const payload = {
      timestamp,
      level,
      context: this.context,
      message,
      ...meta || {}
    };
    if (process.env.NODE_ENV === "production") {
      console.log(JSON.stringify(payload));
    } else {
      const metaStr = meta ? ` | Meta: ${JSON.stringify(meta)}` : "";
      const color = level === "ERROR" ? "\x1B[31m" : level === "WARN" ? "\x1B[33m" : level === "AUDIT" ? "\x1B[36m" : "\x1B[32m";
      const reset = "\x1B[0m";
      console.log(`[${timestamp}] [${color}${level}${reset}] [${this.context}] ${message}${metaStr}`);
    }
  }
  info(message, meta) {
    this.log("INFO", message, meta);
  }
  warn(message, meta) {
    this.log("WARN", message, meta);
  }
  error(message, error, meta) {
    const errMeta = error instanceof Error ? { errorName: error.name, errorMessage: error.message, stack: error.stack } : { error };
    this.log("ERROR", message, { ...errMeta, ...meta });
  }
  audit(action, actor, details, status) {
    this.log("AUDIT", `AUDIT TRIAL: ${action} by ${actor} [${status}]`, {
      audit: { action, actor, details, status }
    });
  }
  debug(message, meta) {
    if (process.env.NODE_ENV !== "production") {
      this.log("DEBUG", message, meta);
    }
  }
};
var logger = new Logger("Global");

// backend/middlewares/security.ts
var logger2 = new Logger("SecurityMiddleware");
function helmetHeaders(req, res, next) {
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' *"
  );
  next();
}
function requestIdMiddleware(req, res, next) {
  const reqId = req.headers["x-request-id"] || `req-${Math.random().toString(36).substring(2, 11)}`;
  req.requestId = reqId;
  res.setHeader("X-Request-ID", reqId);
  next();
}
function sanitizePayload(req, res, next) {
  if (req.body && typeof req.body === "object") {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === "string") {
        req.body[key] = req.body[key].replace(/<[^>]*>/g, "");
      }
    }
  }
  next();
}

// backend/services/auth.ts
var import_crypto = __toESM(require("crypto"), 1);
var logger3 = new Logger("AuthService");
var JWT_SECRET = process.env.JWT_SECRET || "ecoletrack-super-secret-key-2026";
var ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1e3;
var REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1e3;
var tokenBlacklist = /* @__PURE__ */ new Set();
var activeSessions = /* @__PURE__ */ new Map();
var AuthService = class {
  /**
   * Generates a secure JWT-like token
   */
  static generateJWT(payload, secret, durationMs) {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const data = Buffer.from(JSON.stringify({
      ...payload,
      exp: Date.now() + durationMs
    })).toString("base64url");
    const hmac = import_crypto.default.createHmac("sha256", secret);
    hmac.update(`${header}.${data}`);
    const signature = hmac.digest("base64url");
    return `${header}.${data}.${signature}`;
  }
  /**
   * Verifies a JWT token signature and expiration
   */
  static verifyJWT(token, secret = JWT_SECRET) {
    try {
      const [header, data, signature] = token.split(".");
      if (!header || !data || !signature) return null;
      const hmac = import_crypto.default.createHmac("sha256", secret);
      hmac.update(`${header}.${data}`);
      const expectedSignature = hmac.digest("base64url");
      if (signature !== expectedSignature) {
        logger3.warn("JWT Signature verification failed.");
        return null;
      }
      const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8"));
      if (payload.exp < Date.now()) {
        logger3.debug("JWT Token has expired.");
        return null;
      }
      return payload;
    } catch (e) {
      logger3.error("Error verifying JWT token", e);
      return null;
    }
  }
  /**
   * Generates a pair of (Access Token, Refresh Token) for a user session
   */
  static createSession(parentId, role) {
    const accessToken = this.generateJWT({ parentId, role }, JWT_SECRET, ACCESS_TOKEN_EXPIRY_MS);
    const entropy = import_crypto.default.randomBytes(16).toString("hex");
    const refreshToken = this.generateJWT({ parentId, role, entropy }, JWT_SECRET, REFRESH_TOKEN_EXPIRY_MS);
    if (!activeSessions.has(parentId)) {
      activeSessions.set(parentId, /* @__PURE__ */ new Set());
    }
    activeSessions.get(parentId).add(refreshToken);
    logger3.info(`Session created for parent: ${parentId}`);
    return { accessToken, refreshToken };
  }
  /**
   * Rotates a Refresh Token (Refresh Token Rotation - RTR)
   * Prevents replay attacks by invalidating the old Refresh Token and issuing a new pair.
   */
  static rotateSession(oldRefreshToken) {
    const payload = this.verifyJWT(oldRefreshToken);
    if (!payload) {
      logger3.warn("Rotation attempted with invalid or expired Refresh Token.");
      return null;
    }
    const { parentId, role } = payload;
    if (tokenBlacklist.has(oldRefreshToken)) {
      logger3.warn(`[SECURITY ALERT] Replay attack detected! Compromised Refresh Token reused for parent ID: ${parentId}. Revoking all sessions!`);
      this.revokeAllSessions(parentId);
      return null;
    }
    tokenBlacklist.add(oldRefreshToken);
    const parentTokens = activeSessions.get(parentId);
    if (!parentTokens || !parentTokens.has(oldRefreshToken)) {
      logger3.warn(`Refresh Token not found in active session list for parent: ${parentId}`);
      return null;
    }
    parentTokens.delete(oldRefreshToken);
    const newSession = this.createSession(parentId, role);
    return newSession;
  }
  /**
   * Revokes a specific session (Logout)
   */
  static revokeSession(parentId, refreshToken) {
    tokenBlacklist.add(refreshToken);
    const parentTokens = activeSessions.get(parentId);
    if (parentTokens) {
      parentTokens.delete(refreshToken);
    }
    logger3.info(`Session revoked for parent: ${parentId}`);
  }
  /**
   * Revokes all sessions for a user (e.g., when a compromise is detected)
   */
  static revokeAllSessions(parentId) {
    const parentTokens = activeSessions.get(parentId);
    if (parentTokens) {
      parentTokens.forEach((token) => tokenBlacklist.add(token));
      activeSessions.delete(parentId);
    }
    logger3.audit("REVOKE_ALL_SESSIONS", parentId, { parentId }, "SUCCESS");
  }
};

// backend/jobs/queue.ts
var logger4 = new Logger("QueueProcessor");
var activeQueue = [];
var deadLetterQueue = [];
var completedJobIds = /* @__PURE__ */ new Set();
var QueueManager = class {
  /**
   * Add a job to the queue
   */
  static addJob(name, data, options = {}) {
    const priority = options.priority ?? 0;
    const maxAttempts = options.maxAttempts ?? 3;
    const dedupeKey = options.dedupeKey;
    if (dedupeKey && completedJobIds.has(dedupeKey)) {
      logger4.info(`Idempotency hit! Job with dedupeKey '${dedupeKey}' already processed. Skipping duplicate entry.`);
      return `skipped-${dedupeKey}`;
    }
    if (dedupeKey && activeQueue.some((j) => j.dedupeKey === dedupeKey)) {
      logger4.info(`Job with dedupeKey '${dedupeKey}' is already active in queue. Ignoring duplicate entry.`);
      return `queued-${dedupeKey}`;
    }
    const job = {
      id: `job-${Math.random().toString(36).substring(2, 11)}`,
      name,
      data,
      priority,
      attempts: 0,
      maxAttempts,
      createdAt: Date.now(),
      dedupeKey,
      errorHistory: []
    };
    activeQueue.push(job);
    activeQueue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    logger4.info(`Job added to queue: ${name} [ID: ${job.id}]`, { jobId: job.id, priority, dedupeKey });
    this.processNextJob();
    return job.id;
  }
  static {
    /**
     * Process jobs in queue with exponential backoff retries and DLQ routing
     */
    this.isProcessing = false;
  }
  static async processNextJob() {
    if (this.isProcessing || activeQueue.length === 0) return;
    this.isProcessing = true;
    const job = activeQueue.shift();
    logger4.info(`Processing Job: ${job.name} [ID: ${job.id}, Attempt: ${job.attempts + 1}/${job.maxAttempts}]`);
    try {
      job.attempts++;
      await this.executeJobLogic(job);
      if (job.dedupeKey) {
        completedJobIds.add(job.dedupeKey);
      }
      logger4.info(`Job completed successfully: ${job.name} [ID: ${job.id}]`);
    } catch (err) {
      const errorMessage = err?.message || String(err);
      job.errorHistory.push({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: errorMessage
      });
      logger4.error(`Job execution failed: ${job.name} [ID: ${job.id}]`, err);
      if (job.attempts < job.maxAttempts) {
        const delay = Math.pow(2, job.attempts) * 100;
        logger4.warn(`Scheduling retry for job: ${job.id} in ${delay}ms...`);
        setTimeout(() => {
          activeQueue.push(job);
          activeQueue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
          this.processNextJob();
        }, delay);
      } else {
        logger4.error(`Job failed maximum attempts: ${job.name} [ID: ${job.id}]. Moving to DLQ.`);
        deadLetterQueue.push(job);
        logger4.audit("JOB_DLQ_ROUTED", "QueueProcessor", { jobId: job.id, jobName: job.name, errors: job.errorHistory }, "FAILURE");
      }
    } finally {
      this.isProcessing = false;
      this.processNextJob();
    }
  }
  /**
   * Logic execution based on job type
   */
  static async executeJobLogic(job) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (job.name === "test-failure-simulation") {
      throw new Error("Network timeout: FCM Gateway failed to respond (Simulated Error).");
    }
  }
  static getDLQ() {
    return deadLetterQueue;
  }
  static clearDLQ() {
    deadLetterQueue.length = 0;
  }
};

// backend/services/notification.ts
var logger5 = new Logger("NotificationService");
var NotificationService = class {
  /**
   * Orchestrates multi-channel delivery based on parent consents and quiet hours
   */
  static async dispatchNotification(parentId, title, message, category, metadata = {}, dedupeKey) {
    logger5.info(`Orchestrating notification for Parent ID: ${parentId}`, { category, dedupeKey });
    const preferences = store.getNotificationPreferences(parentId);
    const consents = store.getConsentsOfParent(parentId);
    const isPushAuthorized = preferences.pushEnabled;
    const isSmsAuthorized = preferences.smsEnabled && consents.some((c) => c.channel === "sms" && c.granted);
    const isWhatsappAuthorized = preferences.whatsappEnabled && consents.some((c) => c.channel === "whatsapp" && c.granted);
    if (this.isWithinQuietHours(preferences.quietHoursStart, preferences.quietHoursEnd)) {
      logger5.info(`Quiet Hours active for parent ${parentId}. Scheduling notification with lower priority or buffering.`);
      metadata.quietHoursApplied = true;
    }
    const channelsToDeliver = [];
    if (isPushAuthorized) channelsToDeliver.push("push");
    if (isWhatsappAuthorized) channelsToDeliver.push("whatsapp");
    if (isSmsAuthorized) channelsToDeliver.push("sms");
    if (channelsToDeliver.length === 0) {
      logger5.warn(`No authorized notification channels for parent: ${parentId}. Fallback to in-app notification only.`);
      channelsToDeliver.push("push");
    }
    const jobsTriggered = [];
    for (const channel of channelsToDeliver) {
      const priority = category === "absence" ? 10 : 5;
      const jobName = `send-notification-${channel}`;
      const jobDedupeKey = dedupeKey ? `${dedupeKey}-${channel}` : void 0;
      const jobId = QueueManager.addJob(jobName, {
        parentId,
        channel,
        title,
        message,
        category,
        metadata
      }, {
        priority,
        dedupeKey: jobDedupeKey,
        maxAttempts: 3
      });
      jobsTriggered.push(jobId);
    }
    const legacyResult = await store.triggerMultiChannelNotification(
      parentId,
      title,
      message,
      category,
      metadata,
      dedupeKey
    );
    return {
      success: true,
      channels: channelsToDeliver,
      jobs: jobsTriggered,
      legacyResult
    };
  }
  /**
   * Checks if current time is within quiet hours (format 'HH:MM')
   */
  static isWithinQuietHours(start, end) {
    if (!start || !end) return false;
    try {
      const now = /* @__PURE__ */ new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = start.split(":").map(Number);
      const [endH, endM] = end.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      if (startMinutes < endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      } else {
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
      }
    } catch (e) {
      logger5.error("Failed to parse quiet hours, skipping window validation", e);
      return false;
    }
  }
};

// backend/validators/schemas.ts
var import_zod = require("zod");
var LoginSchema = import_zod.z.object({
  email: import_zod.z.string().email({ message: "Format d'email invalide." }),
  password: import_zod.z.string().min(4, { message: "Le mot de passe doit contenir au moins 4 caract\xE8res." })
});
var RegisterPushTokenSchema = import_zod.z.object({
  pushToken: import_zod.z.string().min(10, { message: "Le token push est trop court." }),
  platform: import_zod.z.enum(["android", "ios"], { message: "Plateforme invalide (android ou ios uniquement)." }),
  appVersion: import_zod.z.string().min(1, { message: "La version de l'application est requise." })
});
var NotificationPreferencesSchema = import_zod.z.object({
  pushEnabled: import_zod.z.boolean().optional(),
  whatsappEnabled: import_zod.z.boolean().optional(),
  smsEnabled: import_zod.z.boolean().optional(),
  quietHoursStart: import_zod.z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: "Format d'heure invalide (HH:MM)." }).nullable().optional(),
  quietHoursEnd: import_zod.z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: "Format d'heure invalide (HH:MM)." }).nullable().optional(),
  whatsappConsent: import_zod.z.boolean().optional(),
  smsConsent: import_zod.z.boolean().optional()
});
var TestNotificationSchema = import_zod.z.object({
  title: import_zod.z.string().min(1, { message: "Le titre est requis." }),
  message: import_zod.z.string().min(1, { message: "Le message est requis." })
});
var DevAddAbsenceSchema = import_zod.z.object({
  childId: import_zod.z.string().min(1),
  date: import_zod.z.string().optional(),
  reason: import_zod.z.string().min(2),
  justified: import_zod.z.boolean().optional(),
  justificationText: import_zod.z.string().optional()
});
var DevAddGradeSchema = import_zod.z.object({
  childId: import_zod.z.string().min(1),
  subject: import_zod.z.string().min(1),
  grade: import_zod.z.number().min(0).max(20),
  coefficient: import_zod.z.number().positive().optional(),
  examName: import_zod.z.string().min(1),
  date: import_zod.z.string().optional()
});

// server.ts
var logger6 = new Logger("ExpressServer");
var app = (0, import_express.default)();
var PORT = Number(process.env.PORT) || 3001;
app.use(import_express.default.json());
app.use(helmetHeaders);
app.use(requestIdMiddleware);
app.use(sanitizePayload);
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
function verifyToken(token) {
  return AuthService.verifyJWT(token);
}
var rateLimitMap = /* @__PURE__ */ new Map();
function rateLimit(limit, windowMs) {
  return (req, res, next) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "global";
    const now = Date.now();
    const clientLimit = rateLimitMap.get(ip);
    if (!clientLimit || now > clientLimit.resetTime) {
      rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }
    clientLimit.count++;
    if (clientLimit.count > limit) {
      return res.status(429).json({
        error: "Trop de requ\xEAtes. Veuillez patienter avant de r\xE9essayer.",
        code: "TOO_MANY_REQUESTS",
        details: { resetInSeconds: Math.ceil((clientLimit.resetTime - now) / 1e3) }
      });
    }
    next();
  };
}
var requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentification requise. Jeton de session manquant.",
      code: "UNAUTHORIZED"
    });
  }
  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      error: "Session invalide ou expir\xE9e. Veuillez vous reconnecter.",
      code: "INVALID_SESSION"
    });
  }
  req.parent = {
    id: decoded.parentId,
    email: "",
    // Loaded dynamically if needed
    role: decoded.role
  };
  next();
};
var requireParentRoleOnly = (req, res, next) => {
  if (!req.parent || req.parent.role !== "parent") {
    console.warn(`[SECURITY VIOLATION] Attempted access with non-parent role: ${req.parent?.role || "none"} on URL: ${req.originalUrl}`);
    return res.status(403).json({
      error: "Acc\xE8s refus\xE9. Cette application est strictement r\xE9serv\xE9e aux parents d'\xE9l\xE8ves.",
      code: "PARENTS_ONLY"
    });
  }
  next();
};
app.post("/api/mobile/parent/login", rateLimit(15, 6e4), (req, res) => {
  const validation = LoginSchema.safeParse(req.body);
  if (!validation.success) {
    logger6.warn("\xC9chec de la validation Zod sur la route d'authentification.");
    return res.status(400).json({
      error: "Donn\xE9es de connexion invalides.",
      code: "BAD_REQUEST",
      details: validation.error.format()
    });
  }
  const { email, password } = validation.data;
  const user = store.findParentByEmail(email);
  if (!user) {
    logger6.warn(`Tentative de connexion infructueuse (utilisateur inconnu): ${email}`);
    return res.status(401).json({
      error: "Identifiants de connexion incorrects.",
      code: "BAD_CREDENTIALS"
    });
  }
  if (user.passwordHash !== password) {
    logger6.warn(`Mot de passe incorrect pour le compte parent: ${email}`);
    return res.status(401).json({
      error: "Identifiants de connexion incorrects.",
      code: "BAD_CREDENTIALS"
    });
  }
  if (user.role !== "parent") {
    logger6.audit("NON_PARENT_LOGIN_REJECT", user.id, { email, role: user.role }, "FAILURE");
    return res.status(403).json({
      error: "Acc\xE8s mobile r\xE9serv\xE9 aux parents.",
      code: "PARENTS_ONLY",
      details: { role: user.role }
    });
  }
  const session = AuthService.createSession(user.id, user.role);
  const parentDetails = {
    id: user.id,
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber,
    activeSchoolId: user.activeSchoolId,
    schools: user.schools
  };
  logger6.audit("PARENT_LOGIN_SUCCESS", user.id, { email }, "SUCCESS");
  return res.json({
    parent: parentDetails,
    token: session.accessToken,
    refreshToken: session.refreshToken
  });
});
app.post("/api/mobile/parent/refresh-token", (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({
      error: "Refresh token manquant.",
      code: "BAD_REQUEST"
    });
  }
  const newSession = AuthService.rotateSession(refreshToken);
  if (!newSession) {
    logger6.warn("\xC9chec de rotation du Jeton de Rafra\xEEchissement. Token expir\xE9, compromis ou invalide.");
    return res.status(401).json({
      error: "Session invalide ou expir\xE9e. Veuillez vous reconnecter.",
      code: "INVALID_SESSION"
    });
  }
  logger6.info("Rotation du jeton de session effectu\xE9e avec succ\xE8s.");
  return res.json(newSession);
});
app.post("/api/mobile/parent/logout", requireAuth, requireParentRoleOnly, (req, res) => {
  const parentId = req.parent.id;
  const { refreshToken } = req.body;
  if (refreshToken) {
    AuthService.revokeSession(parentId, refreshToken);
  } else {
    AuthService.revokeAllSessions(parentId);
  }
  logger6.audit("PARENT_LOGOUT", parentId, { parentId }, "SUCCESS");
  return res.json({
    success: true,
    message: "D\xE9connexion r\xE9ussie avec succ\xE8s."
  });
});
app.get("/api/mobile/parent/me", requireAuth, requireParentRoleOnly, (req, res) => {
  const parentId = req.parent.id;
  const parent = store.getParentById(parentId);
  if (!parent) {
    return res.status(404).json({
      error: "Parent introuvable.",
      code: "NOT_FOUND"
    });
  }
  const parentDetails = {
    id: parent.id,
    name: parent.name,
    email: parent.email,
    phoneNumber: parent.phoneNumber,
    activeSchoolId: parent.activeSchoolId,
    schools: parent.schools
  };
  return res.json(parentDetails);
});
app.get("/api/mobile/parent/children", requireAuth, requireParentRoleOnly, (req, res) => {
  const parentId = req.parent.id;
  const children = store.getChildrenOfParent(parentId);
  return res.json(children);
});
app.post("/api/mobile/parent/children/simulate", requireAuth, requireParentRoleOnly, (req, res) => {
  const parentId = req.parent.id;
  const child = store.createSimulatedChildForParent(parentId);
  if (!child) {
    return res.status(400).json({
      error: "Impossible de simuler un enfant pour ce compte.",
      code: "SIMULATION_FAILED"
    });
  }
  return res.status(201).json(child);
});
app.get("/api/mobile/parent/children/:childId/absences", requireAuth, requireParentRoleOnly, (req, res) => {
  const { childId } = req.params;
  const parentId = req.parent.id;
  if (!store.isChildOwnedByParent(childId, parentId)) {
    return res.status(403).json({
      error: "Acc\xE8s refus\xE9. Cet enfant ne vous est pas rattach\xE9.",
      code: "CHILD_OWNERSHIP_VIOLATION"
    });
  }
  const absences = store.getAbsencesOfChild(childId);
  return res.json(absences);
});
app.get("/api/mobile/parent/children/:childId/grades", requireAuth, requireParentRoleOnly, (req, res) => {
  const { childId } = req.params;
  const parentId = req.parent.id;
  if (!store.isChildOwnedByParent(childId, parentId)) {
    return res.status(403).json({
      error: "Acc\xE8s refus\xE9. Cet enfant ne vous est pas rattach\xE9.",
      code: "CHILD_OWNERSHIP_VIOLATION"
    });
  }
  const grades = store.getGradesOfChild(childId);
  return res.json(grades);
});
app.get("/api/mobile/parent/notifications", requireAuth, requireParentRoleOnly, (req, res) => {
  const parentId = req.parent.id;
  const notifications = store.getInAppNotifications(parentId);
  return res.json(notifications);
});
app.put("/api/mobile/parent/notifications/read-all", requireAuth, requireParentRoleOnly, (req, res) => {
  const parentId = req.parent.id;
  store.markAllInAppNotificationsAsRead(parentId);
  return res.json({ success: true, message: "Toutes les notifications ont \xE9t\xE9 marqu\xE9es comme lues." });
});
app.post("/api/mobile/parent/devices/register-push-token", requireAuth, requireParentRoleOnly, (req, res) => {
  const parentId = req.parent.id;
  const validation = RegisterPushTokenSchema.safeParse(req.body);
  if (!validation.success) {
    logger6.warn(`\xC9chec de validation de l'enregistrement de token pour le parent: ${parentId}`);
    return res.status(400).json({
      error: "Param\xE8tres de notification invalides.",
      code: "BAD_REQUEST",
      details: validation.error.format()
    });
  }
  const { pushToken, platform, appVersion } = validation.data;
  const device = store.registerPushToken(parentId, pushToken, platform, appVersion);
  logger6.audit("REGISTER_PUSH_TOKEN", parentId, { platform, appVersion }, "SUCCESS");
  return res.json({
    success: true,
    message: "Token de notification enregistr\xE9.",
    device
  });
});
app.get("/api/mobile/parent/notification-preferences", requireAuth, requireParentRoleOnly, (req, res) => {
  const parentId = req.parent.id;
  const preferences = store.getNotificationPreferences(parentId);
  const consents = store.getConsentsOfParent(parentId);
  return res.json({
    preferences,
    consents
  });
});
app.put("/api/mobile/parent/notification-preferences", requireAuth, requireParentRoleOnly, (req, res) => {
  const parentId = req.parent.id;
  const validation = NotificationPreferencesSchema.safeParse(req.body);
  if (!validation.success) {
    logger6.warn(`\xC9chec de la validation de pr\xE9f\xE9rences pour le parent: ${parentId}`);
    return res.status(400).json({
      error: "Param\xE8tres de pr\xE9f\xE9rences invalides.",
      code: "BAD_REQUEST",
      details: validation.error.format()
    });
  }
  const { pushEnabled, whatsappEnabled, smsEnabled, quietHoursStart, quietHoursEnd, whatsappConsent, smsConsent } = validation.data;
  if (whatsappConsent !== void 0) {
    store.updateConsent(parentId, "whatsapp", whatsappConsent, "v1.0-fr");
  }
  if (smsConsent !== void 0) {
    store.updateConsent(parentId, "sms", smsConsent, "v1.0-fr");
  }
  const updatedPref = store.updateNotificationPreferences(parentId, {
    pushEnabled,
    whatsappEnabled,
    smsEnabled,
    quietHoursStart,
    quietHoursEnd
  });
  logger6.audit("UPDATE_PREFERENCES", parentId, { pushEnabled, whatsappEnabled, smsEnabled }, "SUCCESS");
  return res.json({
    success: true,
    message: "Pr\xE9f\xE9rences de notification mises \xE0 jour.",
    preferences: updatedPref,
    consents: store.getConsentsOfParent(parentId)
  });
});
app.post("/api/mobile/parent/notifications/test", requireAuth, requireParentRoleOnly, async (req, res) => {
  const parentId = req.parent.id;
  const validation = TestNotificationSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: "Veuillez fournir un titre et un corps de message valides.",
      code: "BAD_REQUEST",
      details: validation.error.format()
    });
  }
  const { title, message } = validation.data;
  const dedupeKey = `test-${parentId}-${Date.now()}`;
  const result = await NotificationService.dispatchNotification(
    parentId,
    title,
    message,
    "test",
    { deepLink: "ecoletrack://dashboard" },
    dedupeKey
  );
  logger6.audit("TEST_NOTIFICATION_DISPATCH", parentId, { title }, "SUCCESS");
  return res.json({
    success: true,
    message: "Test de notification multi-canal envoy\xE9 \xE0 la file d'attente.",
    result
  });
});
app.get("/api/mobile/health", (req, res) => {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: now,
    database: "connected",
    services: {
      fcm: "active",
      whatsapp_cloud_api: "active",
      sms_gateway: "active"
    }
  });
});
app.post("/api/dev/add-absence", (req, res) => {
  const { childId, date, reason, justified, justificationText } = req.body;
  if (!childId || !reason) {
    return res.status(400).json({ error: "childId and reason required" });
  }
  const absence = store.addAbsence({
    childId,
    date: date || (/* @__PURE__ */ new Date()).toISOString(),
    reason,
    justified: !!justified,
    justificationText
  });
  const children = store.getChildrenOfParent("parent-jean-dupont");
  const child = children.find((c) => c.id === childId) || store.getChildrenOfParent("parent-marie-martin").find((c) => c.id === childId);
  if (child) {
    const parentId = child.parentId;
    const dedupeKey = `absence-${child.id}-${Date.now()}`;
    const name = `${child.firstName} ${child.lastName}`;
    triggerMultiChannelNotification(
      parentId,
      "Alerte Absence \xC9coleTrack",
      `Absence enregistr\xE9e pour ${name} le ${new Date(date).toLocaleDateString("fr-FR")}. Motif : ${reason}`,
      "absence",
      { childId, childName: name, date, reason },
      dedupeKey
    );
  }
  return res.json({ success: true, absence });
});
app.post("/api/dev/add-grade", (req, res) => {
  const { childId, subject, grade, coefficient, examName, date } = req.body;
  if (!childId || !subject || grade === void 0 || !examName) {
    return res.status(400).json({ error: "Missing required grade properties" });
  }
  const gradeObj = store.addGrade({
    childId,
    subject,
    grade: parseFloat(grade),
    coefficient: coefficient ? parseFloat(coefficient) : 1,
    examName,
    date: date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
  });
  const children = store.getChildrenOfParent("parent-jean-dupont");
  const child = children.find((c) => c.id === childId) || store.getChildrenOfParent("parent-marie-martin").find((c) => c.id === childId);
  if (child) {
    const parentId = child.parentId;
    const dedupeKey = `grade-${child.id}-${Date.now()}`;
    const name = `${child.firstName} ${child.lastName}`;
    triggerMultiChannelNotification(
      parentId,
      "Nouvelle note disponible",
      `${name} a re\xE7u un ${grade}/20 en ${subject} (${examName}).`,
      "grade",
      { childId, childName: name, subject, grade, examName },
      dedupeKey
    );
  }
  return res.json({ success: true, grade: gradeObj });
});
app.get("/api/dev/delivery-logs", (req, res) => {
  const logs = store.getCompleteDeliveryLogs();
  return res.json(logs);
});
app.post("/api/dev/clear-logs", (req, res) => {
  store.clearAllLogs();
  return res.json({ success: true });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[\xC9coleTrack Server] Running on http://localhost:${PORT}`);
  });
}
startServer();
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
//# sourceMappingURL=server.cjs.map
