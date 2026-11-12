import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterCompletedGroupedPublicationNotifications,
  getCompletedGroupedPublicationIds,
} from './groupedEvaluationVisibility';

test('keeps grouped notifications until every class-subject evaluation is complete', () => {
  const completePublications = getCompletedGroupedPublicationIds([
    { publicationId: 10, expectedStudentCount: 2, recordedGradeCount: 2 },
    { publicationId: 11, expectedStudentCount: 2, recordedGradeCount: 1 },
    { publicationId: 11, expectedStudentCount: 3, recordedGradeCount: 3 },
    { publicationId: 12, expectedStudentCount: 1, recordedGradeCount: 1 },
  ]);

  assert.deepEqual(completePublications, new Set([10, 12]));
});

test('filters completed publications without hiding individual notifications', () => {
  const notifications = [
    { id: 1, publicationId: 10 },
    { id: 2, publicationId: 11 },
    { id: 3, publicationId: null, evaluationId: 77 },
    { id: 4 },
  ];

  const visible = filterCompletedGroupedPublicationNotifications(
    notifications,
    new Set([10]),
  );

  assert.deepEqual(visible.map(({ id }) => id), [2, 3, 4]);
});
