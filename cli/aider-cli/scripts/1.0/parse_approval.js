'use strict';
module.exports = function parseApproval(input) {
    const { tail, screenText } = input;
    const source = (screenText || '').trim() || (tail || '').trim();
    if (!source) return null;

    // Check for aider approval patterns
    const hasYN = /\(Y\)es\/\(N\)o/i.test(source);
    const hasAllowCreation = /Allow\s+creation/i.test(source);
    const hasRunShell = /Run\s+shell\s+command/i.test(source);
    const hasApplyEdit = /Apply\s+(edit|change)/i.test(source);
    const hasAddFile = /Add\s+.+\s+to\s+the\s+chat/i.test(source);

    if (!hasYN && !hasAllowCreation && !hasRunShell && !hasApplyEdit && !hasAddFile) return null;

    // Extract the meaningful approval message from the screen
    const lines = source.split('\n')
        .map(l => l.replace(/\r/g, '').trim())
        .filter(l => l.length > 2);

    // Find the line(s) containing the approval question
    const approvalLines = lines.filter(l =>
        /\(Y\)es\/\(N\)o/i.test(l) ||
        /Allow\s+creation/i.test(l) ||
        /Run\s+shell\s+command/i.test(l) ||
        /Apply\s+(edit|change)/i.test(l) ||
        /Add\s+.+\s+to\s+the\s+chat/i.test(l)
    );

    const message = approvalLines.length > 0
        ? approvalLines.join(' ').slice(0, 300)
        : lines.slice(-3).join(' ').slice(0, 300) || 'Approval required';

    // Determine buttons based on context
    // Most aider approvals are (Y)es/(N)o but some have [Yes] default
    const hasDefault = /\[Yes\]/i.test(source) || /\[No\]/i.test(source);
    const buttons = hasDefault ? ['Yes', 'No'] : ['Yes (y)', 'No (n)'];

    return { message, buttons };
};
