import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { withTemporaryUploadCleanup } from "./temporaryUploadCleanup.js";

test("temporary uploads are removed after a successful transfer", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "apk-upload-cleanup-"));
  const uploadDirectory = path.join(root, "uploads");
  await mkdir(uploadDirectory);
  const filePath = path.join(uploadDirectory, "proof.pdf");
  await writeFile(filePath, "temporary content");

  try {
    let transferSawFile = false;
    await withTemporaryUploadCleanup([{ path: filePath }], uploadDirectory, async () => {
      transferSawFile = (await readFile(filePath, "utf8")) === "temporary content";
    });

    assert.equal(transferSawFile, true);
    await assert.rejects(readFile(filePath));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("temporary uploads are removed after transfer errors without masking the error", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "apk-upload-cleanup-"));
  const uploadDirectory = path.join(root, "uploads");
  await mkdir(uploadDirectory);
  const filePath = path.join(uploadDirectory, "proof.pdf");
  await writeFile(filePath, "temporary content");
  const transferError = new Error("web transfer failed");

  try {
    await assert.rejects(
      withTemporaryUploadCleanup([{ path: filePath }], uploadDirectory, async () => {
        throw transferError;
      }),
      (error) => error === transferError,
    );
    await assert.rejects(readFile(filePath));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a cleanup failure does not replace the original transfer error", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "apk-upload-cleanup-"));
  const uploadDirectory = path.join(root, "uploads");
  await mkdir(uploadDirectory);
  const directoryAsUpload = path.join(uploadDirectory, "not-a-file");
  await mkdir(directoryAsUpload);
  const transferError = new Error("web transfer failed");

  try {
    await assert.rejects(
      withTemporaryUploadCleanup([{ path: directoryAsUpload }], uploadDirectory, async () => {
        throw transferError;
      }),
      (error) => error === transferError,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validation exits still clean uploads and never remove files outside the upload directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "apk-upload-cleanup-"));
  const uploadDirectory = path.join(root, "uploads");
  await mkdir(uploadDirectory);
  const uploadedPath = path.join(uploadDirectory, "proof.pdf");
  const externalPath = path.join(root, "user-file.txt");
  await writeFile(uploadedPath, "temporary content");
  await writeFile(externalPath, "keep this file");

  try {
    const invalidResponse = await withTemporaryUploadCleanup(
      [{ path: uploadedPath }, { path: externalPath }],
      uploadDirectory,
      async () => ({ status: 400 }),
    );

    assert.deepEqual(invalidResponse, { status: 400 });
    await assert.rejects(readFile(uploadedPath));
    assert.equal(await readFile(externalPath, "utf8"), "keep this file");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("only one absence justification upload route remains and it relays without writing file_path", async () => {
  const source = await readFile(new URL("../server.ts", import.meta.url), "utf8");
  const routeDeclarations = source.match(/app\.post\("\/api\/absences\/:[^\"]+\/justifications"/g) ?? [];
  assert.equal(routeDeclarations.length, 1);
  assert.match(routeDeclarations[0], /\/absences\/:id\/justifications/);

  const routeStart = source.indexOf(routeDeclarations[0]);
  const routeEnd = source.indexOf("\n// 6. GET", routeStart);
  const routeSource = source.slice(routeStart, routeEnd);
  assert.match(routeSource, /forwardAbsenceJustificationToWeb/);
  assert.match(routeSource, /withTemporaryUploadCleanup/);
  assert.doesNotMatch(routeSource, /INSERT INTO absence_justifications|file_path|uploadedFile\.filename/);
});