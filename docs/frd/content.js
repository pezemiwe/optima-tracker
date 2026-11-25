'use strict';
/* Content for the enhanced Cortex SuperApp Admin Portal FRD.
   Everything marked src:true comes from the supplied v2.4 document; everything else is a proposal to be confirmed. */
const doc = { title: 'Cortex SuperApp Admin Portal', subtitle: 'Functional Requirements Definition', client: 'FirstBank', version: '3.0 (enhanced draft)', date: '25/11/2026', basis: 'v2.4, 26/03/2025' };

const history = [
  ['2.0', 'Emmanuel O. Adesina', '02/06/2023', 'Updated with Phase 2 features'],
  ['2.1', 'Jude Frank', '21/07/2023', 'Definition and permission update'],
  ['2.2', 'Jude Frank', '15/07/2024', 'Admin Portal refresh'],
  ['2.3', 'Jude Frank', '13/12/2024', 'Cortex SuperApp Admin Portal'],
  ['2.4', 'Jude Frank', '26/03/2025', 'Cortex SuperApp Admin Portal update'],
  ['3.0', 'Enhancement draft', '25/11/2026', 'Restructured and enhanced: shared approval workflow, role matrix, acceptance criteria, traceability, measurable quality targets, review findings. Awaiting product owner review.'],
];

const br = [
  ['Access', [['BR001', 'Login'], ['BR002', 'Logout']]],
  ['Role management', [['BR003', 'Create roles'], ['BR004', 'Edit roles'], ['BR005', 'Deactivate roles'], ['BR006', 'Activate roles'], ['BR007', 'View role']]],
  ['User management', [['BR008', 'Create users'], ['BR009', 'Edit user'], ['BR010', 'Deactivate user'], ['BR011', 'Activate user'], ['BR012', 'View user'], ['BR013', 'View report'], ['BR014', 'Remove dormancy']]],
  ['Profile management', [['BR015', 'Lock profile'], ['BR016', 'Unlock profile']]],
  ['Device management', [['BR017', 'Release device']]],
  ['Limit management', [['BR018', 'Limit management']]],
  ['Audit trail', [['BR019', 'Audit trail']]],
];

