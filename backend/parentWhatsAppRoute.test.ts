import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express, { type Request, type RequestHandler } from "express";
import { registerParentWhatsAppRoute } from "./parentWhatsAppRoute.js";

interface ParentRequest extends Request {
  parent?: { id: string; email: string; role: string };
}

interface AdminContact {
  id: number;
  schoolId: number;
  phone: string | null;
}

const ownedChildren = new Map([["71", "101"], ["72", "101"], ["81", "202"]]);
const childSchools = new Map([[71, 1], [72, 1], [81, 2]]);

async function withWhatsAppApi(
  run: (baseUrl: string, calls: Array<{ query: string; params: unknown[] }>) => Promise<void>,
  admins: AdminContact[],
) {
  const app = express();
  const calls: Array<{ query: string; params: unknown[] }> = [];
  const store = {
    isChildOwnedByParent: async (childId: string, parentId: string) => ownedChildren.get(childId) === parentId,
  };
  const database = {
    dbQuery: async <T>(query: string, params: unknown[] = []) => {
      calls.push({ query, params });
      if (query.includes("FROM students")) {
        return { rows: [{ school_id: childSchools.get(Number(params[0])) ?? null }] as T[] };
      }

      const schoolId = Number(params[0]);
      const rows = admins
        .filter((admin) => admin.schoolId === schoolId && admin.phone !== null)
        .sort((left, right) => left.id - right.id)
        .map(({ phone }) => ({ phone })) as T[];
      return { rows };
    },
  };
  const requireAuth: RequestHandler = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentification requise." });
    }
    const parent = authorization === "Bearer parent-101"
      ? { id: "101", email: "parent@example.test", role: "parent" }
      : authorization === "Bearer parent-202"
        ? { id: "202", email: "other@example.test", role: "parent" }
        : null;
    if (!parent) return res.status(401).json({ error: "Session invalide." });
    (req as ParentRequest).parent = parent;
    next();
  };
  const requireParentRoleOnly: RequestHandler = (req, res, next) => (
    (req as ParentRequest).parent?.role === "parent"
      ? next()
      : res.status(403).json({ error: "Parents uniquement." })
  );

  registerParentWhatsAppRoute(app, requireAuth, requireParentRoleOnly, store, database);
  const server: Server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}`, calls);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("returns a WhatsApp URL for an authorized child and a school administrator", async () => {
  await withWhatsAppApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/parent/whatsapp-contact?studentId=71`, {
      headers: { Authorization: "Bearer parent-101" },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      whatsappUrl: `https://wa.me/22890000000?text=${encodeURIComponent("Bonjour, je souhaite contacter l’administration de l’école.")}`,
    });
  }, [{ id: 1, schoolId: 1, phone: "+228 90 00 00 00" }]);
});

test("selects one administrator deterministically and ignores administrators of other schools", async () => {
  await withWhatsAppApi(async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/api/mobile/parent/whatsapp-contact?studentId=71`, {
      headers: { Authorization: "Bearer parent-101" },
    });

    assert.equal(response.status, 200);
    assert.match((await response.json()).whatsappUrl, /^https:\/\/wa\.me\/22890000001\?/);
    const adminQuery = calls.find((call) => call.query.includes("FROM users"));
    assert.deepEqual(adminQuery?.params, [1]);
    assert.match(adminQuery?.query ?? "", /school_id = \$1/);
    assert.match(adminQuery?.query ?? "", /ORDER BY id ASC/);
  }, [
    { id: 9, schoolId: 1, phone: "+22890000009" },
    { id: 2, schoolId: 2, phone: "+22890000002" },
    { id: 1, schoolId: 1, phone: "+22890000001" },
  ]);
});

test("refuses a child that does not belong to the authenticated parent", async () => {
  await withWhatsAppApi(async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/api/mobile/parent/whatsapp-contact?studentId=81`, {
      headers: { Authorization: "Bearer parent-101" },
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Enfant introuvable.", code: "CHILD_NOT_FOUND" });
    assert.equal(calls.length, 0);
  }, [{ id: 1, schoolId: 2, phone: "+22890000002" }]);
});

test("returns a null URL when no school administrator has a usable phone", async () => {
  await withWhatsAppApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/parent/whatsapp-contact?studentId=71`, {
      headers: { Authorization: "Bearer parent-101" },
    });

    assert.deepEqual(await response.json(), { whatsappUrl: null });
  }, [
    { id: 1, schoolId: 1, phone: null },
    { id: 2, schoolId: 1, phone: "not-a-phone" },
    { id: 3, schoolId: 1, phone: "+letters22890000003" },
  ]);
});

test("rejects invalid child identifiers and does not accept client-supplied school or administrator IDs", async () => {
  await withWhatsAppApi(async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/api/mobile/parent/whatsapp-contact?studentId=71&schoolId=2&adminId=303&phone=%2B22890000002`, {
      headers: { Authorization: "Bearer parent-101" },
    });
    assert.equal(response.status, 200);
    assert.match((await response.json()).whatsappUrl, /^https:\/\/wa\.me\/22890000001\?/);
    assert.deepEqual(calls.find((call) => call.query.includes("FROM users"))?.params, [1]);

    const invalidResponse = await fetch(`${baseUrl}/api/mobile/parent/whatsapp-contact?studentId=0`, {
      headers: { Authorization: "Bearer parent-101" },
    });
    assert.equal(invalidResponse.status, 400);
  }, [{ id: 1, schoolId: 1, phone: "+22890000001" }]);
});
