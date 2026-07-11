import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWebParentToMobileParent, mapWebStudentToChild } from './mobileAdapter.js';

test('maps the web parent profile to the mobile parent shape', () => {
  const result = mapWebParentToMobileParent({
    userId: 42,
    userEmail: 'parent@example.com',
    userName: 'Mina Parent',
    userPhone: '+33123456789',
    activeSchoolId: 7,
    schoolMemberships: [{ id: 7, name: 'Collège A' }],
    role: 'parent',
  });

  assert.equal(result.id, '42');
  assert.equal(result.email, 'parent@example.com');
  assert.equal(result.name, 'Mina Parent');
  assert.equal(result.phoneNumber, '+33123456789');
  assert.equal(result.activeSchoolId, '7');
  assert.deepEqual(result.schools, [{ id: '7', name: 'Collège A' }]);
});

test('maps the web student row to the mobile child shape', () => {
  const result = mapWebStudentToChild({
    id: 12,
    firstName: 'Lina',
    lastName: 'Parent',
    birthDate: '2014-09-01',
    schoolId: 7,
    classId: 3,
    className: '6ème A',
    parentId: 42,
  });

  assert.equal(result.id, '12');
  assert.equal(result.parentId, '42');
  assert.equal(result.firstName, 'Lina');
  assert.equal(result.lastName, 'Parent');
  assert.equal(result.className, '6ème A');
  assert.equal(result.birthDate, '2014-09-01');
  assert.equal(result.avatarUrl, '');
});
