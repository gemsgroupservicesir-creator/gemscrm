export function normalizeAssignmentValue(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function matchLeadAssignmentRule(rules, lead, allowedCounselorIds) {
  const course = normalizeAssignmentValue(lead?.course || lead?.faculty);
  const university = normalizeAssignmentValue(lead?.university);
  const allowed = allowedCounselorIds ? new Set(allowedCounselorIds) : null;
  const matches = (Array.isArray(rules) ? rules : [])
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => {
      const counselorId = String(rule?.counselorId || '');
      if (!counselorId || (allowed && !allowed.has(counselorId))) return false;
      const ruleCourse = normalizeAssignmentValue(rule.course);
      const ruleUniversity = normalizeAssignmentValue(rule.university);
      return (!ruleCourse || ruleCourse === course) && (!ruleUniversity || ruleUniversity === university);
    })
    .sort((left, right) => {
      const leftSpecificity = Number(Boolean(left.rule.course)) + Number(Boolean(left.rule.university));
      const rightSpecificity = Number(Boolean(right.rule.course)) + Number(Boolean(right.rule.university));
      return rightSpecificity - leftSpecificity || left.index - right.index;
    });
  return String(matches[0]?.rule?.counselorId || '');
}