/* actor/system step pairs */
const uc = [
  { id: '001', name: 'Login', fr: 'FR001', br: 'BR001', pri: ['High', true], approval: 'n/a', pre: ['User has launched the web page', 'User is profiled on Active Directory'],
    flow: [['Loads the portal URL', 'Displays the landing page'], ['Enters Staff ID and AD password', 'Validates credentials. On success, prompts for a token. On failure, displays an error message'], ['Enters token', 'Validates the token and logs the user in']],
    rules: ['Login succeeds only for staff who have been granted access rights.'], freq: 'As required',
    ac: ['Given valid AD credentials and a valid token, the user reaches the dashboard.', 'Given an invalid password or token, access is denied with an informative message and the attempt is written to the audit trail.'] },
  { id: '002', name: 'Logout', fr: 'FR002', br: 'BR002', pri: ['High', true], approval: 'n/a', pre: ['User is logged in'],
    flow: [['Opens the user menu', 'Displays user information'], ['Clicks Logout', 'Logs the user out and displays the login screen']],
    rules: [], freq: 'As required', note: 'v2.4 refers to a "customer icon"; interpreted here as the signed-in staff member’s menu.',
    ac: ['After logout, the browser back button does not reopen an authenticated page.', 'The logout is written to the audit trail.'] },
  { id: '003', name: 'Create roles', fr: 'FR003', br: 'BR003', pri: ['High', false], approval: 'Required', queue: 'Roles › Requests', pre: ['User is logged in', 'Name and token validation passed'],
    flow: [['Selects the Roles tab, then Role Creation', 'Displays the form: role name, role type, permissions'], ['Enters the details and clicks Create', 'Shows a success message and sends the request to the approver']],
    rules: ['The request shows as Pending until an approver acts.', 'Role viewers can only view requests.'],
    ac: ['A role cannot be saved without a unique name, a type and at least one permission.', 'The new role is not usable until approved.'] },
  { id: '004', name: 'Create users', fr: 'FR004', br: 'BR008', pri: ['High', false], approval: 'Required', queue: 'Users › Requests', pre: ['User is logged in', 'Name and token validation passed'],
    flow: [['Selects Users, then User Creation', 'Prompts for the staff number'], ['Enters the staff number and presses Enter', 'Populates the staff information'], ['Selects SOL ID and role, then clicks Create', 'Shows a success message and sends the request to the approver']],
    rules: ['The request shows as Pending until an approver acts.', 'User viewers can only view requests.'],
    ac: ['An unknown or already-profiled staff number is rejected with a clear message.', 'The new user cannot sign in until the request is approved.'] },
  { id: '005', name: 'Edit roles', fr: 'FR005', br: 'BR004', pri: ['High', false], approval: 'Required', queue: 'Roles › Requests', pre: ['User is logged in', 'Name and token validation passed'],
    flow: [['Selects Roles, then Role Management', 'Displays the Role Management screen'], ['Clicks View Details', 'Shows role details with Edit and Deactivate options'], ['Clicks Edit, makes the change and clicks Edit Role', 'Shows a success message and sends the request to the approver']],
    rules: ['The request shows as Pending until an approver acts.'],
    ac: ['The role keeps its current permissions until the edit is approved.', 'The approver sees the before and after values.'] },
  { id: '006', name: 'Deactivate roles', fr: 'FR006', br: 'BR005', pri: ['High', false], approval: 'Required', queue: 'Roles › Requests', pre: ['User is logged in', 'Name and token validation passed'],
    flow: [['Selects Roles, then Role Management, then View Details', 'Shows role details with Edit and Deactivate options'], ['Clicks Deactivate Role', 'Asks for confirmation'], ['Confirms with Yes', 'Shows a success message and sends the request to the approver']],
    rules: ['The request shows as Pending until an approver acts.'],
    ac: ['A role that still has active users cannot be deactivated without a defined handling rule (see open item O-09).'] },
  { id: '007', name: 'Activate roles', fr: 'FR007', br: 'BR006', pri: ['High', false], approval: 'Required', queue: 'Roles › Requests', pre: ['User is logged in', 'Name and token validation passed'],
    flow: [['Selects Roles, then Role Management, then View Details', 'Shows role details with Edit and Activate options'], ['Clicks Activate Role', 'Asks for confirmation'], ['Confirms with Yes', 'Shows a success message and sends the request to the approver']],
    rules: ['The request shows as Pending until an approver acts.'],
    ac: ['Only an inactive role offers the Activate action.'] },
  { id: '008', name: 'Edit user', fr: 'FR008', br: 'BR009', pri: ['High', false], approval: 'Required', queue: 'Users › Requests', pre: ['User is logged in', 'Name and token validation passed'],
    flow: [['Selects Users, then User Management', 'Displays the User Management screen'], ['Clicks Edit', 'Displays the Edit User screen'], ['Changes SOL ID and/or role and clicks Submit', 'Shows a success message and sends the request to the approver']],
    rules: ['Only SOL ID and role can be edited.', 'The request shows as Pending until an approver acts.'],
    ac: ['All other user fields are read-only.', 'The change takes effect on approval, not on submission.'] },
  { id: '009', name: 'Deactivate user', fr: 'FR009', br: 'BR010', pri: ['High', false], approval: 'Required', queue: 'Users › Requests', pre: ['User is logged in', 'Name and token validation passed'],
    flow: [['Selects Users, then User Management, then View Details', 'Shows details with Edit and Deactivate options'], ['Clicks Deactivate User', 'Asks for confirmation'], ['Confirms with Yes', 'Shows a success message and sends the request to the approver']],
    rules: ['The request shows as Pending until an approver acts.'],
    ac: ['A deactivated user’s active sessions end when the request is approved.'] },
  { id: '010', name: 'Activate user', fr: 'FR010', br: 'BR011', pri: ['High', false], approval: 'Required', queue: 'Users › Requests', pre: ['User is logged in', 'Name and token validation passed'],
    flow: [['Selects Users, then User Management, then View Details', 'Shows details with Edit and Activate options'], ['Clicks Activate User', 'Asks for confirmation'], ['Confirms with Yes', 'Shows a success message and sends the request to the approver']],
    rules: ['The request shows as Pending until an approver acts.'],
    ac: ['Only an inactive user offers the Activate action.'] },
  { id: '011', name: 'View report', fr: 'FR011', br: 'BR013', pri: ['Medium', false], approval: 'None', pre: ['User is logged in', 'User has the report permission'],
    flow: [['Selects Users, then User Management', 'Displays the User Management screen'], ['Clicks Download Report', 'Downloads the report'], ['Opens the report', '']],
    rules: ['The report downloads as a spreadsheet.'],
    ac: ['The spreadsheet contains only users the viewer is permitted to see (same SOL ID rule).', 'The download is written to the audit trail.'] },
  { id: '012', name: 'Remove dormancy', fr: 'FR012', br: 'BR014', pri: ['Medium', false], approval: 'Required', queue: 'Users › Requests', pre: ['The user became dormant because no staff login occurred within 90 days'],
    flow: [['Selects Users, then User Management', 'Displays the User Management screen'], ['Clicks Edit', 'Displays the Edit User screen'], ['Clicks Remove Dormancy', 'Shows a success message and sends the request to the approver']],
    rules: ['The request shows as Pending until an approver acts.'],
    ac: ['The dormancy threshold (90 days) is configurable and evaluated against the last successful login.', 'After approval the user is Active and the 90-day clock restarts.'] },
  { id: '013', name: 'Lock profile', fr: 'FR013', br: 'BR015', pri: ['High', false], approval: 'Not required', pre: ['User is logged in', 'Customer is registered on Cortex'],
    flow: [['Selects Customer Management, then the Customer Management tab', 'Displays a search field for account number or username'], ['Enters account number or username and submits', 'Displays customer information with a Continue option'], ['Clicks Continue', 'Displays the customer management screen'], ['Clicks Profile Management', 'Displays the lock-profile page'], ['Selects a reason: Customer requested, or Other (and enters the reason)', 'Shows a free-text field when Other is chosen'], ['Clicks Lock Profile', 'Asks for confirmation'], ['Confirms', 'Shows a success message, locks the profile and disables scheduled payments']],
    rules: ['This action does not require an approver.'],
    ac: ['The profile is locked immediately and the customer cannot sign in on mobile channels.', 'Reason, actor and time are recorded in the audit trail.'] },
  { id: '014', name: 'Unlock profile', fr: 'FR014', br: 'BR016', pri: ['High', true], approval: 'Required', queue: 'Customer Management › Profile Requests', pre: ['User is logged in', 'Customer is registered on Cortex'],
    flow: [['Selects Customer Management, then the Customer Management tab', 'Displays a search field for account number or username'], ['Enters account number or username and submits', 'Displays customer information with a Continue option'], ['Clicks Continue, then Profile Management', 'Displays the unlock-profile page'], ['Selects a reason: Customer requested, or Other (and enters the reason)', 'Shows a free-text field when Other is chosen'], ['Clicks Unlock Profile and confirms', 'Shows a success message and initiates the unlock request']],
    rules: ['The request shows as Pending until a permitted approver acts.', 'Approved requests appear under the Approved Requests tab.'],
    ac: ['The profile stays locked until the request is approved.', 'Scheduled payments disabled at lock time are not silently re-enabled (see open item O-08).'] },
  { id: '015', name: 'Release device', fr: 'FR015', br: 'BR017', pri: ['High', true], approval: 'Required', queue: 'Customer Management › Device Requests', pre: ['User is logged in', 'Customer is registered on Cortex'],
    flow: [['Selects Customer Management, then the Customer Management tab', 'Displays a search field for account number or username'], ['Enters account number or username and submits', 'Displays the customer management screen'], ['Selects the Device Management tab', 'Displays device model, device ID, date enrolled and a Release button'], ['Clicks Release', 'Displays a confirmation page'], ['Clicks Yes', 'Shows a success message and sends the request to the approver']],
    rules: ['The request shows as Pending until a permitted approver acts.', 'Approved requests appear under the Approved Requests tab.'], freq: 'Anytime',
    ac: ['After approval the customer can enrol a new device and the old device is no longer trusted.'] },
  { id: '016', name: 'Limit management', fr: 'FR016', br: 'BR018', pri: ['High', true], approval: 'Required', queue: 'Limit Management › Requests', pre: ['User is logged in', 'Name and token validation passed'],
    flow: [['Selects Limit Management, then Modify Limit', 'Displays the Limit Management screen'], ['Enters the account number', 'Displays account information and the Set New Limit section'], ['Sets the new limit and proceeds', 'Shows a success message and sends the request to the approver']],
    rules: ['The new limit cannot be more than the maximum allowable limit.'],
    ac: ['A value above the maximum allowable limit is blocked with the maximum shown.', 'The approver sees the current and requested limits.'] },
  { id: '017', name: 'Audit trail', fr: 'FR017', br: 'BR019', pri: ['Medium', false], approval: 'None', pre: ['User is profiled on the admin dashboard', 'User is logged in'],
    flow: [['Selects Audit Trail in the side bar', 'Displays the audit trail screen'], ['Clicks Filter', 'Displays the available filters'], ['Selects filters and searches', 'Displays results for the selected filters'], ['Clicks Download Report', 'Saves the report as an Excel document']],
    rules: [],
    ac: ['Every initiate, approve, reject and download action appears with actor, time, target and outcome.', 'Audit records cannot be edited or deleted from the portal.'] },
];

