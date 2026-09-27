import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express, { type Request, type RequestHandler } from "express";
import { registerChildPhotoRoutes } from "./mobilePhotoRoutes.js";

interface ParentRequest extends Request {
  parent?: { id: string; email: string; role: string };
}

interface StoredPhoto {
  photoData: Buffer;
  mimeType: string;
}

const ownedChildren = new Map([["12", "101"], ["22", "202"]]);

async function withPhotoApi(run: (baseUrl: string, photos: Map<string, StoredPhoto>) => Promise<void>) {
  const app = express();
  const photos = new Map<string, StoredPhoto>();
  const store = {
    isChildOwnedByParent: async (childId: string, parentId: string) => ownedChildren.get(childId) === parentId,
    saveChildPhoto: async (childId: string, photoData: Buffer, mimeType: string) => {
      photos.set(childId, { photoData: Buffer.from(photoData), mimeType });
    },
    getChildPhoto: async (childId: string) => photos.get(childId) ?? null,
  };
  const requireAuth: RequestHandler = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentification requise.", code: "UNAUTHORIZED" });
    }

    const token = authorization.slice("Bearer ".length);
    const parent = token === "parent-a"
      ? { id: "101", email: "a@example.test", role: "parent" }
      : token === "parent-b"
        ? { id: "202", email: "b@example.test", role: "parent" }
        : token === "school-admin"
          ? { id: "303", email: "admin@example.test", role: "school_admin" }
          : null;
    if (!parent) {
      return res.status(401).json({ error: "Session invalide.", code: "INVALID_SESSION" });
    }

    (req as ParentRequest).parent = parent;
    next();
  };
  const requireParentRoleOnly: RequestHandler = (req, res, next) => {
    if ((req as ParentRequest).parent?.role !== "parent") {
      return res.status(403).json({ error: "Parents uniquement.", code: "PARENTS_ONLY" });
    }
    next();
  };

  registerChildPhotoRoutes(app, requireAuth, requireParentRoleOnly, store);
  app.use((_req, res) => res.status(200).type("html").send("<!doctype html><title>SPA fallback</title>"));

  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}`, photos);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function photoForm(bytes: Uint8Array, mimeType: string, filename = "photo") {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), filename);
  return form;
}

const sampleBytes = Uint8Array.from([0, 1, 2, 3, 254, 255]);

test("POST saves a non-empty JPEG for an authenticated parent-owned child", async () => {
  await withPhotoApi(async (baseUrl, photos) => {
    const response = await fetch(`${baseUrl}/api/mobile/parent/children/12/photo`, {
      method: "POST",
      headers: { Authorization: "Bearer parent-a" },
      body: photoForm(sampleBytes, "image/jpeg", "child.jpg"),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(photos.get("12"), { photoData: Buffer.from(sampleBytes), mimeType: "image/jpeg" });
  });
});

test("POST rejects a missing or empty photo", async () => {
  await withPhotoApi(async (baseUrl) => {
    const missingForm = new FormData();
    const missingResponse = await fetch(`${baseUrl}/api/mobile/parent/children/12/photo`, {
      method: "POST",
      headers: { Authorization: "Bearer parent-a" },
      body: missingForm,
    });
    assert.equal(missingResponse.status, 400);
    assert.equal((await missingResponse.json()).code, "CHILD_PHOTO_REQUIRED");

    const emptyResponse = await fetch(`${baseUrl}/api/mobile/parent/children/12/photo`, {
      method: "POST",
      headers: { Authorization: "Bearer parent-a" },
      body: photoForm(new Uint8Array(), "image/png", "empty.png"),
    });
    assert.equal(emptyResponse.status, 400);
    assert.equal((await emptyResponse.json()).code, "CHILD_PHOTO_REQUIRED");
  });
});

test("POST rejects non-image files and unexpected multipart fields", async () => {
  await withPhotoApi(async (baseUrl) => {
    const nonImageResponse = await fetch(`${baseUrl}/api/mobile/parent/children/12/photo`, {
      method: "POST",
      headers: { Authorization: "Bearer parent-a" },
      body: photoForm(sampleBytes, "text/plain", "notes.txt"),
    });
    assert.equal(nonImageResponse.status, 400);
    assert.equal((await nonImageResponse.json()).code, "CHILD_PHOTO_UPLOAD_INVALID");

    const wrongFieldForm = new FormData();
    wrongFieldForm.append("image", new Blob([sampleBytes], { type: "image/png" }), "wrong-field.png");
    const wrongFieldResponse = await fetch(`${baseUrl}/api/mobile/parent/children/12/photo`, {
      method: "POST",
      headers: { Authorization: "Bearer parent-a" },
      body: wrongFieldForm,
    });
    assert.equal(wrongFieldResponse.status, 400);
    assert.equal((await wrongFieldResponse.json()).code, "CHILD_PHOTO_UPLOAD_INVALID");
  });
});

test("POST accepts JPEG, PNG, and WebP without changing other upload rules", async () => {
  await withPhotoApi(async (baseUrl, photos) => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
      const response = await fetch(`${baseUrl}/api/mobile/parent/children/12/photo`, {
        method: "POST",
        headers: { Authorization: "Bearer parent-a" },
        body: photoForm(sampleBytes, mimeType),
      });

      assert.equal(response.status, 200, mimeType);
      assert.deepEqual(await response.json(), { success: true });
      assert.equal(photos.get("12")?.mimeType, mimeType);
    }
  });
});

test("POST and GET deny a parent access to another parent's child", async () => {
  await withPhotoApi(async (baseUrl) => {
    const postResponse = await fetch(`${baseUrl}/api/mobile/parent/children/22/photo`, {
      method: "POST",
      headers: { Authorization: "Bearer parent-a" },
      body: photoForm(sampleBytes, "image/jpeg"),
    });
    assert.equal(postResponse.status, 403);
    assert.equal((await postResponse.json()).code, "CHILD_OWNERSHIP_VIOLATION");

    const getResponse = await fetch(`${baseUrl}/api/mobile/parent/children/22/photo`, {
      headers: { Authorization: "Bearer parent-a" },
    });
    assert.equal(getResponse.status, 403);
    assert.equal((await getResponse.json()).code, "CHILD_OWNERSHIP_VIOLATION");
  });
});

test("GET returns the stored image bytes and matching MIME type", async () => {
  await withPhotoApi(async (baseUrl, photos) => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
      photos.set("12", { photoData: Buffer.from(sampleBytes), mimeType });
      const response = await fetch(`${baseUrl}/api/mobile/parent/children/12/photo`, {
        headers: { Authorization: "Bearer parent-a" },
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), mimeType);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(sampleBytes));
    }
  });
});

test("GET without a stored photo returns JSON 404 instead of the HTML fallback", async () => {
  await withPhotoApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/parent/children/12/photo`, {
      headers: { Authorization: "Bearer parent-a" },
    });

    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
    assert.equal((await response.json()).code, "CHILD_PHOTO_NOT_FOUND");
  });
});

test("photo routes keep the existing authentication and parent-role middleware", async () => {
  await withPhotoApi(async (baseUrl) => {
    const noAuthResponse = await fetch(`${baseUrl}/api/mobile/parent/children/12/photo`);
    assert.equal(noAuthResponse.status, 401);

    const nonParentResponse = await fetch(`${baseUrl}/api/mobile/parent/children/12/photo`, {
      headers: { Authorization: "Bearer school-admin" },
    });
    assert.equal(nonParentResponse.status, 403);
  });
});