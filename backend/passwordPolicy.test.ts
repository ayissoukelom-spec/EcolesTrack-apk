import assert from "node:assert/strict";
import test from "node:test";
import { LoginSchema } from "./validators/schemas.js";
import { getNewPasswordPolicyError } from "../src/utils/passwordPolicy.js";

test("accepts all policy-compliant new passwords", () => {
  for (const password of ["Abcd1234", "Ecole2026", "Abcd123!", "A1234567"]) {
    assert.equal(getNewPasswordPolicyError(password), null);
  }
});

test("reports the exact missing requirements for invalid new passwords", () => {
  const cases = [
    ["abcdef12", "Le nouveau mot de passe doit contenir au moins une lettre majuscule."],
    ["Abcdefgh", "Le nouveau mot de passe doit contenir au moins un chiffre."],
    ["Ab123", "Le nouveau mot de passe doit contenir au moins 8 caractères."],
    ["12345678", "Le nouveau mot de passe doit contenir au moins une lettre majuscule."],
    ["abcdefgh", "Le nouveau mot de passe doit contenir au moins une lettre majuscule et au moins un chiffre."],
    ["123456", "Le nouveau mot de passe ne peut pas être le mot de passe temporaire."],
    ["abc", "Le nouveau mot de passe doit contenir au moins 8 caractères, au moins une lettre majuscule et au moins un chiffre."],
  ] as const;

  for (const [password, expectedError] of cases) {
    assert.equal(getNewPasswordPolicyError(password), expectedError);
  }
});

test("the existing APK login schema continues to accept the temporary password", () => {
  assert.equal(LoginSchema.safeParse({ email: "parent@example.test", password: "123456" }).success, true);
  assert.equal(LoginSchema.safeParse({ identifier: "+228 90 12 34 56", password: "123456" }).success, true);
  assert.equal(LoginSchema.safeParse({ identifier: "parent@example.test", password: "123456" }).success, true);
});