const roles = [
  ['Admin Initiator', 'Raises requests for roles and users (create, edit, activate, deactivate, remove dormancy).'],
  ['Admin Approver', 'Approves or rejects role and user requests. Cannot approve their own request.'],
  ['Permitted Initiator', 'Customer-support staff who lock, unlock, release devices and raise limit changes.'],
  ['Permitted Approver', 'Approves or rejects unlock, device and limit requests.'],
  ['Permitted User', 'Views and downloads reports and the audit trail.'],
  ['Viewer', 'Reads requests only. Sees items with the same SOL ID.'],
];

/* rows: capability; columns: AdminInit, AdminAppr, PermInit, PermAppr, PermUser, Viewer.  I = initiate, A = approve, V = view, - none */
const matrix = [
  ['Login / logout', 'I', 'I', 'I', 'I', 'I', 'I'],
  ['Create / edit / (de)activate roles', 'I', 'A', '-', '-', '-', 'V'],
  ['Create / edit / (de)activate users', 'I', 'A', '-', '-', '-', 'V'],
  ['Remove dormancy', 'I', 'A', '-', '-', '-', 'V'],
  ['Lock profile', '-', '-', 'I', '-', '-', '-'],
  ['Unlock profile', '-', '-', 'I', 'A', '-', 'V'],
  ['Release device', '-', '-', 'I', 'A', '-', 'V'],
  ['Limit management', '-', '-', 'I', 'A', '-', 'V'],
  ['Download user report', '-', '-', '-', '-', 'I', '-'],
  ['View / download audit trail', '-', '-', '-', '-', 'I', '-'],
];

const fr = [
  ['FR001', 'Ability to login', 'Src', 'High'], ['FR002', 'Ability to logout', 'Src', 'High'], ['FR003', 'Ability to create roles', 'Src', 'High'], ['FR004', 'Ability to create users', 'Src', 'High'],
  ['FR005', 'Ability to edit roles', 'Src', 'High'], ['FR006', 'Ability to deactivate roles', 'Src', 'High'], ['FR007', 'Ability to activate roles', 'Src', 'High'], ['FR008', 'Ability to edit user', 'Src', 'High'],
  ['FR009', 'Ability to deactivate user', 'Src', 'High'], ['FR010', 'Ability to activate user', 'Src', 'High'], ['FR011', 'Ability to view report', 'Src', 'Medium'], ['FR012', 'Ability to remove dormancy', 'Src', 'Medium'],
  ['FR013', 'Ability to lock customer’s profile', 'Src', 'High'], ['FR014', 'Ability to unlock customer’s profile', 'Src', 'High'], ['FR015', 'Ability to release customer’s device', 'Src', 'High'],
  ['FR016', 'Ability to manage customer limit', 'Src', 'High'], ['FR017', 'Ability to view audit trail and generate report', 'Src', 'Medium'],
  ['FR018', 'Ability to view a role and its permissions (BR007 had no matching requirement)', 'New', 'Medium'],
  ['FR019', 'Ability to view a user and their status (BR012 had no matching requirement)', 'New', 'Medium'],
  ['FR020', 'Request queue per module with Pending, Approved and Rejected filters, shared by all approval-based use cases', 'New', 'High'],
];

const nfr = {
  performance: [['PR01', 'All add-user activity should be successful', 'Src'], ['PR02', 'All logins by staff who have been granted access rights should return successful', 'Src'],
    ['PR03', '95% of screen loads and searches complete within 3 seconds under normal load', 'New'], ['PR04', 'Report and audit downloads of up to 50,000 rows complete within 60 seconds', 'New']],
  support: [['SUR001', 'The application should be built to allow for easy scalability', 'Src'], ['SUR002', 'The application should be built to allow for easy maintenance', 'Src'], ['SUR003', 'Informative error messages that serve as a guide to the user (v2.4 says “customer”)', 'Src']],
  usability: [['US01', 'Every action that needs approval shows a Pending status immediately after submission', 'New'], ['US02', 'Destructive or state-changing actions ask for confirmation before submitting', 'New'], ['US03', 'Screens work on current versions of the bank’s supported browsers', 'New']],
  security: [['SER01', 'The system must always maintain confidentiality, integrity and availability of customer information', 'Src'], ['SER02', 'The backend should have an audit trail implementation', 'Src'],
    ['SER03', 'Two-factor sign-in: AD credentials plus a token', 'Src'], ['SER04', 'A requester can never approve their own request (maker-checker)', 'New'], ['SER05', 'Approvers and viewers see only items with the same SOL ID', 'Src'], ['SER06', 'Sessions time out after a period of inactivity set by policy', 'New']],
  compliance: [['CR01', 'Customer data security in line with FirstBank Standard Policy', 'Src']],
};

/* findings from reviewing v2.4 */
const findings = [
  ['O-01', 'Contents lists 4.2 Usability and 4.3 Performance, but the body has only Performance under 4.2 and no 4.3.', 'Restructured; usability requirements proposed.'],
  ['O-02', 'BR007 (View role) and BR012 (View user) have no use case or functional requirement.', 'Added FR018 and FR019; use cases to be written.'],
  ['O-03', 'Priority, frequency, exceptions and special requirements are “n/a” in most use cases.', 'Proposed priorities added and marked; exceptions to be confirmed.'],
  ['O-04', 'The approver flow is copied into nine use cases with small wording differences (Admin Approver vs Permitted Approver).', 'Defined once in section 4.2; use cases refer to it.'],
  ['O-05', 'Business requirement order differs from functional requirement order (for example BR004 is Edit roles but FR004 is Create users).', 'Traceability matrix added (section 8).'],
  ['O-06', 'Logout steps mention a “customer icon” and a step with “n/a”.', 'Reworded; confirm the intended control.'],
  ['O-07', 'Lock profile has empty steps (10, 19) and Lock needs no approver while Unlock does.', 'Cleaned up; confirm the asymmetry is intended.'],
  ['O-08', 'Locking disables scheduled payments but no requirement says what happens on unlock.', 'Product owner decision needed.'],
  ['O-09', 'No rule for deactivating a role that still has active users.', 'Product owner decision needed.'],
  ['O-10', 'Maximum allowable limit is not defined (source, who sets it, per segment?).', 'Product owner decision needed.'],
  ['O-11', 'Assumption 2.1(2) says approvers and viewers see only the same SOL ID, but no use case reflects it.', 'Added as SER05 and into acceptance criteria.'],
  ['O-12', 'Performance requirements are not measurable; 99.9% uptime appears under assumptions only.', 'Measurable targets proposed (PR03, PR04); owner to confirm.'],
  ['O-13', 'Rejection reason is entered but its length, storage and visibility are not stated.', 'Proposed: mandatory, stored, visible to initiator.'],
  ['O-14', 'The approval page carried handwritten signatures against v2.4.', 'Not carried into v3.0; fresh approval is needed.'],
];

const glossary = [['AD', 'Active Directory, the bank’s staff directory used to authenticate staff'], ['SOL ID', 'Service outlet (branch) identifier used to scope what a staff member can see'], ['Maker-checker', 'A control in which one person initiates a change and a different person approves it'],
  ['Cortex', 'The bank’s mobile banking application whose customers the portal supports'], ['Dormant user', 'A portal user with no login for 90 days'], ['Initiator / Approver', 'The maker and checker roles in a request'], ['FRD', 'Functional Requirements Definition']];

module.exports = { doc, history, br, uc, roles, matrix, fr, nfr, findings, glossary };
